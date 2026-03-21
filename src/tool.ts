import type { ToolDef, ConvexValidator } from "./types.js";

interface ToolOptions {
  args?: ConvexValidator;
  description?: string;
}

export function query(ref: unknown, options: ToolOptions = {}): ToolDef {
  return {
    ref,
    type: "query",
    args: options.args,
    description: options.description,
  };
}

export function mutation(ref: unknown, options: ToolOptions = {}): ToolDef {
  return {
    ref,
    type: "mutation",
    args: options.args,
    description: options.description,
  };
}

export function action(ref: unknown, options: ToolOptions = {}): ToolDef {
  return {
    ref,
    type: "action",
    args: options.args,
    description: options.description,
  };
}
