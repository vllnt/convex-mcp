import type { ConvexValidator } from "../types.js";

export interface ResourceDef {
  ref: unknown;
  args?: ConvexValidator;
  description?: string;
}
