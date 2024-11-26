// main.ts

interface ExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  executionTime: number;
}

export async function executeSandboxed(
  code: string,
  options = {
    timeout: 1000, // 1 second
    memoryLimit: 100 * 1024 * 1024, // 100MB
  }
): Promise<ExecutionResult> {
  // Create worker script
  const workerScript = `
    self.onmessage = async (e) => {
      try {
        const result = await eval(e.data);
        self.postMessage({ success: true, result });
      } catch (error) {
        self.postMessage({ success: false, error: error.message });
      }
    };
  `;

  // Write temporary worker file
  const tempFile = await Deno.makeTempFile({ suffix: '.js' });
  await Deno.writeTextFile(tempFile, workerScript);

  // Create worker with strict permissions
  const worker = new Worker(new URL(`file://${tempFile}`), {
    type: 'module',
    deno: {
      permissions: {
        net: false, // prevents network access
        read: false, // blocks file system read operations
        write: false, // blocks file system write operations
        env: false, // blocks access to environment variables
        run: false, // blocks ability to spawn subprocesses
        ffi: false, // blocks dynamic library loading
      },
    },
  });

  const startTime = performance.now();
  let timeoutId: number | undefined; // Declare with proper type

  try {
    const timeoutPromise = new Promise<ExecutionResult>((_, reject) => {
      timeoutId = setTimeout(() => { // Now timeoutId is properly assigned
        worker.terminate();
        reject(new Error('Execution timed out'));
      }, options.timeout);
    });

    // Execute code
    const executionPromise = new Promise<ExecutionResult>((resolve) => {
      worker.onmessage = (e) => {
        const executionTime = performance.now() - startTime;
        resolve({
          ...e.data,
          executionTime,
        });
      };

      worker.postMessage(code);
    });

    const result = await Promise.race([executionPromise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId); // Safe cleanup
    worker.terminate();
    await Deno.remove(tempFile);
    return result;
  } catch (error: any) {
    if (timeoutId) clearTimeout(timeoutId); // Safe cleanup
    worker.terminate();
    await Deno.remove(tempFile);
    return {
      success: false,
      error: error.message,
      executionTime: performance.now() - startTime,
    };
  }
}
