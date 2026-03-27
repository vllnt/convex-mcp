import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ErrorCode, ListToolsRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { validateRequest } from "./auth.js";
import { createPaginationContext, paginateTools } from "./pagination.js";
import type { CallContext, ConvexClient, ConvexMCPServer, LifecycleHooks, OnCallResult, ResourceDef, ServerConfig, ToolDef } from "./types.js";
import { convexArgsToZod } from "./validators.js";

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

function addRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Request-Id", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createMCPServer(config: ServerConfig): ConvexMCPServer {
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
  const hooks = config.hooks;

  const preparedTools = prepareTools(config.tools ?? {});
  const preparedResources = prepareResources(config.resources ?? {});
  const paginationCtx = createPaginationContext(config.pagination);

  function createServerAndTransport(
    requestId: string,
    convexToken?: string,
    apiKey?: string,
  ): {
    mcpServer: McpServer;
    transport: WebStandardStreamableHTTPServerTransport;
  } {
    const mcpServer = new McpServer({
      name: serverName,
      version: serverVersion,
    });

    const client = injectedClient ?? createDefaultClient(resolvedConvexUrl!, convexToken);

    registerTools(mcpServer, client, preparedTools, hooks, requestId, apiKey);
    registerResources(mcpServer, client, preparedResources);

    // CRITICAL: Override MUST happen AFTER registerTools() — McpServer's lazy-init
    // registers the default tools/list handler on the first tool() call.
    // Overriding before would cause assertCanSetRequestHandler to throw.
    const hasTools = preparedTools.length > 0;
    if (hasTools && (paginationCtx.enabled || paginationCtx.twoPhaseDiscovery)) {
      const getAllTools = getOriginalToolsList(mcpServer);
      if (paginationCtx.enabled) {
        registerPaginationHandlers(mcpServer, getAllTools, paginationCtx.pageSize, paginationCtx.secret);
      }
      if (paginationCtx.twoPhaseDiscovery) {
        registerTwoPhaseHandlers(mcpServer, getAllTools, paginationCtx.pageSize, paginationCtx.secret);
      }
    }

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    return { mcpServer, transport };
  }

  return {
    handler() {
      return {
        async GET(request: Request): Promise<Response> {
          const requestId = crypto.randomUUID();
          const authResult = await validateRequest(request, config.auth);
          if (!authResult.valid) return addRequestId(authResult.response, requestId);

          const { mcpServer, transport } = createServerAndTransport(requestId, authResult.convexToken, authResult.apiKey);
          await mcpServer.connect(transport);
          const response = await transport.handleRequest(request);
          return addRequestId(response, requestId);
        },
        async POST(request: Request): Promise<Response> {
          const requestId = crypto.randomUUID();
          const authResult = await validateRequest(request, config.auth);
          if (!authResult.valid) return addRequestId(authResult.response, requestId);

          const contentType = request.headers.get("content-type");
          if (!contentType?.includes("application/json")) {
            return addRequestId(
              new Response(
                JSON.stringify({
                  jsonrpc: "2.0",
                  error: { code: -32700, message: "Unsupported Media Type: expected application/json" },
                  id: null,
                }),
                { status: 415, headers: { "Content-Type": "application/json" } },
              ),
              requestId,
            );
          }

          const { mcpServer, transport } = createServerAndTransport(requestId, authResult.convexToken, authResult.apiKey);
          await mcpServer.connect(transport);
          const response = await transport.handleRequest(request);
          return addRequestId(response, requestId);
        },
      };
    },
  };
}

function prepareTools(tools: Record<string, ToolDef>): PreparedTool[] {
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

async function invokeHook(
  hooks: LifecycleHooks | undefined,
  ctx: CallContext,
  toolDef: ToolDef,
): Promise<OnCallResult | void> {
  const handler = ctx.phase === "error" && toolDef.onError
    ? toolDef.onError
    : hooks?.onToolCall;

  if (!handler) return;

  try {
    return await (handler as (ctx: CallContext) => Promise<OnCallResult | void>)(ctx);
  } catch (hookError) {
    console.error("[convex-mcp] hook error (swallowed)", {
      requestId: ctx.requestId,
      phase: ctx.phase,
      tool: ctx.toolName,
      error: hookError,
    });
    return;
  }
}

function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | undefined,
): Promise<T> {
  if (!timeoutMs) return promise;

  let handle: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(handle)),
    new Promise<never>((_, reject) => {
      handle = setTimeout(() => reject(new Error("Tool execution timed out")), timeoutMs);
    }),
  ]);
}

function registerTools(
  mcpServer: McpServer,
  client: ConvexClient,
  tools: PreparedTool[],
  hooks: LifecycleHooks | undefined,
  requestId: string,
  apiKey: string | undefined,
): void {
  for (const { name, description, zodShape, toolDef } of tools) {
    mcpServer.tool(
      name,
      description,
      zodShape,
      async (args) => {
        const startedAt = Date.now();
        const { ref: _ref, onError: _onError, ...safeDef } = toolDef;

        const baseCtx = {
          requestId,
          toolName: name,
          toolDef: safeDef,
          args: args as Record<string, unknown>,
          apiKey,
          startedAt,
        };

        const beforeCtx: CallContext = { ...baseCtx, phase: "before" as const };
        const beforeResult = await invokeHook(hooks, beforeCtx, toolDef);
        if (beforeResult?.abort) {
          return {
            content: [{ type: "text" as const, text: beforeResult.errorMessage ?? "Tool call rejected" }],
            isError: true,
          };
        }

        try {
          const callPromise = (async () => {
            switch (toolDef.type) {
              case "query":
                return await client.query(toolDef.ref, args as Record<string, unknown>);
              case "mutation":
                return await client.mutation(toolDef.ref, args as Record<string, unknown>);
              case "action":
                return await client.action(toolDef.ref, args as Record<string, unknown>);
              default:
                throw new Error(`Unknown function type: ${toolDef.type as string}`);
            }
          })();

          const result = await executeWithTimeout(callPromise, toolDef.timeout);
          const durationMs = Date.now() - startedAt;

          const successCtx: CallContext = {
            ...baseCtx,
            phase: "success",
            result,
            durationMs,
          };
          await invokeHook(hooks, successCtx, toolDef);

          return {
            content: [{ type: "text" as const, text: JSON.stringify(result ?? null, null, 2) }],
          };
        } catch (error) {
          const durationMs = Date.now() - startedAt;
          const errorCtx: CallContext = {
            ...baseCtx,
            phase: "error",
            error,
            durationMs,
          };

          const errorResult = await invokeHook(hooks, errorCtx, toolDef);
          const errorMessage = errorResult?.message ?? "Function execution failed";

          console.error("[convex-mcp] tool execution failed", {
            requestId,
            tool: name,
            durationMs,
            error,
          });

          return {
            content: [{ type: "text" as const, text: errorMessage }],
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

interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

type ToolListFn = () => Promise<McpTool[]>;
type OrigHandler = (req: unknown, extra: unknown) => Promise<{ tools: McpTool[] }>;

/* v8 ignore start -- canary: only triggers if SDK removes tools/list handler */
function assertHandler(handler: OrigHandler | undefined): OrigHandler {
  if (!handler) throw new Error("[convex-mcp] tools/list handler not found — SDK API may have changed.");
  return handler;
}
/* v8 ignore stop */

function getOriginalToolsList(mcpServer: McpServer): ToolListFn {
  type HandlerMap = Map<string, OrigHandler>;
  const handlers = (mcpServer.server as unknown as { _requestHandlers: HandlerMap })._requestHandlers;
  const origHandler = assertHandler(handlers.get("tools/list"));

  let cached: McpTool[] | undefined;
  return async (): Promise<McpTool[]> => {
    if (cached) return cached;
    const result = await origHandler(
      { method: "tools/list", params: {} },
      { signal: new AbortController().signal },
    );
    cached = result.tools;
    return cached;
  };
}

function registerPaginationHandlers(
  mcpServer: McpServer,
  getAllTools: ToolListFn,
  pageSize: number,
  secret: string,
): void {
  mcpServer.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    const cursor = request.params?.cursor;
    const allTools = await getAllTools();

    if (cursor === undefined) {
      return { tools: allTools };
    }

    const result = await paginateTools(allTools, "tools/list", pageSize, cursor, secret);
    if ("error" in result) {
      throw new McpError(ErrorCode.InvalidParams, result.error);
    }
    return { tools: result.tools, nextCursor: result.nextCursor };
  });
}

function registerTwoPhaseHandlers(
  mcpServer: McpServer,
  getAllTools: ToolListFn,
  pageSize: number,
  secret: string,
): void {
  const listSummarySchema = z.object({
    method: z.literal("tools/list_summary"),
    params: z.object({ cursor: z.string().optional() }).optional(),
  });

  mcpServer.server.setRequestHandler(
    listSummarySchema,
    async (request) => {
      const allTools = await getAllTools();
      const summaries = allTools.map((t) => ({
        name: t.name,
        /* v8 ignore next -- both branches tested; v8 misreports ternary in .map() */
        description: t.description !== undefined ? t.description : "",
      }));

      const cursor = request.params?.cursor;
      if (cursor === undefined) {
        return { tools: summaries };
      }

      const result = await paginateTools(summaries, "tools/list_summary", pageSize, cursor, secret);
      if ("error" in result) {
        throw new McpError(ErrorCode.InvalidParams, result.error);
      }
      return { tools: result.tools, nextCursor: result.nextCursor };
    },
  );

  const describeSchema = z.object({
    method: z.literal("tools/describe"),
    params: z.object({ name: z.string().optional() }).optional(),
  });

  mcpServer.server.setRequestHandler(
    describeSchema,
    async (request) => {
      const name = request.params?.name;
      if (!name) {
        throw new McpError(ErrorCode.InvalidParams, "Invalid params: 'name' is required");
      }

      const allTools = await getAllTools();
      const tool = allTools.find((t) => t.name === name);
      if (!tool) {
        throw new McpError(ErrorCode.InvalidParams, `Invalid params: tool '${name}' not found`);
      }

      return { tool };
    },
  );
}

