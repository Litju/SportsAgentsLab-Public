import { getOpenCodeStatus } from "../../../src/server/open-code-model.ts";
import { getArtifactStoreStatus } from "../../../src/server/artifact-store.ts";
import { isPrincipal, principalOrError } from "../../../src/server/api-auth.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const principal = await principalOrError(request);
  if (!isPrincipal(principal)) return principal;
  return Response.json({
    deployment: {
      environment: process.env.VERCEL_ENV ?? "local",
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? "local"
    },
    openCode: getOpenCodeStatus(),
    database: { configured: Boolean(process.env.DATABASE_RUNTIME_URL ?? process.env.DATABASE_AUTH_URL ?? process.env.DATABASE_URL) },
    blob: getArtifactStoreStatus(),
    syntheticOnly: process.env.MEF_SYNTHETIC_ONLY !== "false"
  });
}
