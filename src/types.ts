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

export type FunctionType = "query" | "mutation" | "action";

export interface ToolDef {
  ref: unknown;
  type: FunctionType;
  args?: ConvexValidator;
  description?: string;
}

export interface ResourceDef {
  ref: unknown;
  args?: ConvexValidator;
  description?: string;
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

export interface ServerConfig {
  auth: AuthConfig;
  tools?: Record<string, ToolDef>;
  resources?: Record<string, ResourceDef>;
  convexUrl?: string;
  client?: ConvexClient;
  name?: string;
  version?: string;
}

export interface ConvexMCPServer {
  handler: () => {
    GET: (request: Request) => Promise<Response>;
    POST: (request: Request) => Promise<Response>;
  };
}
