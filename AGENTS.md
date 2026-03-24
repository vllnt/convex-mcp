# @vllnt/convex-mcp — Agent Instructions

## What This Is

NPM library that exposes Convex backend functions as MCP (Model Context Protocol) tools via Streamable HTTP. Customers connect their LLM agents to your Convex app.

## Architecture

```
src/
├── server.ts      — createMCPServer() core, hook execution, request handling
├── types.ts       — All TypeScript interfaces (ConvexClient, CallContext, etc.)
├── validators.ts  — Convex validator → Zod schema converter
├── tool.ts        — query(), mutation(), action() typed wrappers
├── resource.ts    — resource() helper for MCP resources
├── auth.ts        — API key extraction + validation
└── index.ts       — Public API exports
```

## Key Patterns

- **Default-deny auth**: `createMCPServer()` throws without `auth.validate`
- **Typed wrappers**: `query()`/`mutation()`/`action()` — no string type annotations
- **Hook system**: Single `onToolCall` hook with `phase: "before" | "success" | "error"`
- **Injectable client**: `ConvexClient` interface for testing with `convex-test`
- **Generic errors**: Convex error messages never leak to MCP clients

## Testing

```bash
pnpm test              # 74 tests
pnpm typecheck         # Both tsconfigs (src + tests)
pnpm build             # ESM + CJS output
```

- 100% coverage enforced on all metrics (statements, branches, functions, lines)
- `tests/e2e.test.ts` uses `convex-test` for real in-memory Convex execution
- `tests/hooks.test.ts` covers lifecycle hook behavior
- Mock `ConvexHttpClient` via `vi.mock("convex/browser")`

## Conventions

- `convex` is a peer dependency (never bundled)
- `WebStandardStreamableHTTPServerTransport` for Web API compatibility
- `X-Request-Id` header on all responses
- Hook errors are swallowed (logged, never crash server)
- `toolDef.ref` and `toolDef.onError` stripped from hook context (no capability escalation)
