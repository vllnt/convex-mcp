---
title: "Init convex-mcp package"
status: active
created: 2026-03-21
estimate: 8h
tier: standard
issue: https://github.com/vllnt/convex-mcp/issues/1
---

# Init convex-mcp package

## Context

No Convex MCP package exists that exposes user-defined functions as MCP tools. Existing packages (`convex-mcp-visual`, `convex-mcp-nodebench`) are dev inspection/audit tools. Every Convex dev building AI features needs a way to connect LLMs to their backend functions — this package fills that gap with a `createMCPServer()` API that auto-generates MCP tool definitions from Convex function validators and serves them over Streamable HTTP.

**Target persona:** Convex developer building internal AI tools or prototypes where a single service account identity is acceptable. Multi-tenant SaaS with per-user auth is a v2 concern.

## Codebase Impact (MANDATORY)

| Area | Impact | Detail |
|------|--------|--------|
| `package.json` | CREATE | Package manifest with pnpm, TypeScript, `@modelcontextprotocol/sdk`, `convex` peer dep |
| `tsconfig.json` | CREATE | TypeScript config targeting ESM output |
| `tsup.config.ts` | CREATE | Build config for dual CJS/ESM output |
| `src/index.ts` | CREATE | Public API exports: `createMCPServer`, `query`, `mutation`, `action`, `resource` |
| `src/server.ts` | CREATE | Core `createMCPServer()` — wires Convex function refs to MCP tools |
| `src/tool.ts` | CREATE | `query()`, `mutation()`, `action()` typed wrappers — pair function ref + validator + metadata |
| `src/resource.ts` | CREATE | `resource()` helper — pairs query ref + validator for MCP resources |
| `src/validators.ts` | CREATE | Convex validator → Zod schema converter (recursive, handles all `v.*` types) |
| `src/handler.ts` | CREATE | Web API HTTP handler adapter (`Request` → MCP → `Response`) for Next.js App Router |
| `src/types.ts` | CREATE | Shared TypeScript types (`ToolDef`, `ResourceDef`, `ServerConfig`, etc.) |
| `src/auth.ts` | CREATE | Auth middleware — API key validation (REQUIRED, default-deny) + optional Convex auth hook |
| `tests/validators.test.ts` | CREATE | Unit tests for Convex → Zod conversion |
| `tests/server.test.ts` | CREATE | Integration tests for tool registration + execution |
| `tests/handler.test.ts` | CREATE | Tests for HTTP handler (request → response lifecycle) |
| `README.md` | MODIFY | Comprehensive open-source README: badges, install, quickstart, API reference, examples, architecture |
| `LICENSE` | CREATE | MIT license |
| `CONTRIBUTING.md` | CREATE | Contribution guidelines: setup, PR process, coding standards |
| `llms.txt` | CREATE | LLM-readable project summary (name, description, API overview, quickstart) |
| `llms-full.txt` | CREATE | Full LLM context: complete API reference, all types, all validators, examples, error handling |
| `docs/getting-started.md` | CREATE | Installation + first MCP server in 5 minutes |
| `docs/api-reference.md` | CREATE | Full API docs: `createMCPServer`, `query`/`mutation`/`action`, `resource`, auth config, handler |
| `docs/validators.md` | CREATE | Convex → MCP schema mapping reference (every `v.*` type → JSON Schema output) |
| `docs/deployment.md` | CREATE | Deploy guides: Next.js App Router, Vercel, serverless constraints, Fluid Compute |
| `docs/security.md` | CREATE | Auth model, default-deny, Convex auth propagation, API key management, threat model |
| `docs/examples.md` | CREATE | Copy-pasteable examples: basic setup, auth, resources, multiple tools |

**Files:** 24 create | 1 modify | 0 affected
**Reuse:** None — greenfield package
**Breaking changes:** None — new package
**New dependencies:**
- `@modelcontextprotocol/sdk` (MCP server/transport) — no alternative, it IS the standard
- `convex` (peer dep) — required, this package wraps it
- `zod` (MCP SDK requires Zod schemas for tool inputSchema) — transitive via MCP SDK
- `tsup` (build tool) — lightweight, standard for TS library packages
- `vitest` (test runner) — fast, ESM-native, Zod-friendly
- `@vllnt/eslint-config` (dev dep) — shared ESLint config
- `@vllnt/typescript` (dev dep) — shared TypeScript config (extends in tsconfig.json)
- `@vllnt/logger` (dep) — structured logging for server-side error logging

## User Journey (MANDATORY)

### Primary Journey

ACTOR: Convex developer building AI features (internal tools / prototypes)
GOAL: Expose Convex functions as MCP tools accessible by LLMs via Streamable HTTP
PRECONDITION: Has a Convex project with defined functions (queries, mutations, actions) and validators

1. Developer installs package
   → `pnpm add @vllnt/convex-mcp`
   → Package added to project dependencies

2. Developer creates MCP server config file (`convex/mcp.ts`)
   → Imports `createMCPServer`, `query`, `mutation`, `action`, `resource` from package
   → Maps function references + validators to named tools/resources using typed wrappers
   → Exports the server instance

3. Developer creates Next.js route handler (`app/api/mcp/route.ts`)
   → Calls `mcp.handler()` to get `{ GET, POST }` exports
   → Route is live at `/api/mcp`

4. LLM client initializes against the MCP endpoint
   → Sends `initialize` request over HTTP POST with valid API key and `Accept: application/json, text/event-stream`
   → Receives `InitializeResult` with server capabilities for tools and resources

5. LLM client discovers available tools
   → Sends `tools/list` request
   → Receives tool definitions with names, descriptions, and JSON Schema input schemas (auto-generated from Convex validators)

6. LLM client discovers available resources
   → Sends `resources/templates/list` request
   → Receives URI template definitions and metadata for registered resources

7. LLM client calls a tool
   → Sends `tools/call` with tool name + arguments
   → Server validates args, routes to correct Convex function via `ConvexHttpClient`
   → Returns function result as MCP tool response

8. LLM client reads a resource
   → Sends `resources/read` for a concrete URI derived from a registered template
   → Server resolves URI params, executes the mapped Convex query, and returns MCP resource content

POSTCONDITION: Convex functions are accessible as MCP tools and resources over HTTP. LLMs can initialize, discover, and call them.

### Target API

```typescript
import { createMCPServer, query, mutation, action, resource } from "@vllnt/convex-mcp";
import { api } from "./_generated/api";
import { v } from "convex/values";

export const mcp = createMCPServer({
  // Auth is REQUIRED (default-deny). Server throws at startup without it.
  auth: {
    validate: async (key: string) => key === process.env.MCP_API_KEY,
    // Optional: propagate Convex auth context
    convexToken: async (key: string) => getConvexTokenForKey(key),
  },
  tools: {
    create_project: mutation(api.spaces.create, {
      args: v.object({ name: v.string(), description: v.optional(v.string()) }),
      description: "Create a new project",
    }),
    list_projects: query(api.spaces.list, {
      args: v.object({}),
      description: "List all projects",
    }),
    run_migration: action(api.migrations.run, {
      args: v.object({ version: v.number() }),
      description: "Run a database migration",
    }),
  },
  resources: {
    "space://{id}": resource(api.spaces.get, {
      args: v.object({ id: v.id("spaces") }),
      description: "Get a space by ID",
    }),
  },
});
```

### Error Journeys

E1. Invalid tool arguments
   Trigger: LLM sends args that don't match the Convex validator schema
   1. LLM calls tool with wrong argument types
      → Server validates args against Zod schema (converted from Convex validator)
      → MCP protocol returns error with validation details
   Recovery: LLM retries with corrected arguments

E2. Convex function execution failure
   Trigger: Convex function throws an error (e.g., validation error, DB constraint, auth failure)
   1. LLM calls tool with valid args
      → Server routes to Convex function via `ConvexHttpClient`
      → Convex throws `ConvexError` or runtime error
      → Server catches error, returns generic MCP error: "Function execution failed" (no Convex error message leaked — may contain PII or schema details)
   Recovery: LLM sees generic error, adjusts approach or retries

E3. Missing or invalid API key
   Trigger: Request arrives without valid API key (auth is always required)
   1. Client sends request without `Authorization` header (or invalid key)
      → Auth middleware rejects request before MCP processing
      → Returns 401 with error message
   Recovery: Client adds valid API key to request headers

E4. Convex deployment unreachable
   Trigger: `CONVEX_URL` is wrong or Convex backend is down
   1. LLM calls tool
      → `ConvexHttpClient` fails to connect
      → Server returns MCP error response indicating backend unavailability
   Recovery: Developer fixes `CONVEX_URL` or waits for Convex to recover

E5. No auth configured at startup
   Trigger: Developer calls `createMCPServer()` without `auth.validate`
   1. Server instantiation throws error: "Auth is required. Provide auth.validate to createMCPServer()."
   Recovery: Developer adds auth config

E6. Malformed JSON-RPC body
   Trigger: Client sends non-JSON or invalid JSON-RPC payload
   1. POST arrives with invalid body
      → Handler validates Content-Type is `application/json`
      → Handler parses JSON, catches parse error
      → Returns 400 with JSON-RPC error response
   Recovery: Client sends correctly formatted request

E7. Invalid cross-origin request
   Trigger: Browser or proxy sends request with disallowed `Origin`
   1. POST or GET arrives with an untrusted `Origin` header
      → Handler validates origin before MCP processing
      → Returns 403 without invoking MCP handlers
   Recovery: Client connects from an allowed origin or same-origin server context

### Edge Cases

EC1. Empty functions map: `createMCPServer({ tools: {}, auth })` → server starts with zero tools, `tools/list` returns empty array
EC2. Function with no args: `query(api.tasks.listAll, {})` → tool has empty inputSchema, callable with no args
EC3. Nested Convex validators: `v.object({ nested: v.object({ deep: v.array(v.string()) }) })` → correctly converted to nested Zod/JSON Schema
EC4. Convex `v.id("tableName")` validator: mapped to `z.string()` with description `"Convex document ID for table 'tableName'"` (semantic annotation for LLMs)
EC5. Optional fields: `v.optional(v.string())` → optional property in JSON Schema
EC6. Large response payload: Convex function returns large object → serialized as JSON text content in MCP response
EC7. Concurrent requests: stateless transport handles concurrent requests independently
EC8. `v.union([v.literal("a"), v.literal("b")])` → collapsed to `{ "enum": ["a", "b"] }` in JSON Schema (not `anyOf` with `const`)
EC9. `v.int64()` → mapped to `z.string()` with description `"64-bit integer as string (BigInt)"` (JSON cannot represent bigint; string preserves precision)
EC10. Batch JSON-RPC: `[{...}, {...}]` array body → accepted and processed as a valid Streamable HTTP POST body
EC11. Wrong Content-Type on POST → rejected with 415 before MCP processing
EC12. GET request when server-to-client streaming is disabled → returns 405 Method Not Allowed per Streamable HTTP
EC13. `v.record(v.string(), v.boolean())` → mapped to a JSON object with additional property validation
EC14. `v.bytes()` → mapped to a string schema with description indicating base64-encoded bytes
EC15. `v.any()` → mapped conservatively without silently dropping validation metadata

## Acceptance Criteria (MANDATORY)

### Must Have (BLOCKING — all must pass to ship)

- [ ] AC-1: GIVEN a valid `createMCPServer()` config with tools WHEN a client completes `initialize` and then requests `tools/list` THEN it returns tool definitions with correct names, descriptions, and JSON Schema input schemas
- [ ] AC-2: GIVEN a registered tool WHEN an LLM calls it with valid args THEN the corresponding Convex function executes via `ConvexHttpClient` and the result is returned as MCP text content
- [ ] AC-3: GIVEN Convex validators (`v.string()`, `v.number()`, `v.boolean()`, `v.object()`, `v.array()`, `v.union()`, `v.literal()`, `v.optional()`, `v.id()`, `v.null()`, `v.bytes()`, `v.int64()`, `v.float64()`, `v.record()`, `v.any()`) WHEN converted THEN they produce equivalent Zod schemas that generate correct JSON Schema
- [ ] AC-4: GIVEN `mcp.handler()` WHEN mounted as a Next.js App Router route handler THEN it handles the MCP initialization lifecycle and Streamable HTTP transport correctly: POST accepts single and batched JSON-RPC requests, GET either opens an SSE stream or returns 405 when streaming is disabled, and inbound HTTP requests are origin-validated before MCP processing
- [ ] AC-5: GIVEN registered resources with URI templates WHEN a client requests `resources/templates/list` THEN it receives discoverable template definitions with URI templates, names, and descriptions
- [ ] AC-6: GIVEN typed wrappers `query()`, `mutation()`, `action()` WHEN the tool is called THEN `ConvexHttpClient` uses the correct method (`.query()`, `.mutation()`, `.action()`) — no string `type` annotation needed
- [ ] AC-9: GIVEN `createMCPServer()` called WITHOUT `auth.validate` WHEN server instantiates THEN it throws an error (default-deny — no open endpoints)
- [ ] AC-10: GIVEN `v.id("tableName")` WHEN converted to JSON Schema THEN the schema includes description `"Convex document ID for table 'tableName'"` (semantic annotation for LLMs)
- [ ] AC-11: GIVEN `v.union([v.literal("a"), v.literal("b")])` WHEN converted to JSON Schema THEN it produces `{ "enum": ["a", "b"] }` (not `anyOf` with `const`)
- [ ] AC-12: GIVEN a registered resource with URI template WHEN a client reads a concrete resource URI THEN the corresponding Convex query executes and returns resource content
- [ ] AC-13: GIVEN an unknown or newly introduced Convex validator kind WHEN the converter encounters it THEN it throws a descriptive `UnsupportedValidatorError` instead of silently mis-converting the schema

### Error Criteria (BLOCKING — all must pass)

- [ ] AC-E1: GIVEN invalid arguments to a tool call WHEN the MCP server processes it THEN it returns an MCP error response with validation details (no crash, no stack trace)
- [ ] AC-E2: GIVEN a Convex function that throws WHEN called via a tool THEN the MCP server returns a generic error content `"Function execution failed"` (no Convex error message leaked — may contain PII or schema details)
- [ ] AC-E3: GIVEN auth is always required WHEN a request arrives without a valid API key THEN it returns 401 before any MCP processing
- [ ] AC-E4: GIVEN a POST with wrong Content-Type (not `application/json`) WHEN handler receives it THEN it returns 415 (Unsupported Media Type) without processing
- [ ] AC-E5: GIVEN a malformed JSON-RPC body (single request or batch) WHEN handler receives it THEN it returns 400 with a protocol-safe error response and does not crash
- [ ] AC-E6: GIVEN a request with a disallowed `Origin` header WHEN handler receives it THEN it returns 403 before any MCP processing

### Should Have (ship without, fix soon)

- [ ] AC-7: GIVEN a `createMCPServer()` config with `api: api` (full API object) WHEN server starts THEN all public functions are auto-registered as tools (auto-expose mode)
- [ ] AC-8: GIVEN a published package WHEN installed via `pnpm add @vllnt/convex-mcp` THEN TypeScript types resolve correctly and `convex` is a peer dependency

## Scope

- [ ] 1. Init package (pnpm, tsconfig, tsup, vitest) → AC-8
- [ ] 2. Convex validator → Zod schema converter (`src/validators.ts`) — with `v.id()` descriptions, literal union → `enum`, `v.int64()` → string, explicit handling for `v.bytes()`, `v.record()`, `v.any()`, and descriptive failure on unknown kinds → AC-3, AC-10, AC-11, AC-13
- [ ] 3. `query()`, `mutation()`, `action()` typed wrappers + types (`src/tool.ts`, `src/types.ts`) → AC-1, AC-6
- [ ] 4. `resource()` helper (`src/resource.ts`) — registers readable resources plus discoverable URI templates/metadata → AC-5, AC-12
- [ ] 5. `createMCPServer()` core — registers tools/resources on MCP server, exposes resource template discovery, and enforces auth requirement (`src/server.ts`) → AC-1, AC-2, AC-5, AC-6, AC-9, AC-12, AC-13
- [ ] 6. Web API HTTP handler (`src/handler.ts`) — `Request` → MCP → `Response` adapter with initialization flow, Streamable HTTP batch support, GET SSE-or-405 behavior, Content-Type checks, and Origin validation → AC-4, AC-E4, AC-E5, AC-E6
- [ ] 7. Error handling — validation errors → details, Convex errors → generic message, malformed protocol bodies → safe failures (`src/server.ts`, `src/handler.ts`) → AC-E1, AC-E2, AC-E5
- [ ] 8. Auth middleware (`src/auth.ts`) — REQUIRED API key validation + optional `convexToken` hook for auth propagation + allowed-origin enforcement → AC-E3, AC-9, AC-E6
- [ ] 9. Public API exports (`src/index.ts`) → AC-8
- [ ] 10. Tests — validator conversion, initialize/list/call/read flows, handler transport compliance, and auth/origin enforcement → AC-1 through AC-E6, AC-12, AC-13
- [ ] 11. Open-source README — badges, install, quickstart, full API reference, architecture, contributing link → AC-8
- [ ] 12. `docs/` — getting-started, api-reference, validators, deployment, security, examples → AC-8
- [ ] 13. `llms.txt` + `llms-full.txt` — LLM-readable project summary + complete API context → AC-8
- [ ] 14. Open-source scaffolding — LICENSE (MIT), CONTRIBUTING.md → AC-8

### Out of Scope

- Auto-expose all functions from `api` object (AC-7 — deferred, requires proxy traversal + schema discovery at runtime)
- SSE long-polling / stateful sessions (stateless-only for v1)
- Built-in rate limiting (use framework-level or Vercel Firewall)
- Convex real-time subscriptions as MCP resources (queries are point-in-time reads)
- CLI codegen tool (future: generate MCP config from Convex function definitions)
- MCP prompts support (tools + resources only for v1)
- Function-level access control / scoped API keys (v2 — document limitation in README)
- Health check endpoint (v2)
- Per-user Convex auth in multi-tenant SaaS contexts (v2 — `convexToken` hook enables it but is optional)
- Validator import from Convex function files (v2 — explore codegen or build-step approach)

## Quality Checklist

### Blocking (must pass to ship)

- [ ] All Must Have ACs passing
- [ ] All Error Criteria ACs passing
- [ ] All scope items implemented
- [ ] No regressions in existing tests
- [ ] Error states handled (not just happy path)
- [ ] No hardcoded secrets or credentials
- [ ] Convex validators cover all current Convex validator kinds used by this package (`string`, `number`, `boolean`, `null`, `id`, `literal`, `array`, `object`, `record`, `union`, `bytes`, `int64`, `float64`, `any`) with descriptive failure on unknown future kinds
- [ ] HTTP handler handles malformed JSON-RPC requests gracefully (400, not crash) for both single and batched POST bodies
- [ ] `ConvexHttpClient` URL is configurable (not hardcoded)
- [ ] Auth is required — no open endpoints by default
- [ ] Convex error messages NOT leaked to MCP responses (generic error only)
- [ ] Content-Type validated on POST requests
- [ ] `Origin` header validated on inbound Streamable HTTP requests
- [ ] Resource templates are discoverable via `resources/templates/list`
- [ ] Streamable HTTP GET returns SSE or 405 Method Not Allowed when streaming is disabled

### Advisory (should pass, not blocking)

- [ ] All Should Have ACs passing
- [ ] Package exports are tree-shakeable (ESM)
- [ ] TypeScript strict mode enabled
- [ ] README includes copy-pasteable example
- [ ] `convex` declared as peerDependency (not dependency)
- [ ] README documents: serverless timeout constraints, auth limitations, Convex auth propagation

## Test Strategy (MANDATORY)

### Test Environment

| Component | Status | Detail |
|-----------|--------|--------|
| Test runner | not configured | Will set up vitest |
| E2E framework | not configured | N/A — library package, integration tests instead |
| Test DB | N/A | Mock ConvexHttpClient (third-party backend, no local instance) |
| Mock inventory | 0 existing mocks | Greenfield |

### AC → Test Mapping

| AC | Test Type | Test Intention |
|----|-----------|----------------|
| AC-1 | Integration | `initialize` followed by `tools/list` returns correct tool definitions with JSON Schema from Convex validators |
| AC-2 | Integration | Tool call → ConvexHttpClient dispatches correct function → result returned as MCP content |
| AC-3 | Unit | Each supported Convex validator type converts to correct Zod schema (exhaustive for v1: string, number, boolean, object, array, union, literal, optional, id, null, bytes, int64, float64, record, any) |
| AC-4 | Integration | HTTP handler supports initialize + Streamable HTTP semantics: single POST, batch POST, GET → SSE or 405, and Origin validation |
| AC-5 | Integration | `resources/templates/list` returns registered URI templates and metadata |
| AC-6 | Integration | `query()` → `.query()`, `mutation()` → `.mutation()`, `action()` → `.action()` called on ConvexHttpClient |
| AC-9 | Unit | `createMCPServer()` without `auth.validate` → throws error |
| AC-10 | Unit | `v.id("spaces")` → JSON Schema has `description: "Convex document ID for table 'spaces'"` |
| AC-11 | Unit | `v.union([v.literal("a"), v.literal("b")])` → `{ "enum": ["a", "b"] }` not `anyOf` |
| AC-12 | Integration | `resources/read` resolves a concrete URI and executes the mapped Convex query |
| AC-13 | Unit | Unknown validator kind → descriptive `UnsupportedValidatorError` |
| AC-E1 | Integration | Invalid args → MCP error response with validation message |
| AC-E2 | Integration | Convex function throws → generic error content `"Function execution failed"` (no Convex details) |
| AC-E3 | Integration | Missing/invalid API key → 401 response |
| AC-E4 | Integration | POST with wrong Content-Type → 415 response |
| AC-E5 | Integration | Malformed JSON-RPC body (single or batch) → 400 / protocol-safe error response |
| AC-E6 | Integration | Disallowed `Origin` → 403 before MCP processing |

### Failure Mode Tests (MANDATORY)

| Source | ID | Test Intention | Priority |
|--------|----|----------------|----------|
| Error Journey | E1 | Integration: invalid args → error response, server stays healthy | BLOCKING |
| Error Journey | E2 | Integration: Convex error → generic error in MCP response, no details leaked | BLOCKING |
| Error Journey | E3 | Integration: no API key → 401, no MCP processing occurs | BLOCKING |
| Error Journey | E4 | Integration: ConvexHttpClient network error → MCP error response | BLOCKING |
| Error Journey | E5 | Unit: no auth config → startup throws | BLOCKING |
| Error Journey | E6 | Integration: malformed JSON body → 400, no crash | BLOCKING |
| Error Journey | E7 | Integration: disallowed `Origin` → 403, no MCP processing occurs | BLOCKING |
| Edge Case | EC1 | Unit: empty tools map → `tools/list` returns `[]` | Advisory |
| Edge Case | EC3 | Unit: deeply nested validators convert correctly | Advisory |
| Edge Case | EC4 | Unit: `v.id("table")` → `z.string()` with description | Advisory |
| Edge Case | EC5 | Unit: `v.optional(v.string())` → optional in JSON Schema | Advisory |
| Edge Case | EC8 | Unit: literal union → `enum` in JSON Schema | Advisory |
| Edge Case | EC9 | Unit: `v.int64()` → `z.string()` with description | Advisory |
| Edge Case | EC10 | Integration: batch JSON-RPC → accepted and processed correctly | Advisory |
| Edge Case | EC11 | Integration: wrong Content-Type → 415 | Advisory |
| Edge Case | EC12 | Integration: GET without streaming support → 405 | Advisory |
| Edge Case | EC13 | Unit: `v.record()` converts to object/additionalProperties schema | Advisory |
| Edge Case | EC14 | Unit: `v.bytes()` converts to a base64-oriented string schema | Advisory |
| Edge Case | EC15 | Unit: `v.any()` converts conservatively without silent schema loss | Advisory |
| Failure Hypothesis | FH-1 (HIGH) | Integration: malformed JSON-RPC body → 400 error, no crash | BLOCKING |
| Failure Hypothesis | FH-2 (MED) | Unit: unknown/unsupported Convex validator kind → throws descriptive error | BLOCKING |
| Failure Hypothesis | FH-3 (MED) | Integration: concurrent requests don't interfere (stateless transport) | BLOCKING |
| Failure Hypothesis | FH-4 (CRITICAL) | Unit: no auth → startup error (not open endpoint) | BLOCKING |
| Failure Hypothesis | FH-6 (HIGH) | Integration: typed wrappers enforce correct ConvexHttpClient method (no string typo possible) | BLOCKING |
| Failure Hypothesis | FH-9 (HIGH) | Integration: invalid `Origin` is rejected before MCP handling | BLOCKING |
| Failure Hypothesis | FH-10 (HIGH) | Integration: resources are discoverable via `resources/templates/list` before read attempts | BLOCKING |
| Failure Hypothesis | FH-11 (HIGH) | Integration: batch POST body is accepted per Streamable HTTP instead of rejected | BLOCKING |

### Mock Boundary

| Dependency | Strategy | Justification |
|------------|----------|---------------|
| `ConvexHttpClient` | Mock | No local Convex backend available in CI. Mock `.query()/.mutation()/.action()` with controlled responses. Convex is the external third-party system. |
| MCP SDK internals | Real | Use real `McpServer` — it's a local library, not external. Test against actual MCP protocol. |

### TDD Commitment

All tests written BEFORE implementation (RED → GREEN → REFACTOR).
Every Must Have + Error AC tracked in e2e-scenarios registry.

## Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| MCP SDK `handleRequest` requires Node req/res, not Web API | HIGH | HIGH | Spike both approaches (SDK adapter vs raw JSON-RPC) before committing. Kill criteria: if adapter requires >50 LOC of Node shim, implement raw JSON-RPC transport (~200 LOC). |
| Convex validator types not exhaustively covered | MED | MED | Enumerate all current `v.*` kinds from Convex docs/source, including `v.bytes()`, `v.record()`, and `v.any()`. Exhaustive switch with `default` that throws `UnsupportedValidatorError`. |
| FunctionReference has no runtime type info (query/mutation/action) | HIGH | CONFIRMED | Typed wrappers `query()`, `mutation()`, `action()` eliminate string annotation. TypeScript enforces correct usage at compile time. |
| FunctionReference has no runtime args schema | HIGH | CONFIRMED | Users provide Convex validator in wrapper config. Package converts to Zod. Validator duplication is a known DX trade-off — document in README, explore codegen/import path in v2. |
| MCP SDK Zod version mismatch (`zod/v4` vs user's `zod`) | MED | MED | Pin to MCP SDK's Zod version. Document requirement. Add peer dep constraint. Test with both Zod versions in CI. |
| `@vllnt/convex-api-keys` package may not exist yet | LOW | MED | Auth middleware accepts generic `validate(key: string) => Promise<boolean>`. Not coupled to specific package. |
| Convex error messages leak PII or schema details | MED | HIGH | Return generic "Function execution failed" — never pass through Convex error messages. Log original error server-side only. |
| Streamable HTTP transport details drift from current MCP spec | HIGH | MED | Encode transport requirements directly in AC-4 and handler tests: initialization flow, batch POST support, GET → SSE or 405, and origin validation. |
| Registered resources are unreadable in practice because clients cannot discover templates | HIGH | MED | Treat `resources/templates/list` as a first-class must-have API and test it before `resources/read`. |
| Serverless timeout kills long-running tool calls | MED | MED | Document constraint: Vercel Hobby 10s, Pro 60s, Fluid Compute up to 800s. Recommend Fluid Compute for long actions. |
| Convex ships official `@convex-dev/mcp` within 6 months | MED | MED | Business risk. Mitigate by shipping fast, establishing usage. Package is small and focused — low maintenance burden. |
| MCP `Mcp-Session-Id` header handling in stateless mode | LOW | MED | Explore exact MCP spec requirements during spike. Stateless server should echo or ignore session headers correctly per spec. |
| ConvexHttpClient shared mutable state under concurrency | MED | LOW | Audit at spike time. If shared state found, instantiate per-request (cheap for HTTP client). |

**Kill criteria:** If the MCP SDK fundamentally cannot work with Web API Request/Response (even via adapter, and adapter exceeds 50 LOC of Node shims), pivot to raw JSON-RPC implementation (~200 LOC) using only the SDK's `McpServer` for tool/resource registration.

## State Machine

**Status**: N/A — Stateless feature

**Rationale**: The MCP server is stateless (no session tracking in v1). Each HTTP request is independent: receive JSON-RPC → process → respond. No state transitions to track.

## Analysis

### Assumptions Challenged

| # | Assumption | Evidence For | Evidence Against | Verdict | Action |
|---|------------|-------------|-----------------|---------|--------|
| 1 | Convex validators can be converted to Zod schemas at runtime | Validators are runtime objects with `.kind` discriminant and structural properties | No official conversion utility exists; must handle all current kinds exhaustively including `v.bytes()`, `v.record()`, `v.any()`, and future unknown kinds | VALID | → update spec — make AC/test coverage consistent with current Convex validator surface |
| 2 | MCP SDK can work with Web API Request/Response | SDK is modular; protocol layer separate from transport | `NodeStreamableHTTPServerTransport` uses Node `IncomingMessage`/`ServerResponse`; transport obligations also include initialization flow, batch POSTs, GET/405 behavior, and origin validation | RISKY | → explore — spike before committing. Kill criteria: raw JSON-RPC if shim too complex |
| 3 | Users will accept providing validators alongside function refs | Forced by platform constraint; explicit > magic | Duplicates source of truth; validators drift silently when function signature changes; #1 adoption friction | RISKY | → document in README why validators are required; explore codegen/import path in v2 |
| 4 | `ConvexHttpClient` is the right server-side client | Official, framework-agnostic | `convex/nextjs` has `fetchQuery`/`fetchMutation`/`fetchAction` — more idiomatic for Next.js | VALID | → no action — framework-agnostic is correct for a library |
| 5 | Stateless MCP transport is sufficient for v1 | Most MCP tool servers are stateless; tools are request-response | Stateless still must honor initialize, batch POST support, GET/405 behavior, and origin validation; session handling cannot be the only protocol concern | VALID | → update spec — encode the non-session transport requirements explicitly |
| 6 | ~~`type: "query"` string annotation is acceptable~~ | ~~Forced by platform constraint~~ | Error-prone (typos compile fine). Typed wrappers eliminate this class of bugs. | ~~WRONG~~ FIXED | → update spec — replaced with `query()`/`mutation()`/`action()` wrappers |
| 7 | ~~"Public unless auth configured" is acceptable default~~ | ~~Opt-in security common in libs~~ | MCP endpoints are high-value targets (full function surface, machine speed). Default-open is a security footgun. | ~~DANGEROUS~~ FIXED | → update spec — default-deny (startup error without auth) |
| 8 | ~~Sanitized Convex errors (strip stack only) are safe~~ | ~~Stack traces stripped~~ | Convex error messages often contain schema names, function paths, PII | ~~PARTIAL~~ FIXED | → update spec — generic error message, no Convex details leaked |
| 9 | Resources only need read handlers, not discovery metadata | `resources/read` is the business operation | MCP clients typically discover templated resources before reading them; without `resources/templates/list`, resources may exist but remain invisible | WRONG | → update spec — make resource template discovery a must-have |

### Blind Spots

1. **[Security]** Convex auth context gap — `ConvexHttpClient` calls as anonymous by default. Functions using `ctx.auth` for authorization silently execute without identity. RESOLVED: added optional `convexToken` hook in auth config. Documented as known limitation — service account identity by default.

2. **[DX]** Validator duplication compounds at scale — 30 functions = 30 manual validator mirrors. Silent drift when signatures change. ACKNOWLEDGED: v1 trade-off. v2 will explore codegen/import path. README must document this limitation clearly.

3. **[Protocol]** SSE streams on Vercel serverless — 10-60s timeout kills long-running tool calls mid-stream. ACKNOWLEDGED: documented in Risks. Recommend Fluid Compute for long actions.

4. **[Protocol]** Batch JSON-RPC and Content-Type handling were unspecified. RESOLVED: AC-4 now requires batch POST support, while AC-E4 and AC-E5 cover wrong Content-Type and malformed protocol bodies.

5. **[Protocol]** `v.union` of literals → `anyOf` vs `enum` — interoperability risk with strict MCP clients. RESOLVED: added AC-11 (collapse to `enum`).

6. **[DX]** `v.id("tableName")` → `z.string()` loses semantic info — LLMs hallucinate IDs. RESOLVED: added AC-10 (description annotation).

7. **[Security]** No function-level access control — leaked key = access to ALL tools. ACKNOWLEDGED: v2 concern. Documented in Out of Scope.

8. **[Business]** Convex may ship official MCP package within 6 months. ACKNOWLEDGED: business risk. Mitigate by shipping fast.

9. **[Protocol]** Streamable HTTP compliance was under-specified for current MCP revisions. RESOLVED: AC-4 now requires initialize flow, batch POST support, GET → SSE or 405, and origin validation.

10. **[Protocol]** Resource templates were readable in theory but undiscoverable in practice. RESOLVED: added AC-5 for `resources/templates/list` and AC-12 for `resources/read`.

11. **[DX]** Validator coverage in AC-3 omitted `v.bytes()`, `v.record()`, and `v.any()` while the test plan already assumed broader coverage. RESOLVED: aligned AC-3, scope, and test mapping with the current Convex validator surface.

### Failure Hypotheses

| # | IF | THEN | BECAUSE | Severity | Mitigation |
|---|-----|------|---------|----------|------------|
| FH-1 | MCP client sends malformed JSON-RPC body | Server crashes or hangs | No input validation before MCP SDK processing | HIGH | Wrap in try/catch, validate Content-Type + JSON parse before forwarding. AC-E4, AC-E5 added. |
| FH-2 | User creates tool with unknown Convex validator kind | Converter silently drops the field or crashes | Non-exhaustive switch | MED | Exhaustive switch with `default` that throws `UnsupportedValidatorError` |
| FH-3 | Concurrent tool calls arrive simultaneously | Responses mixed up or blocking | Shared mutable state | MED | Stateless transport, per-request context. Audit ConvexHttpClient at spike. |
| FH-4 | Developer deploys without configuring auth | All functions callable by anyone on internet | Default-open | CRITICAL | FIXED: default-deny. AC-9 added — startup error without auth. |
| FH-5 | LLM calls mutation with semantically wrong but type-valid payload | Data corruption, no audit trail | Convex auth bypassed, mutations not idempotent | HIGH | DOCUMENTED: service account model. README warns about mutation exposure. `convexToken` hook enables per-user auth in v2. |
| FH-6 | Typed wrapper mismatch (e.g., calling `query()` on a mutation function ref) | Wrong ConvexHttpClient method called | TypeScript types should prevent this but runtime has no guard | HIGH | FIXED: typed wrappers `query()`/`mutation()`/`action()` — TypeScript generics enforce correct function type at compile time. Runtime fallback: Convex will error if wrong method used. |
| FH-7 | Attacker discovers API key | Enumerates all tools, calls any mutation | No per-function restriction | HIGH | DOCUMENTED: v2 scoped access. v1 mitigated by auth being required + README warning. |
| FH-8 | Serverless timeout mid-stream | Partial response, ambiguous state | Vercel 10-60s timeout | MED | DOCUMENTED in risks + README. Recommend Fluid Compute. |
| FH-9 | Handler accepts untrusted browser origins | Remote website can attempt DNS-rebinding or cross-origin abuse of the MCP endpoint | Streamable HTTP endpoint lacks explicit Origin validation | HIGH | FIXED IN SPEC: add AC-E6, handler scope, and blocking integration test for origin rejection. |
| FH-10 | Resources are registered but not exposed via discovery APIs | Clients never know they exist, so resource reads fail at the product level | Spec modeled `resources/read` but not `resources/templates/list` | HIGH | FIXED IN SPEC: add AC-5, scope item 4, and discovery integration tests. |
| FH-11 | Batch JSON-RPC POST bodies are rejected | Standards-compliant MCP clients fail against this server despite correct requests | Spec was based on an older transport assumption | HIGH | FIXED IN SPEC: replace batch rejection with batch support in AC-4 and tests. |

### The Real Question

The spec still solves the right problem for the stated persona (Convex dev building internal AI tools / prototypes). The trade-offs (validator duplication, service account auth, no subscriptions) remain acceptable for v1, but only if the package also behaves like a real MCP server: initialize correctly, follow current Streamable HTTP semantics, and expose resources through discovery APIs.

The earlier review resolved 3 blocking issues (default-open auth, type string errors, error message leakage). This follow-up review surfaced 4 more spec gaps that are now addressed in the document: initialize lifecycle, Streamable HTTP compliance, resource discovery, and validator coverage consistency. Remaining concerns (validator duplication, function-level authz, subscriptions) are still correctly deferred with documented rationale.

### Open Items

- [gap] `v.int64()` → `z.string()` with description — RESOLVED in AC-3 + EC9
- [risk] Convex auth propagation — RESOLVED: optional `convexToken` hook added to auth config
- [gap] Initialize lifecycle was implicit in the journey — RESOLVED in Primary Journey + AC-1/AC-4
- [gap] Resource template discovery was missing — RESOLVED in AC-5 + AC-12
- [gap] Streamable HTTP semantics were underspecified — RESOLVED in AC-4 + AC-E5/AC-E6
- [gap] Validator coverage omitted `v.bytes()`, `v.record()`, `v.any()` — RESOLVED in AC-3 + AC-13
- [gap] Health check endpoint — deferred to v2 → no action
- [risk] MCP SDK `zod/v4` compatibility — explore at ship time → explore
- [gap] Transport approach (SDK adapter vs raw JSON-RPC) — spike before building handler.ts → explore
- [gap] MCP session header handling in stateless mode — explore during spike → explore
- [gap] Validator import from Convex function files — explore codegen approach in v2 → no action (v2)
- [improvement] Function-level access control / scoped keys — v2 → no action
- [improvement] Streaming tool responses for long-running actions — v2 → no action

## Notes

Spec review applied: 2026-03-21. 4 perspectives: SDK/API Designer, Protocol Engineer, Security Engineer, Skeptic.
3 blocking issues found and resolved: (1) default-deny auth, (2) typed wrappers replace type strings, (3) generic error messages.
Spec review merge applied: 2026-03-21. Follow-up blockers addressed in the spec: (4) explicit initialize lifecycle, (5) Streamable HTTP compliance, (6) resource template discovery, (7) validator coverage aligned with current Convex docs.

## Progress

| # | Scope Item | Status | Iteration |
|---|-----------|--------|-----------|
| 1 | Init package | [x] Complete | 1 |
| 2 | Convex validator → Zod converter | [x] Complete | 1 |
| 3 | query/mutation/action typed wrappers | [x] Complete | 1 |
| 4 | resource() helper | [x] Complete | 1 |
| 5 | createMCPServer() core | [x] Complete | 1 |
| 6 | Web API HTTP handler | [x] Complete | 1 |
| 7 | Error handling | [x] Complete | 1 |
| 8 | Auth middleware | [x] Complete | 1 |
| 9 | Public API exports | [x] Complete | 1 |
| 10 | Tests | [x] Complete | 1 |
| 11 | Open-source README | [x] Complete | 1 |
| 12 | docs/ | [x] Complete | 1 |
| 13 | llms.txt + llms-full.txt | [x] Complete | 1 |
| 14 | LICENSE + CONTRIBUTING | [x] Complete | 1 |

## Timeline

| Action | Timestamp | Duration | Notes |
|--------|-----------|----------|-------|
| plan | 2026-03-21T16:00:00Z | - | Created from issue #1 |
| spec-review | 2026-03-21T16:30:00Z | - | 4 perspectives. 3 blocking fixes applied. |
| ship | 2026-03-21T23:00:00Z | - | All 14 scope items implemented. 37 tests passing. |
