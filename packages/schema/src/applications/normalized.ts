import z from "zod";
import {
	applicationStatusSchema,
	applicationTimelineEntrySchema,
	contactSchema,
	type ApplicationTimelineEntry,
	type Contact,
} from "./data";

const timestampSchema = z.coerce.date();

export const applicationContactSchema = contactSchema.extend({
	id: z.string().trim().min(1),
	email: z.string().trim().default(""),
	phone: z.string().trim().default(""),
	url: z.string().trim().default(""),
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
});

export const applicationEventSchema = z.discriminatedUnion("type", [
	z.object({
		id: z.string().trim().min(1),
		type: z.literal("stage"),
		at: timestampSchema,
		stage: applicationStatusSchema,
	}),
	z.object({
		id: z.string().trim().min(1),
		type: z.literal("note"),
		at: timestampSchema,
		text: z.string().trim().min(1),
	}),
	z.object({
		id: z.string().trim().min(1),
		type: z.literal("follow-up"),
		at: timestampSchema,
		status: z.enum(["scheduled", "completed", "cancelled"]),
		note: z.string().trim().default(""),
	}),
	z.object({
		id: z.string().trim().min(1),
		type: z.literal("document"),
		at: timestampSchema,
		documentId: z.string().trim().min(1),
		action: z.enum(["attached", "removed"]),
	}),
	z.object({
		id: z.string().trim().min(1),
		type: z.literal("contact"),
		at: timestampSchema,
		contactId: z.string().trim().min(1),
		action: z.enum(["added", "updated", "removed"]),
	}),
]);

export const applicationDocumentSchema = z.object({
	id: z.string().trim().min(1),
	kind: z.enum(["resume", "cover-letter", "other"]),
	filename: z.string().trim().min(1),
	storageKey: z.string().trim().min(1),
	contentType: z.string().trim().min(1),
	sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
	size: z.number().int().nonnegative().optional(),
	createdAt: timestampSchema,
});

export const applicationReminderSchema = z.object({
	id: z.string().trim().min(1),
	dueAt: timestampSchema,
	status: z.enum(["pending", "completed", "dismissed"]),
	note: z.string().trim().default(""),
	createdAt: timestampSchema,
	completedAt: timestampSchema.optional(),
});

export type ApplicationContact = z.infer<typeof applicationContactSchema>;
export type ApplicationEvent = z.infer<typeof applicationEventSchema>;
export type ApplicationDocument = z.infer<typeof applicationDocumentSchema>;
export type ApplicationReminder = z.infer<typeof applicationReminderSchema>;

export interface ApplicationNormalizedCollections {
	contacts: ApplicationContact[];
	events: ApplicationEvent[];
	documents: ApplicationDocument[];
	reminders: ApplicationReminder[];
}

/**
 * Convert legacy JSONB contacts without inventing persistent identifiers. A
 * migration or repository layer must supply an ID factory so generated IDs are
 * explicit, testable, and stable for the duration of the migration.
 */
export function normalizeLegacyContacts(
	contacts: readonly Contact[],
	options: { idFactory: (contact: Contact, index: number) => string; now?: Date },
): ApplicationContact[] {
	const now = options.now ?? new Date();
	return contacts.map((contact, index) =>
		applicationContactSchema.parse({
			...contact,
			id: options.idFactory(contact, index),
			email: "",
			phone: "",
			url: "",
			createdAt: now,
			updatedAt: now,
		}),
	);
}

/** Existing timeline entries already have stable IDs, so migration preserves them verbatim. */
export function normalizeLegacyTimeline(entries: readonly ApplicationTimelineEntry[]): ApplicationEvent[] {
	return entries.map((entry) => {
		const parsed = applicationTimelineEntrySchema.parse(entry);
		return applicationEventSchema.parse(parsed);
	});
}

export function emptyApplicationNormalizedCollections(): ApplicationNormalizedCollections {
	return { contacts: [], events: [], documents: [], reminders: [] };
}
