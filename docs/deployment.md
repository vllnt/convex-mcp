# Deployment

## Next.js App Router on Vercel

### 1. Create the route handler

```typescript
// app/api/mcp/route.ts
import { mcp } from "@/convex/mcp";

export const { GET, POST } = mcp.handler();
```

### 2. Set environment variables

In your Vercel project settings (Settings > Environment Variables):

| Variable | Value | Required |
|----------|-------|----------|
| `CONVEX_URL` | `https://your-deployment.convex.cloud` | Yes (unless using `NEXT_PUBLIC_CONVEX_URL`) |
| `MCP_API_KEY` | Your secret API key | Yes (or however your `auth.validate` resolves) |

`NEXT_PUBLIC_CONVEX_URL` also works. The server checks `CONVEX_URL` first, then `NEXT_PUBLIC_CONVEX_URL`. You can also pass `convexUrl` directly to `createMCPServer()`.

### 3. Deploy

```bash
vercel deploy
# or
git push  # if connected to Vercel Git integration
```

Your MCP endpoint is live at `https://your-app.vercel.app/api/mcp`.

## Serverless timeout constraints

MCP tool calls execute Convex functions via `ConvexHttpClient`, which makes HTTP requests to the Convex backend. The total request time is bounded by both the serverless function timeout and the Convex function execution time.

### Vercel timeouts

| Plan | Max Duration | Notes |
|------|-------------|-------|
| Hobby | 10 seconds | Sufficient for simple queries/mutations |
| Pro | 60 seconds | Covers most use cases |
| Pro + Fluid Compute | 800 seconds | Required for long-running actions |

### Convex function limits

- **Queries/Mutations**: Complete in under 1 second typically
- **Actions**: Can run up to 10 minutes (Convex limit), but your serverless function must stay alive long enough to receive the result

### Recommendations

- **Queries and mutations**: Work fine on any Vercel plan.
- **Short actions** (<10s): Work on Hobby plan.
- **Long actions** (10s-60s): Require Vercel Pro.
- **Very long actions** (>60s): Require Vercel Pro with Fluid Compute, or consider restructuring as background jobs.

To set max duration for a Next.js route:

```typescript
// app/api/mcp/route.ts
export const maxDuration = 60; // seconds (requires Pro plan)
```

## Environment variables

### Required

| Variable | Description |
|----------|-------------|
| `CONVEX_URL` | Your Convex deployment URL (e.g., `https://abc-123.convex.cloud`) |
| `MCP_API_KEY` | API key for authenticating MCP clients (name is arbitrary — depends on your `auth.validate` implementation) |

### Alternative Convex URL sources

The server resolves the Convex URL in this order:

1. `convexUrl` passed to `createMCPServer()`
2. `CONVEX_URL` environment variable
3. `NEXT_PUBLIC_CONVEX_URL` environment variable

### Multiple environments

Use different API keys per environment:

```
# .env.local (development)
MCP_API_KEY=dev-key-not-secret

# Vercel Preview
MCP_API_KEY=preview-key-rotated-regularly

# Vercel Production
MCP_API_KEY=production-key-long-random-string
```

## CORS and origin considerations

MCP over Streamable HTTP is designed for server-to-server communication. Typical MCP clients (Claude Desktop, Cursor, Windsurf, custom backends) make requests from a server context, not a browser.

If you need browser-based MCP clients:

```typescript
// app/api/mcp/route.ts
import { mcp } from "@/convex/mcp";

const { GET: mcpGet, POST: mcpPost } = mcp.handler();

function withCORS(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "https://your-client.com",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
        },
      });
    }
    const response = await handler(req);
    response.headers.set("Access-Control-Allow-Origin", "https://your-client.com");
    return response;
  };
}

export const GET = withCORS(mcpGet);
export const POST = withCORS(mcpPost);
```

**Warning**: Exposing MCP endpoints to browsers means API keys are visible in client-side code. This is only appropriate for internal tools behind network-level access controls.

## Other hosting platforms

The handler returns standard `Request -> Response` functions. It works with any platform that supports the Web Fetch API:

```typescript
// Cloudflare Workers
export default {
  async fetch(request: Request) {
    const handler = mcp.handler();
    if (request.method === "GET") return handler.GET(request);
    if (request.method === "POST") return handler.POST(request);
    return new Response("Method not allowed", { status: 405 });
  },
};
```

```typescript
// Deno
const handler = mcp.handler();
Deno.serve(async (request) => {
  if (request.method === "GET") return handler.GET(request);
  if (request.method === "POST") return handler.POST(request);
  return new Response("Method not allowed", { status: 405 });
});
```
