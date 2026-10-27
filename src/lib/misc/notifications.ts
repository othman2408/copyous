import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import { gettext as _, ngettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import type CopyousExtension from '../../extension.js';
import { ItemType } from '../common/constants.js';
import { registerClass } from '../common/gjs.js';
import { Icon, loadIcon } from '../common/icons.js';
import { previewText } from '../common/preview.js';
import { ClipboardEntry } from '../database/database.js';
import { normalizeIndentation, trim } from '../ui/components/label.js';
import { commonDirectory } from '../ui/items/filesItem.js';
import { runMediaWorker } from './mediaWorker.js';

@registerClass()
export class NotificationManager extends GObject.Object {
	private readonly cancellable = new Gio.Cancellable();
	private _source: MessageTray.Source | null = null;

	constructor(private ext: CopyousExtension) {
		super();
	}

	private get source() {
		if (this._source) return this._source;

		this._source = new MessageTray.Source({
			title: this.ext.metadata.name,
			icon: loadIcon(this.ext, Icon.Clipboard),
		});

		this._source.connect('destroy', () => (this._source = null));
		Main.messageTray.add(this._source);
		return this._source;
	}

	public warning(title: string, body: string, ...actions: [label: string, callback: () => void][]) {
		const source = this.source;
		const notification = new MessageTray.Notification({
			source,
			title,
			body,
			gicon: loadIcon(this.ext, Icon.Warning),
		});

		for (const [label, callback] of actions) {
			notification.addAction(label, callback);
		}

		source.addNotification(notification);
	}

	public textNotification(text: string) {
		if (!this.ext.settings.get_boolean('send-notification')) return;

		const source = this.source;
		const notification = new MessageTray.Notification({
			source,
			title: _('Copied Text'),
			body: previewText(text),
			gicon: loadIcon(this.ext, Icon.Text),
			isTransient: true,
		});
		source.addNotification(notification);
	}

	public imageNotification(_bytes: GLib.Bytes | Uint8Array, width: number, height: number) {
		if (!this.ext.settings.get_boolean('send-notification')) return;

		const gicon = loadIcon(this.ext, Icon.Image);
		const source = this.source;
		const notification = new MessageTray.Notification({
			source,
			title: _('Copied Image'),
			body: _('Size: %d×%d px').format(width, height),
			gicon,
			isTransient: true,
		});
		source.addNotification(notification);
	}

	public async notification(entry: ClipboardEntry) {
		if (!this.ext.settings.get_boolean('send-notification')) return;

		let title: string;
		let body: string | null = normalizeIndentation(trim(previewText(entry.content)), 4);
		let gicon: Gio.Icon;
		switch (entry.type) {
			case ItemType.Text:
				title = _('Copied Text');
				gicon = loadIcon(this.ext, Icon.Text);
				break;
			case ItemType.Code:
				title = _('Copied Code');
				gicon = loadIcon(this.ext, Icon.Code);
				break;
			case ItemType.Image: {
				title = _('Copied Image');
				gicon = loadIcon(this.ext, Icon.Image);
				try {
					const [width, height] = await runMediaWorker<[number, number]>(
						this.ext,
						'image-info',
						entry.content,
						this.cancellable,
					);
					if (this.cancellable.is_cancelled()) return;
					body = _('Size: %d×%d px').format(width, height);
				} catch {
					return;
				}
				break;
			}
			case ItemType.File:
			case ItemType.Files: {
				const files = entry.content.split('\n').map((f) => Gio.file_new_for_uri(f));
				const common = files.length === 1 ? files[0]! : commonDirectory(files);

				title = ngettext('Copied %d File', 'Copied %d Files', files.length).format(files.length);
				body = common.get_path() ?? '';
				gicon = loadIcon(this.ext, files.length === 1 ? Icon.File : Icon.Folder);
				break;
			}
			case ItemType.Link:
				title = _('Copied Link');
				gicon = loadIcon(this.ext, Icon.Link);
				break;
			case ItemType.Character:
				title = _('Copied Character');
				gicon = loadIcon(this.ext, Icon.Character);
				break;
			case ItemType.Color:
				title = _('Copied Color');
				gicon = loadIcon(this.ext, Icon.Color);
				break;
		}

		const source = this.source;
		const notification = new MessageTray.Notification({ source, title, body, gicon, isTransient: true });
		source.addNotification(notification);
	}

	public destroy(): void {
		this.cancellable.cancel();
		this._source?.destroy(MessageTray.NotificationDestroyedReason.SOURCE_CLOSED);
		this._source = null;
	}
}
