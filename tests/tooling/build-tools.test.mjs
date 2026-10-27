import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

function format(source) {
	const result = spawnSync(
		join(root, 'node_modules/.bin/oxfmt'),
		['--config', join(root, '.oxfmtrc.json'), '--stdin-filepath', join(root, 'src/prefs.ts')],
		{ input: source, encoding: 'utf8', cwd: root, timeout: 10000 },
	);
	assert.ifError(result.error);
	assert.equal(result.status, 0, result.stderr);
	return result.stdout;
}

test('formatting preserves release markers, side-effect order and ignored tables', () => {
	const formatted = format(`import Adw from 'gi://Adw';
// DEBUG-ONLY
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import './second.js';
import './first.js';
// prettier-ignore
const table = [1,    2,    3];
`);
	assert.match(formatted, /\/\/ DEBUG-ONLY\nimport GLib from 'gi:\/\/GLib';/);
	assert.ok(formatted.indexOf("'./second.js'") < formatted.indexOf("'./first.js'"));
	assert.ok(formatted.includes('[1,    2,    3]'));
	assert.equal(format(formatted), formatted);
});

function report(directory, lines) {
	const input = {
		findings: [
			{
				rule_id: 'TEST',
				severity: 'warning',
				message: 'Fixture diagnostic',
				evidence: lines.map((line) => ({ path: 'archive.zip:lib/sample.js', line, snippet: null })),
			},
		],
	};
	const result = spawnSync(process.execPath, [join(root, 'scripts/shexli/transform-output.ts')], {
		cwd: directory,
		input: JSON.stringify(input),
		encoding: 'utf8',
		timeout: 10000,
	});
	assert.ifError(result.error);
	assert.equal(result.status, 1, result.stderr);
	assert.doesNotMatch(result.stderr, /SyntaxError|TypeError|ERR_/);
	return result.stdout + result.stderr;
}

test('native source maps resolve indentation and multiple sources without mislabeling unmapped lines', () => {
	const directory = mkdtempSync(join(tmpdir(), 'copyous-maps-'));
	try {
		mkdirSync(join(directory, 'dist/lib'), { recursive: true });
		mkdirSync(join(directory, 'dist/sourcemaps/lib'), { recursive: true });
		writeFileSync(
			join(directory, 'dist/lib/sample.js'),
			'const one = 1;\n    console.log(one);\n// generated helper\nconst two = 2;\n',
		);
		writeFileSync(
			join(directory, 'dist/sourcemaps/lib/sample.js.map'),
			JSON.stringify({
				version: 3,
				file: 'sample.js',
				sourceRoot: 'src/',
				sources: ['first.ts', 'second.ts'],
				names: [],
				mappings: 'AAAA;IACA;;ACDA',
			}),
		);
		const output = report(directory, [2, 3, 4]);
		assert.ok(output.includes('src/first.ts:2'));
		assert.ok(output.includes('dist/lib/sample.js:3'));
		assert.ok(output.includes('src/second.ts:1'));
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test('release diagnostics work without source maps', () => {
	const directory = mkdtempSync(join(tmpdir(), 'copyous-report-'));
	try {
		assert.ok(report(directory, [12]).includes('dist/lib/sample.js:12'));
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
