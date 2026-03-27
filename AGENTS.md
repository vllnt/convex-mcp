# @vllnt/convex-mcp — Agent Instructions

## What This Is

NPM library that exposes Convex backend functions as MCP (Model Context Protocol) tools via Streamable HTTP. Customers connect their LLM agents to your Convex app.

## Architecture

```
src/
├── server.ts              — Thin orchestrator: createMCPServer() + handler()
├── auth.ts                — API key extraction + validation
├── validators.ts          — Convex validator → Zod schema converter
├── types.ts               — Shared types + re-exports from domain modules
├── index.ts               — Public API barrel
│
├── tools/
│   ├── register.ts        — registerTools() + hooks + executeWithTimeout
│   ├── helpers.ts         — query(), mutation(), action() typed wrappers
│   └── types.ts           — ToolDef, CallContext, OnCallResult, LifecycleHooks
│
├── resources/
│   ├── register.ts        — registerResources() + prepareResources()
│   ├── helpers.ts         — resource() wrapper
│   └── types.ts           — ResourceDef
│
└── pagination/
    ├── cursor.ts          — HMAC encode/decode (internal, not exported)
    ├── handlers.ts        — registerPaginationHandlers + registerTwoPhaseHandlers
    ├── context.ts         — createPaginationContext + pageSize validation
    └── types.ts           — PaginationConfig, ToolSummary, ToolPage
```

## Key Patterns

- **Default-deny auth**: `createMCPServer()` throws without `auth.validate`
- **Typed wrappers**: `query()`/`mutation()`/`action()` — no string type annotations
- **Hook system**: Single `onToolCall` hook with `phase: "before" | "success" | "error"`
- **Injectable client**: `ConvexClient` interface for testing with `convex-test`
- **Generic errors**: Convex error messages never leak to MCP clients
- **Domain-scoped modules**: `tools/`, `resources/`, `pagination/` — each concern isolated
- **Pagination**: Opt-in cursor-based pagination via `ServerConfig.pagination`
- **Two-phase discovery**: `tools/list_summary` + `tools/describe` (non-standard, custom agents only)
- **HMAC cursors**: Per-instance secret, constant-time verification via `crypto.subtle.verify()`
- **Type safety**: Runtime type guards replace `as` casts; only 3 guard-proven assertions remain

## Testing

```bash
pnpm test              # 113 tests
pnpm typecheck         # Both tsconfigs (src + tests)
pnpm build             # ESM + CJS output
```

- 100% coverage enforced on all metrics (statements, branches, functions, lines)
- `tests/e2e.test.ts` uses `convex-test` for real in-memory Convex execution
- `tests/hooks.test.ts` covers lifecycle hook behavior
- `tests/pagination.test.ts` covers pagination, two-phase, cursor security, SDK canary
- `tests/validators.test.ts` covers all Convex → Zod type mappings
- Mock `ConvexHttpClient` via `vi.mock("convex/browser")`

## Conventions

- `convex` is a peer dependency (never bundled)
- `WebStandardStreamableHTTPServerTransport` for Web API compatibility
- `X-Request-Id` header on all responses
- Hook errors are swallowed (logged, never crash server)
- `toolDef.ref` and `toolDef.onError` stripped from hook context (no capability escalation)
- Pagination handler override MUST happen after all `mcpServer.tool()` calls
- `tools/list` without cursor always returns ALL tools (critical invariant)
- No `as` casts without guard: type guards validate at runtime before narrowing
