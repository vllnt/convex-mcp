import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConvexClient } from "../types.js";
import type { ResourceDef } from "./types.js";

interface PreparedResource {
  uriPattern: string;
  template: ResourceTemplate;
  description: string | undefined;
  resourceDef: ResourceDef;
}

export function prepareResources(resources: Record<string, ResourceDef>): PreparedResource[] {
  return Object.entries(resources).map(([uriPattern, resourceDef]) => ({
    uriPattern,
    template: new ResourceTemplate(uriPattern, { list: undefined }),
    description: resourceDef.description,
    resourceDef,
  }));
}

export function registerResources(
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
