import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { ConsoleLike, Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { getDataPath, getHljsLanguages, getHljsPath } from './lib/common/constants.js';
import { DbusService } from './lib/common/dbus.js';
import { ClipboardHistory, CopyousSettings, migrateSettings } from './lib/common/settings.js';
import { SoundManager, tryCreateSoundManager } from './lib/common/sound.js';
import type { HighlightResult } from './lib/common/workerProtocol.js';
import { ClipboardEntry, type Language } from './lib/database/database.js';
import { ClipboardEntryTracker } from './lib/database/entryTracker.js';
import { ClipboardManager } from './lib/misc/clipboard.js';
import { NotificationManager } from './lib/misc/notifications.js';
import { ShortcutManager } from './lib/misc/shortcuts.js';
import { ThemeManager } from './lib/misc/theme.js';
import { WorkerClient } from './lib/misc/worker.js';
import { ClipboardDialog } from './lib/ui/clipboardDialog.js';
import { ClipboardIndicator } from './lib/ui/indicator.js';

export default class CopyousExtension extends Extension {
	public settings!: CopyousSettings;
	public logger!: ConsoleLike;

	public languages: Language[] = [];
	private processor: WorkerClient | undefined;
	private hljsMonitors: Gio.FileMonitor[] = [];
	private processorRetryAt = 0;
	private hljsCallbacks: Set<() => void> | undefined;

	public themeManager: ThemeManager | undefined;

	public clipboardDialog: ClipboardDialog | undefined;
	private indicator: ClipboardIndicator | undefined;

	private dbus: DbusService | undefined;

	public notificationManager: NotificationManager | undefined;
	private soundManager: SoundManager | undefined;

	public shortcutsManager: ShortcutManager | undefined;

	private entryTracker: ClipboardEntryTracker | undefined;
	private historyTimeoutId: number = -1;
	private updateHistory: boolean = false;

	public clipboardManager: ClipboardManager | undefined;
	private lifecycle = 0;
	private entryLoadId = 0;
	private entryLoadGeneration = 0;
	private historyGeneration = 0;
	private databaseShutdown: Promise<void> = Promise.resolve();

	override enable() {
		const lifecycle = ++this.lifecycle;
		this.settings = this.getSettings();
		migrateSettings(this.settings);

		this.logger = this.getLogger();
		const error = this.logger.error.bind(this.logger);

		// Highlight.js runs in a separate process.
		this.initHljs().catch(error);

		// Theme
		this.themeManager = new ThemeManager(this);

		// UI
		this.clipboardDialog = new ClipboardDialog(this);
		this.clipboardDialog.connectObject(
			'notify::opened',
			async () => {
				// Update the history when the dialog is closed and an update was scheduled while the dialog was open
				if (!this.clipboardDialog?.opened && this.updateHistory) {
					this.updateHistory = false;
					await this.entryTracker?.deleteOldest();
				}
			},
			'copy',
			async (_: unknown, entry: ClipboardEntry) => {
				await this.clipboardManager?.copyEntry(entry);
				this.indicator?.showEntry(entry);
			},
			'paste',
			async (_: unknown, entry: ClipboardEntry) => {
				await this.clipboardManager?.pasteEntry(entry);
				this.indicator?.showEntry(entry);
			},
			'clear-history',
			(_: unknown, history: ClipboardHistory) => this.entryTracker?.clear(history),
			this,
		);

		this.indicator = new ClipboardIndicator(this);
		this.indicator.connectObject(
			'open-dialog',
			() => this.clipboardDialog?.open(),
			'clear-history',
			(_: unknown, history: ClipboardHistory) => this.entryTracker?.clear(history),
			this,
		);

		// DBus
		this.dbus = new DbusService();
		this.dbus.connectObject(
			'toggle',
			() => this.clipboardDialog?.toggle(),
			'show',
			() => this.clipboardDialog?.open(),
			'hide',
			() => this.clipboardDialog?.close(),
			'clear-history',
			(_: unknown, history: ClipboardHistory | -1) => this.entryTracker?.clear(history === -1 ? null : history),
			this,
		);

		// Feedback
		this.notificationManager = new NotificationManager(this);
		tryCreateSoundManager(this)
			.then((soundManager) => {
				if (this.lifecycle !== lifecycle) soundManager?.destroy();
				else if (soundManager) this.soundManager = soundManager;
			})
			.catch(error);

		// Shortcuts
		this.shortcutsManager = new ShortcutManager(this, this.clipboardDialog);
		this.shortcutsManager.connectObject(
			'open-clipboard-dialog',
			() => this.clipboardDialog?.dialogShortcut(),
			'toggle-incognito-mode',
			() => this.indicator?.toggleIncognito(),
			this,
		);

		// Database
		this.entryTracker = new ClipboardEntryTracker(this);
		this.initEntryTracker().catch(error);
		this.initHistoryTimeout().catch(error);

		this.settings.connectObject(
			'changed::database-location',
			this.initEntryTracker.bind(this),
			'changed::database-backend',
			this.initEntryTracker.bind(this),
			'changed::history-time',
			this.initHistoryTimeout.bind(this),
			this,
		);

		// Clipboard Manager
		this.clipboardManager = new ClipboardManager(this, this.entryTracker);
		this.clipboardManager.connectObject(
			'clipboard',
			(_: unknown, entry: ClipboardEntry) => {
				this.clipboardDialog?.addEntry(entry);
				this.indicator?.showEntry(entry);
				this.indicator?.animate();
				this.notificationManager?.notification(entry).catch(error);
				this.soundManager?.playSound();
			},
			'text',
			(_: unknown, text: string) => {
				this.indicator?.showText(text);
				this.indicator?.animate();
				this.notificationManager?.textNotification(text);
				this.soundManager?.playSound();
			},
			'image',
			(_: unknown, image: Uint8Array, width: number, height: number) => {
				this.indicator?.showImageBytes(image);
				this.indicator?.animate();
				this.notificationManager?.imageNotification(image, width, height);
				this.soundManager?.playSound();
			},
			this,
		);
	}

	private async initHljs() {
		const lifecycle = this.lifecycle;
		try {
			this.processor ??= new WorkerClient(`${this.path}/worker.js`, 2000);
			const languages = await this.processor?.request<Language[]>('configure', {
				path: getHljsPath(this).get_uri(),
				languages: getHljsLanguages(this).map(([name, , , path]) => [name, path.get_uri()]),
			});
			if (lifecycle !== this.lifecycle) return;
			this.languages = languages ?? [];
			this.hljsCallbacks?.forEach((fn) => fn());
		} catch {
			/* Plain text remains available if the optional highlighter fails. */
		}
		if (lifecycle !== this.lifecycle || this.hljsMonitors.length) return;
		for (const file of [getHljsPath(this), getDataPath(this).get_child('languages')]) {
			const monitor = file.monitor(Gio.FileMonitorFlags.NONE, null);
			monitor.connectObject(
				'changed',
				(_monitor: unknown, _file: unknown, _other: unknown, event: Gio.FileMonitorEvent) => {
					if (event === Gio.FileMonitorEvent.CHANGES_DONE_HINT || event === Gio.FileMonitorEvent.DELETED) {
						this.initHljs().catch(() => {});
					}
				},
				this,
			);
			this.hljsMonitors.push(monitor);
		}
	}

	public async highlight(
		text: string,
		language: string | null = null,
		cancellable?: Gio.Cancellable,
	): Promise<HighlightResult | null> {
		if (!this.settings || cancellable?.is_cancelled()) return null;
		if (!this.processor) {
			if (GLib.get_monotonic_time() < this.processorRetryAt) return null;
			await this.initHljs();
		}
		const processor = this.processor;
		try {
			return (
				(await processor?.request<HighlightResult | null>('highlight', { text, language }, cancellable)) ?? null
			);
		} catch {
			if (!cancellable?.is_cancelled() && this.processor === processor) {
				processor?.destroy();
				this.processor = undefined;
				this.processorRetryAt = GLib.get_monotonic_time() + 30000000;
			}
			return null;
		}
	}

	public connectHljsInit(fn: () => void): () => void {
		this.hljsCallbacks ??= new Set();
		const callbacks = this.hljsCallbacks;
		callbacks.add(fn);
		return () => {
			callbacks.delete(fn);
		};
	}

	private async initEntryTracker() {
		if (!this.entryTracker || !this.entryTracker.shouldInit) return;
		const tracker = this.entryTracker;
		const generation = ++this.entryLoadGeneration;
		if (this.entryLoadId) GLib.source_remove(this.entryLoadId);
		this.entryLoadId = 0;

		this.clipboardDialog?.clearEntries();
		await this.databaseShutdown;
		if (generation !== this.entryLoadGeneration) return;
		const entries = await tracker.init();
		if (generation !== this.entryLoadGeneration || tracker !== this.entryTracker) return;
		let index = 0;
		this.entryLoadId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
			const deadline = GLib.get_monotonic_time() + 4000;
			do {
				const entry = entries[index++];
				if (entry && tracker.has(entry)) this.clipboardDialog?.addEntry(entry);
			} while (index < entries.length && GLib.get_monotonic_time() < deadline);
			if (index < entries.length) return GLib.SOURCE_CONTINUE;
			this.entryLoadId = 0;
			return GLib.SOURCE_REMOVE;
		});
	}

	private async initHistoryTimeout() {
		const lifecycle = this.lifecycle;
		const generation = ++this.historyGeneration;
		if (this.historyTimeoutId >= 0) GLib.source_remove(this.historyTimeoutId);
		this.historyTimeoutId = -1;

		const historyTime = this.settings?.get_int('history-time');
		if (historyTime === undefined || historyTime === 0) return;

		await this.entryTracker?.deleteOldest();
		if (lifecycle !== this.lifecycle || generation !== this.historyGeneration) return;
		this.historyTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
			// Do not update the history if the dialog is open
			this.updateHistory = this.clipboardDialog?.opened ?? false;
			if (this.updateHistory) return GLib.SOURCE_CONTINUE;

			if (this.entryTracker?.checkOldest()) {
				this.entryTracker?.deleteOldest().catch(this.logger.error.bind(this.logger));
			}

			return GLib.SOURCE_CONTINUE;
		});
	}

	override disable() {
		this.lifecycle++;
		this.entryLoadGeneration++;
		if (this.entryLoadId) GLib.source_remove(this.entryLoadId);
		this.entryLoadId = 0;
		// UI
		this.clipboardDialog?.disconnectObject(this);
		this.clipboardDialog?.destroy();
		this.indicator?.disconnectObject(this);
		this.indicator?.destroy();
		this.clipboardDialog = undefined;
		this.indicator = undefined;

		// Highlight.js
		this.processor?.destroy();
		this.processor = undefined;
		this.languages = [];
		for (const monitor of this.hljsMonitors) {
			monitor.disconnectObject(this);
			monitor.cancel();
		}
		this.hljsMonitors = [];
		this.processorRetryAt = 0;
		this.hljsCallbacks = undefined;

		// Theme
		this.themeManager?.destroy();
		this.themeManager = undefined;

		// DBus
		this.dbus?.disconnectObject(this);
		this.dbus?.destroy();
		this.dbus = undefined;

		// Feedback
		this.notificationManager?.destroy();
		this.notificationManager = undefined;
		this.soundManager?.destroy();
		this.soundManager = undefined;

		// Shortcuts
		this.shortcutsManager?.disconnectObject(this);
		this.shortcutsManager?.destroy();
		this.shortcutsManager = undefined;

		// Database
		const error = this.logger.error.bind(this.logger);
		this.databaseShutdown = this.entryTracker?.destroy().catch(error) ?? Promise.resolve();
		this.entryTracker = undefined;

		if (this.historyTimeoutId >= 0) GLib.source_remove(this.historyTimeoutId);
		this.historyTimeoutId = -1;

		// Clipboard Manager
		this.clipboardManager?.disconnectObject(this);
		this.clipboardManager?.destroy();
		this.clipboardManager = undefined;

		// Globals
		this.settings?.disconnectObject(this);
		this.settings = undefined!;
		this.logger = undefined!;
	}

	/* DEBUG-ONLY */
	override getSettings(schema?: string): Gio.Settings & CopyousSettings {
		try {
			const environment = GLib.get_environ();
			const settings = GLib.environ_getenv(environment, 'DEBUG_COPYOUS_SCHEMA');
			if (settings) {
				this.getLogger().log('Using debug schema');
				schema ??= this.metadata['settings-schema'] + '.debug';
			}

			return super.getSettings(schema) as Gio.Settings & CopyousSettings;
		} catch {
			// Fallback for when debug schema does not exist
			return super.getSettings() as Gio.Settings & CopyousSettings;
		}
	}
}
