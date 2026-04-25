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

export function prepareTools(tools: Record<string, ToolDef>): PreparedTool[] {
  return Object.entries(tools).map(([name, toolDef]) => {
    const zodSchema = toolDef.args ? convexArgsToZod(toolDef.args) : undefined;
    return {
      name,
      description: toolDef.description ?? "",
      zodShape: zodSchema?.shape ?? {},
      toolDef,
    };
  });
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

        try {
          const callPromise = (async () => {
            switch (toolDef.type) {
              case "query":
                return await client.query(toolDef.ref, args);
              case "mutation":
                return await client.mutation(toolDef.ref, args);
              case "action":
                return await client.action(toolDef.ref, args);
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
