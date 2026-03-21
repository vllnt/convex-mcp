# Getting Started

Get a Convex MCP server running in 5 minutes.

## Prerequisites

- A Convex project with functions defined
- Next.js App Router (or any framework that exports `Request -> Response` handlers)
- Node.js 18+

## 1. Install

```bash
pnpm add @vllnt/convex-mcp
# or
npm install @vllnt/convex-mcp
```

**Peer dependency:** `convex` (>=1.0.0) must already be in your project.

## 2. Create MCP server config

Create `convex/mcp.ts` alongside your existing Convex functions:

```typescript
// convex/mcp.ts
import { createMCPServer, query, mutation } from "@vllnt/convex-mcp";
import { api } from "./_generated/api";
import { v } from "convex/values";

export const mcp = createMCPServer({
  auth: {
    validate: async (key) => key === process.env.MCP_API_KEY,
  },
  tools: {
    list_tasks: query(api.tasks.list, {
      args: v.object({}),
      description: "List all tasks",
    }),
    create_task: mutation(api.tasks.create, {
      args: v.object({
        title: v.string(),
        done: v.optional(v.boolean()),
      }),
      description: "Create a new task",
    }),
  },
});
```

**Key points:**
- `auth.validate` is **required** (default-deny). The server throws at startup without it.
- `query()`, `mutation()`, `action()` pair a function reference with its validator and description.
- Convex validators (`v.object(...)`) are automatically converted to JSON Schema for MCP tool definitions.

## 3. Mount the route handler

```typescript
// app/api/mcp/route.ts (Next.js App Router)
import { mcp } from "@/convex/mcp";

export const { GET, POST } = mcp.handler();
```

That's it. Your MCP endpoint is live at `/api/mcp`.

## 4. Set environment variables

```bash
# .env.local
CONVEX_URL=https://your-deployment.convex.cloud  # or NEXT_PUBLIC_CONVEX_URL
MCP_API_KEY=your-secret-key-here
```

## 5. Test with an MCP client

### Using curl

```bash
# Initialize
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer your-secret-key-here" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'

# List tools
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer your-secret-key-here" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# Call a tool
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer your-secret-key-here" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_tasks","arguments":{}}}'
```

### Using the MCP Inspector

```bash
npx @modelcontextprotocol/inspector http://localhost:3000/api/mcp
```

Add `Authorization: Bearer your-secret-key-here` in the inspector headers.

### Claude Desktop / Cursor / Windsurf

Add to your MCP client config:

```json
{
  "mcpServers": {
    "my-convex-app": {
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer your-secret-key-here"
      }
    }
  }
}
```

## Next steps

- [API Reference](api-reference.md) — full config options
- [Validator Mapping](validators.md) — how Convex types map to JSON Schema
- [Security](security.md) — auth model and threat model
- [Deployment](deployment.md) — deploy to Vercel
- [Examples](examples.md) — copy-pasteable patterns
