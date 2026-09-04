#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { detectResumeImportFormat, importResume, type ResumeImportFormat } from "../packages/import/src/registry";
import { jsonPatchOperationSchema, type JsonPatchOperation } from "../packages/resume/src/patch";
import { resumeToolkit } from "../packages/resume/src/toolkit";

type Options = Record<string, string | boolean>;

type ParsedArgs = {
	command: string;
	positionals: string[];
	options: Options;
};

const HELP = `Reactive Resume Toolkit CLI

Usage:
  pnpm rr doctor
  pnpm rr validate <resume.json>
  pnpm rr inspect <resume.json>
  pnpm rr ats <resume.json> [--pretty]
  pnpm rr convert <input> --to json|markdown|document [--from FORMAT] [--output FILE] [--document-id ID]
  pnpm rr patch <resume.json> <patch.json> [--output FILE]
  pnpm rr diff <before.json> <after.json> [--pretty]
  pnpm rr redact <resume.json> [--output FILE]
  pnpm rr api <METHOD> <PATH> --base-url URL [--api-key KEY] [--body JSON_OR_@FILE]

Import formats:
  reactive-resume-v5 | reactive-resume-v4 | json-resume

Environment for remote mode:
  RR_BASE_URL   Base URL used when --base-url is omitted
  RR_API_KEY    API key used when --api-key is omitted

All local commands are deterministic and perform no network I/O.
`;

function parseArgs(argv: string[]): ParsedArgs {
	const [command = "help", ...rest] = argv;
	const positionals: string[] = [];
	const options: Options = {};

	for (let index = 0; index < rest.length; index += 1) {
		const token = rest[index];
		if (!token) continue;
		if (!token.startsWith("--")) {
			positionals.push(token);
			continue;
		}

		const raw = token.slice(2);
		const equalsIndex = raw.indexOf("=");
		if (equalsIndex >= 0) {
			options[raw.slice(0, equalsIndex)] = raw.slice(equalsIndex + 1);
			continue;
		}

		const next = rest[index + 1];
		if (next && !next.startsWith("--")) {
			options[raw] = next;
			index += 1;
		} else {
			options[raw] = true;
		}
	}

	return { command, positionals, options };
}

function optionString(options: Options, name: string): string | undefined {
	const value = options[name];
	return typeof value === "string" ? value : undefined;
}

function required(value: string | undefined, label: string): string {
	if (!value) throw new Error(`Missing ${label}.`);
	return value;
}

async function readText(file: string): Promise<string> {
	return fs.readFile(path.resolve(file), "utf8");
}

async function readJson(file: string): Promise<unknown> {
	const text = await readText(file);
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

async function writeOutput(output: string | undefined, value: string): Promise<void> {
	if (!output || output === "-") {
		process.stdout.write(value.endsWith("\n") ? value : `${value}\n`);
		return;
	}

	const destination = path.resolve(output);
	await fs.mkdir(path.dirname(destination), { recursive: true });
	await fs.writeFile(destination, value.endsWith("\n") ? value : `${value}\n`, "utf8");
	process.stderr.write(`Wrote ${destination}\n`);
}

function formatJson(value: unknown, pretty: boolean): string {
	return JSON.stringify(value, null, pretty ? 2 : 0);
}

async function loadResume(file: string, from?: string) {
	const raw = await readText(file);
	const result = importResume(raw, {
		...(from ? { format: from as ResumeImportFormat } : {}),
	});
	return result;
}

function diffJson(before: unknown, after: unknown, pointer = ""): JsonPatchOperation[] {
	if (Object.is(before, after)) return [];

	const beforeObject = before !== null && typeof before === "object";
	const afterObject = after !== null && typeof after === "object";
	if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) {
		return [{ op: "replace", path: pointer || "", value: after }];
	}

	if (Array.isArray(before) && Array.isArray(after)) {
		if (JSON.stringify(before) === JSON.stringify(after)) return [];
		return [{ op: "replace", path: pointer || "", value: after }];
	}

	const left = before as Record<string, unknown>;
	const right = after as Record<string, unknown>;
	const escape = (segment: string) => segment.replaceAll("~", "~0").replaceAll("/", "~1");
	const operations: JsonPatchOperation[] = [];

	for (const key of Object.keys(left)) {
		if (!(key in right)) operations.push({ op: "remove", path: `${pointer}/${escape(key)}` });
	}
	for (const key of Object.keys(right)) {
		const childPointer = `${pointer}/${escape(key)}`;
		if (!(key in left)) operations.push({ op: "add", path: childPointer, value: right[key] });
		else operations.push(...diffJson(left[key], right[key], childPointer));
	}

	return operations;
}

async function commandDoctor(): Promise<void> {
	const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
	const checks = [
		{ name: "node", ok: nodeMajor >= 24, detail: process.versions.node },
		{
			name: "runtime",
			ok: typeof structuredClone === "function" && typeof fetch === "function",
			detail: "fetch + structuredClone",
		},
		{ name: "mode", ok: true, detail: "local commands are network-free" },
	];
	const ok = checks.every((check) => check.ok);
	process.stdout.write(`${formatJson({ ok, checks }, true)}\n`);
	if (!ok) process.exitCode = 1;
}

async function commandValidate(file: string, pretty: boolean): Promise<void> {
	const value = await readJson(file);
	const candidate =
		value && typeof value === "object" && "data" in value ? (value as Record<string, unknown>).data : value;
	const result = resumeToolkit.validate(candidate);
	process.stdout.write(`${formatJson(result, pretty)}\n`);
	if (!result.valid) process.exitCode = 2;
}

async function commandInspect(file: string, pretty: boolean): Promise<void> {
	const raw = await readText(file);
	const candidates = detectResumeImportFormat(raw);
	let imported: ReturnType<typeof importResume> | null = null;
	try {
		imported = importResume(raw);
	} catch {
		// Detection output is still useful for malformed or unsupported files.
	}

	const summary = imported
		? {
				name: imported.data.basics.name,
				headline: imported.data.basics.headline,
				sections: Object.keys(imported.data.sections).length + imported.data.customSections.length + 1,
				warnings: imported.warnings,
				provenance: imported.provenance,
			}
		: null;

	process.stdout.write(`${formatJson({ file: path.resolve(file), candidates, summary }, pretty)}\n`);
	if (!imported) process.exitCode = 2;
}

async function commandAts(file: string, from: string | undefined, pretty: boolean): Promise<void> {
	const imported = await loadResume(file, from);
	const result = resumeToolkit.ats(imported.data);
	process.stdout.write(`${formatJson({ import: imported.provenance, ...result }, pretty)}\n`);
}

async function commandConvert(file: string, options: Options): Promise<void> {
	const to = optionString(options, "to") ?? "json";
	const imported = await loadResume(file, optionString(options, "from"));
	const output = optionString(options, "output");

	if (to === "json") {
		await writeOutput(output, formatJson(imported.data, true));
		return;
	}
	if (to === "markdown" || to === "md") {
		await writeOutput(output, resumeToolkit.markdown(imported.data));
		return;
	}
	if (to === "document") {
		const documentId = optionString(options, "document-id") ?? path.basename(file).replace(/\.[^.]+$/, "");
		const document = resumeToolkit.createDocument({
			documentId,
			data: imported.data,
			provenance: {
				source: "import",
				format: imported.provenance.format,
				adapterVersion: imported.provenance.adapterVersion,
				confidence: imported.provenance.confidence,
				importedAt: new Date().toISOString(),
			},
		});
		await writeOutput(output, formatJson(document, true));
		return;
	}

	throw new Error(`Unsupported output format: ${to}`);
}

async function commandPatch(file: string, patchFile: string, output?: string): Promise<void> {
	const imported = await loadResume(file);
	const rawOperations = await readJson(patchFile);
	if (!Array.isArray(rawOperations)) throw new Error("Patch file must contain a JSON array of RFC 6902 operations.");
	const operations = rawOperations.map((operation) => jsonPatchOperationSchema.parse(operation));
	const patched = resumeToolkit.patch(imported.data, operations);
	await writeOutput(output, formatJson(patched, true));
}

async function commandDiff(beforeFile: string, afterFile: string, pretty: boolean): Promise<void> {
	const [before, after] = await Promise.all([readJson(beforeFile), readJson(afterFile)]);
	const operations = diffJson(before, after);
	process.stdout.write(`${formatJson(operations, pretty)}\n`);
}

async function commandRedact(file: string, output?: string): Promise<void> {
	const imported = await loadResume(file);
	const data = structuredClone(imported.data);
	data.basics.email = "";
	data.basics.phone = "";
	data.basics.location = "";
	data.basics.website = { url: "", label: "" };
	data.basics.customFields = [];
	data.picture.url = "";
	data.sections.references.items = [];
	await writeOutput(output, formatJson(data, true));
}

async function commandApi(method: string, requestPath: string, options: Options): Promise<void> {
	const baseURL = optionString(options, "base-url") ?? process.env.RR_BASE_URL;
	const apiKey = optionString(options, "api-key") ?? process.env.RR_API_KEY;
	const bodyOption = optionString(options, "body");
	const url = new URL(requestPath, `${required(baseURL, "--base-url or RR_BASE_URL").replace(/\/$/, "")}/`);
	const headers = new Headers({ accept: "application/json" });
	if (apiKey) headers.set("x-api-key", apiKey);

	let body: string | undefined;
	if (bodyOption) {
		body = bodyOption.startsWith("@") ? await readText(bodyOption.slice(1)) : bodyOption;
		headers.set("content-type", "application/json");
	}

	const response = await fetch(url, {
		method: method.toUpperCase(),
		headers,
		...(body ? { body } : {}),
		redirect: "error",
	});
	const text = await response.text();
	process.stdout.write(text ? `${text}\n` : `${response.status} ${response.statusText}\n`);
	if (!response.ok) process.exitCode = 3;
}

async function main() {
	const { command, positionals, options } = parseArgs(process.argv.slice(2));
	const pretty = options.pretty === true;

	switch (command) {
		case "help":
		case "--help":
		case "-h":
			process.stdout.write(HELP);
			return;
		case "doctor":
			await commandDoctor();
			return;
		case "validate":
			await commandValidate(required(positionals[0], "resume file"), pretty);
			return;
		case "inspect":
			await commandInspect(required(positionals[0], "resume file"), pretty);
			return;
		case "ats":
			await commandAts(required(positionals[0], "resume file"), optionString(options, "from"), pretty);
			return;
		case "convert":
			await commandConvert(required(positionals[0], "input file"), options);
			return;
		case "patch":
			await commandPatch(
				required(positionals[0], "resume file"),
				required(positionals[1], "patch file"),
				optionString(options, "output"),
			);
			return;
		case "diff":
			await commandDiff(required(positionals[0], "before file"), required(positionals[1], "after file"), pretty);
			return;
		case "redact":
			await commandRedact(required(positionals[0], "resume file"), optionString(options, "output"));
			return;
		case "api":
			await commandApi(required(positionals[0], "HTTP method"), required(positionals[1], "API path"), options);
			return;
		default:
			throw new Error(`Unknown command: ${command}\n\n${HELP}`);
	}
}

main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
