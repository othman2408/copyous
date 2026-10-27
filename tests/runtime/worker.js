import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { ClipboardHistory } from '../../dist/lib/common/settings.js';
import { RemoteDatabase } from '../../dist/lib/database/remote.js';
import { WorkerClient } from '../../dist/lib/misc/worker.js';

const assert = (value, message) => {
	if (!value) throw new Error(message);
};
const root = Gio.File.new_for_path(GLib.dir_make_tmp('copyous-worker-XXXXXX'));
const path = GLib.get_current_dir() + '/dist';
const context = { path };
const sleep = (ms) =>
	new Promise((resolve) =>
		GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
			resolve();
			return GLib.SOURCE_REMOVE;
		}),
	);
const sample = 'مرحبا 🥳 \\"\n\r\t';
for (const backend of ['json', 'sqlite']) {
	if (backend === 'sqlite') {
		try {
			await import('gi://Gda');
		} catch {
			print('SKIP: SQLite worker (Gda unavailable)');
			continue;
		}
	}
	const file = root.get_child('history.' + (backend === 'json' ? 'json' : 'db'));
	let db = new RemoteDatabase(context, backend, file);
	await db.init();
	assert((await db.entries()).length === 0, 'Initial worker database must be empty');
	const entry = await db.insert('Text', sample, null);
	assert(entry.content === sample, 'Unicode/multiline content changed over IPC');
	assert((await db.selectConflict(entry)) === entry.id, 'Remote conflict lookup failed');
	entry.pinned = true;
	await db.updateProperty(entry, 'pinned');
	entry.tag = 'red';
	await db.updateProperty(entry, 'tag');
	entry.title = 'saved title';
	await db.updateProperty(entry, 'title');
	entry.datetime = GLib.DateTime.new_from_iso8601('2026-01-01T00:00:00Z', null);
	await db.updateProperty(entry, 'datetime');
	entry.content += ' edited';
	await db.updateProperty(entry, 'content');
	await db.insert('Text', 'unprotected', null);
	await db.deleteOldest(0, 0);
	// Acknowledged writes survive an abrupt worker exit, without graceful close.
	db.worker.destroy();
	await sleep(20);
	db = new RemoteDatabase(context, backend, file);
	await db.init();
	const restored = await db.entries();
	assert(
		restored.length === 1 && restored[0].content === entry.content,
		'Durable acknowledged mutation lost after crash',
	);
	assert(
		restored[0].pinned && restored[0].tag === 'red' && restored[0].title === 'saved title',
		'Updated properties lost',
	);
	assert(restored[0].datetime.to_unix() === entry.datetime.to_unix(), 'Date changed across worker boundary');
	await db.clear(ClipboardHistory.KeepPinnedAndTagged);
	assert((await db.selectConflict(restored[0])) !== null, 'Pinned clear policy failed');
	await db.delete(restored[0]);
	const pending = [];
	for (let i = 0; i < 130; i++)
		pending.push(db.insert('Text', `page entry ${i}`, { language: { id: 'js', name: 'JavaScript' } }));
	await Promise.all(pending);
	assert((await db.entries()).length === 130, 'Paged history lost entries');
	assert((await db.entries()).length === 130, 'Reading history twice consumed entries');
	await db.close();
	print(`PASS: ${backend} worker roundtrip, updates, retention, duplicate detection, crash durability and close`);
}

const worker = new WorkerClient(path + '/worker.js');
let tick = 0,
	lastBeat = GLib.get_monotonic_time(),
	maxGap = 0;
const timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5, () => {
	tick++;
	const now = GLib.get_monotonic_time();
	maxGap = Math.max(maxGap, now - lastBeat);
	lastBeat = now;
	return GLib.SOURCE_CONTINUE;
});
const record = (id, content, type = 'Text', extra = {}) => ({
	id,
	type,
	content,
	pinned: false,
	tag: null,
	datetime: '2026-01-01T00:00:00Z',
	metadata: null,
	title: '',
	...extra,
});
// Warm index and a deliberately expensive locale-aware miss. Main loop keeps running.
for (let i = 0; i < 100; i++) await worker.request('index', [record(i, 'été '.repeat(20000))]);
const before = tick;
maxGap = 0;
lastBeat = GLib.get_monotonic_time();
const searchStarted = lastBeat;
const query = {
	query: 'øøøøø',
	pinned: false,
	excludePinned: false,
	tag: null,
	excludeTagged: false,
	type: null,
	locale: 'fr',
};
assert((await worker.request('search', query)).length === 0, 'Unexpected search match');
assert(tick - before >= 3, 'Heavy search blocked the caller main loop');
print(
	'WORKER_SEARCH_METRICS ' +
		JSON.stringify({
			search_ms: (GLib.get_monotonic_time() - searchStarted) / 1000,
			caller_heartbeat_count: tick - before,
			max_heartbeat_gap_ms: maxGap / 1000,
		}),
);
await worker.request('reset-index');
await worker.request('index', [
	record(1, 'résumé'),
	record(2, 'file:///tmp/secret.png', 'Image', { title: 'named image' }),
	record(3, 'https://example.com', 'Link', { metadata: { description: 'hidden description' } }),
	record(4, 'file:///tmp/a%20b.txt', 'File'),
]);
assert((await worker.request('search', { ...query, query: 'resume' }))[0] === 1, 'Locale matching changed');
assert(
	(await worker.request('search', { ...query, query: 'secret' })).length === 0,
	'Image URI should not be searchable',
);
assert((await worker.request('search', { ...query, query: 'named' }))[0] === 2, 'Image title not indexed');
assert((await worker.request('search', { ...query, query: 'hidden' }))[0] === 3, 'Link metadata not indexed');
assert((await worker.request('search', { ...query, query: 'a b' }))[0] === 4, 'Decoded path not indexed');
const cancel = new Gio.Cancellable();
cancel.cancel();
await worker.request('search', query, cancel).then(
	() => {
		throw new Error('Cancelled request ran');
	},
	() => {},
);
assert(
	(await worker.request('search', { ...query, query: 'resume' }))[0] === 1,
	'Cancelled request desynchronized protocol',
);
GLib.source_remove(timer);
await worker.close();
print('PASS: worker search semantics, Unicode, metadata, cancellation and main-loop responsiveness');

const grammar = root.get_child('highlighter.js');
grammar.replace_contents(
	`import GLib from 'gi://GLib';
export default {
 listLanguages: () => ['fixture'], getLanguage: () => ({name: 'Fixture'}),
 highlightAuto: text => { const deadline = GLib.get_monotonic_time() + 250000; while (GLib.get_monotonic_time() < deadline) {} return {value: String(text.length), relevance: 10, language: 'fixture'}; },
 highlight: text => ({value: text, relevance: 10, language: 'fixture'})
};`,
	null,
	false,
	Gio.FileCreateFlags.NONE,
	null,
);
const highlighter = new WorkerClient(path + '/worker.js');
assert(
	(await highlighter.request('configure', { path: grammar.get_uri(), languages: [] }))[0].id === 'fixture',
	'Worker grammar not configured',
);
let beats = 0;
const beatTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5, () => {
	beats++;
	return GLib.SOURCE_CONTINUE;
});
const result = await highlighter.request('highlight', { text: 'x'.repeat(100000), language: null });
GLib.source_remove(beatTimer);
assert(result.value === '4096' && result.language.id === 'fixture', 'Worker did not bound highlight input');
assert(beats >= 10, 'Highlight blocked caller main loop');
await highlighter.close();
print('PASS: syntax grammar runs outside caller, bounded input, language metadata and main-loop responsiveness');

const svg = root.get_child('dimensions.svg');
svg.replace_contents(
	'<svg xmlns="http://www.w3.org/2000/svg" width="8000" height="6000"/>',
	null,
	false,
	Gio.FileCreateFlags.NONE,
	null,
);
const { runMediaWorker } = await import('../../dist/lib/misc/mediaWorker.js');
const dimensions = await runMediaWorker(context, 'image-info', svg.get_uri(), new Gio.Cancellable());
assert(dimensions[0] === 8000 && dimensions[1] === 6000, 'Image metadata worker changed original dimensions');
const cancelledMedia = new Gio.Cancellable();
cancelledMedia.cancel();
await runMediaWorker(context, 'image-info', svg.get_uri(), cancelledMedia).then(
	() => {
		throw new Error('Cancelled media ran');
	},
	() => {},
);
const wav = root.get_child('duration.wav');
const wave = new Uint8Array(16044),
	header = new DataView(wave.buffer);
const ascii = (offset, text) => wave.set(new TextEncoder().encode(text), offset);
ascii(0, 'RIFF');
header.setUint32(4, 16036, true);
ascii(8, 'WAVEfmt ');
header.setUint32(16, 16, true);
header.setUint16(20, 1, true);
header.setUint16(22, 1, true);
header.setUint32(24, 8000, true);
header.setUint32(28, 16000, true);
header.setUint16(32, 2, true);
header.setUint16(34, 16, true);
ascii(36, 'data');
header.setUint32(40, 16000, true);
wav.replace_contents(wave, null, false, Gio.FileCreateFlags.NONE, null);
const duration = await runMediaWorker(context, 'media-info', wav.get_uri(), new Gio.Cancellable());
assert(duration !== null && Math.abs(duration - 1) < 0.05, 'Media duration worker did not decode a one-second WAV');
print('PASS: isolated image dimensions, media duration and cancelled media queue');

const hung = root.get_child('hung.js');
hung.replace_contents('while (true) {}', null, false, Gio.FileCreateFlags.NONE, null);
const blocked = new WorkerClient(hung.get_path(), 80);
const started = GLib.get_monotonic_time();
const results = await Promise.allSettled([blocked.request('x'), blocked.request('y')]);
assert(
	results.every((r) => r.status === 'rejected'),
	'Timeout did not reject all queued work',
);
assert(GLib.get_monotonic_time() - started < 2000000, 'Timeout failed to terminate worker');
blocked.destroy();
print('PASS: worker timeout terminates process and settles queued requests');
// Remove only this test's temporary files.
const files = root.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
let info;
while ((info = files.next_file(null))) root.get_child(info.get_name()).delete(null);
files.close(null);
root.delete(null);
