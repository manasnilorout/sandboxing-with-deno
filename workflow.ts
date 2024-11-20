import { executeSandboxed } from "./sandbox.ts";

var runFunction = async (s: string, params: Record<string, any> = {}) => {
    const paramEntries = Object.entries(params)
        .map(([key, value]) => {
            // Special handling for functions to preserve their functionality
            if (typeof value === 'function') {
                return `const ${key} = ${value.toString()};`;
            }
            return `const ${key} = ${JSON.stringify(value)};`;
        })
        .join('\n');
    return await executeSandboxed(`
        ${paramEntries}
        ${s}
    `);
};

async function evaluate(expr: string, params: Record<string, any> = {}) {
    try {
        const done = (result: any) => {
            return result;
        };
        const result = await runFunction(expr, { done, ...params });
        return result;
    } catch (err) {
        throw err;
    }
}

const extractHeaders = (headers: any) => {
    return Object.fromEntries(headers.entries());
};

const makeApiCall = async (url: string, method: string, body: any = null, headers: any = {}) => {
    try {
        const response = await fetch(url, { method, body, headers });
        try {
            const result = await response.json();
            return { success: true, result: { response: { body: result, status: response.status, headers: extractHeaders(response.headers) } } };
        } catch (jsonError) {
            console.error(`Error parsing JSON response from ${url}:`, jsonError);
            try {
                const result = await response.text();
                return { success: true, result: { response: { body: result, status: response.status, headers: extractHeaders(response.headers) } } };
            } catch (textError) {
                console.error(`Error parsing text response from ${url}:`, textError);
                return { success: false, error: textError };
            }
        }
    } catch (error) {
        console.error(`Error making API call to ${url}:`, error);
        return { success: false, error: error };
    }
};

const executeScript = async (script: string, context: any) => {
    const result = await evaluate(script, context);
    return { success: true, result };
};

const executeStep = async (step: any, input: any, context: any) => {
    console.log(`Executing step - ${step.id} - ${step.name}`);
    try {
        switch (step.type) {
            case "httpRequest": {
                const { success, result } = await makeApiCall(step.properties.url, step.properties.method, step.properties.body);
                return { success, ...result };
            }
            case "script": {
                const { success, result } = await executeScript(step.properties.body, context);
                return { success, result };
            }
            default:
                return { success: true };
        }
    } catch (error) {
        return { success: false, error };
    }
};

const findNextStep = (currentStep: any, executionResult: any, input: any) => {
    const nextStepName = executionResult.success
        ? currentStep.onSuccess[0]
        : currentStep.onFailure[0];

    if (!nextStepName) return null;
    return input.steps.find((step: any) => step.name === nextStepName);
};

export const executeFormula = async (input: any = sampleInput) => {
    const context: any = { steps: {}, triggers: {} };

    // Start execution from the active trigger
    const trigger = input.triggers.find((trigger: any) => trigger.active);
    if (!trigger) {
        throw new Error("No active trigger found");
    }

    // Find the first step in the trigger's onSuccess array
    const firstStep = input.steps.find((step: any) => trigger.onSuccess.includes(step.name));
    if (!firstStep) {
        throw new Error("No first step found");
    }

    let currentStep = firstStep;
    let finalStepResult = null;
    while (currentStep) {
        const executionResult = await executeStep(currentStep, input, context);
        finalStepResult = executionResult;
        context.steps[currentStep.name] = executionResult;
        currentStep = findNextStep(currentStep, executionResult, input);
    }

    console.log("Execution completed");
    return finalStepResult;
};