# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-04-25

### Changed

- Upgraded core runtime and development dependencies, including MCP SDK 1.29, Convex 1.36, Vitest 4, and TypeScript 6
- Moved the exported validator helpers onto Zod 4, making the public API align with the new schema runtime
- Replaced `zod-to-json-schema` in tests with Zod 4's built-in JSON Schema support
- Added TS 6 deprecation silencing for DTS builds and tightened a few internal/test patterns required by newer toolchain rules

## [0.2.0] - 2026-03-27

### Added

- Opt-in cursor-based pagination for `tools/list` (MCP spec-compliant)
- Two-phase tool discovery: `tools/list_summary` (name + description) and `tools/describe` (full schema on-demand)
- `PaginationConfig` on `ServerConfig` with `pageSize` and `twoPhaseDiscovery` options
- HMAC-signed cursors with constant-time verification (`crypto.subtle.verify`)
- Exported `ToolSummary` and `ToolPage` types for consumer use
- `pageSize` validation rejects NaN, floats, and values < 1
- SDK canary test for `setRequestHandler` override compatibility
- 113 tests with 100% coverage on all metrics (statements, branches, functions, lines)

### Changed

- Restructured `src/` from flat files to domain-scoped folders (`tools/`, `resources/`, `pagination/`)
- `server.ts` reduced from 458 to ~130 LOC (thin orchestrator)
- Replaced 13 of 16 `as` type assertions with runtime type guards
- Zero public API changes — DTS output identical

### Security

- Constant-time HMAC verification via `crypto.subtle.verify()` prevents timing-based cursor attacks
- HMAC-signed cursors prevent cardinality leaks and tampering
- `atob()` wrapped in try-catch for edge runtime compatibility (Cloudflare Workers)
- Runtime type guards validate all parsed data (cursors, validators) before narrowing

## [0.1.1] - 2026-03-25

### Fixed

- Use Web Crypto API (`crypto.randomUUID`) instead of `node:crypto` for broader runtime compatibility
- Publish CI now uses OIDC provenance instead of `NPM_TOKEN` secret

## [0.1.0] - 2026-03-24

### Added

- `createMCPServer()` with default-deny auth (startup error without `auth.validate`)
- `query()`, `mutation()`, `action()` typed wrappers (no error-prone type strings)
- `resource()` helper for MCP resources with URI templates
- Convex validator to Zod schema converter (all `v.*` types, literal union to `enum`)
- `WebStandardStreamableHTTPServerTransport` integration for Next.js App Router
- Generic error responses (no Convex message leakage)
- Optional Convex auth propagation via `convexToken` hook
- Injectable `ConvexClient` interface for testing with `convex-test`
- Lifecycle hooks (`onToolCall` with before/success/error phases)
- Per-tool config: `tags`, `timeout`, `onError`
- `X-Request-Id` header on all responses
- 74 tests with 100% coverage on all metrics
- GitHub Actions CI (Node 20 + 22)
- Full documentation: README, docs/, llms.txt, llms-full.txt
