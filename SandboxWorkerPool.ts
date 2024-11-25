import { executeSandboxed as sandboxedExecution } from './sandbox.ts';

interface ExecutionResult {
    success: boolean;
    result?: any;
    error?: string;
    executionTime: number;
}

const MAX_WORKERS = 20;

class SandboxWorkerPool {
    private static instance: SandboxWorkerPool;
    private activeExecutions = new Set<number>();
    private executionCount = 0;
    private queue: Array<{
        id: number;
        code: string;
        resolve: (result: ExecutionResult) => void;
        reject: (error: Error) => void;
    }> = [];
    private readonly maxWorkers: number;
    private processing = false;
    private abortController = new AbortController();

    private constructor(maxWorkers = MAX_WORKERS) {
        this.maxWorkers = maxWorkers;
        console.log(`[Pool] Initialized with max workers: ${maxWorkers}`);
    }

    static getInstance(): SandboxWorkerPool {
        if (!SandboxWorkerPool.instance) {
            SandboxWorkerPool.instance = new SandboxWorkerPool();
        }
        return SandboxWorkerPool.instance;
    }

    async submitScript(code: string): Promise<ExecutionResult> {
        const executionId = ++this.executionCount;
        console.log(`[Pool] Submitting script #${executionId}, queue length: ${this.queue.length}`);
        
        return new Promise((resolve, reject) => {
            this.queue.push({ 
                id: executionId,
                code, 
                resolve, 
                reject 
            });
            if (!this.processing) {
                console.log(`[Pool] Starting queue processing`);
                this.processQueue();
            }
        });
    }

    async cleanup() {
        this.abortController.abort();
        this.activeExecutions.clear();
        this.queue = [];
        this.processing = false;
    }

    private async trackExecution(id: number, promise: Promise<ExecutionResult>): Promise<ExecutionResult> {
        this.activeExecutions.add(id);
        try {
            return await Promise.race([
                promise,
                new Promise<never>((_, reject) => {
                    this.abortController.signal.addEventListener('abort', () => 
                        reject(new Error('Pool shutdown')));
                })
            ]);
        } finally {
            this.activeExecutions.delete(id);
        }
    }

    private async processQueue() {
        if (this.processing) return;
        this.processing = true;

        try {
            while (this.queue.length > 0 && !this.abortController.signal.aborted) {
                if (this.activeExecutions.size >= this.maxWorkers) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                    continue;
                }

                const task = this.queue.shift();
                if (!task) continue;

                this.trackExecution(
                    task.id,
                    sandboxedExecution(task.code)
                ).then(task.resolve)
                  .catch(task.reject);
            }
        } finally {
            this.processing = false;
        }
    }

    private async executeScript(code: string): Promise<ExecutionResult> {
        return sandboxedExecution(code, {
            timeout: 1000,
            memoryLimit: 100 * 1024 * 1024,
        });
    }
}

export async function executeSandboxed(
    code: string,
    options = {
        timeout: 1000,
        memoryLimit: 100 * 1024 * 1024,
    },
): Promise<ExecutionResult> {
    return SandboxWorkerPool.getInstance().submitScript(code);
}
