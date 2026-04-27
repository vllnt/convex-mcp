---
title: "Lifecycle hooks + per-tool config + observability"
status: shipped
created: 2026-03-24
shipped: 2026-04-27
estimate: 2h
actual: 3h
tier: mini
---

# Lifecycle hooks + per-tool config + observability

## Context

Add extensibility hooks to `@vllnt/convex-mcp` as integration points for `@vllnt/convex-api-keys` and `@vllnt/convex-analytics`. Simplified design from spec review: single `onToolCall` hook with phase discriminant, not 5 separate hooks.

## Scope

- [x] 1. Types: `CallContext`, `OnCallResult`, `LifecycleHooks` + extend `ToolDef`/`ServerConfig`
- [x] 2. Update `auth.ts`: return `apiKey` in success result
- [x] 3. Update `tool.ts`: add `tags`/`onError` to ToolOptions
- [x] 4. Implement hooks in `server.ts`: requestId, apiKey threading, hook execution, timeout
- [x] 5. `X-Request-Id` response header (wrap SSE Response)
- [x] 6. Export new types + update README
- [x] 7. Tests (~12 new)
- [x] 8. v0.3.0 follow-up: `extendArgs` for hook-driven request context propagation
- [x] 9. v0.3.0 follow-up: reserved `_` prefix (schema strip + handler reject)
- [x] 10. Review-driven hardening: hook fail-open doc, construction-time warn, reject log, test fixture cleanup

## ACs

- [x] AC-1: `onToolCall` fires with `{ requestId, toolName, args, apiKey, phase: "before" }`; can return `{ abort: true }`
- [x] AC-2: `onToolCall` fires with `phase: "success"` including `result` + `durationMs`
- [x] AC-3: `onToolCall` fires with `phase: "error"` including `error` + `durationMs`; custom message via `{ message }`
- [x] AC-4: Per-tool `onError` overrides server hook for error phase
- [x] AC-5: `toolDef.tags` accessible in context
- [x] AC-6: `toolDef.timeout` aborts long-running calls
- [x] AC-7: `X-Request-Id` header on all responses
- [x] AC-E1: Hook throws → server stays healthy, default behavior
- [x] AC-E2: No hooks → existing behavior unchanged
- [x] AC-8: Hook can return `extendArgs` to merge server-resolved context into dispatched args (server-side wins on collision; only `before` honors)
- [x] AC-9: Reserved `_*` keys stripped from published JSON Schema; handler-layer reject for non-SDK transports
- [x] AC-10: Construction-time warn surfaces tools that declare `_*` args without an `onToolCall` hook configured

## Quality Gates (Final)

- Lint: PASS (biome, 28 files)
- Typecheck: PASS (both tsconfigs)
- Tests: PASS — 132/132 (was 113 pre-spec)
- Coverage: 100% on statements (312), branches (206), functions (63), lines (289)
- Build: PASS — ESM 23.20 KB, CJS 23.54 KB, DTS 6.07 KB

## Notes

- v0.3.0 also bundles dependency upgrades (MCP SDK 1.29, Convex 1.36, Vitest 4, TS 6) and the validators-on-Zod-4 migration (carried over from earlier work).
- `extendArgs` semantics: server-wins-on-collision, `before`-only honor, empty/undefined no-op, abort precedence over extend. All four invariants documented in JSDoc and tested.
- Two-layer reserved-prefix protection: schema strip (clients silently dropped via SDK Zod default-strip) + handler reject (defense-in-depth for non-SDK transports). Asymmetry intentional and tested.
- Hook fail-open is by design (transient failures must not crash the server). The action validator declaring `_*` fields as required is what makes the system safe — documented as non-negotiable in `docs/security.md`.
- Construction-time warn lists affected tools + keys; fires once per server when tools declare `_*` but no hook is configured.

## Timeline

| Action | Timestamp | Notes |
|--------|-----------|-------|
| plan | 2026-03-24 | Created |
| spec-review | 2026-03-24 | 4 perspectives. Simplified from 12→7 scope items. |
| ship (initial) | 2026-03-24 | Hooks + per-tool config + X-Request-Id landed |
| ship (v0.3.0 extend) | 2026-04-26 | extendArgs + reserved `_` prefix (commit 4ff8057) |
| docs | 2026-04-27 | Cross-surface doc coverage (commit 2822ef5) |
| review | 2026-04-27 | Deep mode — 4 WARNs, no blockers |
| ship (review fixes) | 2026-04-27 | Security doc callout, construction warn, reject log, test cleanup (commit 107824a) |
| done | 2026-04-27 | Archived |
