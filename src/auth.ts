import type { AuthConfig } from "./types.js";

export function extractApiKey(request: Request): string | undefined {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return undefined;

  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return undefined;
}

export async function validateRequest(
  request: Request,
  auth: AuthConfig,
): Promise<{ valid: true; convexToken?: string; apiKey: string } | { valid: false; response: Response }> {
  const apiKey = extractApiKey(request);

  if (!apiKey) {
    return {
      valid: false,
      response: new Response(
        JSON.stringify({ error: "Missing or malformed API key. Use Authorization: Bearer <key>." }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    };
  }

  const isValid = await auth.validate(apiKey);
  if (!isValid) {
    return {
      valid: false,
      response: new Response(
        JSON.stringify({ error: "Invalid API key." }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    };
  }

  let convexToken: string | undefined;
  if (auth.convexToken) {
    convexToken = await auth.convexToken(apiKey);
  }

  return { valid: true, convexToken, apiKey };
}
