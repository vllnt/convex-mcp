import type { ToolDef, ConvexValidator, CallContext, OnCallResult } from "./types.js";

interface ToolOptions {
  args?: ConvexValidator;
  description?: string;
  tags?: Record<string, string>;
  timeout?: number;
  onError?: (ctx: CallContext & { phase: "error" }) => Promise<OnCallResult | void> | OnCallResult | void;
}

export function query(ref: unknown, options: ToolOptions = {}): ToolDef {
  return {
    ref,
    type: "query",
    args: options.args,
    description: options.description,
    tags: options.tags,
    timeout: options.timeout,
    onError: options.onError,
  };
}

export function mutation(ref: unknown, options: ToolOptions = {}): ToolDef {
  return {
    ref,
    type: "mutation",
    args: options.args,
    description: options.description,
    tags: options.tags,
    timeout: options.timeout,
    onError: options.onError,
  };
}

export function action(ref: unknown, options: ToolOptions = {}): ToolDef {
  return {
    ref,
    type: "action",
    args: options.args,
    description: options.description,
    tags: options.tags,
    timeout: options.timeout,
    onError: options.onError,
  };
}
