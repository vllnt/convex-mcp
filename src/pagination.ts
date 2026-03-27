import type { PaginationConfig } from "./types.js";

interface CursorPayload {
  /** Version for forward-compat: reject cursors from incompatible versions. */
  v: 1;
  /** Method namespace: prevents cross-method cursor reuse. */
  m: string;
  /** Offset into the tool array. */
  o: number;
}

function generateSecret(): string {
  return crypto.randomUUID();
}

const SEPARATOR = ".";


async function importKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

async function hmacSign(payload: string, secret: string): Promise<ArrayBuffer> {
  const key = await importKey(secret, ["sign"]);
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
}

async function hmacVerify(payload: string, signature: string, secret: string): Promise<boolean> {
  const key = await importKey(secret, ["verify"]);
  const sigBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(payload));
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  return btoa(Array.from(new Uint8Array(buf), (b) => String.fromCharCode(b)).join(""));
}

async function encodeCursor(method: string, offset: number, secret: string): Promise<string> {
  const payload: CursorPayload = { v: 1, m: method, o: offset };
  const json = JSON.stringify(payload);
  const b64 = btoa(json);
  const sig = await hmacSign(b64, secret);
  return `${b64}${SEPARATOR}${arrayBufferToBase64(sig)}`;
}

async function decodeCursor(
  cursor: string,
  expectedMethod: string,
  secret: string,
): Promise<{ offset: number } | { error: string }> {
  const sepIdx = cursor.lastIndexOf(SEPARATOR);
  if (sepIdx === -1) return { error: "invalid or expired cursor" };

  const b64 = cursor.slice(0, sepIdx);
  const sig = cursor.slice(sepIdx + 1);

  const valid = await hmacVerify(b64, sig, secret);
  if (!valid) return { error: "invalid or expired cursor" };

  // Safe to parse without try-catch: HMAC verification above guarantees b64 is
  // a payload we signed, so atob + JSON.parse will not throw.
  const payload = JSON.parse(atob(b64)) as CursorPayload;
  if (payload.v !== 1) return { error: "invalid or expired cursor" };
  if (payload.m !== expectedMethod) return { error: "invalid or expired cursor" };
  if (typeof payload.o !== "number" || payload.o < 0) return { error: "invalid or expired cursor" };
  return { offset: payload.o };
}

export interface ToolSummary {
  name: string;
  description: string;
}

export interface ToolPage<T extends object> {
  tools: T[];
  nextCursor?: string;
}

/** Paginate a tool array using cursor-based pagination with HMAC-signed cursors. */
export async function paginateTools<T extends object>(
  tools: T[],
  method: string,
  pageSize: number,
  cursor: string | undefined,
  secret: string,
): Promise<ToolPage<T> | { error: string }> {
  if (cursor !== undefined) {
    let offset = 0;

    if (cursor !== "") {
      const decoded = await decodeCursor(cursor, method, secret);
      if ("error" in decoded) return { error: decoded.error };
      offset = decoded.offset;
    }

    /* v8 ignore next 3 -- unreachable from public API: HMAC prevents crafting out-of-bounds cursors */
    if (offset >= tools.length && tools.length > 0) {
      return { error: "invalid or expired cursor" };
    }

    const page = tools.slice(offset, offset + pageSize);
    const hasMore = offset + pageSize < tools.length;
    const nextCursor = hasMore
      ? await encodeCursor(method, offset + pageSize, secret)
      : undefined;

    return { tools: page, nextCursor };
  }

  // No cursor: return ALL tools (CRITICAL INVARIANT — prevents silent tool loss)
  return { tools };
}

/** Create pagination context from config. Validates pageSize >= 1. */
export function createPaginationContext(config: PaginationConfig | undefined): {
  secret: string;
  pageSize: number;
  twoPhaseDiscovery: boolean;
  enabled: boolean;
} {
  if (!config) {
    return { secret: "", pageSize: 0, twoPhaseDiscovery: false, enabled: false };
  }
  if (config.pageSize < 1) {
    throw new Error("pagination.pageSize must be >= 1");
  }
  return {
    secret: generateSecret(),
    pageSize: config.pageSize,
    twoPhaseDiscovery: config.twoPhaseDiscovery ?? false,
    enabled: true,
  };
}
