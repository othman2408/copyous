import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import type CopyousExtension from '../../extension.js';
import { ItemType, getDefaultDatabaseFile } from '../common/constants.js';
import { ClipboardHistory, DatabaseBackend } from '../common/settings.js';
import { getLinkImagePath } from '../misc/link.js';
import { forEachCooperatively } from '../misc/scheduler.js';
import { ClipboardEntry, Database, Metadata } from './database.js';
import { MemoryDatabase } from './memory.js';
import { RemoteDatabase } from './remote.js';

export class ClipboardEntryTracker {
	private _database: Database | undefined;
	private _entries: Map<number, ClipboardEntry> = new Map();
	private _fromDefault: boolean = false;
	private _signals = new Map<ClipboardEntry, number[]>();
	private _initialization: Promise<void> = Promise.resolve();
	private _destroyed = false;

	private readonly settings;
	private readonly logger;

	constructor(private ext: CopyousExtension) {
		this.settings = ext.settings;
		this.logger = ext.logger;
	}

	public has(entry: ClipboardEntry): boolean {
		return this._entries.get(entry.id) === entry;
	}

	get shouldInit(): boolean {
		if (this._fromDefault) {
			this._fromDefault = false;
			return false;
		}

		return true;
	}

	init(): Promise<ClipboardEntry[]> {
		const initialization = this._initialization
			.catch(() => {})
			.then(() => {
				return this._destroyed ? [] : this.initialize();
			});
		// Do not keep the resolved array alive after deleted entries leave the tracker.
		this._initialization = initialization.then(
			() => {},
			() => {},
		);
		return initialization;
	}

	private async initialize(): Promise<ClipboardEntry[]> {
		if (this._database) {
			await this.closeDatabase();
		}

		const backend: DatabaseBackend = this.settings.get_enum('database-backend');
		const file = this.getFile();
		const dir = file.get_parent()!;
		const fileName = file.get_basename()!.replace(/(\.db|\.json)$/, '');
		const dbFile = dir.get_child(`${fileName}.db`);
		const jsonFile = dir.get_child(`${fileName}.json`);

		// Default database strategy is as followed:
		// 1. (memory)  in-memory-database (deprecated) set to true
		// 2. (sqlite)  .db file exists
		// 3. (json)    .json file exists
		// 4. (sqlite)  sqlite backend can be loaded
		// 5. (json)    json backend can be loaded
		// 6. fallback to in-memory
		let entries: ClipboardEntry[] | null = null;
		if (backend === DatabaseBackend.Default) {
			this._fromDefault = true;
			if (this.settings.get_boolean('in-memory-database')) {
				this.logger.log('Set default database backend to in-memory');
				entries = await this.initMemory();
			} else if (dbFile.query_exists(null)) {
				entries = await this.initSqlite(dbFile, true);
				this.settings.set_enum('database-backend', DatabaseBackend.Sqlite);
				this.logger.log('Set default database backend to SQLite');
			} else if (jsonFile.query_exists(null)) {
				entries = await this.initJson(jsonFile);
				this.settings.set_enum('database-backend', DatabaseBackend.Json);
				this.logger.log('Set default database backend to JSON');
			} else {
				entries = await this.initSqlite(dbFile, false);
				if (entries !== null) {
					this.settings.set_enum('database-backend', DatabaseBackend.Sqlite);
					this.logger.log('Set default database backend to SQLite');
				} else {
					entries = await this.initJson(jsonFile);
					if (entries !== null) {
						this.settings.set_enum('database-backend', DatabaseBackend.Json);
						this.logger.log('Set default database backend to JSON');
					} else {
						entries = await this.initMemory();
						this.settings.set_enum('database-backend', DatabaseBackend.Memory);
						this.logger.log('Set default database backend to in-memory');
					}
				}
			}
		} else if (backend === DatabaseBackend.Sqlite) {
			entries = await this.initSqlite(dbFile, true);
		} else if (backend === DatabaseBackend.Json) {
			entries = await this.initJson(jsonFile);
		}

		// Fallback to in-memory
		entries ??= await this.initMemory();

		// Track all entries
		await this.track(entries);

		// Delete oldest entries
		await this.deleteOldest();

		return Array.from(this._entries.values());
	}

	private getFile(): Gio.File {
		// Check if DEBUG_COPYOUS_DBPATH is set
		const environment = GLib.get_environ();
		const debugPath = GLib.environ_getenv(environment, 'DEBUG_COPYOUS_DBPATH');
		if (debugPath) {
			this.logger.log('Using debug database');
			return Gio.File.new_for_path(debugPath);
		}

		// Get database location or use default ${XDG_DATA_HOME}/${EXTENSION UUID}
		const location = this.settings.get_string('database-location');
		return location ? Gio.File.new_for_path(location) : getDefaultDatabaseFile(this.ext, DatabaseBackend.Default);
	}

	private async initSqlite(file: Gio.File | null, showError: boolean): Promise<ClipboardEntry[] | null> {
		if (!file) return this.initMemory();
		const database = new RemoteDatabase(this.ext, 'sqlite', file);
		try {
			await database.init();
			this._database = database;
			return await database.entries();
		} catch {
			await database.close().catch(() => {});
			this._database = undefined;
			this.logger.error('Failed to load Gda in clipboard worker');
			if (showError && !this.settings.get_boolean('disable-gda-warning')) {
				this.ext.notificationManager?.warning(_('Failed to load Gda'), _('Clipboard history will be disabled'));
			}
			return null;
		}
	}

	private async initJson(file: Gio.File | null): Promise<ClipboardEntry[] | null> {
		if (file === null) return await this.initMemory();

		try {
			this.logger.log('Using JSON database');
			this._database = new RemoteDatabase(this.ext, 'json', file);
			await this._database.init();
			return await this._database.entries();
		} catch (e) {
			await this._database?.close().catch(() => {});
			this._database = undefined;
			this.logger.error('Failed to initialize JSON database', e);
			this.ext.notificationManager?.warning(_('Failed to load JSON'), _('Clipboard history will be disabled'));

			return null;
		}
	}

	private async initMemory(): Promise<ClipboardEntry[]> {
		this.logger.log('Using in-memory database');

		this._database = new MemoryDatabase();
		await this._database.init();
		return [];
	}

	public async clear(history: ClipboardHistory | null = null) {
		if (!this._database) return;

		history ??= this.settings.get_enum('clipboard-history');
		const deleted = await this._database.clear(history);
		await forEachCooperatively(deleted, (id) => this.deleteFromDatabase(id));
	}

	public async destroy() {
		this._destroyed = true;
		await this._initialization.catch(() => []);
		await this.closeDatabase();
	}

	private async closeDatabase() {
		const database = this._database;
		this._database = undefined;
		await forEachCooperatively(this._signals.keys(), (entry) => this.untrack(entry));
		this._entries.clear();
		await database?.close();
	}

	/**
	 * Inserts an entry into the database
	 * @param type The type of the entry
	 * @param content The content of the entry
	 * @param metadata The metadata of the entry
	 * @returns The inserted entry or null if the entry could not be inserted or is already tracked
	 */
	public async insert(
		type: ItemType,
		content: string,
		metadata: Metadata | null = null,
	): Promise<ClipboardEntry | null> {
		await this._initialization;
		if (this._destroyed) return null;
		const database = this._database;
		const id = await database?.selectConflict({ type, content });
		if (this._destroyed || database !== this._database) return null;
		if (id != null) {
			// Check if the entry is already tracked
			const trackedEntry = this._entries.get(id);
			if (trackedEntry) {
				trackedEntry.datetime = GLib.DateTime.new_now_utc();
				return null;
			}
		}

		const entry = await database?.insert(type, content, metadata);
		if (!entry || this._destroyed || database !== this._database) return null;

		// Start tracking it
		await this.track([entry]);

		// Also delete oldest entries
		await this.deleteOldest();

		return this.has(entry) ? entry : null;
	}

	public checkOldest(): boolean {
		const M = this.settings.get_int('history-time');
		if (M === 0) return false;

		const now = GLib.DateTime.new_now_utc();
		const olderThan = now.add_minutes(-M)!;

		for (const entry of this._entries.values()) {
			if (entry.pinned || entry.tag) continue;
			if (entry.datetime.compare(olderThan) < 0) return true;
		}

		return false;
	}

	public async deleteOldest() {
		const N = this.settings.get_int('history-length');
		const M = this.settings.get_int('history-time');
		const deleted = await this._database?.deleteOldest(N, M);
		if (deleted) await forEachCooperatively(deleted, (id) => this.deleteFromDatabase(id));
	}

	private async track(entries: Iterable<ClipboardEntry>) {
		await forEachCooperatively(entries, (entry) => {
			if (this._destroyed) return;
			const signals = [
				entry.connect('notify::content', async () => {
					const id = await this._database
						?.updateProperty(entry, 'content')
						.catch((error: unknown) => this.logger.error(error));
					// If entry conflicts with another entry, delete it
					if (id !== undefined && id >= 0) {
						entry.emit('delete');

						// Update the date of the other entry
						const conflicted = this._entries.get(id);
						if (conflicted) {
							conflicted.datetime = entry.datetime;
						}
					}
				}),
			];
			signals.push(
				entry.connect('notify::pinned', () =>
					this._database?.updateProperty(entry, 'pinned').catch((error: unknown) => this.logger.error(error)),
				),
			);
			signals.push(
				entry.connect('notify::tag', () =>
					this._database?.updateProperty(entry, 'tag').catch((error: unknown) => this.logger.error(error)),
				),
			);
			signals.push(
				entry.connect('notify::datetime', () =>
					this._database
						?.updateProperty(entry, 'datetime')
						.catch((error: unknown) => this.logger.error(error)),
				),
			);
			signals.push(
				entry.connect('notify::metadata', () =>
					this._database
						?.updateProperty(entry, 'metadata')
						.catch((error: unknown) => this.logger.error(error)),
				),
			);
			signals.push(
				entry.connect('notify::title', () =>
					this._database?.updateProperty(entry, 'title').catch((error: unknown) => this.logger.error(error)),
				),
			);
			signals.push(
				entry.connect('delete', () => this.delete(entry).catch((error: unknown) => this.logger.error(error))),
			);
			this._signals.set(entry, signals);
			this._entries?.set(entry.id, entry);
		});
	}

	private untrack(entry: ClipboardEntry) {
		for (const id of this._signals.get(entry) ?? []) entry.disconnect(id);
		this._signals.delete(entry);
	}

	private async delete(entry: ClipboardEntry) {
		if (entry.type === ItemType.Image) {
			// Delete image
			try {
				const file = Gio.File.new_for_uri(entry.content);
				if (file.query_exists(null)) {
					file.delete(null);
				}
			} catch {
				this.logger.error('Failed to delete image', entry.content);
			}
		} else if (entry.type === ItemType.Link && entry.metadata) {
			// Delete thumbnail image
			const metadata: { image: string | null } = { image: null, ...entry.metadata };
			if (metadata.image) {
				try {
					const file = getLinkImagePath(this.ext, metadata.image);
					if (file?.query_exists(null)) {
						file.delete(null);
					}
				} catch {
					this.logger.error('Failed to delete thumbnail image', metadata.image);
				}
			}
		}

		// Delete from database if not deleted already
		if (this._entries.has(entry.id)) {
			await this._database?.delete(entry);
			this._entries.delete(entry.id);
			this.untrack(entry);
		}
	}

	private deleteFromDatabase(id: number) {
		const entry = this._entries.get(id);
		if (entry) {
			this._entries.delete(id);
			entry.emit('delete');
			this.untrack(entry);
		}
	}
}
