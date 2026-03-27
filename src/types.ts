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
  tags?: Record<string, string>;
  timeout?: number;
  onError?: (ctx: CallContext & { phase: "error" }) => Promise<OnCallResult | void> | OnCallResult | void;
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
  onToolCall?: (ctx: CallContext) => Promise<OnCallResult | void> | OnCallResult | void;
}

export interface AuthConfig {
  validate: (apiKey: string) => Promise<boolean> | boolean;
  convexToken?: (apiKey: string) => Promise<string | undefined> | string | undefined;
}

/**
 * Opt-in pagination for `tools/list` and two-phase tool discovery.
 *
 * `pageSize` is required for all pagination features including `twoPhaseDiscovery`.
 * Must be >= 1. When enabled, `tools/list` without a cursor still returns ALL tools
 * (backwards-compatible). Cursor pagination activates only when the client sends a cursor.
 *
 * `twoPhaseDiscovery` enables non-standard custom MCP methods (`tools/list_summary`,
 * `tools/describe`). These are NOT part of the MCP spec — only custom agents that
 * explicitly call these methods will benefit.
 */
export interface PaginationConfig {
  /** Number of tools per page when client sends a cursor. Must be >= 1. */
  pageSize: number;
  /** Enable `tools/list_summary` + `tools/describe` custom methods. Default: false. */
  twoPhaseDiscovery?: boolean;
}

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
