import type { RequestPrincipal } from "@mef/control-api";
import { PrincipalAccessError, getRequestPrincipal } from "./authz.ts";

export async function principalOrError(request: Request): Promise<RequestPrincipal | Response> {
  try {
    const principal = await getRequestPrincipal(request);
    if (!principal) {
      return Response.json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required." } }, { status: 401 });
    }
    return principal;
  } catch (error) {
    if (error instanceof PrincipalAccessError) {
      return Response.json({ error: { code: error.code, message: error.code === "UNAUTHENTICATED" ? "Authentication is required." : "The authenticated principal is not permitted." } }, { status: error.status });
    }
    return Response.json({ error: { code: "AUTHENTICATION_UNAVAILABLE", message: "Authentication is temporarily unavailable." } }, { status: 500 });
  }
}

export function isPrincipal(value: RequestPrincipal | Response): value is RequestPrincipal {
  return value instanceof Response === false;
}
