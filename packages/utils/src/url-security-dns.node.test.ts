import { describe, expect, it } from "vitest";
import {
	assertUrlResolvesToPublicAddresses,
	resolvePublicHostAddresses,
	type HostLookup,
} from "./url-security.node";

function resolver(records: readonly { address: string; family: number }[]): HostLookup {
	return async () => records;
}

describe("resolvePublicHostAddresses", () => {
	it("accepts public literal IP addresses without DNS", async () => {
		await expect(resolvePublicHostAddresses("8.8.8.8")).resolves.toEqual(["8.8.8.8"]);
		await expect(resolvePublicHostAddresses("2606:4700:4700::1111")).resolves.toEqual([
			"2606:4700:4700::1111",
		]);
	});

	it("rejects private literal IP addresses", async () => {
		await expect(resolvePublicHostAddresses("127.0.0.1")).rejects.toThrow("NON_PUBLIC_HOST");
		await expect(resolvePublicHostAddresses("169.254.169.254")).rejects.toThrow("NON_PUBLIC_HOST");
		await expect(resolvePublicHostAddresses("fd00::1")).rejects.toThrow("NON_PUBLIC_HOST");
	});

	it("accepts hostnames only when every DNS answer is public", async () => {
		const lookup = resolver([
			{ address: "8.8.8.8", family: 4 },
			{ address: "2606:4700:4700::1111", family: 6 },
		]);

		await expect(resolvePublicHostAddresses("ai.example.com", { lookup })).resolves.toEqual([
			"8.8.8.8",
			"2606:4700:4700::1111",
		]);
	});

	it("rejects mixed public/private DNS answers to prevent resolver selection bypasses", async () => {
		const lookup = resolver([
			{ address: "8.8.8.8", family: 4 },
			{ address: "10.0.0.8", family: 4 },
		]);

		await expect(resolvePublicHostAddresses("rebinding.example.com", { lookup })).rejects.toThrow(
			"NON_PUBLIC_HOST",
		);
	});

	it("rejects metadata and link-local DNS answers", async () => {
		const lookup = resolver([{ address: "169.254.169.254", family: 4 }]);
		await expect(resolvePublicHostAddresses("metadata.attacker.test", { lookup })).rejects.toThrow(
			"NON_PUBLIC_HOST",
		);
	});

	it("rejects empty DNS results", async () => {
		await expect(resolvePublicHostAddresses("missing.example.com", { lookup: resolver([]) })).rejects.toThrow(
			"HOST_NOT_RESOLVED",
		);
	});
});

describe("assertUrlResolvesToPublicAddresses", () => {
	it("validates the URL shape and resolved destination", async () => {
		const lookup = resolver([{ address: "1.1.1.1", family: 4 }]);
		await expect(assertUrlResolvesToPublicAddresses("https://api.example.com/v1", { lookup })).resolves.toEqual([
			"1.1.1.1",
		]);
	});

	it("rejects credentials and non-http protocols before DNS", async () => {
		const lookup = resolver([{ address: "1.1.1.1", family: 4 }]);
		await expect(assertUrlResolvesToPublicAddresses("https://user:pass@example.com", { lookup })).rejects.toThrow(
			"INVALID_URL",
		);
		await expect(assertUrlResolvesToPublicAddresses("file:///etc/passwd", { lookup })).rejects.toThrow("INVALID_URL");
	});
});
