import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

export const METRICS = {
	register10000: { description: 'Register 10,000 logical history entries', units: 'ms', value: 0 },
	peakCards: { description: 'Peak materialized cards with 10,000 history entries', units: 'count', value: 0 },
};
const assert = (value, message) => {
	if (!value) throw new Error(message);
};
export async function run() {
	await Scripting.sleep(1800);
	const scale = Number(GLib.getenv('COPYOUS_TEST_SCALE') || 1);
	St.ThemeContext.get_for_stage(global.stage).scale_factor = scale;
	const ext = Main.extensionManager.lookup('copyous@boerdereinar.dev').stateObj;
	const { ClipboardEntry } = await import(`file://${ext.path}/lib/database/database.js`);
	const { SearchQuery, SearchChange } = await import(`file://${ext.path}/lib/ui/searchEntry.js`);
	const dialog = ext.clipboardDialog,
		container = dialog._scrollView._scrollContainer;
	const query = (text) =>
		new SearchQuery(
			SearchChange.Different,
			text,
			false,
			false,
			null,
			false,
			null,
			new Intl.Collator('en', { sensitivity: 'base' }),
		);
	const wait = async (predicate) => {
		for (let i = 0; i < 300; i++) {
			if (predicate()) return;
			await Scripting.sleep(20);
		}
		throw new Error('Timed out waiting for virtual history');
	};
	dialog.clearEntries();
	container.search(query(''));
	const start = GLib.get_monotonic_time();
	const date = GLib.DateTime.new_now_utc();
	for (let i = 0; i < 10000; i++)
		dialog.addEntry(
			new ClipboardEntry(
				i + 100000,
				'Text',
				`history record ${i} ${i % 2 ? 'a\n'.repeat(40) : 'short'}`,
				false,
				null,
				date.add_seconds(-i),
			),
		);
	METRICS.register10000.value = (GLib.get_monotonic_time() - start) / 1000;
	await Scripting.sleep(50);
	assert(container.actors.size === 0, 'Hidden history created cards');
	for (const vertical of [false, true]) {
		for (const dynamic of [false, true]) {
			ext.settings.set_enum('clipboard-position-horizontal', vertical ? 1 : 3);
			ext.settings.set_enum('clipboard-orientation', vertical ? 1 : 0);
			ext.settings.set_boolean('dynamic-item-height', dynamic);
			dialog.open();
			await Scripting.sleep(300);
			assert(container.actors.size > 0 && container.actors.size < 30, 'Card count scaled with history');
			METRICS.peakCards.value = Math.max(METRICS.peakCards.value, container.actors.size);
			assert(container.selectLast(), 'Cannot select logical last entry');
			await Scripting.sleep(100);
			let actor = container.actors.get(109999);
			if (!actor?.has_key_focus())
				print(
					'VIRTUAL_DEBUG ' +
						JSON.stringify({
							keys: Array.from(container.actors.keys()),
							target: container.scrollTarget,
							last: container.lastFocus,
							adjustment: [
								container.adjustment.value,
								container.adjustment.upper,
								container.adjustment.page_size,
							],
							end: container.offsets.slice(-8),
							focus: global.stage.key_focus?.toString(),
						}),
				);
			assert(actor?.has_key_focus(), `End did not focus last entry (vertical=${vertical}, dynamic=${dynamic})`);
			const screenshotDir = GLib.getenv('COPYOUS_TEST_SCREENSHOTS');
			if (screenshotDir && ((!vertical && !dynamic) || (vertical && dynamic))) {
				const file = Gio.File.new_for_path(`${screenshotDir}/${vertical ? 'vertical' : 'horizontal'}.png`);
				const stream = file.replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
				const screenshot = new Shell.Screenshot();
				await new Promise((resolve, reject) =>
					screenshot.screenshot(false, stream, (object, result) => {
						try {
							object.screenshot_finish(result);
							resolve();
						} catch (error) {
							reject(error);
						}
					}),
				);
				stream.close(null);
			}
			const box = actor.get_transformed_position();
			const viewport = dialog._scrollView.get_transformed_position();
			const extent = vertical ? dialog._scrollView.height : dialog._scrollView.width;
			const pos = vertical ? box[1] - viewport[1] : box[0] - viewport[0];
			const center = pos + (vertical ? actor.height : actor.width) / 2;
			assert(center >= 0 && center <= extent, `Selected last card center outside viewport: ${center}, ${extent}`);
			assert(container.vfunc_navigate_focus(actor, St.DirectionType.TAB_BACKWARD), 'Backward navigation failed');
			await Scripting.sleep(60);
			assert(container.actors.get(109998)?.has_key_focus(), 'Navigation skipped logical neighbor');
			container.records.get(109998).entry.emit('delete');
			await Scripting.sleep(50);
			assert(container.actors.get(109999)?.has_key_focus(), 'Deleting focused item lost neighbor focus');
			// Restore to keep the fixture stable across orientations.
			dialog.addEntry(new ClipboardEntry(109998, 'Text', 'restored', false, null, date.add_seconds(-9998)));
			container.selectItem(0);
			await Scripting.sleep(60);
			assert(container.actors.get(100000)?.has_key_focus(), 'Home did not focus first entry');
			const forward = vertical
				? St.DirectionType.DOWN
				: container.text_direction === Clutter.TextDirection.RTL
					? St.DirectionType.LEFT
					: St.DirectionType.RIGHT;
			assert(container.vfunc_navigate_focus(container.actors.get(100000), forward), 'Arrow navigation failed');
			await Scripting.sleep(50);
			assert(container.actors.get(100001)?.has_key_focus(), 'Arrow direction did not respect orientation/RTL');
			ext.settings.set_int('item-width', 220);
			ext.settings.set_int('item-height', 180);
			await Scripting.sleep(100);
			container.selectLast();
			await Scripting.sleep(100);
			assert(container.actors.get(109999)?.has_key_focus(), 'Resize lost ability to reach last card');
			ext.settings.reset('item-width');
			ext.settings.reset('item-height');
			await Scripting.sleep(100);

			const adjustment = vertical ? container.vadjustment : container.hadjustment;
			adjustment.value = adjustment.upper / 2;
			await Scripting.sleep(100);
			assert(container.actors.size < 30, 'Scrolling retained old cards');
			assert(!container.actors.has(100000) && !container.actors.has(109999), 'Far-away cards were not recycled');
			dialog.close();
			await Scripting.sleep(300);
			assert(container.actors.size === 0, 'Closed popup retained cards');
			assert(!container.searchWorker, 'Closed popup retained search index worker');
		}
	}
	// Latest query wins, including clearing a query while indexing is in progress.
	dialog.open();
	await Scripting.sleep(250);
	let activated = null;
	const signal = dialog.connect('paste', (_dialog, entry) => (activated = entry.id));
	container.search(query('history record 9876'));
	container.activateFirst();
	assert(activated === null, 'Enter activated stale result while search was pending');
	await wait(() => activated !== null);
	assert(activated === 109876, 'Deferred Enter activated wrong result');
	dialog.disconnect(signal);
	await Scripting.sleep(300);
	dialog.open();
	await Scripting.sleep(250);
	container.search(query('history record 9999'));
	container.search(query('history record 1234'));
	await wait(
		() =>
			!container.needsFilter &&
			container.completedSearchGeneration === container.searchGeneration &&
			container.filtered.length === 1,
	);
	assert(container.filtered[0].entry.id === 101234, 'Stale search replaced latest result');
	container.search(query('missing'));
	container.search(query(''));
	await Scripting.sleep(100);
	assert(container.filtered.length === 10000, 'Clearing query applied stale results');
	container.search(query('history record 1234'));
	await wait(
		() =>
			container.filtered.length === 1 &&
			container.completedSearchGeneration === container.searchGeneration &&
			!container.needsFilter,
	);
	container.records.get(101234).entry.title = 'updated title';
	container.search(query('updated title'));
	await wait(
		() =>
			container.filtered.length === 1 &&
			container.completedSearchGeneration === container.searchGeneration &&
			!container.needsFilter,
	);
	assert(container.filtered[0].entry.id === 101234, 'Changed metadata missing from search');
	// Kill the search worker, then retry: no fallback blocking scan in Shell.
	container.searchWorker.destroy();
	container.search(query('will fail'));
	await wait(() => !container.searchWorker);
	container.search(query('updated title'));
	await wait(
		() =>
			container.filtered.length === 1 &&
			container.completedSearchGeneration === container.searchGeneration &&
			!container.needsFilter,
	);
	assert(container.filtered[0].entry.id === 101234, 'Search worker did not recover');
	dialog.close();
	await Scripting.sleep(300);
	dialog.clearEntries();
	assert(container.records.size === 0 && container.actors.size === 0, 'Clear leaked history');
	ext.settings.reset('clipboard-orientation');
	ext.settings.reset('dynamic-item-height');
	ext.settings.reset('clipboard-position-horizontal');
	print('VIRTUALIZATION_METRICS ' + JSON.stringify(METRICS));
	print(
		'PASS: 10,000 entries, bounded actors, horizontal/vertical/dynamic sizing, scrolling, keyboard, deletion, stale queries, search crash recovery',
	);
}
