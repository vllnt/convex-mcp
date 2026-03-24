# Examples

## Basic CRUD tools

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
    get_task: query(api.tasks.get, {
      args: v.object({ id: v.id("tasks") }),
      description: "Get a task by ID",
    }),
    create_task: mutation(api.tasks.create, {
      args: v.object({
        title: v.string(),
        description: v.optional(v.string()),
        status: v.optional(v.union(
          v.literal("todo"),
          v.literal("in_progress"),
          v.literal("done"),
        )),
      }),
      description: "Create a new task",
    }),
    update_task: mutation(api.tasks.update, {
      args: v.object({
        id: v.id("tasks"),
        title: v.optional(v.string()),
        status: v.optional(v.union(
          v.literal("todo"),
          v.literal("in_progress"),
          v.literal("done"),
        )),
      }),
      description: "Update a task's title or status",
    }),
    delete_task: mutation(api.tasks.remove, {
      args: v.object({ id: v.id("tasks") }),
      description: "Delete a task",
    }),
  },
});
```

```typescript
// app/api/mcp/route.ts
import { mcp } from "@/convex/mcp";

export const { GET, POST } = mcp.handler();
```

## Auth with convexToken

Propagate identity to Convex functions so `ctx.auth.getUserIdentity()` works:

```typescript
// convex/mcp.ts
import { createMCPServer, query, mutation } from "@vllnt/convex-mcp";
import { api } from "./_generated/api";
import { v } from "convex/values";

export const mcp = createMCPServer({
  auth: {
    validate: async (key) => {
      // Validate against your API key store
      const result = await fetch(`${process.env.AUTH_SERVICE_URL}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      return result.ok;
    },
    convexToken: async (apiKey) => {
      // Exchange API key for a Convex-compatible JWT
      const result = await fetch(`${process.env.AUTH_SERVICE_URL}/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: apiKey }),
      });
      if (!result.ok) return undefined;
      const { token } = await result.json();
      return token;
    },
  },
  tools: {
    my_tasks: query(api.tasks.listMine, {
      args: v.object({}),
      description: "List tasks for the authenticated user",
    }),
    create_task: mutation(api.tasks.create, {
      args: v.object({ title: v.string() }),
      description: "Create a task owned by the authenticated user",
    }),
  },
});
```

## Resources with URI templates

```typescript
// convex/mcp.ts
import { createMCPServer, query, resource } from "@vllnt/convex-mcp";
import { api } from "./_generated/api";
import { v } from "convex/values";

export const mcp = createMCPServer({
  auth: {
    validate: async (key) => key === process.env.MCP_API_KEY,
  },
  tools: {
    list_spaces: query(api.spaces.list, {
      args: v.object({}),
      description: "List all spaces",
    }),
  },
  resources: {
    "space://{id}": resource(api.spaces.get, {
      args: v.object({ id: v.id("spaces") }),
      description: "Get a space by ID",
    }),
    "space://{spaceId}/members": resource(api.spaces.listMembers, {
      args: v.object({ spaceId: v.id("spaces") }),
      description: "List members of a space",
    }),
  },
});
```

## Multiple tool types (query + mutation + action)

```typescript
// convex/mcp.ts
import { createMCPServer, query, mutation, action } from "@vllnt/convex-mcp";
import { api } from "./_generated/api";
import { v } from "convex/values";

export const mcp = createMCPServer({
  auth: {
    validate: async (key) => key === process.env.MCP_API_KEY,
  },
  tools: {
    // Queries — read-only, cached
    search_documents: query(api.documents.search, {
      args: v.object({
        query: v.string(),
        limit: v.optional(v.float64()),
      }),
      description: "Search documents by text query",
    }),

    // Mutations — write operations, transactional
    create_document: mutation(api.documents.create, {
      args: v.object({
        title: v.string(),
        content: v.string(),
        tags: v.optional(v.array(v.string())),
      }),
      description: "Create a new document",
    }),

    // Actions — side effects, external API calls
    summarize_document: action(api.ai.summarize, {
      args: v.object({
        documentId: v.id("documents"),
      }),
      description: "Generate an AI summary of a document",
    }),
    send_notification: action(api.notifications.send, {
      args: v.object({
        userId: v.id("users"),
        message: v.string(),
        channel: v.union(
          v.literal("email"),
          v.literal("slack"),
          v.literal("sms"),
        ),
      }),
      description: "Send a notification to a user",
    }),
  },
});
```

## Complex argument types

Demonstrating nested objects, arrays, records, and unions:

```typescript
// convex/mcp.ts
import { createMCPServer, mutation } from "@vllnt/convex-mcp";
import { api } from "./_generated/api";
import { v } from "convex/values";

export const mcp = createMCPServer({
  auth: {
    validate: async (key) => key === process.env.MCP_API_KEY,
  },
  tools: {
    create_project: mutation(api.projects.create, {
      args: v.object({
        name: v.string(),
        settings: v.object({
          isPublic: v.boolean(),
          maxMembers: v.optional(v.float64()),
          tags: v.array(v.string()),
        }),
        metadata: v.optional(v.record(v.string(), v.any())),
        priority: v.union(
          v.literal("low"),
          v.literal("medium"),
          v.literal("high"),
        ),
      }),
      description: "Create a project with settings, metadata, and priority",
    }),
  },
});
```

## Error handling patterns

### Client-side: handling tool errors

MCP clients receive errors as tool results with `isError: true`:

```json
{
  "content": [{ "type": "text", "text": "Function execution failed" }],
  "isError": true
}
```

The actual Convex error message is never exposed. If you need to surface specific error types, return them as part of your function's success response:

```typescript
// convex/tasks.ts — in your Convex function
export const create = mutation({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    if (args.title.length === 0) {
      return { success: false, error: "Title cannot be empty" };
    }
    const id = await ctx.db.insert("tasks", { title: args.title });
    return { success: true, id };
  },
});
```

This way the LLM sees structured error information without leaking internal details.

### Server-side: custom validate with logging

```typescript
auth: {
  validate: async (key) => {
    const isValid = key === process.env.MCP_API_KEY;
    if (!isValid) {
      console.warn("MCP auth failed: invalid API key attempt");
    }
    return isValid;
  },
}
```

## Separate MCP servers for different access levels

```typescript
// convex/mcp-admin.ts
import { createMCPServer, query, mutation } from "@vllnt/convex-mcp";
import { api } from "./_generated/api";
import { v } from "convex/values";

export const adminMcp = createMCPServer({
  auth: { validate: async (key) => key === process.env.ADMIN_MCP_KEY },
  tools: {
    list_users: query(api.admin.listUsers, {
      args: v.object({}),
      description: "List all users (admin only)",
    }),
    delete_user: mutation(api.admin.deleteUser, {
      args: v.object({ userId: v.id("users") }),
      description: "Delete a user (admin only)",
    }),
  },
});
```

```typescript
// convex/mcp-public.ts
import { createMCPServer, query } from "@vllnt/convex-mcp";
import { api } from "./_generated/api";
import { v } from "convex/values";

export const publicMcp = createMCPServer({
  auth: { validate: async (key) => key === process.env.PUBLIC_MCP_KEY },
  tools: {
    search_docs: query(api.docs.search, {
      args: v.object({ query: v.string() }),
      description: "Search public documentation",
    }),
  },
});
```

```typescript
// app/api/mcp/admin/route.ts
import { adminMcp } from "@/convex/mcp-admin";
export const { GET, POST } = adminMcp.handler();

// app/api/mcp/public/route.ts
import { publicMcp } from "@/convex/mcp-public";
export const { GET, POST } = publicMcp.handler();
```
