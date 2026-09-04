export type TelemetryAttribute = string | number | boolean;
export type TelemetryAttributes = Readonly<Record<string, TelemetryAttribute>>;

export interface OperationTelemetryEvent {
	name: string;
	startedAt: string;
	durationMs: number;
	outcome: "success" | "error";
	attributes: TelemetryAttributes;
	errorName?: string;
}

export type OperationTelemetrySink = (event: OperationTelemetryEvent) => Promise<void> | void;

export interface OperationTelemetryOptions {
	sink?: OperationTelemetrySink;
	now?: () => Date;
	clock?: () => number;
}

const SENSITIVE_ATTRIBUTE_PATTERN = /(authorization|cookie|credential|email|name|password|phone|prompt|resume|secret|token)/i;

export function sanitizeTelemetryAttributes(attributes: TelemetryAttributes): TelemetryAttributes {
	const sanitized: Record<string, TelemetryAttribute> = {};
	for (const [key, value] of Object.entries(attributes)) {
		if (SENSITIVE_ATTRIBUTE_PATTERN.test(key)) continue;
		sanitized[key] = value;
	}
	return sanitized;
}

/**
 * Lightweight operation instrumentation with an OpenTelemetry-compatible data
 * shape but no mandatory telemetry dependency. Sinks can bridge these events
 * to OTel, logs, metrics, or tests. Attribute names that commonly contain PII
 * or secrets are dropped defensively at this boundary.
 */
export class OperationTelemetry {
	readonly #sink?: OperationTelemetrySink;
	readonly #now: () => Date;
	readonly #clock: () => number;

	constructor(options: OperationTelemetryOptions = {}) {
		this.#sink = options.sink;
		this.#now = options.now ?? (() => new Date());
		this.#clock = options.clock ?? (() => performance.now());
	}

	async run<T>(name: string, attributes: TelemetryAttributes, operation: () => Promise<T> | T): Promise<T> {
		const startedAt = this.#now().toISOString();
		const started = this.#clock();
		const safeAttributes = sanitizeTelemetryAttributes(attributes);

		try {
			const result = await operation();
			await this.#emit({
				name,
				startedAt,
				durationMs: Math.max(0, this.#clock() - started),
				outcome: "success",
				attributes: safeAttributes,
			});
			return result;
		} catch (error) {
			await this.#emit({
				name,
				startedAt,
				durationMs: Math.max(0, this.#clock() - started),
				outcome: "error",
				attributes: safeAttributes,
				...(error instanceof Error ? { errorName: error.name } : {}),
			});
			throw error;
		}
	}

	async #emit(event: OperationTelemetryEvent): Promise<void> {
		try {
			await this.#sink?.(event);
		} catch (error) {
			// Telemetry is best-effort and must not change business outcomes.
			console.warn("Operation telemetry sink failed", {
				operation: event.name,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

export const noopOperationTelemetry = new OperationTelemetry();
