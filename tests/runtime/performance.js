// Run after TypeScript compilation: gjs -m tests/runtime/performance.js
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { ClipboardEntryTracker } from '../../dist/lib/database/entryTracker.js';
import { JsonDatabase } from '../../dist/lib/database/json.js';
import { delay } from '../../dist/lib/misc/delay.js';
import { readBounded } from '../../dist/lib/misc/stream.js';

function assert(value, message) {
	if (!value) throw new Error(message);
}
const root = Gio.File.new_for_path(GLib.dir_make_tmp('copyous-regression-XXXXXX'));
const realFile = root.get_child('history.json');
const cancellable = new Gio.Cancellable();
let active = 0,
	peak = 0,
	writes = 0;
const slowFile = {
	query_exists: (c) => realFile.query_exists(c),
	get_parent: () => realFile.get_parent(),
	replace_contents_async: async (...args) => {
		active++;
		peak = Math.max(peak, active);
		writes++;
		try {
			await delay(40, cancellable);
			return await realFile.replace_contents_async(...args);
		} finally {
			active--;
		}
	},
};
const ext = {
	logger: {
		log() {},
		info() {},
		warn() {},
		error(...args) {
			throw new Error(args.join(' '));
		},
	},
};
const database = new JsonDatabase(ext, slowFile);
await database.init();
await database.insert('Text', 'first');
const firstFlush = database.flush();
await delay(5, cancellable);
await database.insert('Text', 'second');
const secondFlush = database.flush();
await Promise.all([firstFlush, secondFlush, database.close()]);
const [contents] = await realFile.load_contents_async(null);
const stored = JSON.parse(new TextDecoder().decode(contents));
assert(peak === 1, 'JSON writes overlapped');
assert(stored.entries.length === 2, 'Mutation during a slow JSON save was lost');
assert(writes === 2, 'Dirty snapshots were not coalesced');
assert((await database.entries()).length === 0, 'Closed JSON database retained entries');
print('PASS: serialized JSON save, latest snapshot, close flush and memory release');

const settings = {
	get_enum: () => 3, // Memory backend
	get_string: () => realFile.get_path(),
	get_int: (key) => (key === 'history-length' ? 10 : 0),
};
// Use the exported enum instead of relying on an incidental numeric value.
const { DatabaseBackend } = await import('../../dist/lib/common/settings.js');
settings.get_enum = () => DatabaseBackend.Memory;
const tracker = new ClipboardEntryTracker({ ...ext, settings });
await tracker.init();
const entry = await tracker.insert('Text', 'id zero');
assert(entry.id === 0, 'Fixture must exercise the zero ID');
const duplicate = await tracker.insert('Text', 'id zero');
assert(duplicate === null && tracker.has(entry), 'First memory entry was not deduplicated');
await tracker.destroy();
assert(tracker._entries.size === 0 && tracker._signals.size === 0, 'Tracker retained entries/signals after teardown');
assert((await tracker.insert('Text', 'late')) === null, 'Destroyed tracker accepted a late clipboard result');
print('PASS: ID-zero duplicate and tracker teardown');

for (const length of [0, 100, 65536, 65537]) {
	const data = new Uint8Array(length).fill(42);
	const stream = Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(data));
	const result = await readBounded(stream, 65536, cancellable).catch(() => null);
	assert(stream.is_closed(), 'Read stream leaked');
	assert(length <= 65536 ? result?.length === length : result === null, 'Byte limit was not enforced');
}
const htmlStream = Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(new Uint8Array(100).fill(42)));
assert((await readBounded(htmlStream, 20, cancellable, true)).length === 20, 'HTML prefix limit was not respected');
assert(htmlStream.is_closed(), 'Truncated HTML response leaked its stream');
const cancelled = new Gio.Cancellable();
cancelled.cancel();
const stream = Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(new Uint8Array(20)));
await readBounded(stream, 65536, cancelled).catch(() => null);
assert(stream.is_closed(), 'Cancelled stream leaked');
const waitCancel = new Gio.Cancellable();
const pending = delay(10000, waitCancel);
waitCancel.cancel();
await pending;
print('PASS: bounded reads, stream closure and cancellation settling');
realFile.delete(null);
root.delete(null);
