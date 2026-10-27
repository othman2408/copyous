/// <reference types="node" />
import * as fs from 'node:fs';
import { SourceMap, type SourceMapPayload } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Evidence = {
	path: string;
	line: number | null;
	snippet: string | null;
};

type Finding = {
	rule_id: string;
	title: string;
	severity: string;
	message: string;
	evidence: Evidence[];
	source_url: string;
	source_section: string;
};

type Summary = {
	input_path: string;
	finding_count: number;
	severity_counts: Record<string, number>;
	status: string;
};

type AnalysisResult = {
	spec_version: string;
	summary: Summary;
	findings: Finding[];
	artifacts: Record<string, unknown>;
};

function colorSeverity(severity: string) {
	switch (severity) {
		case 'error':
			return '\x1b[31merror\x1b[0m';
		case 'warning':
			return '\x1b[33mwarning\x1b[0m';
		case 'manual_review':
			return '\x1b[34mmanual_review\x1b[0m';
		default:
			return severity;
	}
}

function logEvidence(finding: Finding, evidence: Evidence) {
	const log = (() => {
		switch (finding.severity) {
			case 'error':
				return console.error;
			case 'warning':
				return console.warn;
			default:
				return console.log;
		}
	})();

	const severity = colorSeverity(finding.severity);

	if (evidence.line === null && evidence.snippet !== null && fs.existsSync(evidence.path)) {
		const snippet = evidence.snippet.split('\n')[0]!.replace(/'/g, '"');
		const file = fs.readFileSync(evidence.path, 'utf8');
		for (const [i, line] of file.split('\n').entries()) {
			if (line.replace(/'/g, '"').includes(snippet)) {
				evidence.line = i + 1;
				break;
			}
		}
	}

	console.log();
	log(`${evidence.path}:${evidence.line ?? 1} - ${severity} \x1b[2m${finding.rule_id}:\x1b[0m ${finding.message}`);
	if (evidence.line === null && evidence.snippet !== null) console.log(evidence.snippet);
}

const result = JSON.parse(fs.readFileSync(0, 'utf8')) as AnalysisResult;
const sourceMaps = new Map<string, { map: SourceMap; root: string; lines: string[] }>();

let hasErrors = false;
for (const finding of result.findings) {
	if (finding.severity === 'error' || finding.severity === 'warning') {
		hasErrors = true;
	}

	for (const evidence of finding.evidence) {
		evidence.path = evidence.path.split(':')[1]!;
		if (!evidence.path.endsWith('.js')) {
			evidence.path = `dist/${evidence.path}`;
			logEvidence(finding, evidence);
			continue;
		}

		const path = `dist/sourcemaps/${evidence.path}.map`;
		if (!fs.existsSync(path)) {
			evidence.path = `dist/${evidence.path}`;
			logEvidence(finding, evidence);
			continue;
		}

		let cached = sourceMaps.get(path);
		if (!cached) {
			const payload = JSON.parse(fs.readFileSync(path, 'utf8')) as SourceMapPayload & { sourceRoot?: string };
			cached = {
				map: new SourceMap(payload),
				root: payload.sourceRoot ?? '',
				lines: fs.readFileSync(`dist/${evidence.path}`, 'utf8').split('\n'),
			};
			sourceMaps.set(path, cached);
		}
		const line = (evidence.line ?? 1) - 1;
		const column = Math.max(0, cached.lines[line]?.search(/\S/) ?? 0);
		const position = cached.map.findEntry(line, column);
		if ('originalSource' in position && position.originalSource && position.generatedLine === line) {
			const source = position.originalSource;
			const url = URL.canParse(source)
				? new URL(source)
				: URL.canParse(cached.root)
					? new URL(source, cached.root)
					: null;
			evidence.path = url
				? url.protocol === 'file:'
					? fileURLToPath(url)
					: url.href
				: join(cached.root, source);
			evidence.line = position.originalLine + 1;
		} else {
			evidence.path = `dist/${evidence.path}`;
		}
		logEvidence(finding, evidence);
	}
}

if (hasErrors) {
	process.exitCode = 1;
}
