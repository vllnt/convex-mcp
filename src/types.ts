export interface ConvexValidator {
  kind: string;
  isOptional: "required" | "optional";
  tableName?: string;
  value?: unknown;
  fields?: Record<string, ConvexValidator>;
  element?: ConvexValidator;
  members?: ConvexValidator[];
  key?: ConvexValidator;
}

/**
 * Injectable Convex client interface. Compatible with both ConvexHttpClient
 * (production) and convex-test's `t` (testing).
 *
 * Uses `any` for functionRef because Convex's FunctionReference is a complex
 * generic that cannot be expressed without importing convex internals.
 */
export interface ConvexClient {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  query(functionRef: any, ...args: any[]): Promise<any>;
  mutation(functionRef: any, ...args: any[]): Promise<any>;
  action(functionRef: any, ...args: any[]): Promise<any>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export interface AuthConfig {
  validate: (apiKey: string) => Promise<boolean> | boolean;
  convexToken?: (apiKey: string) => Promise<string | undefined> | string | undefined;
}

export { type PaginationConfig, type ToolPage, type ToolSummary } from "./pagination/types.js";
export { type ResourceDef } from "./resources/types.js";
export { type CallContext, type FunctionType, type LifecycleHooks, type OnCallResult, type ToolDef } from "./tools/types.js";

export interface ServerConfig {
  auth: AuthConfig;
  tools?: Record<string, import("./tools/types.js").ToolDef>;
  resources?: Record<string, import("./resources/types.js").ResourceDef>;
  convexUrl?: string;
  client?: ConvexClient;
  hooks?: import("./tools/types.js").LifecycleHooks;
  name?: string;
  version?: string;
  pagination?: import("./pagination/types.js").PaginationConfig;
}

export interface ConvexMCPServer {
  handler: () => {
    GET: (request: Request) => Promise<Response>;
    POST: (request: Request) => Promise<Response>;
  };
}
