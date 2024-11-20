// main_test.ts
import { assertEquals, assertExists } from "https://deno.land/std/assert/mod.ts";
import { executeSandboxed } from "./sandbox.ts";

Deno.test("sandbox - basic arithmetic execution", async () => {
  const result = await executeSandboxed("1 + 1");
  assertEquals(result.success, true);
  assertEquals(result.result, 2);
  assertExists(result.executionTime);
});

Deno.test("sandbox - syntax error handling", async () => {
  const result = await executeSandboxed("1 + +");
  assertEquals(result.success, false);
  assertExists(result.error);
});

Deno.test("sandbox - timeout handling", async () => {
  const result = await executeSandboxed("while(true){}", { timeout: 100, memoryLimit: 1024 * 1024 });
  assertEquals(result.success, false);
  assertEquals(result.error, "Execution timed out");
});

Deno.test("sandbox - restricted API access", async () => {
  const result = await executeSandboxed('Deno.readTextFile("secret.txt")');
  assertEquals(result.success, false);
  assertExists(result.error);
});

Deno.test("sandbox - complex operations", async () => {
  const code = `
    const arr = Array(1000).fill(1);
    arr.reduce((a, b) => a + b, 0);
  `;
  const result = await executeSandboxed(code);
  assertEquals(result.success, true);
  assertEquals(result.result, 1000);
});

Deno.test.ignore("sandbox - async code execution", async () => {
  const code = `
    await new Promise(resolve => setTimeout(resolve, 100));
    "done"
  `;
  const result = await executeSandboxed(code);
  console.log(result)
  assertEquals(result.success, true);
  assertEquals(result.result, "done");
});

Deno.test("sandbox - memory limit", async () => {
  const code = `
    const arr = new Array(1e9).fill(1);
  `;
  const result = await executeSandboxed(code, { timeout: 100, memoryLimit: 1024 * 1024 });
  assertEquals(result.success, false);
  assertExists(result.error);
});

Deno.test("sandbox - scope isolation", async () => {
  const result = await executeSandboxed("typeof window");
  assertEquals(result.success, true);
  assertEquals(result.result, "undefined");
});