import { executeSandboxed } from "./SandboxWorkerPool.ts";

type QueryParams = Record<string, string | number | boolean | null | undefined>;
type Headers = Record<string, string>;

// Utility function to build URL with query parameters
const buildUrlWithQuery = (baseUrl: string, query: QueryParams): string => {
    // Parse the base URL to handle existing query parameters
    const url = new URL(baseUrl);
    const existingParams = url.searchParams;

    // Create new params combining existing and new
    const searchParams = new URLSearchParams(existingParams);

    // Add new query parameters
    Object.entries(query).forEach(([key, value]) => {
        if (value != null) {
            // Remove existing param if present to avoid duplication
            searchParams.delete(key);
            searchParams.append(key, String(value));
        }
    });

    const queryString = searchParams.toString();

    // Return original URL path with combined query params
    return queryString
        ? `${url.origin}${url.pathname}${queryString ? "?" + queryString : ""}`
        : url.origin + url.pathname;
};

export const runFunction = async (
    s: string,
    params: Record<string, any> = {},
    trigger: any,
) => {
    let paramEntries = Object.entries(params)
        .map(([key, value]) => {
            // Special handling for functions to preserve their functionality
            if (typeof value === "function") {
                return `const ${key} = ${value.toString()};`;
            }
            return `const ${key} = ${JSON.stringify(value)};`;
        })
        .join("\n");

    if (trigger) {
        paramEntries += `const trigger = ${JSON.stringify(trigger)};`;
    }

    return await executeSandboxed(`
        ${paramEntries}
        ${s}
    `);
};

async function evaluate(
    expr: string,
    params: Record<string, any> = {},
    input: any = {},
) {
    try {
        const done = (result: any) => {
            return result;
        };
        const { trigger } = input;
        const result = await runFunction(expr, { done, ...params }, trigger);
        return result;
    } catch (err) {
        throw err;
    }
}

const extractHeaders = (headers: any) => {
    return Object.fromEntries(headers.entries());
};

const makeApiCall = async (
    url: string,
    method: string,
    body: any = null,
    headers: Headers = {},
    query: QueryParams = {},
) => {
    try {
        const fullUrl = buildUrlWithQuery(url, query);
        const response = await fetch(fullUrl, {
            method,
            body: body ? JSON.stringify(body) : null,
            headers,
        });

        try {
            const result = await response.json();
            return {
                success: true,
                result: {
                    response: {
                        body: result,
                        status: response.status,
                        headers: extractHeaders(response.headers),
                    },
                },
            };
        } catch (jsonError) {
            console.error(
                `Error parsing JSON response from ${url}:`,
                jsonError,
            );
            try {
                const result = await response.text();
                return {
                    success: true,
                    result: {
                        response: {
                            body: result,
                            status: response.status,
                            headers: extractHeaders(response.headers),
                        },
                    },
                };
            } catch (textError) {
                console.error(
                    `Error parsing text response from ${url}:`,
                    textError,
                );
                return { success: false, error: textError };
            }
        }
    } catch (error) {
        console.error(`Error making API call to ${url}:`, error);
        return { success: false, error: error };
    }
};

const executeScript = async (script: string, context: any, input: any) => {
    return await evaluate(script, context, input);
};

const executeStep = async (step: any, input: any, context: any) => {
    const startTime = performance.now();
    try {
        let result;
        switch (step.type) {
            case "httpRequest": {
                let queryParameters = {};
                let bodyParameter = null;

                // Handle query parameters
                if (step.properties.query) {
                    const queryValue = step.properties.query;
                    const stepRefRegex = /\${steps\.(.+?)\.(.+?)}/;
                    const queryMatches = queryValue?.match(stepRefRegex);

                    if (queryMatches) {
                        const [_, stepName, propertyPath] = queryMatches;
                        const stepResult = context.steps?.[stepName]?.result;
                        queryParameters = stepResult?.[propertyPath] ?? {};
                    } else {
                        // Handle static query value
                        queryParameters = queryValue;
                    }
                }

                // Handle body parameter separately
                if (step.properties.body) {
                    const bodyValue = step.properties.body;
                    const stepRefRegex = /\${steps\.(.+?)\.(.+?)}/;
                    const bodyMatches = bodyValue?.match(stepRefRegex);

                    if (bodyMatches) {
                        const [_, stepName, propertyPath] = bodyMatches;
                        const stepResult = context.steps?.[stepName]?.result;
                        bodyParameter = stepResult?.[propertyPath];
                        
                        if (bodyParameter === undefined) {
                            console.warn(`Could not resolve body parameter: ${stepName}.${propertyPath}`);
                        }
                    } else {
                        // Handle static body value
                        bodyParameter = bodyValue;
                    }
                }

                const response = await makeApiCall(
                    step.properties.url,
                    step.properties.method,
                    bodyParameter ?? step.properties.body,
                    {}, // headers
                    queryParameters
                );
                result = { success: response.success, ...response.result };
                break;
            }
            case "script": {
                result = await executeScript(
                    step.properties.body,
                    context,
                    input,
                );
                break;
            }
            default:
                result = { success: true };
                break;
        }

        const executionTime = Math.round(performance.now() - startTime);
        console.log(
            `Step ${step.id} - ${step.name} completed in ${executionTime}ms`,
        );
        return result;
    } catch (error) {
        const executionTime = Math.round(performance.now() - startTime);
        console.error(
            `Step ${step.id} - ${step.name} failed after ${executionTime}ms`,
        );
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

export const executeFormula = async (input: any) => {
    const context: any = { steps: {}, triggers: {} };

    // Start execution from the active trigger
    const trigger = input.triggers.find((trigger: any) => trigger.active);
    if (!trigger) {
        throw new Error("No active trigger found");
    }

    // Find the first step in the trigger's onSuccess array
    const firstStep = input.steps.find((step: any) =>
        trigger.onSuccess.includes(step.name)
    );

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
