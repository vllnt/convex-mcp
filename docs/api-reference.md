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
  version?: string;        // MCP server version (default: "0.3.1")
  pagination?: PaginationConfig;  // opt-in pagination + two-phase discovery
  hooks?: LifecycleHooks;  // before/success/error tool-call hooks
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
| `version` | `string` | No | `"0.3.1"` | Server version reported in MCP `initialize` response. |
| `pagination` | `PaginationConfig` | No | — | Opt-in pagination and two-phase discovery. See [Pagination](#pagination). |
| `hooks` | `LifecycleHooks` | No | — | Lifecycle hooks for tool calls. See [`LifecycleHooks`](#lifecyclehooks). |

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

## `LifecycleHooks`

```typescript
interface LifecycleHooks {
  onToolCall?: (ctx: CallContext) => Promise<OnCallResult | void> | OnCallResult | void;
}
```

Pass via `createMCPServer({ hooks: { onToolCall } })`. The hook fires three times per tool call: `before` (pre-dispatch), `success` (after the dispatched function resolves), and `error` (after it throws).

| Phase | Purpose |
|-------|---------|
| `before` | Validate, abort, inject context via `extendArgs`. The only phase whose return value affects dispatch. |
| `success` | Observe successful results (logging, metrics). Return value is ignored. |
| `error` | Customize the error message returned to the MCP client (`return { message: "..." }`). |

Per-tool overrides: `ToolDef.onError` runs before `LifecycleHooks.onToolCall` for the `error` phase.

---

## `CallContext`

```typescript
interface CallContext {
  requestId: string;          // crypto.randomUUID() — same across before/success/error for one tool call
  toolName: string;           // the registered tool name (e.g. "list_tasks")
  toolDef: Omit<ToolDef, "ref" | "onError">;  // tool def without the function ref or per-tool error hook
  args: Record<string, unknown>;
  apiKey: string | undefined; // from the Authorization header; undefined if anonymous
  phase: "before" | "success" | "error";
  result?: unknown;           // present on "success"
  error?: unknown;            // present on "error"
  durationMs?: number;        // present on "success" and "error"
  startedAt: number;          // ms timestamp of dispatch start
}
```

---

## `OnCallResult`

```typescript
interface OnCallResult {
  abort?: boolean;             // before phase — skip dispatch, return error response
  errorMessage?: string;       // before phase — message when aborting (default: "Tool call rejected")
  message?: string;            // error phase — replace default error message
  extendArgs?: Record<string, unknown>;  // before phase — merge into dispatched args (v0.3.0+)
}
```

| Field | Phase | Description |
|-------|-------|-------------|
| `abort` | `before` | When `true`, framework returns an error response without dispatching. |
| `errorMessage` | `before` | Custom abort message. Falls back to `"Tool call rejected"`. |
| `message` | `error` | Replaces the framework's default `"Function execution failed"` text in the response. |
| `extendArgs` | `before` | **(v0.3.0)** Server-resolved key/value pairs merged into the dispatched function's args. Server-side wins on collision. Only honored during the `before` phase. Empty / undefined is a no-op. Keys SHOULD use the framework-reserved `_` prefix. |

### `extendArgs` example

```typescript
hooks: {
  onToolCall: async ({ apiKey, phase }) => {
    if (phase !== "before") return;
    const validated = await validateKey(apiKey);
    if (!validated.valid) return { abort: true, errorMessage: "Invalid key" };
    return {
      extendArgs: {
        _mcp_apiKey: apiKey,
        _mcp_scopes: validated.scopes,
      },
    };
  },
}
```

The dispatched action's validator must declare the injected fields as required args:

```typescript
export const sensitiveAction = action({
  args: {
    _mcp_apiKey: v.string(),     // injected by framework
    _mcp_scopes: v.array(v.string()),
    targetId: v.id("things"),
  },
  handler: async (ctx, args) => {
    await assertMcpAuth(ctx, args._mcp_apiKey, "things:write");
    // ... real logic ...
  },
});
```

---

## Reserved `_` prefix in tool args (v0.3.0)

Arg keys starting with underscore are framework-controlled. Two layers protect them:

1. **Schema strip** — `prepareTools` removes `_*` keys from the published JSON Schema. The MCP SDK's Zod validator silently strips `_*` keys from incoming requests (Zod default strip mode), so spoofed values never reach the dispatched function.
2. **Handler reject** — The registered tool handler explicitly rejects any `_*` key reaching it with a structured `"Reserved arg keys not allowed"` error before the hook runs. This defends against transports that bypass the SDK's schema validation (custom transports, future protocol changes, direct `registerTools` callers).

Hook-supplied `_*` keys via `extendArgs` are exempt from both layers — the server is trusted by definition.

See [Security › Server-side Context Propagation](./security.md#server-side-context-propagation-v030) for the full pattern.

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
  LifecycleHooks,
  CallContext,
  OnCallResult,
} from "@vllnt/convex-mcp";
```
