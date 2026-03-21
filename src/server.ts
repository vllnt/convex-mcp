import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ConvexHttpClient } from "convex/browser";
import { convexArgsToZod } from "./validators.js";
import { validateRequest } from "./auth.js";
import type { ServerConfig, HandlerOptions, ConvexMCPServer, ToolDef, ResourceDef } from "./types.js";

export function createMCPServer(config: ServerConfig): ConvexMCPServer {
  if (!config.auth?.validate) {
    throw new Error(
      "Auth is required. Provide auth.validate to createMCPServer(). " +
      "This package enforces default-deny — no open MCP endpoints.",
    );
  }

  const convexUrl = config.convexUrl ?? process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error(
      "Convex URL not found. Set CONVEX_URL or NEXT_PUBLIC_CONVEX_URL environment variable, " +
      "or pass convexUrl to createMCPServer().",
    );
  }

  const serverName = config.name ?? "convex-mcp";
  const serverVersion = config.version ?? "0.1.0";

  function createServerAndTransport(convexToken?: string): {
    mcpServer: McpServer;
    transport: WebStandardStreamableHTTPServerTransport;
  } {
    const mcpServer = new McpServer({
      name: serverName,
      version: serverVersion,
    });

    const client = new ConvexHttpClient(convexUrl!);
    if (convexToken) {
      client.setAuth(convexToken);
    }

    registerTools(mcpServer, client, config.tools ?? {});
    registerResources(mcpServer, client, config.resources ?? {});

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    return { mcpServer, transport };
  }

  return {
    handler(_options?: HandlerOptions) {
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

function registerTools(
  mcpServer: McpServer,
  client: ConvexHttpClient,
  tools: Record<string, ToolDef>,
): void {
  for (const [name, toolDef] of Object.entries(tools)) {
    const zodSchema = toolDef.args ? convexArgsToZod(toolDef.args) : undefined;

    const toolConfig: Record<string, unknown> = {};
    if (toolDef.description) toolConfig.description = toolDef.description;
    if (zodSchema) toolConfig.inputSchema = zodSchema;

    mcpServer.tool(
      name,
      toolDef.description ?? "",
      zodSchema?.shape ?? {},
      async (args) => {
        try {
          let result: unknown;
          switch (toolDef.type) {
            case "query":
              result = await client.query(toolDef.ref as any, args as any);
              break;
            case "mutation":
              result = await client.mutation(toolDef.ref as any, args as any);
              break;
            case "action":
              result = await client.action(toolDef.ref as any, args as any);
              break;
          }
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) ?? "null" }],
          };
        } catch {
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
  client: ConvexHttpClient,
  resources: Record<string, ResourceDef>,
): void {
  for (const [uriPattern, resourceDef] of Object.entries(resources)) {
    const template = new ResourceTemplate(uriPattern, {
      list: undefined,
    });

    mcpServer.resource(
      uriPattern,
      template,
      {
        description: resourceDef.description,
        mimeType: "application/json",
      },
      async (uri, params) => {
        try {
          const args = params as Record<string, unknown>;
          const result = await client.query(resourceDef.ref as any, args as any);
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify(result, null, 2) ?? "null",
              mimeType: "application/json",
            }],
          };
        } catch {
          return {
            contents: [{
              uri: uri.href,
              text: JSON.stringify({ error: "Resource read failed" }),
              mimeType: "application/json",
            }],
          };
        }
      },
    );
  }
}
