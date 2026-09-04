import { describe, expect, it } from "vitest";
import { automationDefinitionSchema } from "./definition";
import { planAutomation } from "./engine";

const definition = automationDefinitionSchema.parse({
	schemaVersion: 1,
	id: "follow-up-after-interview",
	name: "Follow up after interview",
	enabled: true,
	trigger: { type: "application.stage-changed", to: "interview" },
	conditions: [{ path: "company", operator: "exists" }],
	actions: [
		{ type: "application.add-note", text: "Interview stage entered" },
		{ type: "agent.suggest", instruction: "Draft follow-up talking points without sending anything." },
	],
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("planAutomation", () => {
	it("returns actions only after trigger and conditions match", () => {
		const plan = planAutomation(definition, {
			type: "application.stage-changed",
			at: new Date("2026-01-01T01:00:00Z"),
			data: { from: "screening", to: "interview", company: "Example" },
		});

		expect(plan.matched).toBe(true);
		expect(plan.reason).toBe("matched");
		expect(plan.actions).toHaveLength(2);
	});

	it("does not execute plans for mismatched triggers", () => {
		const plan = planAutomation(definition, {
			type: "application.stage-changed",
			at: new Date("2026-01-01T01:00:00Z"),
			data: { from: "saved", to: "applied", company: "Example" },
		});

		expect(plan).toMatchObject({ matched: false, reason: "trigger-mismatch", actions: [] });
	});

	it("does not mutate the stored action definition", () => {
		const plan = planAutomation(definition, {
			type: "application.stage-changed",
			at: new Date("2026-01-01T01:00:00Z"),
			data: { to: "interview", company: "Example" },
		});

		if (plan.actions[0]?.type === "application.add-note") plan.actions[0].text = "changed";
		expect(definition.actions[0]).toMatchObject({ text: "Interview stage entered" });
	});
});
