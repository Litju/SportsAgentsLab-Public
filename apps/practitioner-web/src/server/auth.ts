import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins/organization";
import { Pool } from "pg";

const PLACEHOLDER_DATABASE_URL = "postgresql://invalid-ml98-config.invalid/mef";
const PLACEHOLDER_SECRET = "ml98-invalid-configuration-secret-please-set-a-server-secret";

export function isBoundedSyntheticPreview(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === "preview" && env.MEF_SYNTHETIC_ONLY === "true";
}

export function isHostedEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
}

export function isSyntheticBootstrapRequest(request: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  const configuredSecret = env.MEF_PREVIEW_BOOTSTRAP_SECRET;
  return isBoundedSyntheticPreview(env)
    && typeof configuredSecret === "string"
    && configuredSecret.length >= 32
    && request.headers.get("x-mef-preview-bootstrap") === configuredSecret;
}

export class AuthConfigurationError extends Error {
  constructor() {
    super("authentication configuration is unavailable");
    this.name = "AuthConfigurationError";
  }
}

export function assertAuthRuntimeConfiguration(env: NodeJS.ProcessEnv = process.env): void {
  if (isHostedEnvironment(env) && (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)) {
    throw new AuthConfigurationError();
  }
  if (!env.DATABASE_AUTH_URL && !env.DATABASE_URL) throw new AuthConfigurationError();
}

function databaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.DATABASE_AUTH_URL ?? env.DATABASE_URL ?? PLACEHOLDER_DATABASE_URL;
}

const globalAuthPool = globalThis as typeof globalThis & { __mefBetterAuthPool?: Pool };

function createAuth() {
  const env = process.env;
  globalAuthPool.__mefBetterAuthPool ??= new Pool({
    connectionString: databaseUrl(env),
    options: "-c search_path=mef_auth,public",
    max: 5,
    idleTimeoutMillis: 30_000
  });
  const allowSyntheticSignup = isBoundedSyntheticPreview(env) && Boolean(env.MEF_PREVIEW_BOOTSTRAP_SECRET);
  return betterAuth({
    database: globalAuthPool.__mefBetterAuthPool,
    secret: env.BETTER_AUTH_SECRET ?? PLACEHOLDER_SECRET,
    baseURL: env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    basePath: "/api/auth",
    emailAndPassword: {
      enabled: true,
      disableSignUp: !allowSyntheticSignup,
      requireEmailVerification: false
    },
    plugins: [
      organization({
        allowUserToCreateOrganization: false,
        disableOrganizationDeletion: true,
        teams: { enabled: false },
        dynamicAccessControl: { enabled: false }
      })
    ]
  });
}

type MefAuth = ReturnType<typeof createAuth>;
const globalAuth = globalThis as typeof globalThis & { __mefBetterAuth?: MefAuth };
export const auth: MefAuth = globalAuth.__mefBetterAuth ??= createAuth();

export async function getBetterAuthSession(request: Request, env: NodeJS.ProcessEnv = process.env) {
  assertAuthRuntimeConfiguration(env);
  return auth.api.getSession({ headers: request.headers });
}
