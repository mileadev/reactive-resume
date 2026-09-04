import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { parseJSONResume } from "./json-resume";
import { parseReactiveResumeJSON } from "./reactive-resume-json";
import { parseReactiveResumeV4JSON } from "./reactive-resume-v4-json";

export type ResumeImportFormat = "reactive-resume-v5" | "reactive-resume-v4" | "json-resume";

export interface ResumeImportWarning {
	code: string;
	message: string;
	path?: string;
}

export interface ResumeImportProvenance {
	format: ResumeImportFormat;
	adapterVersion: 1;
	confidence: number;
}

export interface ResumeImportResult {
	data: ResumeData;
	warnings: ResumeImportWarning[];
	provenance: ResumeImportProvenance;
}

export interface ResumeImporter {
	id: ResumeImportFormat;
	label: string;
	detect(input: string): number;
	import(input: string): ResumeData;
}

function parseObject(input: string): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(input);
		return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function hasObjectKey(value: Record<string, unknown> | null, key: string): boolean {
	return value !== null && Object.prototype.hasOwnProperty.call(value, key);
}

const importers: readonly ResumeImporter[] = [
	{
		id: "reactive-resume-v5",
		label: "Reactive Resume",
		detect(input) {
			const value = parseObject(input);
			if (!value) return 0;
			if (hasObjectKey(value, "customSections") && hasObjectKey(value, "metadata")) return 1;
			if (hasObjectKey(value, "sections") && hasObjectKey(value, "picture") && hasObjectKey(value, "metadata")) return 0.95;
			return 0;
		},
		import: parseReactiveResumeJSON,
	},
	{
		id: "reactive-resume-v4",
		label: "Reactive Resume v4",
		detect(input) {
			const value = parseObject(input);
			if (!value) return 0;
			const basics = value.basics;
			const metadata = value.metadata;
			if (!basics || typeof basics !== "object" || !metadata || typeof metadata !== "object") return 0;
			const picture = (basics as Record<string, unknown>).picture;
			const layout = (metadata as Record<string, unknown>).layout;
			return picture && typeof picture === "object" && Array.isArray(layout) ? 0.98 : 0;
		},
		import: parseReactiveResumeV4JSON,
	},
	{
		id: "json-resume",
		label: "JSON Resume",
		detect(input) {
			const value = parseObject(input);
			if (!value) return 0;
			const schema = typeof value.$schema === "string" ? value.$schema.toLowerCase() : "";
			if (schema.includes("jsonresume")) return 1;
			const jsonResumeKeys = ["basics", "work", "volunteer", "education", "awards", "certificates", "publications", "skills", "languages", "interests", "references", "projects"];
			const score = jsonResumeKeys.filter((key) => hasObjectKey(value, key)).length;
			return score >= 3 ? 0.9 : score > 0 ? 0.6 : Object.keys(value).length === 0 ? 0.25 : 0;
		},
		import: parseJSONResume,
	},
] as const;

export function listResumeImporters(): readonly ResumeImporter[] {
	return importers;
}

export function detectResumeImportFormat(input: string): Array<{ format: ResumeImportFormat; confidence: number }> {
	return importers
		.map((importer) => ({ format: importer.id, confidence: importer.detect(input) }))
		.filter((candidate) => candidate.confidence > 0)
		.sort((a, b) => b.confidence - a.confidence);
}

export function importResume(
	input: string,
	options: { format?: ResumeImportFormat; minimumConfidence?: number } = {},
): ResumeImportResult {
	const minimumConfidence = options.minimumConfidence ?? 0.5;
	const selected = options.format
		? importers.find((importer) => importer.id === options.format)
		: (() => {
				const [best] = detectResumeImportFormat(input);
				return best && best.confidence >= minimumConfidence
					? importers.find((importer) => importer.id === best.format)
					: undefined;
			})();

	if (!selected) {
		throw new Error(
			options.format
				? `Unsupported resume import format: ${options.format}`
				: "Could not confidently detect the resume import format.",
		);
	}

	const confidence = selected.detect(input);
	const data = selected.import(input);
	const warnings: ResumeImportWarning[] = [];
	if (confidence < 0.75) {
		warnings.push({
			code: "LOW_FORMAT_CONFIDENCE",
			message: `The ${selected.label} adapter was selected with ${(confidence * 100).toFixed(0)}% confidence. Review the imported document before publishing.`,
		});
	}

	return {
		data,
		warnings,
		provenance: {
			format: selected.id,
			adapterVersion: 1,
			confidence,
		},
	};
}
