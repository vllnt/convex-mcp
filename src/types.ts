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

export interface ConvexClient {
  query(functionRef: any, args?: any): Promise<any>;
  mutation(functionRef: any, args?: any): Promise<any>;
  action(functionRef: any, args?: any): Promise<any>;
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
