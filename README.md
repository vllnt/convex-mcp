# @vllnt/convex-mcp

[![npm](https://img.shields.io/npm/v/@vllnt/convex-mcp)](https://www.npmjs.com/package/@vllnt/convex-mcp)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Expose Convex functions as MCP tools with zero boilerplate. Connect any LLM to your Convex backend via the Model Context Protocol.

## Why

No Convex MCP package exists that exposes **your** functions as MCP tools. Existing packages are dev-inspection tools. This package lets you turn any Convex query, mutation, or action into an MCP tool in minutes.

## Install

```bash
pnpm add @vllnt/convex-mcp
# or
npm install @vllnt/convex-mcp
```

**Peer dependency:** `convex` (>=1.0.0)

## Quickstart

### 1. Define your MCP server

```typescript
// convex/mcp.ts
import { createMCPServer, query, mutation, action } from "@vllnt/convex-mcp";
import { api } from "./_generated/api";
import { v } from "convex/values";

export const mcp = createMCPServer({
  auth: {
    validate: async (key) => key === process.env.MCP_API_KEY,
  },
  tools: {
    list_projects: query(api.projects.list, {
      args: v.object({}),
      description: "List all projects",
    }),
    create_project: mutation(api.projects.create, {
      args: v.object({
        name: v.string(),
        description: v.optional(v.string()),
      }),
      description: "Create a new project",
    }),
    run_migration: action(api.migrations.run, {
      args: v.object({ version: v.number() }),
      description: "Run a database migration",
    }),
  },
});
```

### 2. Mount the route handler

```typescript
// app/api/mcp/route.ts (Next.js App Router)
import { mcp } from "@/convex/mcp";

export const { GET, POST } = mcp.handler();
```

### 3. Connect your LLM

Point any MCP client at `https://your-app.vercel.app/api/mcp` with your API key in the `Authorization: Bearer <key>` header.

## API Reference

### `createMCPServer(config)`

Creates an MCP server instance.

```typescript
createMCPServer({
  auth: AuthConfig;        // REQUIRED — default-deny
  tools?: Record<string, ToolDef>;
  resources?: Record<string, ResourceDef>;
  convexUrl?: string;      // defaults to CONVEX_URL or NEXT_PUBLIC_CONVEX_URL
  name?: string;           // MCP server name (default: "convex-mcp")
  version?: string;        // MCP server version (default: "0.3.1")
  pagination?: PaginationConfig;  // opt-in pagination + two-phase discovery
})
```

### `query(ref, options?)` / `mutation(ref, options?)` / `action(ref, options?)`

Typed wrappers that pair a Convex function reference with its validator and metadata. The wrapper name determines which `ConvexHttpClient` method is called — no error-prone string `type` annotation needed.

```typescript
query(api.tasks.list, {
  args: v.object({ status: v.optional(v.string()) }),
  description: "List tasks by status",
})
```

### `resource(ref, options?)`

Wraps a Convex query as an MCP resource with a URI template.

```typescript
resource(api.spaces.get, {
  args: v.object({ id: v.id("spaces") }),
  description: "Get a space by ID",
})
```

### Auth Config

Auth is **required**. The server throws at startup without it (default-deny).

```typescript
{
  // REQUIRED: validate the API key
  validate: (apiKey: string) => Promise<boolean> | boolean;

  // OPTIONAL: propagate Convex auth context
  convexToken?: (apiKey: string) => Promise<string | undefined> | string | undefined;
}
```

### `.handler(options?)`

Returns `{ GET, POST }` functions compatible with Next.js App Router route handlers.

### Pagination + Two-Phase Discovery

Opt-in pagination for `tools/list` and two-phase tool discovery for reduced token overhead.

```typescript
createMCPServer({
  auth: { validate: async (key) => key === process.env.MCP_API_KEY },
  tools: { /* ... */ },
  pagination: {
    pageSize: 20,              // tools per page (must be integer >= 1)
    twoPhaseDiscovery: true,   // enable tools/list_summary + tools/describe
  },
});
```

**Cursor-based pagination** (MCP spec-compliant):
- `tools/list` without cursor returns ALL tools (backwards-compatible)
- `tools/list` with `cursor: ""` starts pagination, returns `nextCursor`
- Cursors are HMAC-signed with constant-time verification

**Two-phase discovery** (non-standard, for custom agents):
- `tools/list_summary` returns `{ name, description }` only (no `inputSchema`)
- `tools/describe` with `{ name }` returns the full tool definition on-demand
- Reduces token overhead ~90% for large tool catalogs

## Validator Mapping

Convex validators are automatically converted to JSON Schema for MCP tool definitions:

| Convex | JSON Schema | Notes |
|--------|-------------|-------|
| `v.string()` | `string` | |
| `v.number()` / `v.float64()` | `number` | |
| `v.boolean()` | `boolean` | |
| `v.null()` | `null` | |
| `v.int64()` | `string` | "64-bit integer as string (BigInt)" |
| `v.bytes()` | `string` | "Binary data as base64-encoded string" |
| `v.id("table")` | `string` | "Convex document ID for table 'table'" |
| `v.literal(x)` | `const: x` | |
| `v.array(v.X())` | `array` of X | |
| `v.object({...})` | `object` | |
| `v.union(v.literal("a"), ...)` | `enum: ["a", ...]` | Collapsed for interop |
| `v.union(v.X(), v.Y())` | `anyOf` | Mixed types |
| `v.optional(v.X())` | optional X | |
| `v.record(k, v)` | `additionalProperties` | |
| `v.any()` | `any` | |

## Security

- **Default-deny**: Auth is required. No `validate` = startup error.
- **Generic errors**: Convex error messages are never leaked to MCP responses (may contain PII). Only "Function execution failed" is returned.
- **Per-action authorization (v0.3.0)**: The `onToolCall` hook can return `extendArgs` to inject server-resolved context (e.g. `_mcp_apiKey`, scopes, tenantId) into the dispatched function's args. The action handler re-validates the injected context as defense-in-depth — even if the framework hook is bypassed, the action stays safe. See [Security › Server-side Context Propagation](docs/security.md#server-side-context-propagation-v030).
- **Reserved `_` prefix (v0.3.0)**: Arg keys starting with `_` are framework-controlled. Stripped from the published JSON Schema and rejected at the handler boundary; only the framework can inject them via `extendArgs`. Prevents callers from spoofing server-injected context.

### Known Limitations

- **Validator duplication**: You must provide Convex validators in the MCP config alongside function references. FunctionReference carries no runtime schema info. We're exploring codegen for v2.
- **Service account model**: By default, Convex functions execute without user identity (`ctx.auth` is null). Use `convexToken` in auth config to propagate identity, or `extendArgs` for arg-level context propagation (v0.3.0).
- **Serverless timeouts**: Vercel Hobby has 10s timeout, Pro has 60s. Use Fluid Compute for long-running actions.

## Docs

- [Getting Started](docs/getting-started.md)
- [API Reference](docs/api-reference.md)
- [Validator Mapping](docs/validators.md)
- [Deployment](docs/deployment.md)
- [Security](docs/security.md)
- [Examples](docs/examples.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Author

**vllnt** — [bntvllnt.com](https://bntvllnt.com) | [X](https://bntvllnt.com/x) | [Discord](https://bntvllnt.com/discord) | [GitHub](https://bntvllnt.com/github)

## License

[MIT](LICENSE)
