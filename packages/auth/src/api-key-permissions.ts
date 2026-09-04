export const API_KEY_PERMISSION_ACTIONS = {
	resume: ["read", "create", "write", "delete", "export"],
	application: ["read", "create", "write", "delete"],
	ats: ["run"],
	agent: ["run"],
	aiProvider: ["read", "write"],
	statistics: ["read"],
	storage: ["read", "write"],
} as const;

export type ApiKeyResource = keyof typeof API_KEY_PERMISSION_ACTIONS;
export type ApiKeyAction<TResource extends ApiKeyResource = ApiKeyResource> =
	(typeof API_KEY_PERMISSION_ACTIONS)[TResource][number];
export type ApiKeyPermissions = Partial<Record<ApiKeyResource, string[]>>;

/**
 * Safe defaults for keys created through Better Auth's generic API-key endpoint.
 * Destructive actions and provider-secret management are intentionally excluded.
 * Callers that need elevated capabilities should use an explicit, reviewed
 * permission set rather than inheriting full user authority.
 */
export const API_KEY_DEFAULT_PERMISSIONS: ApiKeyPermissions = {
	resume: ["read", "create", "write", "export"],
	application: ["read", "create", "write"],
	ats: ["run"],
	agent: ["run"],
	statistics: ["read"],
	storage: ["read", "write"],
};

function normalizePermissions(value: unknown): Record<string, string[]> {
	if (typeof value === "string") {
		try {
			return normalizePermissions(JSON.parse(value));
		} catch {
			return {};
		}
	}

	if (!value || typeof value !== "object" || Array.isArray(value)) return {};

	const permissions: Record<string, string[]> = {};
	for (const [resource, actions] of Object.entries(value)) {
		if (!Array.isArray(actions)) continue;
		permissions[resource] = actions.filter((action): action is string => typeof action === "string");
	}

	return permissions;
}

export function normalizeApiKeyPermissions(value: unknown): ApiKeyPermissions {
	return normalizePermissions(value) as ApiKeyPermissions;
}

export function hasApiKeyPermission(
	permissions: unknown,
	resource: ApiKeyResource,
	action: string,
): boolean {
	const normalized = normalizePermissions(permissions);
	return normalized[resource]?.includes(action) ?? false;
}

export function isValidApiKeyPermissions(value: unknown): value is ApiKeyPermissions {
	const normalized = normalizePermissions(value);
	if (Object.keys(normalized).length === 0 && value && typeof value === "object") {
		return Object.keys(value).length === 0;
	}

	for (const [resource, actions] of Object.entries(normalized)) {
		if (!(resource in API_KEY_PERMISSION_ACTIONS)) return false;
		const allowed = API_KEY_PERMISSION_ACTIONS[resource as ApiKeyResource] as readonly string[];
		if (actions.some((action) => !allowed.includes(action))) return false;
	}

	return true;
}
