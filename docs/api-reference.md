# API Reference

## `createMCPServer(config)`

Creates an MCP server instance. Returns a `ConvexMCPServer` with a `.handler()` method.

```typescript
import { createMCPServer } from "@vllnt/convex-mcp";

const mcp = createMCPServer({
  auth: AuthConfig;        // REQUIRED — default-deny
  tools?: Record<string, ToolDef>;
  resources?: Record<string, ResourceDef>;
  convexUrl?: string;      // defaults to CONVEX_URL or NEXT_PUBLIC_CONVEX_URL env var
  name?: string;           // MCP server name (default: "convex-mcp")
  version?: string;        // MCP server version (default: "0.3.0")
  pagination?: PaginationConfig;  // opt-in pagination + two-phase discovery
});
```

### Config fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `auth` | `AuthConfig` | Yes | — | Auth configuration. Server throws at startup without it. |
| `tools` | `Record<string, ToolDef>` | No | `{}` | Named MCP tools. Keys become tool names. |
| `resources` | `Record<string, ResourceDef>` | No | `{}` | Named MCP resources. Keys are URI template patterns. |
| `convexUrl` | `string` | No | env var | Convex deployment URL. Falls back to `CONVEX_URL` then `NEXT_PUBLIC_CONVEX_URL`. |
| `name` | `string` | No | `"convex-mcp"` | Server name reported in MCP `initialize` response. |
| `version` | `string` | No | `"0.3.0"` | Server version reported in MCP `initialize` response. |
| `pagination` | `PaginationConfig` | No | — | Opt-in pagination and two-phase discovery. See [Pagination](#pagination). |

### Throws

- `Error` if `auth.validate` is not provided (default-deny enforcement).
- `Error` if `pagination.pageSize` is not a positive integer >= 1.
- `Error` if no Convex URL is found (config or environment).

---

## `query(ref, options?)`

Wraps a Convex query function reference as an MCP tool. The tool calls `ConvexHttpClient.query()` at runtime.

```typescript
import { query } from "@vllnt/convex-mcp";
import { api } from "./convex/_generated/api";
import { v } from "convex/values";

query(api.tasks.list, {
  args: v.object({ status: v.optional(v.string()) }),
  description: "List tasks, optionally filtered by status",
})
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ref` | Convex function reference | Yes | e.g. `api.tasks.list` |
| `options.args` | Convex validator | No | `v.object({...})` validator. Converted to JSON Schema for tool input. |
| `options.description` | `string` | No | Human-readable tool description shown to LLMs. |

### Returns

`ToolDef` — pass this as a value in the `tools` record of `createMCPServer()`.

---

## `mutation(ref, options?)`

Same signature as `query()`. Calls `ConvexHttpClient.mutation()` at runtime.

```typescript
import { mutation } from "@vllnt/convex-mcp";

mutation(api.tasks.create, {
  args: v.object({ title: v.string() }),
  description: "Create a new task",
})
```

---

## `action(ref, options?)`

Same signature as `query()`. Calls `ConvexHttpClient.action()` at runtime.

```typescript
import { action } from "@vllnt/convex-mcp";

action(api.ai.summarize, {
  args: v.object({ documentId: v.id("documents") }),
  description: "Summarize a document using AI",
})
```

---

## `resource(ref, options?)`

Wraps a Convex query as an MCP resource with a URI template.

```typescript
import { resource } from "@vllnt/convex-mcp";

resource(api.spaces.get, {
  args: v.object({ id: v.id("spaces") }),
  description: "Get a space by ID",
})
```

Resources are registered with a URI template pattern as the key:

```typescript
createMCPServer({
  auth: { validate: async (key) => key === process.env.MCP_API_KEY },
  resources: {
    "space://{id}": resource(api.spaces.get, {
      description: "Get a space by ID",
    }),
  },
});
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ref` | Convex function reference | Yes | Must be a query (resources are read-only). |
| `options.args` | Convex validator | No | Validator for URI template parameters. |
| `options.description` | `string` | No | Human-readable resource description. |

### Returns

`ResourceDef` — pass this as a value in the `resources` record.

---

## Pagination

Opt-in cursor-based pagination for `tools/list` and two-phase tool discovery.

### `PaginationConfig`

```typescript
interface PaginationConfig {
  pageSize: number;              // Tools per page (positive integer >= 1)
  twoPhaseDiscovery?: boolean;   // Enable tools/list_summary + tools/describe (default: false)
}
```

### Cursor-Based Pagination (MCP Spec-Compliant)

- `tools/list` WITHOUT cursor: returns ALL tools (backwards-compatible)
- `tools/list` WITH `cursor: ""`: starts pagination, returns first `pageSize` tools + `nextCursor`
- `tools/list` WITH valid cursor: returns next page + `nextCursor` (absent on last page)
- Invalid/tampered cursors return JSON-RPC error -32602

Cursors are HMAC-signed with a per-instance secret and verified with `crypto.subtle.verify()` (constant-time).

### Two-Phase Discovery (Non-Standard)

These are custom MCP methods — only custom agents that explicitly call them will benefit. Standard MCP clients (Claude Desktop, Cursor) do not use them.

- `tools/list_summary`: returns `{ tools: [{ name, description }] }` — no `inputSchema`, ~90% token reduction
- `tools/describe` with `{ name: "toolName" }`: returns full tool definition including `inputSchema`
- Unknown tool name returns JSON-RPC error -32602

### Exported Types

```typescript
import type { PaginationConfig, ToolSummary, ToolPage } from "@vllnt/convex-mcp";
```

---

## `AuthConfig`

```typescript
interface AuthConfig {
  validate: (apiKey: string) => Promise<boolean> | boolean;
  convexToken?: (apiKey: string) => Promise<string | undefined> | string | undefined;
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `validate` | `(apiKey: string) => Promise<boolean> \| boolean` | Yes | Validates the API key from the `Authorization: Bearer <key>` header. Return `true` to allow, `false` to reject with 401. |
| `convexToken` | `(apiKey: string) => Promise<string \| undefined> \| string \| undefined` | No | Returns a Convex auth token (JWT) to set on `ConvexHttpClient`. This populates `ctx.auth` in your Convex functions. |

### Auth flow

```
Request arrives
  -> Extract API key from Authorization header
  -> Call auth.validate(apiKey)
  -> If false: return 401
  -> If true + auth.convexToken defined: call auth.convexToken(apiKey)
  -> Set Convex auth token on ConvexHttpClient
  -> Process MCP request
```

---

## `HandlerOptions`

```typescript
interface HandlerOptions {
  allowedOrigins?: string[];
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `allowedOrigins` | `string[]` | No | Allowed CORS origins. |

---

## `.handler(options?)`

Returns `{ GET, POST }` functions compatible with Next.js App Router route handlers.

```typescript
const mcp = createMCPServer({ ... });
const { GET, POST } = mcp.handler();
```

Both `GET` and `POST` accept a `Request` and return `Promise<Response>`.

- **GET**: Handles MCP SSE connections.
- **POST**: Handles JSON-RPC MCP requests. Validates `Content-Type: application/json` (returns 415 otherwise).

---

## `convexArgsToZod(argsValidator)`

Low-level utility. Converts a Convex `v.object()` validator to a Zod object schema.

```typescript
import { convexArgsToZod } from "@vllnt/convex-mcp";
import { v } from "convex/values";

const zodSchema = convexArgsToZod(v.object({
  name: v.string(),
  count: v.number(),
}));
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `argsValidator` | Convex validator | Yes | Must be a `v.object()` validator. Throws if not. |

### Returns

`z.ZodObject<Record<string, z.ZodTypeAny>>` — a Zod object schema.

### Throws

- `Error` if the validator is not a `v.object()` (kind !== `"object"`).

---

## `convertValidator(validator)`

Low-level utility. Converts any single Convex validator to a Zod schema. Handles all `v.*` types recursively.

```typescript
import { convertValidator } from "@vllnt/convex-mcp";
```

### Throws

- `UnsupportedValidatorError` for unknown validator kinds.

---

## `UnsupportedValidatorError`

Error thrown when a Convex validator kind is not recognized. Extends `Error`.

```typescript
import { UnsupportedValidatorError } from "@vllnt/convex-mcp";

try {
  convertValidator(unknownValidator);
} catch (e) {
  if (e instanceof UnsupportedValidatorError) {
    console.log(e.message); // "Unsupported Convex validator kind: "futureType"..."
  }
}
```

---

## Exported Types

```typescript
import type {
  ServerConfig,
  AuthConfig,
  ToolDef,
  ResourceDef,
  HandlerOptions,
  ConvexMCPServer,
  FunctionType,     // "query" | "mutation" | "action"
  ConvexValidator,
} from "@vllnt/convex-mcp";
```
