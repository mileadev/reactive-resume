import z from "zod";
import { applicationStatusSchema } from "../applications/data";

export const automationTriggerSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("application.stage-changed"),
		from: applicationStatusSchema.optional(),
		to: applicationStatusSchema.optional(),
	}),
	z.object({
		type: z.literal("application.follow-up-due"),
		withinMinutes: z.number().int().min(0).max(43_200).default(0),
	}),
	z.object({
		type: z.literal("resume.updated"),
	}),
	z.object({
		type: z.literal("webhook.received"),
		event: z.string().trim().min(1).max(128),
	}),
	z.object({
		type: z.literal("schedule"),
		// Stored as an operator-provided cron expression. Runtime schedulers are
		// responsible for parsing it with their selected scheduler implementation.
		cron: z.string().trim().min(5).max(128),
		timezone: z.string().trim().min(1).max(128).default("UTC"),
	}),
]);

export const automationConditionSchema = z.object({
	path: z.string().trim().min(1).max(256),
	operator: z.enum(["equals", "not-equals", "contains", "in", "exists"]),
	value: z.unknown().optional(),
});

export const automationActionSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("application.add-note"),
		text: z.string().trim().min(1).max(4_000),
	}),
	z.object({
		type: z.literal("application.set-status"),
		status: applicationStatusSchema,
	}),
	z.object({
		type: z.literal("resume.snapshot"),
		label: z.string().trim().min(1).max(120),
	}),
	z.object({
		type: z.literal("webhook.deliver"),
		url: z.string().url(),
		method: z.enum(["POST", "PUT", "PATCH"]).default("POST"),
		headers: z.record(z.string(), z.string()).default({}),
	}),
	z.object({
		type: z.literal("agent.suggest"),
		instruction: z.string().trim().min(1).max(4_000),
	}),
]);

export const automationDefinitionSchema = z.object({
	schemaVersion: z.literal(1),
	id: z.string().trim().min(1),
	name: z.string().trim().min(1).max(120),
	enabled: z.boolean().default(true),
	trigger: automationTriggerSchema,
	conditions: z.array(automationConditionSchema).max(20).default([]),
	actions: z.array(automationActionSchema).min(1).max(20),
	maxRunsPerHour: z.number().int().min(1).max(60).default(12),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
});

export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;
export type AutomationCondition = z.infer<typeof automationConditionSchema>;
export type AutomationAction = z.infer<typeof automationActionSchema>;
export type AutomationDefinition = z.infer<typeof automationDefinitionSchema>;
