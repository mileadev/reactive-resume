import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { ResumeDocument, ResumeDocumentProvenance } from "@reactive-resume/schema/resume/document";
import { resumeDataSchema } from "@reactive-resume/schema/resume/data";
import {
	createResumeDocument,
	nextResumeDocumentRevision,
	parseResumeDocument,
} from "@reactive-resume/schema/resume/document";
import { runAtsEngine, type AtsEngineResult } from "./ats/engine";
import { buildMarkdown } from "./markdown";
import { applyResumePatches, type JsonPatchOperation } from "./patch";

export interface ResumeValidationResult {
	valid: boolean;
	data?: ResumeData;
	issues: Array<{ path: string; message: string }>;
}

export function validateResumeData(value: unknown): ResumeValidationResult {
	const parsed = resumeDataSchema.safeParse(value);
	if (parsed.success) return { valid: true, data: parsed.data, issues: [] };

	return {
		valid: false,
		issues: parsed.error.issues.map((issue) => ({
			path: issue.path.length > 0 ? `/${issue.path.map(String).join("/")}` : "/",
			message: issue.message,
		})),
	};
}

export function createVersionedResume(input: {
	documentId: string;
	data: ResumeData;
	revision?: number;
	provenance?: ResumeDocumentProvenance;
}): ResumeDocument {
	return createResumeDocument(input);
}

export function parseVersionedResume(
	value: unknown,
	options: { legacyDocumentId?: string; legacyRevision?: number } = {},
): ResumeDocument {
	return parseResumeDocument(value, options);
}

export function incrementResumeRevision(document: ResumeDocument): ResumeDocument {
	return nextResumeDocumentRevision(document);
}

export function patchResume(data: ResumeData, operations: JsonPatchOperation[]): ResumeData {
	return applyResumePatches(data, operations);
}

export function analyzeResumeForAts(data: ResumeData): AtsEngineResult {
	return runAtsEngine(data);
}

export function resumeToMarkdown(data: ResumeData): string {
	return buildMarkdown(data);
}

/**
 * Lockfile-safe public toolkit surface shared by automation, CLI, and future SDK
 * packaging. It intentionally contains only deterministic local operations and
 * never performs network or storage I/O.
 */
export const resumeToolkit = {
	validate: validateResumeData,
	createDocument: createVersionedResume,
	parseDocument: parseVersionedResume,
	nextRevision: incrementResumeRevision,
	patch: patchResume,
	ats: analyzeResumeForAts,
	markdown: resumeToMarkdown,
} as const;
