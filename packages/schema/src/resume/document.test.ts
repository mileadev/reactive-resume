import { describe, expect, it } from "vitest";
import { defaultResumeData } from "./default";
import {
	RESUME_DOCUMENT_SCHEMA_VERSION,
	createResumeDocument,
	nextResumeDocumentRevision,
	parseResumeDocument,
} from "./document";

describe("resume document envelope", () => {
	it("wraps ResumeData in a stable versioned envelope", () => {
		const document = createResumeDocument({ documentId: "resume-1", data: defaultResumeData });

		expect(document.schemaVersion).toBe(RESUME_DOCUMENT_SCHEMA_VERSION);
		expect(document.documentId).toBe("resume-1");
		expect(document.revision).toBe(0);
		expect(document.data).toEqual(defaultResumeData);
	});

	it("upgrades legacy bare ResumeData only when the caller supplies its identity", () => {
		expect(() => parseResumeDocument(defaultResumeData)).toThrow("legacyDocumentId");

		const document = parseResumeDocument(defaultResumeData, { legacyDocumentId: "legacy-1", legacyRevision: 7 });
		expect(document.documentId).toBe("legacy-1");
		expect(document.revision).toBe(7);
		expect(document.provenance?.source).toBe("migration");
	});

	it("increments revisions monotonically without mutating the previous document", () => {
		const first = createResumeDocument({ documentId: "resume-1", data: defaultResumeData, revision: 3 });
		const next = nextResumeDocumentRevision(first);

		expect(first.revision).toBe(3);
		expect(next.revision).toBe(4);
	});
});
