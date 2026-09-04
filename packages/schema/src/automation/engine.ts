import type { AutomationAction, AutomationCondition, AutomationDefinition } from "./definition";
import { automationDefinitionSchema } from "./definition";

export interface AutomationEvent {
	type: string;
	at: Date;
	data: Record<string, unknown>;
}

export interface AutomationPlan {
	automationId: string;
	matched: boolean;
	reason: "disabled" | "trigger-mismatch" | "condition-mismatch" | "matched";
	actions: readonly AutomationAction[];
}

function getPath(value: unknown, path: string): unknown {
	const segments = path
		.replace(/^\$\.?/, "")
		.split(".")
		.map((segment) => segment.trim())
		.filter(Boolean);

	let current: unknown = value;
	for (const segment of segments) {
		if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

function valueContains(actual: unknown, expected: unknown): boolean {
	if (typeof actual === "string" && typeof expected === "string") return actual.includes(expected);
	if (Array.isArray(actual)) return actual.some((item) => Object.is(item, expected));
	return false;
}

function conditionMatches(condition: AutomationCondition, data: Record<string, unknown>): boolean {
	const actual = getPath(data, condition.path);

	switch (condition.operator) {
		case "exists":
			return actual !== undefined && actual !== null;
		case "equals":
			return Object.is(actual, condition.value);
		case "not-equals":
			return !Object.is(actual, condition.value);
		case "contains":
			return valueContains(actual, condition.value);
		case "in":
			return Array.isArray(condition.value) && condition.value.some((value) => Object.is(value, actual));
	}
}

function triggerMatches(definition: AutomationDefinition, event: AutomationEvent): boolean {
	const trigger = definition.trigger;
	if (trigger.type !== event.type) return false;

	if (trigger.type === "application.stage-changed") {
		if (trigger.from !== undefined && event.data.from !== trigger.from) return false;
		if (trigger.to !== undefined && event.data.to !== trigger.to) return false;
	}

	if (trigger.type === "webhook.received" && event.data.event !== trigger.event) return false;

	return true;
}

/**
 * Produce an immutable action plan without executing side effects. Rate limits,
 * authorization, destination validation, idempotency, audit logging, and the
 * actual action adapters live at the execution boundary, not in this evaluator.
 */
export function planAutomation(definitionInput: AutomationDefinition, event: AutomationEvent): AutomationPlan {
	const definition = automationDefinitionSchema.parse(definitionInput);
	if (!definition.enabled) {
		return { automationId: definition.id, matched: false, reason: "disabled", actions: [] };
	}
	if (!triggerMatches(definition, event)) {
		return { automationId: definition.id, matched: false, reason: "trigger-mismatch", actions: [] };
	}
	if (!definition.conditions.every((condition) => conditionMatches(condition, event.data))) {
		return { automationId: definition.id, matched: false, reason: "condition-mismatch", actions: [] };
	}

	return {
		automationId: definition.id,
		matched: true,
		reason: "matched",
		actions: structuredClone(definition.actions),
	};
}
