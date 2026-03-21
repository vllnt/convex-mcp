# Security

## Auth model

### Default-deny

Auth is **mandatory**. `createMCPServer()` throws at startup if `auth.validate` is not provided:

```typescript
// This throws:
createMCPServer({ tools: { ... } });
// Error: "Auth is required. Provide auth.validate to createMCPServer()."

// This works:
createMCPServer({
  auth: { validate: async (key) => key === process.env.MCP_API_KEY },
  tools: { ... },
});
```

There is no way to create an open MCP endpoint with this package. This is intentional.

### API key validation

The server extracts the API key from the `Authorization` header:

```
Authorization: Bearer <api-key>
```

If no header is present, or the header value doesn't start with `Bearer `, the raw header value is used as the key. If no header exists at all, the request is rejected with 401.

The `validate` function receives the extracted key and must return `true` (allow) or `false` (reject).

```typescript
auth: {
  // Simple static key
  validate: async (key) => key === process.env.MCP_API_KEY,
}
```

```typescript
auth: {
  // Database lookup
  validate: async (key) => {
    const record = await db.query("SELECT 1 FROM api_keys WHERE key = $1 AND active = true", [key]);
    return record.rows.length > 0;
  },
}
```

### API key management best practices

- **Generate strong keys**: Use `openssl rand -base64 32` or equivalent.
- **Rotate regularly**: Treat MCP API keys like any other service credential.
- **Environment-specific keys**: Use different keys for dev, staging, and production.
- **Don't commit keys**: Use environment variables. Never hardcode keys in source.
- **Scope tools carefully**: A valid API key grants access to **all** exposed tools (see Known Limitations below).
- **Audit access**: Log API key usage if your validate function supports it.

## Error handling — no message leakage

When a Convex function throws, the error message may contain sensitive data (PII, internal state, stack traces). The MCP server **never** forwards Convex error messages to the client.

All Convex errors are replaced with a generic message:

```json
{
  "content": [{ "type": "text", "text": "Function execution failed" }],
  "isError": true
}
```

This applies to all function types (queries, mutations, actions) and all error types. The original error is swallowed — no details leak to the MCP client.

Similarly, resource read failures return:

```json
{
  "uri": "space://abc123",
  "text": "{\"error\":\"Resource read failed\"}",
  "mimeType": "application/json"
}
```

## Convex auth propagation

By default, Convex functions execute without user identity — `ctx.auth.getUserIdentity()` returns `null`. To propagate auth:

```typescript
auth: {
  validate: async (key) => key === process.env.MCP_API_KEY,
  convexToken: async (apiKey) => {
    // Return a Convex-compatible JWT token
    // This sets ConvexHttpClient.setAuth(token)
    // which populates ctx.auth in your Convex functions
    return await generateConvexToken(apiKey);
  },
}
```

The `convexToken` hook:
- Is called **after** `validate` returns `true`.
- Receives the same API key that was validated.
- Returns a string token (JWT) or `undefined`.
- If it returns a token, `ConvexHttpClient.setAuth(token)` is called before any function execution.

### Use cases for `convexToken`

- Map API keys to Convex user identities for audit trails.
- Enforce row-level access control in Convex functions via `ctx.auth`.
- Use Clerk/Auth0 service tokens to act as a specific user.

## Known limitations

### No function-level authorization

In v1, a valid API key grants access to **all** tools and resources registered with the server. There is no per-tool or per-resource authorization.

**Mitigation**: Only expose functions that the API key holder should access. Create separate MCP server instances with different tool sets for different access levels:

```typescript
// Admin MCP server — restricted key
const adminMcp = createMCPServer({
  auth: { validate: (key) => key === process.env.ADMIN_MCP_KEY },
  tools: {
    delete_user: mutation(api.admin.deleteUser, { ... }),
    // ...admin tools
  },
});

// Public MCP server — different key
const publicMcp = createMCPServer({
  auth: { validate: (key) => key === process.env.PUBLIC_MCP_KEY },
  tools: {
    list_docs: query(api.docs.list, { ... }),
    // ...read-only tools
  },
});
```

### Service account model

By default, this package operates as a service account — all requests share the same identity (or no identity). Per-user multi-tenant auth is a v2 concern.

### No request-level rate limiting

Rate limiting is not built in. Use your hosting platform's rate limiting (Vercel WAF, Cloudflare rate limiting, etc.) or implement it in your `auth.validate` function.

## Threat model for LLM-accessible endpoints

MCP endpoints are designed to be called by LLMs. This creates a unique threat surface.

### Prompt injection via tool results

Convex function return values are passed back to the LLM as tool results. If your functions return user-generated content, an attacker could craft data that manipulates LLM behavior.

**Mitigation**: Sanitize or truncate user-generated content in function return values. Don't return raw HTML or markdown from untrusted sources.

### Tool abuse via LLM

An LLM with access to mutation/action tools can modify data. A jailbroken or manipulated LLM could call destructive tools.

**Mitigations**:
- Prefer `query()` tools over `mutation()`/`action()` when read-only access suffices.
- Add confirmation steps in your application layer before executing destructive operations.
- Use Convex function-level validation to enforce business rules regardless of caller.
- Monitor tool call patterns for anomalous behavior.

### API key exposure

API keys in MCP client configs (Claude Desktop, Cursor) are stored in plaintext config files on the user's machine.

**Mitigations**:
- Use scoped, rotatable API keys.
- Set short expiration times where possible.
- Monitor key usage and revoke compromised keys immediately.

### Denial of service

An attacker with a valid API key could flood the endpoint with tool calls.

**Mitigations**:
- Rate limit at the infrastructure level.
- Implement per-key rate limiting in `auth.validate`.
- Monitor Convex function call volume and costs.
