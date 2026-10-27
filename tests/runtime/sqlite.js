import GLib from 'gi://GLib';

let Gda;
try {
	Gda = (await import('gi://Gda?version=5.0')).default;
} catch {
	print('SKIP: Gda 5 is not installed');
}
if (Gda) {
	const { GdaDatabase } = await import(ARGV[0] || '../../dist/lib/database/gda.js');
	const errors = [];
	const ext = {
		logger: {
			info() {},
			log() {},
			error(...args) {
				errors.push(args.map(String).join(' '));
			},
		},
	};
	const database = new GdaDatabase(ext, Gda, null);
	await database.init();
	const start = GLib.get_monotonic_time();
	const entries = [];
	for (let i = 0; i < 10; i++) {
		const content = `synthetic clipboard ${i} العربية 😀 \\ quotes ' "`;
		if ((await database.selectConflict({ type: 'Text', content })) !== null) throw new Error('Unexpected conflict');
		const entry = await database.insert('Text', content, null);
		if (!entry) throw new Error('Insert failed: ' + errors.join('\n'));
		entries.push(entry);
		await database.deleteOldest(200, 0);
	}
	print(`SQLITE_CAPTURE_10_MS ${(GLib.get_monotonic_time() - start) / 1000}`);
	const saved = await database.entries();
	if (
		saved.length !== 10 ||
		(saved[0].content !== entries[9].content && !saved.some((e) => e.content === entries[9].content))
	)
		throw new Error('Round trip failed');
	entries[0].pinned = true;
	await database.updateProperty(entries[0], 'pinned');
	const removed = await database.deleteOldest(2, 0);
	if (removed.length !== 7 || removed.includes(entries[0].id)) throw new Error('Retention removed protected history');
	if (ARGV[0]) {
		await database.close();
	} else {
		const pending = database.entries();
		await database.close();
		await pending;
	}
	// Cancellation during close is expected; ordinary operations must not fail.
	const unexpected = errors.filter((s) => !s.includes('cancelled'));
	if (unexpected.length) throw new Error(unexpected.join('\n'));
	print('PASS: Gda 5 insert, duplicate query, retention, Unicode round trip and cancellation');
}
