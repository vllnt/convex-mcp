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

import type { PaginationConfig, ToolPage, ToolSummary } from "./pagination/types.js";
import type { ResourceDef } from "./resources/types.js";
import type { CallContext, FunctionType, LifecycleHooks, OnCallResult, ToolDef } from "./tools/types.js";

export type { CallContext, FunctionType, LifecycleHooks, OnCallResult, PaginationConfig, ResourceDef, ToolDef, ToolPage, ToolSummary };

export interface ServerConfig {
  auth: AuthConfig;
  tools?: Record<string, ToolDef>;
  resources?: Record<string, ResourceDef>;
  convexUrl?: string;
  client?: ConvexClient;
  hooks?: LifecycleHooks;
  name?: string;
  version?: string;
  pagination?: PaginationConfig;
}

export interface ConvexMCPServer {
  handler: () => {
    GET: (request: Request) => Promise<Response>;
    POST: (request: Request) => Promise<Response>;
  };
}
