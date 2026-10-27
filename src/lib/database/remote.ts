import type GObject from 'gi://GObject';
import type Gio from 'gi://Gio';

import type CopyousExtension from '../../extension.js';
import type { ItemType } from '../common/constants.js';
import type { ClipboardHistory } from '../common/settings.js';
import { type EntryData, decodeEntry } from '../common/workerProtocol.js';
import { WorkerClient } from '../misc/worker.js';
import type { ClipboardEntry, Database, Metadata } from './database.js';

/** Keep storage engines, JSON snapshots and SQL execution outside the compositor. */
export class RemoteDatabase implements Database {
	private worker!: WorkerClient;
	private failed = false;
	private reading: Promise<ClipboardEntry[]> | undefined;

	constructor(
		private ext: CopyousExtension,
		private backend: 'json' | 'sqlite',
		private file: Gio.File,
	) {}

	private async call<T>(method: string, args: unknown): Promise<T> {
		try {
			return await this.worker.request<T>(method, args);
		} catch (error) {
			if (!this.failed) {
				this.failed = true;
				this.ext.notificationManager?.warning(
					_('Failed to save clipboard history'),
					_('Restart Copyous to reconnect to clipboard history'),
				);
			}
			throw error;
		}
	}

	async init() {
		this.worker = new WorkerClient(`${this.ext.path}/worker.js`);
		await this.worker.request('init', { backend: this.backend, file: this.file.get_uri() });
	}

	async close() {
		await this.worker?.close();
	}

	entries(): Promise<ClipboardEntry[]> {
		this.reading ??= this.readEntries().finally(() => {
			this.reading = undefined;
		});
		return this.reading;
	}

	private async readEntries(): Promise<ClipboardEntry[]> {
		await this.worker.request('snapshot');
		const entries: ClipboardEntry[] = [];
		while (true) {
			// Each page is requested only after the preceding page has been consumed.
			// eslint-disable-next-line no-await-in-loop
			const page = await this.worker.request<{ entries: EntryData[]; more: boolean }>('entries');
			entries.push(...page.entries.map(decodeEntry));
			if (!page.more) return entries;
		}
	}

	clear(history: ClipboardHistory): Promise<number[]> {
		return this.call('clear', history);
	}

	selectConflict(entry: ClipboardEntry | { type: ItemType; content: string }): Promise<number | null> {
		return this.call('conflict', { type: entry.type, content: entry.content });
	}

	async insert(type: ItemType, content: string, metadata: Metadata | null): Promise<ClipboardEntry | null> {
		const entry = await this.call<EntryData | null>('insert', { type, content, metadata });
		return entry ? decodeEntry(entry) : null;
	}

	updateProperty(
		entry: ClipboardEntry,
		property: Exclude<keyof ClipboardEntry, keyof GObject.Object | 'id'>,
	): Promise<number> {
		return this.call('update', {
			id: entry.id,
			property,
			value: property === 'datetime' ? entry.datetime.format_iso8601() : entry[property],
		});
	}

	delete(entry: ClipboardEntry): Promise<boolean> {
		return this.call('delete', entry.id);
	}

	deleteOldest(offset: number, minutes: number): Promise<number[]> {
		return this.call('prune', { offset, minutes });
	}
}
