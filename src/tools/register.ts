import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import type { ConvexClient } from "../types.js";
import { convexArgsToZod } from "../validators.js";
import type { CallContext, LifecycleHooks, OnCallResult, ToolDef } from "./types.js";

interface PreparedTool {
  name: string;
  description: string;
  zodShape: Record<string, z.ZodTypeAny>;
  toolDef: ToolDef;
}

/**
 * Underscore-prefixed arg keys are reserved for framework-injected context.
 *
 * - Request args containing `_*` keys are rejected before hook invocation.
 * - Tool-level Convex validators MAY declare `_*` fields so the action
 *   handler receives server-injected values; these are stripped from the
 *   published JSON Schema so MCP clients neither see nor pass them.
 */
function isReservedKey(key: string): boolean {
  return key.startsWith("_");
}

function stripReservedFromShape(
  shape: Record<string, z.ZodTypeAny>,
): Record<string, z.ZodTypeAny> {
  const filtered: Record<string, z.ZodTypeAny> = {};
  for (const [key, value] of Object.entries(shape)) {
    if (!isReservedKey(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

export function prepareTools(tools: Record<string, ToolDef>): PreparedTool[] {
  return Object.entries(tools).map(([name, toolDef]) => {
    const zodSchema = toolDef.args ? convexArgsToZod(toolDef.args) : undefined;
    const fullShape = zodSchema?.shape ?? {};
    return {
      name,
      description: toolDef.description ?? "",
      zodShape: stripReservedFromShape(fullShape),
      toolDef,
    };
  });
}

/**
 * Returns tools whose top-level args contain reserved `_*` keys.
 *
 * Used by `createMCPServer` at construction to surface a footgun: a tool that
 * declares `_*` args without an `onToolCall` hook will have those args stripped
 * from the published schema and never injected, so every dispatched call will
 * fail Convex's own validator with "missing required arg".
 */
export function findToolsWithReservedArgs(
  tools: Record<string, ToolDef>,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const [name, toolDef] of Object.entries(tools)) {
    if (toolDef.args?.kind !== "object" || !toolDef.args.fields) continue;
    const reserved = Object.keys(toolDef.args.fields).filter(isReservedKey);
    if (reserved.length > 0) result.set(name, reserved);
  }
  return result;
}

async function invokeHook(
  hooks: LifecycleHooks | undefined,
  ctx: CallContext,
  toolDef: ToolDef,
): Promise<OnCallResult | undefined> {
  try {
    if (ctx.phase === "error" && toolDef.onError) {
      const result = await toolDef.onError(ctx as CallContext & { phase: "error" });
      return result ?? undefined;
    }
    if (hooks?.onToolCall) {
      const result = await hooks.onToolCall(ctx);
      return result ?? undefined;
    }
    return;
  } catch (hookError) {
    console.error("[convex-mcp] hook error (swallowed)", {
      requestId: ctx.requestId,
      phase: ctx.phase,
      tool: ctx.toolName,
      error: hookError,
    });
    return;
  }
}

function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | undefined,
): Promise<T> {
  if (!timeoutMs) return promise;

  let handle: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(handle)),
    new Promise<never>((_, reject) => {
      handle = setTimeout(() => reject(new Error("Tool execution timed out")), timeoutMs);
    }),
  ]);
}

export function registerTools(
  mcpServer: McpServer,
  client: ConvexClient,
  tools: PreparedTool[],
  hooks: LifecycleHooks | undefined,
  requestId: string,
  apiKey: string | undefined,
): void {
  for (const { name, description, zodShape, toolDef } of tools) {
    mcpServer.tool(
      name,
      description,
      zodShape,
      async (args: Record<string, unknown>) => {
        const startedAt = Date.now();
        const { ref: _ref, onError: _onError, ...safeDef } = toolDef;

        const reservedKeys = Object.keys(args).filter(isReservedKey);
        if (reservedKeys.length > 0) {
          console.warn("[convex-mcp] reserved-key reject", {
            requestId,
            tool: name,
            keys: reservedKeys,
          });
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `Reserved arg keys not allowed in request: ${reservedKeys.join(", ")}. ` +
                  `Keys starting with "_" are reserved for framework-injected context.`,
              },
            ],
            isError: true,
          };
        }

        const baseCtx = {
          requestId,
          toolName: name,
          toolDef: safeDef,
          args,
          apiKey,
          startedAt,
        };

        const beforeCtx: CallContext = { ...baseCtx, phase: "before" };
        const beforeResult = await invokeHook(hooks, beforeCtx, toolDef);
        if (beforeResult?.abort) {
          return {
            content: [{ type: "text" as const, text: beforeResult.errorMessage ?? "Tool call rejected" }],
            isError: true,
          };
        }

        const dispatchArgs =
          beforeResult?.extendArgs && Object.keys(beforeResult.extendArgs).length > 0
            ? { ...args, ...beforeResult.extendArgs }
            : args;

        try {
          const callPromise = (async () => {
            switch (toolDef.type) {
              case "query":
                return await client.query(toolDef.ref, dispatchArgs);
              case "mutation":
                return await client.mutation(toolDef.ref, dispatchArgs);
              case "action":
                return await client.action(toolDef.ref, dispatchArgs);
              default:
                throw new Error(`Unknown function type: ${String(toolDef.type)}`);
            }
          })();

          const result = await executeWithTimeout(callPromise, toolDef.timeout);
          const durationMs = Date.now() - startedAt;

          const successCtx: CallContext = {
            ...baseCtx,
            phase: "success",
            result,
            durationMs,
          };
          await invokeHook(hooks, successCtx, toolDef);

          return {
            content: [{ type: "text" as const, text: JSON.stringify(result ?? null, null, 2) }],
          };
        } catch (error) {
          const durationMs = Date.now() - startedAt;
          const errorCtx: CallContext = {
            ...baseCtx,
            phase: "error",
            error,
            durationMs,
          };

          const errorResult = await invokeHook(hooks, errorCtx, toolDef);
          const errorMessage = errorResult?.message ?? "Function execution failed";

          console.error("[convex-mcp] tool execution failed", {
            requestId,
            tool: name,
            durationMs,
            error,
          });

          return {
            content: [{ type: "text" as const, text: errorMessage }],
            isError: true,
          };
        }
      },
    );
  }
}
