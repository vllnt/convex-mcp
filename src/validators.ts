import { z } from "zod";
import type { ConvexValidator } from "./types.js";

export class UnsupportedValidatorError extends Error {
  constructor(kind: string) {
    super(`Unsupported Convex validator kind: "${kind}". This may be from a newer version of Convex.`);
    this.name = "UnsupportedValidatorError";
  }
}

function isConvexValidator(value: unknown): value is ConvexValidator {
  return typeof value === "object" && value !== null && "kind" in value && "isOptional" in value;
}

function isLiteralValue(value: unknown): value is string | number | boolean | null {
  const t = typeof value;
  return t === "string" || t === "number" || t === "boolean" || value === null;
}

function isAllStringLiteralUnion(
  members: ConvexValidator[],
): members is Array<ConvexValidator & { value: string }> {
  return members.length > 1 && members.every((m) => m.kind === "literal" && typeof m.value === "string");
}

// Callers guarantee arr.length >= 2 (pre-checked by isAllStringLiteralUnion or length === 1 early return)
function asTuple<T>(arr: T[]): [T, T, ...T[]] {
  /* v8 ignore next -- callers guarantee length >= 2 */
  if (arr.length < 2) throw new Error("Expected at least 2 elements");
  return [arr[0]!, arr[1]!, ...arr.slice(2)];
}

function convertKind(validator: ConvexValidator): z.ZodTypeAny {
  switch (validator.kind) {
    case "string":
      return z.string();

    case "float64":
      return z.number();

    case "boolean":
      return z.boolean();

    case "null":
      return z.null();

    case "int64":
      return z.string().describe("64-bit integer as string (BigInt — JSON cannot represent bigint)");

    case "bytes":
      return z.string().describe("Binary data as base64-encoded string");

    case "id":
      return z.string().describe(
        validator.tableName
          ? `Convex document ID for table '${validator.tableName}'`
          : "Convex document ID",
      );

    case "literal": {
      if (!isLiteralValue(validator.value)) {
        throw new UnsupportedValidatorError("literal (unsupported value type)");
      }
      return z.literal(validator.value);
    }

    case "array": {
      if (!validator.element) {
        throw new UnsupportedValidatorError("array (missing element)");
      }
      return z.array(convertValidator(validator.element));
    }

    case "object": {
      if (!validator.fields) {
        return z.object({});
      }
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [key, field] of Object.entries(validator.fields)) {
        shape[key] = convertValidator(field);
      }
      return z.object(shape);
    }

    case "union": {
      if (!validator.members || validator.members.length === 0) {
        throw new UnsupportedValidatorError("union (missing members)");
      }
      if (isAllStringLiteralUnion(validator.members)) {
        const values = validator.members.map((m) => m.value);
        return z.enum(asTuple(values));
      }
      const converted = validator.members.map((m) => convertValidator(m));
      if (converted.length === 1) {
        return converted[0]!;
      }
      return z.union(asTuple(converted));
    }

    case "record": {
      if (!validator.key || !validator.value) {
        throw new UnsupportedValidatorError("record (missing key or value)");
      }
      const keyKind = validator.key.kind;
      if (keyKind !== "string" && keyKind !== "id") {
        throw new UnsupportedValidatorError(`record key must be string or id, got "${keyKind}"`);
      }
      const valueValidator = validator.value;
      if (!isConvexValidator(valueValidator)) {
        throw new UnsupportedValidatorError("record (invalid value validator)");
      }
      // Key kind validated as "string" | "id" above — always maps to z.string()
      return z.record(z.string(), convertValidator(valueValidator));
    }

    case "any":
      return z.any();

    default:
      throw new UnsupportedValidatorError(validator.kind);
  }
}

export function convertValidator(validator: ConvexValidator): z.ZodTypeAny {
  const base = convertKind(validator);
  if (validator.isOptional === "optional") {
    return base.optional();
  }
  return base;
}

export function convexArgsToZod(
  argsValidator: ConvexValidator,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  if (argsValidator.kind !== "object") {
    throw new Error("Convex function args must be a v.object() validator");
  }
  if (!argsValidator.fields) {
    return z.object({});
  }
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, field] of Object.entries(argsValidator.fields)) {
    shape[key] = convertValidator(field);
  }
  return z.object(shape);
}
