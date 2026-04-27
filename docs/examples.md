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

## Hook-driven request context propagation (v0.3.0)

The `onToolCall` hook can return `extendArgs` to inject server-resolved context into the dispatched function's args. Combined with the framework-reserved `_` prefix, this gives you a safe channel for per-action authorization, request tracing, multi-tenancy, audit metadata, and more.

### Per-action authorization (defense-in-depth)

The framework hook validates the apiKey + required scope. The action handler **re-validates** the injected key — so even if the hook is bypassed (custom transport, framework regression), the action stays safe.

```typescript
// convex/mcp.ts
import { createMCPServer, action } from "@vllnt/convex-mcp";
import { api } from "./_generated/api";
import { v } from "convex/values";

export const mcp = createMCPServer({
  auth: { validate: async (key) => Boolean(await validateKey(key)) },
  hooks: {
    onToolCall: async ({ apiKey, phase, toolDef }) => {
      if (phase !== "before") return;
      const validated = await validateKey(apiKey);
      if (!validated.valid) return { abort: true, errorMessage: "Invalid key" };
      const required = toolDef.tags?.requiredScope;
      if (required && !validated.scopes.includes(required)) {
        return { abort: true, errorMessage: `Missing scope: ${required}` };
      }
      return {
        extendArgs: {
          _mcp_apiKey: apiKey,
          _mcp_scopes: validated.scopes,
        },
      };
    },
  },
  tools: {
    upsert_thing: action(api.things.upsert, {
      args: v.object({
        _mcp_apiKey: v.string(),     // injected by framework
        _mcp_scopes: v.array(v.string()),
        targetId: v.id("things"),
        payload: v.any(),
      }),
      description: "Upsert a thing.",
      tags: { requiredScope: "things:write" },
    }),
  },
});

// convex/things.ts
export const upsert = action({
  args: {
    _mcp_apiKey: v.string(),
    _mcp_scopes: v.array(v.string()),
    targetId: v.id("things"),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    // Defense-in-depth: re-validate inside the action.
    await assertMcpAuth(ctx, args._mcp_apiKey, "things:write");
    return await ctx.runMutation(internal.things.write, {
      id: args.targetId,
      payload: args.payload,
    });
  },
});
```

### Request tracing

```typescript
hooks: {
  onToolCall: async ({ requestId, phase }) => {
    if (phase !== "before") return;
    return { extendArgs: { _mcp_requestId: requestId } };
  },
}

// In the action — correlate domain logs with framework request lifecycle:
export const doThing = action({
  args: { _mcp_requestId: v.string(), input: v.string() },
  handler: async (ctx, args) => {
    logger.info("doing_thing", { requestId: args._mcp_requestId, input: args.input });
    // ...
  },
});
```

### Multi-tenancy with server-resolved tenant routing

```typescript
hooks: {
  onToolCall: async ({ apiKey, phase }) => {
    if (phase !== "before") return;
    const tenantId = await resolveTenantFromKey(apiKey);
    if (!tenantId) return { abort: true, errorMessage: "Unknown tenant" };
    return { extendArgs: { _mcp_tenantId: tenantId } };
  },
}

// Action enforces server-resolved tenant ID — caller cannot spoof:
export const listProjects = query({
  args: { _mcp_tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args._mcp_tenantId))
      .take(50);
  },
});
```

### Per-key feature flags

```typescript
hooks: {
  onToolCall: async ({ apiKey, phase }) => {
    if (phase !== "before") return;
    const flags = await getFlagsFor(apiKey);  // cached lookup
    return { extendArgs: { _mcp_flags: flags } };
  },
}

// Action branches on flags without re-fetching:
export const search = query({
  args: {
    _mcp_flags: v.object({ semanticSearch: v.boolean() }),
    q: v.string(),
  },
  handler: async (ctx, args) => {
    return args._mcp_flags.semanticSearch
      ? await semanticSearch(ctx, args.q)
      : await keywordSearch(ctx, args.q);
  },
});
```

### Anti-patterns

| Anti-pattern | Why bad | Fix |
|---|---|---|
| Long-lived secrets in `extendArgs` | Args flow into action logs and may be over-shared | Inject ID + scopes only; resolve secrets inside the action when needed |
| Hook-only authorization (no action re-check) | Framework regression / fork = silent security failure | Always re-validate the injected key inside the action handler |
| Splitting context across `extendArgs` AND a side-channel store | Two sources of truth; drift inevitable | Pick one — `extendArgs` is the canonical path |
| Allowing client `_*` passthrough (e.g., disabling the reject) | Defeats the entire safety model | Don't. The reject is what makes `extendArgs` trustworthy |

See [Security › Server-side Context Propagation](./security.md#server-side-context-propagation-v030) for the full security rationale.
