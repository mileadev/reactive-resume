import { describe, expect, it } from "vitest";
import { detectResumeImportFormat, importResume } from "./registry";

const v5Shape = JSON.stringify({
	picture: { url: "", hidden: true },
	basics: {},
	sections: {},
	customSections: [],
	metadata: {},
});

const v4Shape = JSON.stringify({
	basics: { picture: { url: "" } },
	sections: {},
	metadata: { layout: [[[]]] },
});

const jsonResumeShape = JSON.stringify({
	$schema: "https://raw.githubusercontent.com/jsonresume/resume-schema/master/schema.json",
	basics: { name: "Jane Doe" },
	work: [],
	education: [],
});

describe("resume importer registry", () => {
	it("detects current Reactive Resume documents ahead of generic formats", () => {
		expect(detectResumeImportFormat(v5Shape)[0]).toEqual({ format: "reactive-resume-v5", confidence: 1 });
	});

	it("detects v4 documents using their nested basics.picture and array layout", () => {
		expect(detectResumeImportFormat(v4Shape)[0]?.format).toBe("reactive-resume-v4");
	});

	it("recognizes JSON Resume schema declarations", () => {
		expect(detectResumeImportFormat(jsonResumeShape)[0]).toEqual({ format: "json-resume", confidence: 1 });
	});

	it("rejects unknown documents instead of guessing", () => {
		expect(() => importResume(JSON.stringify({ hello: "world" }))).toThrow(
			"Could not confidently detect the resume import format.",
		);
	});

	it("allows an explicit adapter when auto-detection confidence is intentionally low", () => {
		const result = importResume("{}", { format: "json-resume" });
		expect(result.provenance.format).toBe("json-resume");
		expect(result.provenance.confidence).toBe(0.25);
		expect(result.warnings[0]?.code).toBe("LOW_FORMAT_CONFIDENCE");
	});
});
