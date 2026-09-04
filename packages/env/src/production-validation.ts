export interface ProductionEnvironmentInput {
	APP_URL: string;
	AUTH_SECRET: string;
	ENCRYPTION_SECRET?: string;
	FLAG_DISABLE_API_RATE_LIMIT: boolean;
	FLAG_ALLOW_UNSAFE_OAUTH_REDIRECT_URI: boolean;
	S3_ACCESS_KEY_ID?: string;
	S3_SECRET_ACCESS_KEY?: string;
	SMTP_USER?: string;
	SMTP_PASS?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
	LINKEDIN_CLIENT_ID?: string;
	LINKEDIN_CLIENT_SECRET?: string;
	OAUTH_CLIENT_ID?: string;
	OAUTH_CLIENT_SECRET?: string;
}

const PLACEHOLDER_SECRET = /(change[-_ ]?me|example|password|replace[-_ ]?me|secret|todo)/i;

function assertSecret(name: string, value: string | undefined, minimumLength: number): void {
	if (value === undefined) return;
	if (value.length < minimumLength) throw new Error(`${name} must be at least ${minimumLength} characters in production.`);
	if (PLACEHOLDER_SECRET.test(value)) throw new Error(`${name} looks like a placeholder and is not allowed in production.`);
}

function assertPair(name: string, left: string | undefined, right: string | undefined): void {
	if (Boolean(left) !== Boolean(right)) throw new Error(`${name} must be configured as a complete credential pair.`);
}

function isLoopbackApplicationUrl(url: URL): boolean {
	const hostname = url.hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
	return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function validateProductionEnvironment(input: ProductionEnvironmentInput): void {
	const appUrl = new URL(input.APP_URL);
	const loopback = isLoopbackApplicationUrl(appUrl);

	if (!loopback && appUrl.protocol !== "https:") {
		throw new Error("Public APP_URL must use HTTPS in production.");
	}

	// The checked-in convenience Compose stack intentionally uses localhost and
	// disposable secrets. Public deployments must use strong secrets; allowing
	// loopback-only evaluation here does not weaken internet-facing instances.
	if (!loopback) {
		assertSecret("AUTH_SECRET", input.AUTH_SECRET, 32);
		assertSecret("ENCRYPTION_SECRET", input.ENCRYPTION_SECRET, 32);
	}

	if (input.FLAG_DISABLE_API_RATE_LIMIT && !loopback) {
		throw new Error("FLAG_DISABLE_API_RATE_LIMIT cannot be enabled for a public production deployment.");
	}
	if (input.FLAG_ALLOW_UNSAFE_OAUTH_REDIRECT_URI && !loopback) {
		throw new Error("FLAG_ALLOW_UNSAFE_OAUTH_REDIRECT_URI cannot be enabled for a public production deployment.");
	}

	assertPair("S3 credentials", input.S3_ACCESS_KEY_ID, input.S3_SECRET_ACCESS_KEY);
	assertPair("SMTP credentials", input.SMTP_USER, input.SMTP_PASS);
	assertPair("Google OAuth credentials", input.GOOGLE_CLIENT_ID, input.GOOGLE_CLIENT_SECRET);
	assertPair("GitHub OAuth credentials", input.GITHUB_CLIENT_ID, input.GITHUB_CLIENT_SECRET);
	assertPair("LinkedIn OAuth credentials", input.LINKEDIN_CLIENT_ID, input.LINKEDIN_CLIENT_SECRET);
	assertPair("Custom OAuth credentials", input.OAUTH_CLIENT_ID, input.OAUTH_CLIENT_SECRET);
}
