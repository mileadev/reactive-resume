import type { z } from "zod";
import type { AuthPrincipal } from "../context";
import type { CapabilityDescriptor, CapabilityId } from "./catalog";
import { getCapabilityDescriptor } from "./catalog";

export interface CapabilityContext {
	userId: string;
	principal: AuthPrincipal;
	requestId?: string;
}

export interface CapabilityAuditEvent {
	capabilityId: CapabilityId;
	version: number;
	userId: string;
	principalType: AuthPrincipal["type"];
	requestId?: string;
	startedAt: string;
	durationMs: number;
	outcome: "success" | "error";
	errorName?: string;
}

export interface CapabilityBinding<TInput, TOutput> {
	id: CapabilityId;
	input: z.ZodType<TInput>;
	output: z.ZodType<TOutput>;
	execute(input: TInput, context: CapabilityContext): Promise<TOutput> | TOutput;
}

export type CapabilityAuditSink = (event: CapabilityAuditEvent) => Promise<void> | void;

type StoredBinding = CapabilityBinding<unknown, unknown>;

export class CapabilityRegistry {
	readonly #bindings = new Map<CapabilityId, StoredBinding>();
	readonly #audit?: CapabilityAuditSink;

	constructor(options: { audit?: CapabilityAuditSink } = {}) {
		this.#audit = options.audit;
	}

	register<TInput, TOutput>(binding: CapabilityBinding<TInput, TOutput>): this {
		getCapabilityDescriptor(binding.id);
		if (this.#bindings.has(binding.id)) throw new Error(`Capability already registered: ${binding.id}`);
		this.#bindings.set(binding.id, binding as StoredBinding);
		return this;
	}

	has(id: CapabilityId): boolean {
		return this.#bindings.has(id);
	}

	descriptor(id: CapabilityId): CapabilityDescriptor {
		return getCapabilityDescriptor(id);
	}

	async execute<TInput, TOutput>(
		id: CapabilityId,
		input: TInput,
		context: CapabilityContext,
	): Promise<TOutput> {
		const binding = this.#bindings.get(id);
		if (!binding) throw new Error(`Capability is not bound: ${id}`);

		const started = performance.now();
		const startedAt = new Date().toISOString();
		try {
			const parsedInput = binding.input.parse(input);
			const result = await binding.execute(parsedInput, context);
			const parsedOutput = binding.output.parse(result);
			await this.#emitAudit({
				capabilityId: id,
				version: getCapabilityDescriptor(id).version,
				userId: context.userId,
				principalType: context.principal.type,
				...(context.requestId ? { requestId: context.requestId } : {}),
				startedAt,
				durationMs: performance.now() - started,
				outcome: "success",
			});
			return parsedOutput as TOutput;
		} catch (error) {
			await this.#emitAudit({
				capabilityId: id,
				version: getCapabilityDescriptor(id).version,
				userId: context.userId,
				principalType: context.principal.type,
				...(context.requestId ? { requestId: context.requestId } : {}),
				startedAt,
				durationMs: performance.now() - started,
				outcome: "error",
				...(error instanceof Error ? { errorName: error.name } : {}),
			});
			throw error;
		}
	}

	async #emitAudit(event: CapabilityAuditEvent): Promise<void> {
		try {
			await this.#audit?.(event);
		} catch (error) {
			// Audit sinks must never make business operations fail. The sink should
			// independently alert on delivery failures and avoid accepting PII.
			console.warn("Capability audit sink failed", {
				capabilityId: event.capabilityId,
				requestId: event.requestId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}
