import type { ConvexValidator } from "../types.js";

export type FunctionType = "query" | "mutation" | "action";

export type HookResult = OnCallResult | undefined;
export type HookReturn = HookResult | Promise<HookResult> | Promise<void>;

export interface ToolDef {
  ref: unknown;
  type: FunctionType;
  args?: ConvexValidator;
  description?: string;
  tags?: Record<string, string>;
  timeout?: number;
  onError?: (ctx: CallContext & { phase: "error" }) => HookReturn;
}

export interface CallContext {
  requestId: string;
  toolName: string;
  toolDef: Omit<ToolDef, "ref" | "onError">;
  args: Record<string, unknown>;
  apiKey: string | undefined;
  phase: "before" | "success" | "error";
  result?: unknown;
  error?: unknown;
  durationMs?: number;
  startedAt: number;
}

export interface OnCallResult {
  /** Set true to abort execution. Only checked during "before" phase. */
  abort?: boolean;
  /** Custom error message when aborting (before phase). Default: "Tool call rejected" */
  errorMessage?: string;
  /** Custom error message on failure (error phase). Default: "Function execution failed" */
  message?: string;
}

export interface LifecycleHooks {
  onToolCall?: (ctx: CallContext) => HookReturn;
}
