import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ConvexHttpClient } from "convex/browser";
import { convexArgsToZod } from "./validators.js";
import { validateRequest } from "./auth.js";
import type { ServerConfig, ConvexMCPServer, ConvexClient, ToolDef, ResourceDef } from "./types.js";
import type { z } from "zod";

function createDefaultClient(convexUrl: string, convexToken?: string): ConvexClient {
  const client = new ConvexHttpClient(convexUrl);
  if (convexToken) {
    client.setAuth(convexToken);
  }
  return client;
}

interface PreparedTool {
  name: string;
  description: string;
  zodShape: Record<string, z.ZodTypeAny>;
  toolDef: ToolDef;
}

interface PreparedResource {
  uriPattern: string;
  template: ResourceTemplate;
  description: string | undefined;
  resourceDef: ResourceDef;
}

export function createMCPServer(config: ServerConfig): ConvexMCPServer {
  // Defense-in-depth: auth is typed as required but JS callers may omit it
  if (!config.auth?.validate) {
    throw new Error(
      "Auth is required. Provide auth.validate to createMCPServer(). " +
      "This package enforces default-deny — no open MCP endpoints.",
    );
  }

  const injectedClient = config.client;

  if (injectedClient && config.auth.convexToken) {
    throw new Error(
      "Cannot use both 'client' and 'auth.convexToken'. When providing a custom client, " +
      "handle auth token propagation in your client implementation directly.",
    );
  }

  let resolvedConvexUrl: string | undefined;
  if (!injectedClient) {
    resolvedConvexUrl = config.convexUrl ?? process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!resolvedConvexUrl) {
      throw new Error(
        "Convex URL not found. Set CONVEX_URL or NEXT_PUBLIC_CONVEX_URL environment variable, " +
        "or pass convexUrl or client to createMCPServer().",
      );
    }
  }

  const serverName = config.name ?? "convex-mcp";
  const serverVersion = config.version ?? "0.1.0";

  const preparedTools = prepareTtools(config.tools ?? {});
  const preparedResources = prepareResources(config.resources ?? {});

  function createServerAndTransport(convexToken?: string): {
    mcpServer: McpServer;
    transport: WebStandardStreamableHTTPServerTransport;
  } {
    const mcpServer = new McpServer({
      name: serverName,
      version: serverVersion,
    });

    const client = injectedClient ?? createDefaultClient(resolvedConvexUrl!, convexToken);

    registerTools(mcpServer, client, preparedTools);
    registerResources(mcpServer, client, preparedResources);

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    return { mcpServer, transport };
  }

  return {
    handler() {
      return {
        async GET(request: Request): Promise<Response> {
          const authResult = await validateRequest(request, config.auth);
          if (!authResult.valid) return authResult.response;

          const { mcpServer, transport } = createServerAndTransport(authResult.convexToken);
          await mcpServer.connect(transport);
          return transport.handleRequest(request);
        },
        async POST(request: Request): Promise<Response> {
          const authResult = await validateRequest(request, config.auth);
          if (!authResult.valid) return authResult.response;

          const contentType = request.headers.get("content-type");
          if (!contentType?.includes("application/json")) {
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                error: { code: -32700, message: "Unsupported Media Type: expected application/json" },
                id: null,
              }),
              { status: 415, headers: { "Content-Type": "application/json" } },
            );
          }

          const { mcpServer, transport } = createServerAndTransport(authResult.convexToken);
          await mcpServer.connect(transport);
          return transport.handleRequest(request);
        },
      };
    },
  };
}

function prepareTtools(tools: Record<string, ToolDef>): PreparedTool[] {
  return Object.entries(tools).map(([name, toolDef]) => {
    const zodSchema = toolDef.args ? convexArgsToZod(toolDef.args) : undefined;
    return {
      name,
      description: toolDef.description ?? "",
      zodShape: zodSchema?.shape ?? {},
      toolDef,
    };
  });
}

function prepareResources(resources: Record<string, ResourceDef>): PreparedResource[] {
  return Object.entries(resources).map(([uriPattern, resourceDef]) => ({
    uriPattern,
    template: new ResourceTemplate(uriPattern, { list: undefined }),
    description: resourceDef.description,
    resourceDef,
  }));
}

function registerTools(
  mcpServer: McpServer,
  client: ConvexClient,
  tools: PreparedTool[],
): void {
  for (const { name, description, zodShape, toolDef } of tools) {
    mcpServer.tool(
      name,
      description,
      zodShape,
      async (args) => {
        try {
          let result: unknown;
          switch (toolDef.type) {
            case "query":
              result = await client.query(toolDef.ref, args as Record<string, unknown>);
              break;
            case "mutation":
              result = await client.mutation(toolDef.ref, args as Record<string, unknown>);
              break;
            case "action":
              result = await client.action(toolDef.ref, args as Record<string, unknown>);
              break;
            default:
              throw new Error(`Unknown function type: ${toolDef.type as string}`);
          }
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result ?? null, null, 2) }],
          };
        } catch (error) {
          console.error("[convex-mcp] tool execution failed", { tool: name, error });
          return {
            content: [{ type: "text" as const, text: "Function execution failed" }],
            isError: true,
          };
        }
      },
    );
  }
}

function registerResources(
  mcpServer: McpServer,
  client: ConvexClient,
  resources: PreparedResource[],
): void {
  for (const { uriPattern, template, description, resourceDef } of resources) {
    mcpServer.resource(
      uriPattern,
      template,
      {
        description,
        mimeType: "application/json",
      },
      async (uri, params) => {
        try {
          const args = params as Record<string, unknown>;
          const result = await client.query(resourceDef.ref, args);
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify(result ?? null, null, 2),
              mimeType: "application/json",
            }],
          };
        } catch (error) {
          console.error("[convex-mcp] resource read failed", { resource: uriPattern, error });
          throw error;
        }
      },
    );
  }
}
