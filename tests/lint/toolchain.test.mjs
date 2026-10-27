import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

function withFixture(source, check) {
	const directory = mkdtempSync(join(tmpdir(), 'copyous-lint-'));
	try {
		writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
		copyFileSync(join(root, 'src/thirdparty/tslib.ts'), join(directory, 'tslib.ts'));
		writeFileSync(
			join(directory, 'tsconfig.json'),
			JSON.stringify({
				extends: join(root, 'tsconfig.src.json'),
				compilerOptions: {
					rootDir: directory,
					tsBuildInfoFile: join(directory, 'build.tsbuildinfo'),
					paths: { tslib: [join(directory, 'tslib.ts')] },
				},
				include: ['*.ts', join(root, 'types/**/*.d.ts')],
			}),
		);
		const filename = join(directory, 'fixture.ts');
		writeFileSync(filename, source);
		return check(filename, directory);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

function lint(filename) {
	const result = spawnSync(
		join(root, 'node_modules/.bin/oxlint'),
		['--config', join(root, '.oxlintrc.json'), '--format', 'json', '--report-unused-disable-directives', filename],
		{ cwd: root, encoding: 'utf8', timeout: 20000 },
	);
	assert.ifError(result.error);
	assert.equal(result.signal, null, result.stderr);
	return { status: result.status, ...JSON.parse(result.stdout) };
}

test('type-aware and GNOME rules reject unsafe code', () => {
	withFixture(
		`export const value: string = JSON.parse('"test"');
Promise.resolve(value);
log('obsolete');
imports.format;
export class Base { _init() {} }
export class Legacy extends Base { _init() { super._init(); } }
`,
		(filename) => {
			const result = lint(filename);
			assert.equal(result.status, 1);
			const rules = new Set(result.diagnostics.map(({ code }) => code));
			for (const rule of [
				'typescript(no-unsafe-assignment)',
				'typescript(no-floating-promises)',
				'eslint(no-restricted-globals)',
				'eslint(no-restricted-properties)',
				'gjs(prefer-constructor)',
			])
				assert.ok(rules.has(rule), `Missing diagnostic: ${rule}`);
		},
	);
});

test('GI types, decorators and intentional sequential work are supported', () => {
	withFixture(
		`import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
@GObject.registerClass
export class Example extends GObject.Object {
    constructor() { super(); }
}
export const file: Gio.File = Gio.File.new_for_path('/tmp/example');
export async function sequential() {
    for (const value of [1, 2]) {
        // oxlint-disable-next-line no-await-in-loop
        await Promise.resolve(value);
    }
}
void sequential();
`,
		(filename) => {
			const result = lint(filename);
			assert.equal(result.status, 0, JSON.stringify(result.diagnostics));
			assert.equal(result.diagnostics.length, 0);
			assert.equal(result.number_of_files, 1);
		},
	);
});

test('TypeScript 7 still rejects incompatible GI types', () => {
	withFixture(
		`import Gio from 'gi://Gio';
export const file: string = Gio.File.new_for_path('/tmp/example');
`,
		(_filename, directory) => {
			const result = spawnSync(join(root, 'node_modules/.bin/tsc'), ['-p', directory, '--noEmit'], {
				cwd: root,
				encoding: 'utf8',
				timeout: 20000,
			});
			assert.ifError(result.error);
			assert.notEqual(result.status, 0);
			assert.match(result.stdout, /TS2322/);
		},
	);
});
