import type { Locale } from "@reactive-resume/utils/locale";
import type { User } from "better-auth";
import { ORPCError, os } from "@orpc/server";
import { eq } from "drizzle-orm";
import {
	hasApiKeyPermission,
	normalizeApiKeyPermissions,
	type ApiKeyAction,
	type ApiKeyPermissions,
	type ApiKeyResource,
} from "@reactive-resume/auth/api-key-permissions";
import { auth, verifyOAuthToken } from "@reactive-resume/auth/config";
import { db } from "@reactive-resume/db/client";
import { user } from "@reactive-resume/db/schema";

interface ORPCContext {
	locale: Locale;
	reqHeaders: Headers;
	resHeaders?: Headers;
	trustedClient?: string;
}

export type AuthPrincipal =
	| { type: "session"; userId: string }
	| { type: "oauth"; userId: string }
	| { type: "api-key"; userId: string; keyId: string; permissions: ApiKeyPermissions };

export interface AuthIdentity {
	user: User;
	principal: AuthPrincipal;
}

async function getIdentityFromBearerToken(headers: Headers): Promise<AuthIdentity | null> {
	try {
		const authHeader = headers.get("authorization");
		if (!authHeader?.startsWith("Bearer ")) return null;

		const payload = await verifyOAuthToken(authHeader.slice(7));
		if (!payload?.sub) return null;

		const [userResult] = await db.select().from(user).where(eq(user.id, payload.sub)).limit(1);
		if (!userResult) return null;

		return { user: userResult, principal: { type: "oauth", userId: userResult.id } };
	} catch (error) {
		console.warn("Bearer token verification failed:", error);
		return null;
	}
}

async function getIdentityFromHeaders(headers: Headers): Promise<AuthIdentity | null> {
	try {
		const result = await auth.api.getSession({ headers });
		if (!result?.user) return null;

		return { user: result.user, principal: { type: "session", userId: result.user.id } };
	} catch (error) {
		console.warn("Session verification failed:", error);
		return null;
	}
}

async function getIdentityFromApiKey(apiKey: string): Promise<AuthIdentity | null> {
	try {
		const result = await auth.api.verifyApiKey({ body: { key: apiKey } });
		if (!result.key || !result.valid) return null;

		const [userResult] = await db.select().from(user).where(eq(user.id, result.key.referenceId)).limit(1);
		if (!userResult) return null;

		return {
			user: userResult,
			principal: {
				type: "api-key",
				userId: userResult.id,
				keyId: result.key.id,
				permissions: normalizeApiKeyPermissions(result.key.permissions),
			},
		};
	} catch (error) {
		console.warn("API key verification failed:", error);
		return null;
	}
}

/**
 * Resolve authentication from the same headers oRPC uses (`x-api-key`,
 * `Authorization: Bearer`, or session cookies). Explicit credentials fail
 * closed: an invalid API key or bearer token is never silently replaced by a
 * browser session, preventing credential-confusion and privilege escalation.
 */
export async function resolveAuthenticationFromRequestHeaders(headers: Headers): Promise<AuthIdentity | null> {
	const apiKey = headers.get("x-api-key");
	if (apiKey) return getIdentityFromApiKey(apiKey);

	const authorization = headers.get("authorization");
	if (authorization?.startsWith("Bearer ")) return getIdentityFromBearerToken(headers);

	return getIdentityFromHeaders(headers);
}

/**
 * Compatibility helper for callers that only need the authenticated user.
 * New authorization-sensitive integrations should use
 * `resolveAuthenticationFromRequestHeaders` so the credential type and API-key
 * permissions are not discarded.
 */
export async function resolveUserFromRequestHeaders(headers: Headers): Promise<User | null> {
	return (await resolveAuthenticationFromRequestHeaders(headers))?.user ?? null;
}

const base = os.$context<ORPCContext>();

export const publicProcedure = base.use(async ({ context, next }) => {
	const identity = await resolveAuthenticationFromRequestHeaders(context.reqHeaders);

	return next({
		context: {
			...context,
			user: identity?.user ?? null,
			principal: identity?.principal ?? null,
		},
	});
});

export const protectedProcedure = publicProcedure.use(({ context, next }) => {
	if (!context.user || !context.principal) throw new ORPCError("UNAUTHORIZED");

	return next({
		context: {
			...context,
			user: context.user,
			principal: context.principal,
		},
	});
});

/**
 * Require a resource/action permission only when the caller authenticated with
 * an API key. Session and OAuth principals retain the user's normal authority;
 * API keys are capabilities and never implicitly inherit the whole account.
 */
export const scopedProcedure = <TResource extends ApiKeyResource>(
	resource: TResource,
	action: ApiKeyAction<TResource>,
) =>
	protectedProcedure.use(({ context, next }) => {
		if (
			context.principal.type === "api-key" &&
			!hasApiKeyPermission(context.principal.permissions, resource, action)
		) {
			throw new ORPCError("FORBIDDEN", {
				message: `API key is missing required permission: ${resource}:${String(action)}`,
			});
		}

		return next({ context });
	});

/**
 * Public resources may still use authenticated ownership to reveal additional
 * private data. For an under-scoped API key, degrade to an anonymous principal
 * rather than granting owner visibility; truly public data remains readable.
 */
export const scopedPublicProcedure = <TResource extends ApiKeyResource>(
	resource: TResource,
	action: ApiKeyAction<TResource>,
) =>
	publicProcedure.use(({ context, next }) => {
		if (
			context.principal?.type === "api-key" &&
			!hasApiKeyPermission(context.principal.permissions, resource, action)
		) {
			return next({ context: { ...context, user: null, principal: null } });
		}

		return next({ context });
	});
