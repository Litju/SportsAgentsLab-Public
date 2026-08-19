import { toNextJsHandler } from "better-auth/next-js";
import { auth, assertAuthRuntimeConfiguration, isSyntheticBootstrapRequest } from "../../../../src/server/auth.ts";

export const dynamic = "force-dynamic";

const handlers = toNextJsHandler(auth);

async function dispatch(request: Request, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE") {
  try {
    assertAuthRuntimeConfiguration();
    const pathname = new URL(request.url).pathname;
    if (pathname.endsWith("/sign-up/email") && !isSyntheticBootstrapRequest(request)) {
      return Response.json({ error: { code: "SIGNUP_DISABLED", message: "Account creation is disabled." } }, { status: 403 });
    }
    return handlers[method](request);
  } catch {
    return Response.json({ error: { code: "AUTHENTICATION_UNAVAILABLE", message: "Authentication is temporarily unavailable." } }, { status: 500 });
  }
}

export function GET(request: Request) { return dispatch(request, "GET"); }
export function POST(request: Request) { return dispatch(request, "POST"); }
export function PATCH(request: Request) { return dispatch(request, "PATCH"); }
export function PUT(request: Request) { return dispatch(request, "PUT"); }
export function DELETE(request: Request) { return dispatch(request, "DELETE"); }
