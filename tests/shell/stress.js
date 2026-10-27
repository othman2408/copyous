import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

export const METRICS = {
	createCards: { description: 'Register 80 history records, each with 100 KB of text', units: 'ms', value: 0 },
	destroyedCards: { description: 'Cards destroyed after removing 80 entries', units: 'count', value: 0 },
	searchMiss: { description: 'Search 80 x 100 KB text entries for absent ASCII term', units: 'ms', value: 0 },
};
export async function run() {
	let ext;
	for (let i = 0; i < 50; i++) {
		ext = Main.extensionManager.lookup('copyous@boerdereinar.dev')?.stateObj;
		if (ext?.clipboardDialog) break;
		await Scripting.sleep(100);
	}
	await Scripting.sleep(1200);
	const { ClipboardEntry } = await import(`file://${ext.path}/lib/database/database.js`);
	const { SearchQuery, SearchChange } = await import(`file://${ext.path}/lib/ui/searchEntry.js`);
	const dialog = ext.clipboardDialog;
	dialog.clearEntries();
	const entries = [];
	const text = 'const value = exampleCall(123); // some synthetic text for a clipboard card\n'.repeat(1400);
	const start = GLib.get_monotonic_time();
	for (let i = 0; i < 80; i++) {
		const e = new ClipboardEntry(10000 + i, 'Text', text + i, false, null, GLib.DateTime.new_now_utc());
		entries.push(e);
		dialog.addEntry(e);
	}
	METRICS.createCards.value = (GLib.get_monotonic_time() - start) / 1000;
	const container = dialog._scrollView._scrollContainer;
	dialog.open();
	await Scripting.sleep(300);
	const renderedCards = container.actors.size;
	for (const child of container.actors.values()) child.connect('destroy', () => METRICS.destroyedCards.value++);
	const q = new SearchQuery(
		SearchChange.Different,
		'impossibleterm',
		false,
		false,
		null,
		false,
		null,
		new Intl.Collator('en', { sensitivity: 'base' }),
	);
	const startSearch = GLib.get_monotonic_time();
	container.search(q);
	for (let i = 0; i < 250 && (container.needsFilter || container.searching || container.filtered.length); i++)
		await Scripting.sleep(20);
	if (container.filtered.length) throw new Error('Search did not complete');
	METRICS.searchMiss.value = (GLib.get_monotonic_time() - startSearch) / 1000;
	for (const e of entries) e.emit('delete');

	if (GLib.getenv('COPYOUS_BENCHMARK_ONLY') === '1') {
		print('COPYOUS_METRICS ' + JSON.stringify(METRICS));
		return;
	}
	await Scripting.sleep(30);
	if (METRICS.destroyedCards.value !== renderedCards) throw new Error('Removed cards were not destroyed');
	if (container.records.size !== 0 || container.actors.size !== 0)
		throw new Error('History is not empty after deletion');
	// Deleted entries must no longer call into the container.
	entries[0].datetime = GLib.DateTime.new_now_utc();
	if (container.records.size !== 0 || container.actors.size !== 0) throw new Error('A destroyed card was reinserted');
	const extra = new ClipboardEntry(20000, 'Text', 'clear test', false, null, GLib.DateTime.new_now_utc());
	dialog.addEntry(extra);
	dialog.clearEntries();
	extra.datetime = GLib.DateTime.new_now_utc();
	if (container.records.size !== 0 || container.actors.size !== 0)
		throw new Error('Clear left entry callbacks connected');

	const { CodeItem } = await import(`file://${ext.path}/lib/ui/items/codeItem.js`);
	let highlightLength = 0;
	const previousHighlight = ext.highlight;
	const highlight = async (input) => {
		highlightLength = Math.max(highlightLength, input.length);
		return { value: GLib.markup_escape_text(input, -1) };
	};
	ext.highlight = highlight;
	const codeEntry = new ClipboardEntry(30000, 'Code', text.repeat(10), false, null, GLib.DateTime.new_now_utc(), {
		language: { id: 'js', name: 'JavaScript' },
	});
	const code = new CodeItem(ext, codeEntry);
	if (highlightLength === 0 || highlightLength > 4096) throw new Error('Code highlighter received unbounded input');
	if (codeEntry.content !== text.repeat(10)) throw new Error('Full clipboard content was truncated');
	code.destroy();
	ext.highlight = previousHighlight;

	const { ImagePreview } = await import(`file://${ext.path}/lib/ui/components/contentPreview.js`);
	const directory = Gio.File.new_for_path(GLib.dir_make_tmp('copyous-preview-test-XXXXXX'));
	const file = directory.get_child('large.svg');
	file.replace_contents(
		'<svg xmlns="http://www.w3.org/2000/svg" width="8000" height="6000"><rect width="8000" height="6000" fill="red"/></svg>',
		null,
		false,
		Gio.FileCreateFlags.NONE,
		null,
	);
	const preview = new ImagePreview(ext, file);
	if (preview._started) throw new Error('Hidden image preview started decoding');
	await preview.load(ext, file);
	const uri = preview.get_first_child()?.style?.match(/url\("(.*?)"\)/)?.[1];
	if (!uri) throw new Error('Asynchronous image preview failed');
	const [, width, height] = GdkPixbuf.Pixbuf.get_file_info(Gio.File.new_for_uri(uri).get_path());
	if (width > 1024 || height > 1024) throw new Error('Image texture is not bounded');
	preview.destroy();
	container.search(
		new SearchQuery(
			SearchChange.Different,
			'',
			false,
			false,
			null,
			false,
			null,
			new Intl.Collator('en', { sensitivity: 'base' }),
		),
	);
	const imageEntry = new ClipboardEntry(40000, 'Image', file.get_uri(), false, null, GLib.DateTime.new_now_utc());
	dialog.addEntry(imageEntry);
	dialog.open();
	await Scripting.sleep(100);
	const imageCard = container.actors.get(imageEntry.id);
	if (!imageCard) throw new Error('Image card was not materialized');
	for (let i = 0; i < 500 && imageCard._imagePreview._ratio === null; i++) await Scripting.sleep(20);
	if (!imageCard._imagePreview._started || imageCard._imagePreview._ratio !== 0.75)
		throw new Error('Mapped image did not load automatically');
	dialog.close();
	await Scripting.waitLeisure();
	imageEntry.emit('delete');
	ext.settings.set_boolean('send-notification', true);
	ext.notificationManager.textNotification(text.repeat(10));
	const notices = ext.notificationManager._source.notifications;
	if (notices[notices.length - 1].body.length > 4096) throw new Error('Unbounded text notification');
	await ext.notificationManager.notification(imageEntry);
	ext.notificationManager.imageNotification(new Uint8Array([0]), 8000, 6000);
	ext.settings.set_boolean('send-notification', false);

	const removed = new ImagePreview(ext, file);
	const loading = removed.load(ext, file);
	removed.destroy();
	await loading;
	file.delete(null);
	directory.delete(null);

	const manager = ext.clipboardManager;
	const { delay } = await import(`file://${ext.path}/lib/misc/delay.js`);
	const source = (value, wait) => ({
		get_mimetypes: () => ['text/plain'],
		read_async: async (_mime, cancel) => {
			await delay(wait, cancel);
			if (cancel.is_cancelled()) throw new Error('cancelled synthetic clipboard source');
			return Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(new TextEncoder().encode(value)));
		},
	});
	const captured = [];
	const signal = manager.connect('clipboard', (_manager, entry) => captured.push(entry.content));
	await Promise.all([
		manager.ownerChanged(null, Meta.SelectionType.SELECTION_CLIPBOARD, source('stale transfer', 100)),
		manager.ownerChanged(null, Meta.SelectionType.SELECTION_CLIPBOARD, source('current transfer', 1)),
	]);
	await manager.ownerChanged(null, Meta.SelectionType.SELECTION_CLIPBOARD, source('مرحبا1', 1));
	await manager.ownerChanged(null, Meta.SelectionType.SELECTION_CLIPBOARD, source('مرحبا2', 1));
	if (!captured.includes('مرحبا1') || !captured.includes('مرحبا2'))
		throw new Error('UTF-8 checksum ignored distinct clipboard content');
	manager.disconnect(signal);
	if (captured.includes('stale transfer') || !captured.includes('current transfer'))
		throw new Error('Superseded clipboard read was not cancelled');
	dialog.open();
	await Scripting.waitLeisure();
	dialog.close();
	await Scripting.waitLeisure();
	// Teardown must release the menu outside the dialog tree and its modal grab.
	const menus = () =>
		Main.layoutManager.uiGroup.get_children().filter((actor) => actor.has_style_class_name?.('clipboard-item-menu'))
			.length;
	const initialMenus = menus();
	for (let i = 0; i < 3; i++) {
		ext.clipboardDialog.open();
		await Scripting.waitLeisure();
		ext.disable();
		await Scripting.sleep(100);
		if (menus() !== initialMenus - 1) throw new Error('Detached clipboard popup menu leaked');
		ext.enable();
		await Scripting.sleep(300);
		if (menus() !== initialMenus) throw new Error('Menus accumulated after re-enabling');
	}
	print('COPYOUS_METRICS ' + JSON.stringify(METRICS));
	print(
		'PASS: card cleanup, stale signals, bounded code/image previews, cancelled preview and superseded clipboard transfer',
	);
	await Scripting.sleep(200);
}
