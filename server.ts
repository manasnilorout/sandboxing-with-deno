import { Application, Router } from "@oak/oak";
import { executeFormula } from './workflow.ts';

const router = new Router();

router.post('/api/execute', async (context) => {
  const startTime = performance.now();
  
  try {
    const body = await context.request.body.json();

    if (!body.triggers || !body.steps) {
      context.response.status = 400;
      context.response.body = {
        success: false,
        error: 'Invalid request format. Required fields: triggers, steps',
      };
      return;
    }

    const result = await executeFormula(body);
    
    const executionTime = Math.round(performance.now() - startTime);
    context.response.headers.set('X-Execution-Time', `${executionTime}ms`);
    
    context.response.status = 200;
    context.response.body = {...result, executionTime};
  } catch (error) {
    const executionTime = Math.round(performance.now() - startTime);
    context.response.headers.set('X-Execution-Time', `${executionTime}ms`);
    
    console.error('Workflow execution error:', error);
    context.response.status = 500;
    context.response.body = {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    };
  }
});

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

console.log('Server running on http://localhost:8000');
await app.listen({ port: 8000 });