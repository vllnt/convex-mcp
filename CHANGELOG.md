# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
