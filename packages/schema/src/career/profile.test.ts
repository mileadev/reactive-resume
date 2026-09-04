import { describe, expect, it } from "vitest";
import { activeCareerFacts, careerProfileSchema, publicCareerFacts, verifiedCareerFacts } from "./profile";

const profile = careerProfileSchema.parse({
	schemaVersion: 1,
	profileId: "profile-1",
	revision: 3,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-02T00:00:00.000Z",
	facts: [
		{
			id: "fact-public",
			kind: "skill",
			label: "TypeScript",
			value: { level: "advanced" },
			verification: "source-verified",
			sensitivity: "public",
			provenance: { source: "manual", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "user" },
		},
		{
			id: "fact-private",
			kind: "identity",
			label: "Personal email",
			value: "person@example.com",
			verification: "self-verified",
			sensitivity: "personal",
			provenance: { source: "manual", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "user" },
		},
		{
			id: "fact-archived",
			kind: "headline",
			label: "Old headline",
			value: "Old",
			archivedAt: "2026-01-02T00:00:00.000Z",
			provenance: { source: "resume", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "system" },
		},
	],
});

describe("career profile facts", () => {
	it("excludes archived facts from active projections", () => {
		expect(activeCareerFacts(profile).map((fact) => fact.id)).toEqual(["fact-public", "fact-private"]);
	});

	it("keeps verification and sensitivity independent", () => {
		expect(verifiedCareerFacts(profile)).toHaveLength(2);
		expect(publicCareerFacts(profile).map((fact) => fact.id)).toEqual(["fact-public"]);
	});
});
