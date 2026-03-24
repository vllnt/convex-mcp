# Validator Mapping

Convex validators (`v.*`) are automatically converted to Zod schemas, which the MCP SDK serializes to JSON Schema for tool definitions. This page documents every supported mapping.

## How it works

```
Convex validator (v.string())
  -> convertValidator() -> Zod schema (z.string())
    -> MCP SDK -> JSON Schema ({ "type": "string" })
```

You provide Convex validators in your tool/resource definitions. The conversion is automatic.

## Complete mapping reference

### `v.string()`

```
Input:  v.string()
Zod:    z.string()
Schema: { "type": "string" }
```

### `v.number()` / `v.float64()`

Convex `v.number()` is an alias for `v.float64()`. Both map to the same output.

```
Input:  v.number()  // or v.float64()
Zod:    z.number()
Schema: { "type": "number" }
```

### `v.boolean()`

```
Input:  v.boolean()
Zod:    z.boolean()
Schema: { "type": "boolean" }
```

### `v.null()`

```
Input:  v.null()
Zod:    z.null()
Schema: { "type": "null" }
```

### `v.int64()`

Mapped to `string` because JSON cannot represent BigInt values.

```
Input:  v.int64()
Zod:    z.string().describe("64-bit integer as string (BigInt — JSON cannot represent bigint)")
Schema: { "type": "string", "description": "64-bit integer as string (BigInt — JSON cannot represent bigint)" }
```

### `v.bytes()`

Mapped to `string` (base64-encoded).

```
Input:  v.bytes()
Zod:    z.string().describe("Binary data as base64-encoded string")
Schema: { "type": "string", "description": "Binary data as base64-encoded string" }
```

### `v.id("table")`

Mapped to `string` with a description indicating the table name.

```
Input:  v.id("tasks")
Zod:    z.string().describe("Convex document ID for table 'tasks'")
Schema: { "type": "string", "description": "Convex document ID for table 'tasks'" }
```

Without a table name:

```
Input:  v.id()
Zod:    z.string().describe("Convex document ID")
Schema: { "type": "string", "description": "Convex document ID" }
```

### `v.literal(value)`

Supports string, number, and boolean literals.

```
Input:  v.literal("active")
Zod:    z.literal("active")
Schema: { "const": "active" }

Input:  v.literal(42)
Zod:    z.literal(42)
Schema: { "const": 42 }

Input:  v.literal(true)
Zod:    z.literal(true)
Schema: { "const": true }
```

### `v.array(element)`

```
Input:  v.array(v.string())
Zod:    z.array(z.string())
Schema: { "type": "array", "items": { "type": "string" } }
```

Nested arrays work:

```
Input:  v.array(v.array(v.number()))
Zod:    z.array(z.array(z.number()))
Schema: { "type": "array", "items": { "type": "array", "items": { "type": "number" } } }
```

### `v.object(fields)`

```
Input:  v.object({ name: v.string(), age: v.number() })
Zod:    z.object({ name: z.string(), age: z.number() })
Schema: {
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "age": { "type": "number" }
  },
  "required": ["name", "age"]
}
```

Nested objects are fully supported.

### `v.union()` — literal union (enum optimization)

When **all members** are `v.literal()`, the union is collapsed to a JSON Schema `enum` for better LLM interop.

```
Input:  v.union(v.literal("draft"), v.literal("published"), v.literal("archived"))
Zod:    z.enum(["draft", "published", "archived"])
Schema: { "enum": ["draft", "published", "archived"] }
```

### `v.union()` — mixed types

When members are mixed types, uses `anyOf`.

```
Input:  v.union(v.string(), v.number())
Zod:    z.union([z.string(), z.number()])
Schema: { "anyOf": [{ "type": "string" }, { "type": "number" }] }
```

Single-member unions unwrap to the inner type.

### `v.optional(type)`

Makes the field optional in the parent object schema.

```
Input:  v.object({ name: v.string(), bio: v.optional(v.string()) })
Zod:    z.object({ name: z.string(), bio: z.string().optional() })
Schema: {
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "bio": { "type": "string" }
  },
  "required": ["name"]   // "bio" not listed — it's optional
}
```

### `v.record(keys, values)`

```
Input:  v.record(v.string(), v.number())
Zod:    z.record(z.string(), z.number())
Schema: { "type": "object", "additionalProperties": { "type": "number" } }
```

### `v.any()`

```
Input:  v.any()
Zod:    z.any()
Schema: {}    // empty schema — accepts anything
```

## Unsupported validators

If a validator kind is not recognized (e.g., from a newer Convex version), `convertValidator()` throws `UnsupportedValidatorError`:

```typescript
import { convertValidator, UnsupportedValidatorError } from "@vllnt/convex-mcp";

try {
  convertValidator(unknownValidator);
} catch (e) {
  if (e instanceof UnsupportedValidatorError) {
    // e.message: 'Unsupported Convex validator kind: "futureType". This may be from a newer version of Convex.'
  }
}
```

## Important note: validator duplication

You must provide Convex validators in the MCP config alongside your function references. Convex `FunctionReference` does not carry runtime schema information — the validator data is only available at build time within the Convex runtime.

```typescript
// You need to duplicate the validator:
list_tasks: query(api.tasks.list, {
  args: v.object({ status: v.optional(v.string()) }),  // same as in your Convex function
  description: "List tasks",
})
```

We're exploring codegen to eliminate this duplication in a future version.
