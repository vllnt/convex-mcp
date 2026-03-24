import type { ConvexValidator, ResourceDef } from "./types.js";

interface ResourceOptions {
  args?: ConvexValidator;
  description?: string;
}

export function resource(ref: unknown, options: ResourceOptions = {}): ResourceDef {
  return {
    ref,
    args: options.args,
    description: options.description,
  };
}
