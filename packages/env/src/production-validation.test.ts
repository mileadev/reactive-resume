import { describe, expect, it } from "vitest";
import { validateProductionEnvironment, type ProductionEnvironmentInput } from "./production-validation";

function valid(overrides: Partial<ProductionEnvironmentInput> = {}): ProductionEnvironmentInput {
	return {
		APP_URL: "https://resume.example.com",
		AUTH_SECRET: "a".repeat(64),
		FLAG_DISABLE_API_RATE_LIMIT: false,
		FLAG_ALLOW_UNSAFE_OAUTH_REDIRECT_URI: false,
		...overrides,
	};
}

describe("validateProductionEnvironment", () => {
	it("accepts a minimal hardened production configuration", () => {
		expect(() => validateProductionEnvironment(valid())).not.toThrow();
	});

	it("rejects public HTTP and weak or placeholder auth secrets", () => {
		expect(() => validateProductionEnvironment(valid({ APP_URL: "http://resume.example.com" }))).toThrow("HTTPS");
		expect(() => validateProductionEnvironment(valid({ AUTH_SECRET: "short" }))).toThrow("at least 32");
		expect(() => validateProductionEnvironment(valid({ AUTH_SECRET: `replace-me-${"a".repeat(64)}` }))).toThrow(
			"placeholder",
		);
	});

	it("permits loopback evaluation with disposable development secrets", () => {
		expect(() =>
			validateProductionEnvironment(
				valid({
					APP_URL: "http://localhost:3000",
					AUTH_SECRET: "change-me-to-a-secure-secret-key-in-production",
					ENCRYPTION_SECRET: "change-me-to-a-secure-agent-secret-in-production",
				}),
			),
		).not.toThrow();
	});

	it("rejects security bypass flags for public deployments", () => {
		expect(() => validateProductionEnvironment(valid({ FLAG_DISABLE_API_RATE_LIMIT: true }))).toThrow(
			"FLAG_DISABLE_API_RATE_LIMIT",
		);
		expect(() => validateProductionEnvironment(valid({ FLAG_ALLOW_UNSAFE_OAUTH_REDIRECT_URI: true }))).toThrow(
			"FLAG_ALLOW_UNSAFE_OAUTH_REDIRECT_URI",
		);
	});

	it("permits explicit bypass flags only for loopback evaluation", () => {
		expect(() =>
			validateProductionEnvironment(
				valid({
					APP_URL: "http://127.0.0.1:3000",
					AUTH_SECRET: "dev",
					FLAG_DISABLE_API_RATE_LIMIT: true,
					FLAG_ALLOW_UNSAFE_OAUTH_REDIRECT_URI: true,
				}),
			),
		).not.toThrow();
	});

	it("rejects incomplete credential pairs in every mode", () => {
		expect(() => validateProductionEnvironment(valid({ S3_ACCESS_KEY_ID: "id" }))).toThrow("S3 credentials");
		expect(() => validateProductionEnvironment(valid({ SMTP_PASS: "password" }))).toThrow("SMTP credentials");
		expect(() => validateProductionEnvironment(valid({ OAUTH_CLIENT_ID: "client" }))).toThrow(
			"Custom OAuth credentials",
		);
		expect(() =>
			validateProductionEnvironment(valid({ APP_URL: "http://localhost:3000", S3_ACCESS_KEY_ID: "id" })),
		).toThrow("S3 credentials");
	});
});
