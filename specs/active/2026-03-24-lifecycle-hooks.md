---
title: "Lifecycle hooks + per-tool config + observability"
status: active
created: 2026-03-24
estimate: 2h
tier: mini
---

# Lifecycle hooks + per-tool config + observability

## Context

Add extensibility hooks to `@vllnt/convex-mcp` as integration points for `@vllnt/convex-api-keys` and `@vllnt/convex-analytics`. Simplified design from spec review: single `onToolCall` hook with phase discriminant, not 5 separate hooks.

## Scope

- [ ] 1. Types: `CallContext`, `OnCallResult`, `LifecycleHooks` + extend `ToolDef`/`ServerConfig`
- [ ] 2. Update `auth.ts`: return `apiKey` in success result
- [ ] 3. Update `tool.ts`: add `tags`/`onError` to ToolOptions
- [ ] 4. Implement hooks in `server.ts`: requestId, apiKey threading, hook execution, timeout
- [ ] 5. `X-Request-Id` response header (wrap SSE Response)
- [ ] 6. Export new types + update README
- [ ] 7. Tests (~12 new)

## ACs

- [ ] AC-1: `onToolCall` fires with `{ requestId, toolName, args, apiKey, phase: "before" }`; can return `{ abort: true }`
- [ ] AC-2: `onToolCall` fires with `phase: "success"` including `result` + `durationMs`
- [ ] AC-3: `onToolCall` fires with `phase: "error"` including `error` + `durationMs`; custom message via `{ message }`
- [ ] AC-4: Per-tool `onError` overrides server hook for error phase
- [ ] AC-5: `toolDef.tags` accessible in context
- [ ] AC-6: `toolDef.timeout` aborts long-running calls
- [ ] AC-7: `X-Request-Id` header on all responses
- [ ] AC-E1: Hook throws → server stays healthy, default behavior
- [ ] AC-E2: No hooks → existing behavior unchanged

## Timeline

| Action | Timestamp | Notes |
|--------|-----------|-------|
| plan | 2026-03-24 | Created |
| spec-review | 2026-03-24 | 4 perspectives. Simplified from 12→7 scope items. |
