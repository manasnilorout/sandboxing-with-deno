# Deno-based Step Executor

A flexible step execution engine that processes various types of operations securely.

## Overview

This project provides a framework for executing a sequence of steps, where each step can be of different types:
- `httpRequest`: Execute HTTP requests
- `script`: Run untrusted code in a sandboxed Deno environment

## Features

- Type-safe step execution
- Secure script execution using Deno's sandbox
- Support for HTTP operations
- Modular step type system

## Security

The project leverages Deno's security features to run untrusted code safely:
- Isolated runtime environment
- Explicit permissions model
- No file system access by default
- Network access can be restricted

## Usage

```typescript
// Example step configuration
const steps = [
    {
        type: 'httpRequest',
        url: 'https://api.example.com/data',
        method: 'GET'
    },
    {
        type: 'script',
        code: 'console.log("Hello from Deno!");'
    }
];
```

### Commands
**Run workflow:**

`deno --unstable-worker-options --allow-net --allow-write --allow-read execFormula.ts`

**Run server:**

`deno run server`

**Run tests:**

`deno test sandbox_test.ts --allow-write --allow-read --allow-net=none --unstable-worker-options`

**Docker setup:**
```sh
# Build and start
docker compose up --build

# Stop
docker compose down
```

## Requirements

- Deno runtime
- Permission flags based on step requirements
