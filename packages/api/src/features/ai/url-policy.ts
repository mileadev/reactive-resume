import type { AIProvider } from "@reactive-resume/ai/types";
import { AI_PROVIDER_DEFAULT_BASE_URLS } from "@reactive-resume/ai/types";
import { env } from "@reactive-resume/env/server";
import {
	assertUrlResolvesToPublicAddresses,
	isPrivateOrLoopbackHost,
	parseUrl,
} from "@reactive-resume/utils/url-security.node";

type ResolveAiBaseUrlInput = {
	provider: AIProvider;
	baseURL?: string | null;
};

function assertSafeUrl(input: string, errorCode: string, options?: { allowUnsafe?: boolean }) {
	const parsed = parseUrl(input);
	if (!parsed) throw new Error(errorCode);
	if (parsed.username || parsed.password) throw new Error(errorCode);
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error(errorCode);

	if (!options?.allowUnsafe) {
		if (parsed.protocol !== "https:") throw new Error(errorCode);
		if (isPrivateOrLoopbackHost(parsed.hostname)) throw new Error(errorCode);
	}

	parsed.hash = "";
	return parsed.toString();
}

export function resolveAiBaseUrl(input: ResolveAiBaseUrlInput) {
	const baseURL = input.baseURL?.trim() || AI_PROVIDER_DEFAULT_BASE_URLS[input.provider];
	if (!baseURL) throw new Error("INVALID_AI_BASE_URL");

	return assertSafeUrl(baseURL, "INVALID_AI_BASE_URL", { allowUnsafe: env.FLAG_ALLOW_UNSAFE_AI_BASE_URL });
}

/**
 * Validate the resolved network destination immediately before a provider is
 * tested or used. Literal-host checks alone do not stop an attacker-controlled
 * hostname from resolving to loopback/private infrastructure.
 */
export async function validateAiBaseUrlNetwork(input: ResolveAiBaseUrlInput): Promise<string> {
	const baseURL = resolveAiBaseUrl(input);
	if (env.FLAG_ALLOW_UNSAFE_AI_BASE_URL) return baseURL;

	try {
		await assertUrlResolvesToPublicAddresses(baseURL);
		return baseURL;
	} catch {
		throw new Error("INVALID_AI_BASE_URL");
	}
}
