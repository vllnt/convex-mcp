import { z } from "zod";

interface ConvexValidator {
  kind: string;
  isOptional: "required" | "optional";
  tableName?: string;
  value?: unknown;
  fields?: Record<string, ConvexValidator>;
  element?: ConvexValidator;
  members?: ConvexValidator[];
  key?: ConvexValidator;
}

export class UnsupportedValidatorError extends Error {
  constructor(kind: string) {
    super(`Unsupported Convex validator kind: "${kind}". This may be from a newer version of Convex.`);
    this.name = "UnsupportedValidatorError";
  }
}

function isAllLiteralUnion(
  members: ConvexValidator[],
): members is Array<ConvexValidator & { kind: "literal"; value: unknown }> {
  return members.every((m) => m.kind === "literal");
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

    case "literal":
      return z.literal(validator.value as string | number | boolean);

    case "array": {
      if (!validator.element) {
        throw new UnsupportedValidatorError("array (missing element)");
      }
      return z.array(convertValidator(validator.element));
    }

    case "object": {
      if (!validator.fields) {
        throw new UnsupportedValidatorError("object (missing fields)");
      }
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [key, field] of Object.entries(validator.fields)) {
        const converted = convertKind(field);
        shape[key] = field.isOptional === "optional" ? converted.optional() : converted;
      }
      return z.object(shape);
    }

    case "union": {
      if (!validator.members || validator.members.length === 0) {
        throw new UnsupportedValidatorError("union (missing members)");
      }
      if (isAllLiteralUnion(validator.members)) {
        const values = validator.members.map((m) => m.value);
        return z.enum(values as [string, ...string[]]);
      }
      const converted = validator.members.map((m) => convertValidator(m));
      if (converted.length === 1) {
        return converted[0]!;
      }
      return z.union(
        converted as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]],
      );
    }

    case "record": {
      if (!validator.key || !validator.value) {
        throw new UnsupportedValidatorError("record (missing key or value)");
      }
      return z.record(
        convertValidator(validator.key) as z.ZodType<string>,
        convertValidator(validator.value as unknown as ConvexValidator),
      );
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
    const converted = convertKind(field);
    shape[key] = field.isOptional === "optional" ? converted.optional() : converted;
  }
  return z.object(shape);
}
