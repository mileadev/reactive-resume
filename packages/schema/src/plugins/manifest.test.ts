import { describe, expect, it } from "vitest";
import { evaluatePluginTrust, pluginManifestSchema } from "./manifest";

const browserPlugin = pluginManifestSchema.parse({
	apiVersion: 1,
	id: "example.markdown-exporter",
	name: "Markdown Exporter",
	version: "1.0.0",
	runtime: "browser-worker",
	extensions: ["resume.exporter"],
	permissions: ["resume:read"],
	entrypoint: "./index.js",
});

describe("plugin manifest trust policy", () => {
	it("allows sandboxed browser-worker plugins by default", () => {
		expect(evaluatePluginTrust(browserPlugin, { trustedPublishers: [] })).toEqual({
			allowed: true,
			reason: "browser-sandbox",
		});
	});

	it("requires integrity metadata for server plugins", () => {
		expect(() =>
			pluginManifestSchema.parse({
				...browserPlugin,
				id: "example.server-plugin",
				runtime: "trusted-server",
				publisher: "example",
			}),
		).toThrow("integrity");
	});

	it("keeps server plugins disabled unless the deployment opts in and trusts the publisher", () => {
		const serverPlugin = pluginManifestSchema.parse({
			...browserPlugin,
			id: "example.server-plugin",
			runtime: "trusted-server",
			publisher: "example",
			integrity: "sha256-YWJj",
		});

		expect(evaluatePluginTrust(serverPlugin, { trustedPublishers: ["example"] }).allowed).toBe(false);
		expect(
			evaluatePluginTrust(serverPlugin, { trustedPublishers: ["other"], allowServerPlugins: true }).reason,
		).toBe("untrusted-publisher");
		expect(
			evaluatePluginTrust(serverPlugin, { trustedPublishers: ["example"], allowServerPlugins: true }).allowed,
		).toBe(true);
	});
});
