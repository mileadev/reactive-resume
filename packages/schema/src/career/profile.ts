import z from "zod";

export const careerFactSensitivitySchema = z.enum(["public", "personal", "sensitive"]);
export const careerFactVerificationSchema = z.enum(["unverified", "self-verified", "source-verified"]);

export const careerFactEvidenceSchema = z.object({
	kind: z.enum(["document", "url", "note", "application", "resume", "manual"]),
	ref: z.string().trim().min(1),
	label: z.string().trim().min(1).optional(),
	capturedAt: z.iso.datetime().optional(),
});

export const careerFactProvenanceSchema = z.object({
	source: z.enum(["manual", "resume", "import", "agent", "application", "integration"]),
	sourceRef: z.string().trim().min(1).optional(),
	createdAt: z.iso.datetime(),
	createdBy: z.enum(["user", "system", "agent"]),
});

export const careerFactSchema = z.object({
	id: z.string().trim().min(1),
	kind: z.enum([
		"identity",
		"headline",
		"summary",
		"experience",
		"education",
		"skill",
		"certification",
		"project",
		"publication",
		"award",
		"language",
		"volunteer",
		"interest",
		"reference",
		"custom",
	]),
	label: z.string().trim().min(1),
	value: z.unknown(),
	tags: z.array(z.string().trim().min(1)).default([]),
	verification: careerFactVerificationSchema.default("unverified"),
	sensitivity: careerFactSensitivitySchema.default("personal"),
	provenance: careerFactProvenanceSchema,
	evidence: z.array(careerFactEvidenceSchema).default([]),
	validFrom: z.iso.datetime().optional(),
	validTo: z.iso.datetime().optional(),
	archivedAt: z.iso.datetime().optional(),
});

export const careerProfileSchema = z.object({
	schemaVersion: z.literal(1),
	profileId: z.string().trim().min(1),
	revision: z.number().int().nonnegative(),
	facts: z.array(careerFactSchema),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
});

export type CareerFactSensitivity = z.infer<typeof careerFactSensitivitySchema>;
export type CareerFactVerification = z.infer<typeof careerFactVerificationSchema>;
export type CareerFactEvidence = z.infer<typeof careerFactEvidenceSchema>;
export type CareerFactProvenance = z.infer<typeof careerFactProvenanceSchema>;
export type CareerFact = z.infer<typeof careerFactSchema>;
export type CareerProfile = z.infer<typeof careerProfileSchema>;

export function activeCareerFacts(profile: CareerProfile): CareerFact[] {
	return profile.facts.filter((fact) => !fact.archivedAt);
}

export function verifiedCareerFacts(profile: CareerProfile): CareerFact[] {
	return activeCareerFacts(profile).filter((fact) => fact.verification !== "unverified");
}

export function publicCareerFacts(profile: CareerProfile): CareerFact[] {
	return activeCareerFacts(profile).filter((fact) => fact.sensitivity === "public");
}
