import { describe, expect, it } from "vitest";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { ATS_ENGINE_VERSION, runAtsEngine } from "./engine";

describe("runAtsEngine", () => {
	it("returns a stable deterministic envelope around the lint report", () => {
		const result = runAtsEngine(defaultResumeData, { now: new Date("2026-01-01T00:00:00Z") });

		expect(result.engineVersion).toBe(ATS_ENGINE_VERSION);
		expect(result.deterministic).toBe(true);
		expect(result.confidence).toBe(1);
		expect(result.score).toBeGreaterThanOrEqual(0);
		expect(result.score).toBeLessThanOrEqual(100);
		expect(result.checks.total).toBe(result.report.totalRules);
		expect(result.checks.passed + result.checks.failed).toBe(result.checks.total);
		expect(result.evidence).toHaveLength(result.report.findings.length);
	});
});
