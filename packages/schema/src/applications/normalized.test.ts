import { describe, expect, it } from "vitest";
import { normalizeLegacyContacts, normalizeLegacyTimeline } from "./normalized";

describe("normalized application migrations", () => {
	it("requires the migration layer to own new contact IDs", () => {
		const now = new Date("2026-01-01T00:00:00.000Z");
		const contacts = normalizeLegacyContacts(
			[{ name: "Alex Recruiter", role: "Talent", type: "Recruiter" }],
			{ idFactory: (_contact, index) => `contact-${index + 1}`, now },
		);

		expect(contacts).toEqual([
			{
				id: "contact-1",
				name: "Alex Recruiter",
				role: "Talent",
				type: "Recruiter",
				email: "",
				phone: "",
				url: "",
				createdAt: now,
				updatedAt: now,
			},
		]);
	});

	it("preserves stable legacy timeline IDs and semantics", () => {
		const entries = normalizeLegacyTimeline([
			{ id: "event-1", type: "stage", stage: "interview", at: new Date("2026-01-02T00:00:00Z") },
			{ id: "event-2", type: "note", text: "Panel scheduled", at: new Date("2026-01-03T00:00:00Z") },
		]);

		expect(entries.map((entry) => entry.id)).toEqual(["event-1", "event-2"]);
		expect(entries.map((entry) => entry.type)).toEqual(["stage", "note"]);
	});
});
