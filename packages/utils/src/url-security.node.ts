import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

function normalizeHostname(hostname: string) {
	return hostname.trim().toLowerCase();
}

function stripIpv6Brackets(hostname: string): string {
	return hostname.replace(/^\[/, "").replace(/\]$/, "");
}

const blockedIpv4Cidrs: Array<[string, number]> = [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.88.99.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 4],
	["240.0.0.0", 4],
];

const blockedIpv6Cidrs: Array<[string, number]> = [
	["::", 128],
	["::1", 128],
	["::ffff:0:0", 96],
	["64:ff9b::", 96],
	["64:ff9b:1::", 48],
	["100::", 64],
	["100:0:0:1::", 64],
	["2001::", 23],
	["2001:2::", 48],
	["2001:10::", 28],
	["2001:db8::", 32],
	["2002::", 16],
	["3fff::", 20],
	["5f00::", 16],
	["fc00::", 7],
	["fe80::", 10],
	["ff00::", 8],
];

const blockedIpv4s = new BlockList();
for (const [address, prefix] of blockedIpv4Cidrs) blockedIpv4s.addSubnet(address, prefix, "ipv4");

const blockedIpv6s = new BlockList();
for (const [address, prefix] of blockedIpv6Cidrs) blockedIpv6s.addSubnet(address, prefix, "ipv6");

export function isPrivateOrLoopbackHost(hostname: string) {
	const normalized = stripIpv6Brackets(normalizeHostname(hostname));
	if (normalized.startsWith("::ffff:")) return true;
	if (normalized === "localhost" || normalized === "::1" || normalized.endsWith(".localhost")) return true;

	const ipVersion = isIP(normalized);
	if (ipVersion === 4) return blockedIpv4s.check(normalized, "ipv4");
	if (ipVersion === 6) return blockedIpv6s.check(normalized, "ipv6");

	return false;
}

export function parseUrl(input: string) {
	try {
		return new URL(input);
	} catch {
		return null;
	}
}

export type HostLookupResult = Readonly<{ address: string; family: number }>;
export type HostLookup = (hostname: string) => Promise<readonly HostLookupResult[]>;

const systemHostLookup: HostLookup = (hostname) => lookup(hostname, { all: true, verbatim: true });

/**
 * Resolve every address currently published for a hostname and reject the
 * entire destination if any answer is non-public. Rejecting mixed public and
 * private answers is intentional: an attacker must not be able to influence
 * which answer the downstream HTTP stack chooses.
 *
 * This closes hostname-only SSRF validation gaps. Callers performing the actual
 * HTTP request should still disable or revalidate redirects and, where their
 * HTTP client permits it, pin the validated address to eliminate DNS-rebinding
 * time-of-check/time-of-use races.
 */
export async function resolvePublicHostAddresses(
	hostname: string,
	options: { lookup?: HostLookup } = {},
): Promise<readonly string[]> {
	const normalized = stripIpv6Brackets(normalizeHostname(hostname));
	if (!normalized) throw new Error("INVALID_HOSTNAME");

	const literalVersion = isIP(normalized);
	if (literalVersion !== 0) {
		if (isPrivateOrLoopbackHost(normalized)) throw new Error("NON_PUBLIC_HOST");
		return [normalized];
	}

	if (isPrivateOrLoopbackHost(normalized)) throw new Error("NON_PUBLIC_HOST");

	const resolver = options.lookup ?? systemHostLookup;
	const answers = await resolver(normalized);
	if (answers.length === 0) throw new Error("HOST_NOT_RESOLVED");

	const addresses = [...new Set(answers.map(({ address }) => stripIpv6Brackets(normalizeHostname(address))))];
	if (addresses.some((address) => isIP(address) === 0 || isPrivateOrLoopbackHost(address))) {
		throw new Error("NON_PUBLIC_HOST");
	}

	return addresses;
}

export async function assertUrlResolvesToPublicAddresses(
	input: string,
	options: { lookup?: HostLookup } = {},
): Promise<readonly string[]> {
	const parsed = parseUrl(input);
	if (!parsed) throw new Error("INVALID_URL");
	if (parsed.username || parsed.password) throw new Error("INVALID_URL");
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("INVALID_URL");

	return resolvePublicHostAddresses(parsed.hostname, options);
}

type OAuthRedirectUriOptions = {
	allowUnsafe?: boolean;
};

export function isAllowedOAuthRedirectUri(input: string, trustedOrigins: string[], options?: OAuthRedirectUriOptions) {
	const parsed = parseUrl(input);
	if (!parsed) return false;
	if (options?.allowUnsafe) return true;
	if (parsed.username || parsed.password) return false;
	if (parsed.hash) return false;

	const origin = parsed.origin.toLowerCase();
	const hostname = stripIpv6Brackets(normalizeHostname(parsed.hostname));

	if (parsed.protocol === "http:") return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
	if (parsed.protocol !== "https:") return false;
	if (isPrivateOrLoopbackHost(hostname)) return false;

	return trustedOrigins.includes(origin);
}
