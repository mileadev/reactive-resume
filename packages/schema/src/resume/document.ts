import z from "zod";
import { resumeDataSchema } from "./data";

/**
 * Version of the stable document envelope, independent from the application
 * release number. Increment only for backwards-incompatible envelope changes;
 * ResumeData migrations can evolve independently behind this contract.
 */
export const RESUME_DOCUMENT_SCHEMA_VERSION = 1 as const;

export const resumeDocumentProvenanceSchema = z.object({
	source: z.enum(["native", "import", "duplicate", "agent", "migration"]),
	format: z.string().trim().min(1).optional(),
	adapterVersion: z.number().int().positive().optional(),
	importedAt: z.iso.datetime().optional(),
	confidence: z.number().min(0).max(1).optional(),
});

export const resumeDocumentSchema = z.object({
	schemaVersion: z.literal(RESUME_DOCUMENT_SCHEMA_VERSION),
	documentId: z.string().trim().min(1),
	revision: z.number().int().nonnegative(),
	provenance: resumeDocumentProvenanceSchema.optional(),
	data: resumeDataSchema,
});

export type ResumeDocumentProvenance = z.infer<typeof resumeDocumentProvenanceSchema>;
export type ResumeDocument = z.infer<typeof resumeDocumentSchema>;

export function createResumeDocument(input: {
	documentId: string;
	data: z.input<typeof resumeDataSchema>;
	revision?: number;
	provenance?: ResumeDocumentProvenance;
}): ResumeDocument {
	return resumeDocumentSchema.parse({
		schemaVersion: RESUME_DOCUMENT_SCHEMA_VERSION,
		documentId: input.documentId,
		revision: input.revision ?? 0,
		...(input.provenance ? { provenance: input.provenance } : {}),
		data: input.data,
	});
}

/**
 * Accept either the new envelope or legacy bare ResumeData. Bare documents are
 * upgraded in-memory and require an explicit identity supplied by the caller;
 * this keeps persistence migrations additive and prevents invented IDs.
 */
export function parseResumeDocument(
	value: unknown,
	options: { legacyDocumentId?: string; legacyRevision?: number } = {},
): ResumeDocument {
	const envelope = resumeDocumentSchema.safeParse(value);
	if (envelope.success) return envelope.data;

	const legacy = resumeDataSchema.safeParse(value);
	if (!legacy.success) throw envelope.error;
	if (!options.legacyDocumentId) {
		throw new Error("Legacy ResumeData requires legacyDocumentId to create a versioned document envelope.");
	}

	return createResumeDocument({
		documentId: options.legacyDocumentId,
		revision: options.legacyRevision ?? 0,
		provenance: { source: "migration" },
		data: legacy.data,
	});
}

export function nextResumeDocumentRevision(document: ResumeDocument): ResumeDocument {
	return { ...document, revision: document.revision + 1 };
}
