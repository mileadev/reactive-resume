import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { AtsLintOptions } from "./index";
import type { AtsFinding, AtsReport } from "./types";
import { lintResumeForAts } from "./index";

export const ATS_ENGINE_VERSION = "1" as const;

export interface AtsEngineEvidence {
	code: AtsFinding["code"];
	pointer: string;
	severity: AtsFinding["severity"];
}

export interface AtsEngineResult {
	engineVersion: typeof ATS_ENGINE_VERSION;
	deterministic: true;
	score: number;
	confidence: 1;
	scoreFormula: "passed-rules / total-rules";
	checks: {
		total: number;
		passed: number;
		failed: number;
	};
	report: AtsReport;
	evidence: readonly AtsEngineEvidence[];
	warnings: readonly string[];
	skippedRules: readonly string[];
}

/**
 * Stable deterministic ATS entry point for API, CLI, SDK, MCP, and UI callers.
 * The score is deliberately transparent: it is only the percentage of lint
 * rules that did not fire, not a claim about recruiter or ATS acceptance.
 */
export function runAtsEngine(data: ResumeData, options: AtsLintOptions = {}): AtsEngineResult {
	const report = lintResumeForAts(data, options);
	const failed = report.totalRules - report.passedRules;
	const score = report.totalRules === 0 ? 100 : Math.round((report.passedRules / report.totalRules) * 100);

	return {
		engineVersion: ATS_ENGINE_VERSION,
		deterministic: true,
		score,
		confidence: 1,
		scoreFormula: "passed-rules / total-rules",
		checks: {
			total: report.totalRules,
			passed: report.passedRules,
			failed,
		},
		report,
		evidence: report.findings.map((finding) => ({
			code: finding.code,
			pointer: finding.pointer,
			severity: finding.severity,
		})),
		warnings: [],
		skippedRules: [],
	};
}
