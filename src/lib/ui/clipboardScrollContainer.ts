import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';

import type CopyousExtension from '../../extension.js';
import { registerClass } from '../common/gjs.js';
import { encodeEntry } from '../common/workerProtocol.js';
import type { ClipboardEntry } from '../database/database.js';
import { WorkerClient } from '../misc/worker.js';
import { ClipboardItem } from './items/clipboardItem.js';
import { State, StatusItem } from './items/statusItem.js';
import { SearchChange, SearchQuery } from './searchEntry.js';

type Record = { entry: ClipboardEntry; create: () => ClipboardItem | null; signals: number[]; size?: number };

/** Logical history and a small, disposable window of cards. Spacers preserve native scrolling. */
@registerClass()
export class ClipboardScrollContainer extends St.BoxLayout {
	private readonly _statusItem: StatusItem;
	private readonly leading = new St.Widget();
	private readonly trailing = new St.Widget();
	private records = new Map<number, Record>();
	private ordered: Record[] = [];
	private filtered: Record[] = [];
	private actors = new Map<number, ClipboardItem>();
	private offsets: number[] = [0];
	private lastFocus: number | null = null;
	private query: SearchQuery | null = null;
	private refreshId = 0;
	private disposed = false;
	private searchGeneration = 0;
	private searchRequest = new Gio.Cancellable();
	private searchWorker: WorkerClient | undefined;
	private dirtyIndex = new Set<number>();
	private removedIndex = new Set<number>();
	private searching = false;
	private needsFilter = false;
	private completedSearchGeneration = 0;
	private activateAfterSearch: 'activate' | 'activate-shift' | 'activate-ctrl' | null = null;
	private scrollTarget: number | null = null;

	constructor(private ext: CopyousExtension) {
		super({ style_class: 'clipboard-item-list', x_align: Clutter.ActorAlign.START, x_expand: false });
		this._statusItem = new StatusItem(ext);
		this.add_child(this.leading);
		this.add_child(this.trailing);
		this.connect('destroy', () => this.cleanup());
		this.connect('notify::mapped', () => {
			if (this.mapped) {
				this.lastFocus = null;
				this.scrollTarget = null;
				this.adjustment.value = 0;
				this.refilter();
			} else {
				this.releaseActors();
				this.searchRequest.cancel();
				this.searchGeneration++;
				this.searchWorker?.destroy();
				this.searchWorker = undefined;
				this.activateAfterSearch = null;
			}
		});
		this.connect('notify::allocation', () => this.schedule());
		this.connect('notify::orientation', () => this.resetSizes());
		this.connect('style-changed', () => this.resetSizes());
		// Adjustments are provided by St.ScrollView after construction.
		for (const name of ['hadjustment', 'vadjustment'] as const) {
			this.connect(`notify::${name}`, () => this[name]?.connect('notify::value', () => this.schedule()));
		}
		ext.settings.connectObject(
			'changed::item-width',
			() => this.resetSizes(),
			'changed::item-height',
			() => this.resetSizes(),
			'changed::dynamic-item-height',
			() => this.resetSizes(),
			this,
		);
		this.updateStatus();
	}

	private get adjustment() {
		return this.orientation === Clutter.Orientation.HORIZONTAL ? this.hadjustment : this.vadjustment;
	}

	private get spacing() {
		return this.layout_manager.spacing;
	}

	private get estimate() {
		return this.ext.settings.get_int(
			this.orientation === Clutter.Orientation.HORIZONTAL ? 'item-width' : 'item-height',
		);
	}

	public addEntry(entry: ClipboardEntry, create: () => ClipboardItem | null): void {
		if (this.records.get(entry.id)?.entry === entry) return;
		if (this.records.has(entry.id)) this.removeEntry(entry.id);
		const record: Record = { entry, create, signals: [] };
		this.records.set(entry.id, record);
		this.dirtyIndex.add(entry.id);
		const changed = (_entry: unknown, property: { name: string }) => {
			this.dirtyIndex.add(entry.id);
			delete record.size;
			if (property.name === 'datetime') {
				this.ordered.splice(this.ordered.indexOf(record), 1);
				this.insert(record);
			}
			this.refilter();
		};
		record.signals.push(
			entry.connect('notify', changed),
			entry.connect('delete', () => this.removeEntry(entry.id)),
		);
		// Append on initial load, prepend on capture, binary insertion for date changes.
		this.insert(record);
		this.refilter();
	}

	private insert(record: Record) {
		let low = 0,
			high = this.ordered.length;
		while (low < high) {
			const mid = (low + high) >>> 1;
			if (this.ordered[mid]!.entry.datetime.compare(record.entry.datetime) > 0) low = mid + 1;
			else high = mid;
		}
		this.ordered.splice(low, 0, record);
	}

	private removeEntry(id: number) {
		const record = this.records.get(id);
		if (!record) return;
		const focused = this.actors.get(id)?.has_key_focus() ?? false;
		const position = this.filtered.indexOf(record);
		for (const signal of record.signals) record.entry.disconnect(signal);
		this.records.delete(id);
		this.ordered.splice(this.ordered.indexOf(record), 1);
		this.dirtyIndex.delete(id);
		this.removedIndex.add(id);
		this.actors.get(id)?.destroy();
		this.actors.delete(id);
		if (this.lastFocus === id) this.lastFocus = null;
		this.refilter();
		if (focused) this.applyFilter();
		if (focused && !this.selectItem(Math.min(position, this.filtered.length - 1))) this.focusSearch();
	}

	public clearItems(): void {
		this.searchGeneration++;
		this.searchRequest.cancel();
		this.needsFilter = false;
		this.searching = false;
		this.activateAfterSearch = null;
		for (const record of this.records.values()) for (const id of record.signals) record.entry.disconnect(id);
		this.records.clear();
		this.ordered = [];
		this.filtered = [];
		this.dirtyIndex.clear();
		this.removedIndex.clear();
		this.searchWorker?.destroy();
		this.searchWorker = undefined;
		this.lastFocus = null;
		this.scrollTarget = null;
		this.releaseActors();
		this.rebuildOffsets();
		this.updateStatus();
		this.schedule();
	}

	private refilter() {
		this.needsFilter = true;
		this.schedule();
	}

	private applyFilter() {
		this.needsFilter = false;
		if (this.query?.query) {
			// Coalesce bursts and retain the previous result until the new query completes.
			this.searchGeneration++;
			this.searching = true;
			this.filtered = this.filtered.filter((record) => this.records.has(record.entry.id));
		} else {
			this.completedSearchGeneration = this.searchGeneration;
			this.filtered = this.query
				? this.ordered.filter(({ entry }) => this.query!.matchesProperties(entry.pinned, entry.tag, entry.type))
				: this.ordered;
		}
		this.rebuildOffsets();
		this.updateStatus();
		this.schedule();
	}

	private async runSearch() {
		this.searching = false;
		const query = this.query!;
		const generation = this.searchGeneration;
		this.searchRequest.cancel();
		const cancellable = new Gio.Cancellable();
		this.searchRequest = cancellable;
		try {
			if (!this.searchWorker) {
				this.searchWorker = new WorkerClient(`${this.ext.path}/worker.js`, 10000);
				for (const id of this.records.keys()) this.dirtyIndex.add(id);
			}
			const worker = this.searchWorker;
			if (this.removedIndex.size) {
				const removed = Array.from(this.removedIndex);
				this.removedIndex.clear();
				await worker.request('unindex', removed);
			}
			// Small messages yield to Shell between batches, including initial indexing.
			while (this.dirtyIndex.size) {
				const batch = [];
				let size = 0;
				for (const id of this.dirtyIndex) {
					this.dirtyIndex.delete(id);
					const record = this.records.get(id);
					if (record) {
						batch.push(encodeEntry(record.entry));
						size += record.entry.content.length;
					}
					if (batch.length >= 32 || size > 128 * 1024) break;
				}
				// Backpressure prevents buffering the complete history in IPC messages.
				// oxlint-disable-next-line no-await-in-loop
				await worker.request('index', batch);
				if (cancellable.is_cancelled() || this.disposed) return;
			}
			const ids = new Set(await worker.request<number[]>('search', query.toData(), cancellable));
			if (this.disposed || generation !== this.searchGeneration) return;
			this.filtered = this.ordered.filter((record) => ids.has(record.entry.id));
			this.completedSearchGeneration = generation;
			this.adjustment.value = 0;
			this.rebuildOffsets();
			this.updateStatus();
			this.schedule();
			if (this.activateAfterSearch) {
				const action = this.activateAfterSearch;
				this.activateAfterSearch = null;
				this.activateFirst(action);
			}
		} catch {
			if (this.disposed || cancellable.is_cancelled()) return;
			this.searchWorker?.destroy();
			this.searchWorker = undefined;
			// Do not silently claim stale results match a failed query.
			this.filtered = [];
			this.completedSearchGeneration = generation;
			this.activateAfterSearch = null;
			this.rebuildOffsets();
			this.updateStatus();
			this.schedule();
			this.ext.logger.warn('History search worker failed; retry the search to restart it');
		}
	}

	public search(query: SearchQuery): void {
		this.activateAfterSearch = null;
		this.searchRequest.cancel();
		this.searchGeneration++;
		this.query = query.withChange(SearchChange.Different);
		this.searching = false;
		this.scrollTarget = null;
		this.adjustment.value = 0;
		this.refilter();
	}

	private rebuildOffsets() {
		let offset = 0;
		this.offsets = [0];
		const spacing = this.spacing,
			estimate = this.estimate;
		for (const record of this.filtered) {
			offset += (record.size ?? estimate) + spacing;
			this.offsets.push(offset);
		}
	}

	private resetSizes() {
		if (!this.records) return;
		for (const record of this.records.values()) delete record.size;
		this.rebuildOffsets();
		this.schedule();
	}

	private schedule() {
		if (this.disposed || this.refreshId) return;
		this.refreshId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
			this.refreshId = 0;
			if (this.needsFilter) this.applyFilter();
			if (this.searching && this.mapped) this.runSearch().catch(() => {});
			this.render();
			return GLib.SOURCE_REMOVE;
		});
	}

	private updateStatus() {
		const empty = this.filtered.length === 0;
		if (empty && !this._statusItem.get_parent()) this.add_child(this._statusItem);
		else if (!empty && this._statusItem.get_parent()) this.remove_child(this._statusItem);
		this._statusItem.state = this.records.size ? State.NoResults : State.Empty;
		this.x_align = empty ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.START;
		this.x_expand = empty;
	}

	private releaseActors() {
		for (const actor of this.actors.values()) actor.destroy();
		this.actors.clear();
	}

	private indexAt(offset: number) {
		let low = 0,
			high = this.filtered.length;
		while (low < high) {
			const mid = (low + high) >>> 1;
			if (this.offsets[mid + 1]! <= offset) low = mid + 1;
			else high = mid;
		}
		return low;
	}

	private render(target?: number) {
		if (this.disposed || !this.mapped) return;
		const adjustment = this.adjustment;
		const page = adjustment.page_size || (this.orientation === Clutter.Orientation.HORIZONTAL ? 1200 : 800);
		const pending =
			this.scrollTarget === null
				? -1
				: this.filtered.findIndex((record) => record.entry.id === this.scrollTarget);
		const targetIndex = target ?? (pending >= 0 ? pending : undefined);
		const offset = targetIndex === undefined ? adjustment.value : this.offsets[targetIndex]!;
		const start = Math.max(0, this.indexAt(offset) - 2);
		const end = Math.min(this.filtered.length, Math.max(start + 1, this.indexAt(offset + page) + 3));
		const anchor = Math.min(this.filtered.length - 1, this.indexAt(adjustment.value));
		const anchorOffset = adjustment.value - (this.offsets[anchor] ?? 0);
		const wanted = new Set(this.filtered.slice(start, end).map((record) => record.entry.id));
		for (const [id, actor] of this.actors) {
			if (!wanted.has(id)) {
				if (actor.has_key_focus()) this.focusSearch();
				actor.destroy();
				this.actors.delete(id);
			}
		}
		let measured = false;
		for (let i = start; i < end; i++) {
			const record = this.filtered[i]!;
			let actor = this.actors.get(record.entry.id);
			if (!actor) {
				actor = record.create() ?? undefined;
				if (!actor) continue;
				this.actors.set(record.entry.id, actor);
				this.insert_child_at_index(actor, i - start + 1);
			} else if (this.get_child_at_index(i - start + 1) !== actor) this.set_child_at_index(actor, i - start + 1);
			if (i === 0) actor.add_style_pseudo_class('first-child');
			else actor.remove_style_pseudo_class('first-child');
			if (i === this.filtered.length - 1) actor.add_style_pseudo_class('last-child');
			else actor.remove_style_pseudo_class('last-child');
			const size =
				this.orientation === Clutter.Orientation.HORIZONTAL
					? actor.get_preferred_width(-1)[1]
					: actor.get_preferred_height(this.ext.settings.get_int('item-width'))[1];
			if (size > 0 && size !== record.size) {
				record.size = size;
				measured = true;
			}
		}
		if (measured) {
			this.rebuildOffsets();
			if (targetIndex === undefined && anchor >= 0) adjustment.value = this.offsets[anchor]! + anchorOffset;
		}
		const leading = Math.max(0, this.offsets[start]! - this.spacing);
		const trailing = Math.max(0, this.offsets[this.filtered.length]! - this.offsets[end]! - this.spacing);
		this.leading.visible = start > 0;
		this.trailing.visible = end < this.filtered.length;
		if (this.orientation === Clutter.Orientation.HORIZONTAL) {
			this.leading.set_size(leading, 1);
			this.trailing.set_size(trailing, 1);
		} else {
			this.leading.set_size(1, leading);
			this.trailing.set_size(1, trailing);
		}
		if (this.scrollTarget !== null) {
			const index = this.filtered.findIndex((record) => record.entry.id === this.scrollTarget);
			if (
				index >= 0 &&
				Math.abs(adjustment.upper - Math.max(page, this.offsets[this.filtered.length]! - this.spacing)) < 2
			) {
				adjustment.value = Math.max(
					0,
					Math.min(
						adjustment.upper - page,
						this.offsets[index]! + (this.filtered[index]!.size ?? this.estimate) / 2 - page / 2,
					),
				);
				this.actors.get(this.scrollTarget)?.grab_key_focus();
				this.scrollTarget = null;
			}
		}
	}

	private focusSearch() {
		global.focus_manager.get_group(this)?.grab_key_focus();
	}

	public selectItem(index: number): boolean {
		if (this.needsFilter) this.applyFilter();
		const record = this.filtered[index];
		if (!record) return false;
		this.lastFocus = record.entry.id;
		this.scrollTarget = record.entry.id;
		this.render(index);
		this.actors.get(record.entry.id)?.grab_key_focus();
		this.schedule();
		return true;
	}

	public selectLast(): boolean {
		return this.selectItem(this.filtered.length - 1);
	}

	public focusChild(child: Clutter.Actor): void {
		if (child instanceof ClipboardItem)
			this.selectItem(this.filtered.findIndex((record) => record.entry === child.entry));
	}

	public scrollToFocus(): void {
		if (this.lastFocus !== null)
			this.selectItem(this.filtered.findIndex((record) => record.entry.id === this.lastFocus));
	}

	public selectNextItem() {
		const index = this.filtered.findIndex((record) => this.actors.get(record.entry.id)?.has_key_focus());
		this.selectItem(Math.min(index + 1, this.filtered.length - 1));
	}

	public activateFirst(action?: 'activate' | 'activate-shift' | 'activate-ctrl'): void {
		const event = Clutter.get_current_event();
		action ??= event?.has_control_modifier()
			? 'activate-ctrl'
			: event?.has_shift_modifier()
				? 'activate-shift'
				: 'activate';
		if (this.needsFilter) this.applyFilter();
		if (this.completedSearchGeneration !== this.searchGeneration) {
			this.activateAfterSearch = action;
			return;
		}
		if (this.selectItem(0)) this.actors.get(this.filtered[0]!.entry.id)?.emit(action);
	}

	override vfunc_navigate_focus(from: Clutter.Actor | null, direction: St.DirectionType): boolean {
		const index =
			from instanceof ClipboardItem ? this.filtered.findIndex((record) => record.entry === from.entry) : -1;
		if (index < 0 && direction === St.DirectionType.TAB_FORWARD) return this.selectItem(0);
		if (index < 0)
			return direction === St.DirectionType.TAB_BACKWARD
				? this.selectLast()
				: this.selectItem(
						Math.max(
							0,
							this.filtered.findIndex((record) => record.entry.id === this.lastFocus),
						),
					);
		const horizontal = this.orientation === Clutter.Orientation.HORIZONTAL;
		if (horizontal && direction === St.DirectionType.UP) return false;
		if (horizontal && direction === St.DirectionType.DOWN) return true;
		if (!horizontal && (direction === St.DirectionType.LEFT || direction === St.DirectionType.RIGHT)) return true;
		let forward =
			direction === St.DirectionType.TAB_FORWARD ||
			direction === St.DirectionType.DOWN ||
			direction === St.DirectionType.RIGHT;
		if (
			horizontal &&
			this.text_direction === Clutter.TextDirection.RTL &&
			(direction === St.DirectionType.LEFT || direction === St.DirectionType.RIGHT)
		)
			forward = !forward;
		return this.selectItem(index + (forward ? 1 : -1));
	}

	private cleanup() {
		this.disposed = true;
		if (this.refreshId) GLib.source_remove(this.refreshId);
		this.refreshId = 0;
		this.clearItems();
		this.ext.settings.disconnectObject(this);
		this._statusItem.destroy();
	}
}
