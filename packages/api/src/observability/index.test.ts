import { describe, expect, it, vi } from "vitest";
import { OperationTelemetry, sanitizeTelemetryAttributes } from "./index";

describe("operation telemetry", () => {
	it("drops likely PII and secret attributes", () => {
		expect(
			sanitizeTelemetryAttributes({
				capability: "resume.read",
				userId: "opaque-user-id",
				email: "person@example.com",
				authorization: "Bearer secret",
				promptText: "sensitive",
			}),
		).toEqual({ capability: "resume.read", userId: "opaque-user-id" });
	});

	it("records deterministic success timing without changing the result", async () => {
		const sink = vi.fn();
		let tick = 10;
		const telemetry = new OperationTelemetry({
			sink,
			now: () => new Date("2026-01-01T00:00:00.000Z"),
			clock: () => (tick += 5),
		});

		await expect(telemetry.run("ats.run", { engineVersion: "1" }, () => 42)).resolves.toBe(42);
		expect(sink).toHaveBeenCalledWith({
			name: "ats.run",
			startedAt: "2026-01-01T00:00:00.000Z",
			durationMs: 5,
			outcome: "success",
			attributes: { engineVersion: "1" },
		});
	});

	it("records errors and rethrows the original failure", async () => {
		const sink = vi.fn();
		const telemetry = new OperationTelemetry({
			sink,
			clock: (() => {
				let tick = 0;
				return () => (tick += 1);
			})(),
		});
		const failure = new TypeError("boom");

		await expect(telemetry.run("pdf.render", {}, () => Promise.reject(failure))).rejects.toBe(failure);
		expect(sink.mock.calls[0]?.[0]).toMatchObject({ outcome: "error", errorName: "TypeError" });
	});

	it("does not fail business operations when the telemetry sink fails", async () => {
		const telemetry = new OperationTelemetry({ sink: () => Promise.reject(new Error("collector unavailable")) });
		await expect(telemetry.run("resume.validate", {}, () => "ok")).resolves.toBe("ok");
	});
});
