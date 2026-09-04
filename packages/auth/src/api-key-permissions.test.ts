import { describe, expect, it } from "vitest";
import {
	API_KEY_DEFAULT_PERMISSIONS,
	hasApiKeyPermission,
	isValidApiKeyPermissions,
	normalizeApiKeyPermissions,
} from "./api-key-permissions";

describe("API-key permission policy", () => {
	it("defaults to useful non-destructive permissions", () => {
		expect(hasApiKeyPermission(API_KEY_DEFAULT_PERMISSIONS, "resume", "read")).toBe(true);
		expect(hasApiKeyPermission(API_KEY_DEFAULT_PERMISSIONS, "resume", "export")).toBe(true);
		expect(hasApiKeyPermission(API_KEY_DEFAULT_PERMISSIONS, "application", "write")).toBe(true);
		expect(hasApiKeyPermission(API_KEY_DEFAULT_PERMISSIONS, "resume", "delete")).toBe(false);
		expect(hasApiKeyPermission(API_KEY_DEFAULT_PERMISSIONS, "application", "delete")).toBe(false);
		expect(hasApiKeyPermission(API_KEY_DEFAULT_PERMISSIONS, "aiProvider", "write")).toBe(false);
	});

	it("normalizes Better Auth JSON-string permission payloads", () => {
		const normalized = normalizeApiKeyPermissions(
			JSON.stringify({ resume: ["read", "write"], application: ["read"] }),
		);
		expect(normalized).toEqual({ resume: ["read", "write"], application: ["read"] });
	});

	it("rejects unknown resources and actions", () => {
		expect(isValidApiKeyPermissions({ resume: ["read", "delete"] })).toBe(true);
		expect(isValidApiKeyPermissions({ resume: ["root"] })).toBe(false);
		expect(isValidApiKeyPermissions({ admin: ["all"] })).toBe(false);
	});

	it("fails closed on malformed permission payloads", () => {
		expect(normalizeApiKeyPermissions("not-json")).toEqual({});
		expect(hasApiKeyPermission("not-json", "resume", "read")).toBe(false);
		expect(hasApiKeyPermission({ resume: "read" }, "resume", "read")).toBe(false);
	});
});
