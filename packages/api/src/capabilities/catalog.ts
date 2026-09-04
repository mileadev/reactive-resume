import type { ApiKeyResource } from "@reactive-resume/auth/api-key-permissions";

export interface CapabilityDescriptor {
	id: string;
	version: 1;
	summary: string;
	authorization: { resource: ApiKeyResource; action: string };
	readOnly: boolean;
	destructive: boolean;
	idempotent: boolean;
	supportsDryRun: boolean;
}

function capability(
	id: string,
	summary: string,
	authorization: CapabilityDescriptor["authorization"],
	behavior: Pick<CapabilityDescriptor, "readOnly" | "destructive" | "idempotent" | "supportsDryRun">,
): CapabilityDescriptor {
	return { id, version: 1, summary, authorization, ...behavior };
}

const read = { readOnly: true, destructive: false, idempotent: true, supportsDryRun: false } as const;
const create = { readOnly: false, destructive: false, idempotent: false, supportsDryRun: true } as const;
const write = { readOnly: false, destructive: false, idempotent: true, supportsDryRun: true } as const;
const remove = { readOnly: false, destructive: true, idempotent: true, supportsDryRun: true } as const;
const run = { readOnly: false, destructive: false, idempotent: false, supportsDryRun: false } as const;

export const CAPABILITY_CATALOG = [
	capability("resume.list", "List owned resumes", { resource: "resume", action: "read" }, read),
	capability("resume.read", "Read an owned resume", { resource: "resume", action: "read" }, read),
	capability("resume.create", "Create a resume", { resource: "resume", action: "create" }, create),
	capability("resume.import", "Import a resume", { resource: "resume", action: "create" }, create),
	capability("resume.duplicate", "Duplicate a resume", { resource: "resume", action: "create" }, create),
	capability("resume.update", "Update resume metadata or data", { resource: "resume", action: "write" }, write),
	capability("resume.patch", "Apply validated resume patch operations", { resource: "resume", action: "write" }, write),
	capability("resume.restore", "Restore a resume version", { resource: "resume", action: "write" }, write),
	capability("resume.export.pdf", "Render and download a resume PDF", { resource: "resume", action: "export" }, read),
	capability("resume.delete", "Permanently delete a resume", { resource: "resume", action: "delete" }, remove),

	capability("application.list", "List job applications", { resource: "application", action: "read" }, read),
	capability("application.read", "Read a job application", { resource: "application", action: "read" }, read),
	capability("application.create", "Create a job application", { resource: "application", action: "create" }, create),
	capability("application.import", "Bulk import job applications", { resource: "application", action: "create" }, create),
	capability("application.update", "Update a job application", { resource: "application", action: "write" }, write),
	capability("application.document.write", "Attach or remove application documents", { resource: "application", action: "write" }, write),
	capability("application.delete", "Permanently delete a job application", { resource: "application", action: "delete" }, remove),

	capability("ats.run", "Run deterministic ATS analysis", { resource: "ats", action: "run" }, read),
	capability("agent.run", "Run AI-assisted career workflows", { resource: "agent", action: "run" }, run),
	capability("ai-provider.read", "List redacted AI-provider configurations", { resource: "aiProvider", action: "read" }, read),
	capability("ai-provider.write", "Create, test, change, or remove AI-provider secrets", { resource: "aiProvider", action: "write" }, write),
	capability("statistics.read", "Read account or platform statistics", { resource: "statistics", action: "read" }, read),
	capability("storage.read", "Read owned storage objects", { resource: "storage", action: "read" }, read),
	capability("storage.write", "Create or remove owned storage objects", { resource: "storage", action: "write" }, write),
] as const satisfies readonly CapabilityDescriptor[];

export type CapabilityId = (typeof CAPABILITY_CATALOG)[number]["id"];

const capabilityById = new Map<CapabilityId, CapabilityDescriptor>(
	CAPABILITY_CATALOG.map((descriptor) => [descriptor.id, descriptor]),
);

export function getCapabilityDescriptor(id: CapabilityId): CapabilityDescriptor {
	const descriptor = capabilityById.get(id);
	if (!descriptor) throw new Error(`Unknown capability: ${id}`);
	return descriptor;
}

export function listCapabilityDescriptors(): readonly CapabilityDescriptor[] {
	return CAPABILITY_CATALOG;
}
