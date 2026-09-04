import z from "zod";

export const PLUGIN_API_VERSION = 1 as const;

export const pluginPermissionSchema = z.enum([
	"resume:read",
	"resume:write",
	"application:read",
	"application:write",
	"ats:run",
	"agent:run",
	"storage:read",
	"storage:write",
	"network:outbound",
]);

export const pluginExtensionPointSchema = z.enum([
	"resume.importer",
	"resume.exporter",
	"ats.rule",
	"template",
	"automation.trigger",
	"automation.action",
]);

export const pluginManifestSchema = z
	.object({
		apiVersion: z.literal(PLUGIN_API_VERSION),
		id: z.string().regex(/^[a-z0-9][a-z0-9.-]{2,127}$/),
		name: z.string().trim().min(1).max(120),
		version: z.string().trim().min(1).max(64),
		description: z.string().trim().max(1_000).default(""),
		runtime: z.enum(["browser-worker", "trusted-server"]),
		extensions: z.array(pluginExtensionPointSchema).min(1),
		permissions: z.array(pluginPermissionSchema).default([]),
		entrypoint: z.string().trim().min(1),
		integrity: z.string().regex(/^sha256-[A-Za-z0-9+/=]+$/).optional(),
		publisher: z.string().trim().min(1).optional(),
	})
	.superRefine((manifest, context) => {
		if (manifest.runtime === "trusted-server" && !manifest.integrity) {
			context.addIssue({
				code: "custom",
				path: ["integrity"],
				message: "Trusted server plugins require an immutable SHA-256 integrity value.",
			});
		}
	});

export type PluginPermission = z.infer<typeof pluginPermissionSchema>;
export type PluginExtensionPoint = z.infer<typeof pluginExtensionPointSchema>;
export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export interface PluginTrustPolicy {
	trustedPublishers: readonly string[];
	allowServerPlugins?: boolean;
}

export interface PluginPolicyDecision {
	allowed: boolean;
	reason: "browser-sandbox" | "server-plugins-disabled" | "untrusted-publisher" | "trusted-server";
}

/**
 * Browser-worker plugins are the default extension runtime. Server plugins are
 * never loadable merely because a manifest asks for it: the deployment must
 * explicitly enable them and trust the publisher. This policy is intentionally
 * separate from signature/integrity verification, which belongs to the loader.
 */
export function evaluatePluginTrust(manifest: PluginManifest, policy: PluginTrustPolicy): PluginPolicyDecision {
	if (manifest.runtime === "browser-worker") return { allowed: true, reason: "browser-sandbox" };
	if (!policy.allowServerPlugins) return { allowed: false, reason: "server-plugins-disabled" };
	if (!manifest.publisher || !policy.trustedPublishers.includes(manifest.publisher)) {
		return { allowed: false, reason: "untrusted-publisher" };
	}
	return { allowed: true, reason: "trusted-server" };
}
