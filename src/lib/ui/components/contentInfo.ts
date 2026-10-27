import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';

import { Extension, gettext as _, ngettext } from 'resource:///org/gnome/shell/extensions/extension.js';

import type CopyousExtension from '../../../extension.js';
import { enumParamSpec, registerClass } from '../../common/gjs.js';
import { Icon, loadIcon } from '../../common/icons.js';
import { TextCountMode } from '../../common/settings.js';
import { runMediaWorker } from '../../misc/mediaWorker.js';
import { FileType } from './contentPreview.js';

function formatBytes(bytes: number): [string, string] {
	const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
	const exp = Math.floor(Math.log10(bytes) / 3);
	const value = (bytes / Math.pow(1000, exp)) % 1000;
	const formatted = value.toLocaleString('en', { maximumSignificantDigits: 2 });

	return [formatted, units[exp]!];
}

function formatTime(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);

	let res = '';
	if (h > 0) res += _('%dh').format(h) + ' ';
	if (m > 0) res += _('%dm').format(m) + ' ';
	res += _('%ds').format(s);

	return res;
}

@registerClass()
export class ContentInfo extends St.BoxLayout {
	protected left: St.BoxLayout;
	protected right: St.BoxLayout;

	constructor() {
		super({
			style_class: 'content-info',
			x_expand: true,
		});

		this.left = new St.BoxLayout({
			style_class: 'content-info-left',
			x_align: Clutter.ActorAlign.START,
			x_expand: true,
		});
		this.add_child(this.left);

		this.right = new St.BoxLayout({
			style_class: 'content-info-right',
			x_align: Clutter.ActorAlign.END,
		});
		this.add_child(this.right);
	}
}

@registerClass({
	Properties: {
		'text': GObject.ParamSpec.string('text', null, null, GObject.ParamFlags.WRITABLE, ''),
		'text-count-mode': enumParamSpec('text-count-mode', GObject.ParamFlags.WRITABLE, TextCountMode, 0),
	},
})
export class TextInfo extends ContentInfo {
	private readonly _countLabel: St.Label;

	private _text: string;
	private _textCountMode: TextCountMode;
	private _countSource = 0;

	constructor(text: string, textCountMode: TextCountMode) {
		super();

		this._countLabel = new St.Label();
		this.left.add_child(this._countLabel);

		this._text = text;
		this._textCountMode = textCountMode;
		this.connect('notify::mapped', () => this.updateCount());
		this.connect('destroy', () => {
			if (this._countSource) GLib.source_remove(this._countSource);
			this._countSource = 0;
		});
		this.updateCount();
	}

	set text(text: string) {
		if (this._text === text) return;
		this._text = text;
		this.updateCount();
	}

	set textCountMode(countMode: TextCountMode) {
		if (this._textCountMode === countMode) return;
		this._textCountMode = countMode;
		this.updateCount();
	}

	private updateCount() {
		if (this._countSource) GLib.source_remove(this._countSource);
		this._countSource = 0;
		if (!this.mapped) return;
		const mode = this._textCountMode;
		const text = this._text;
		const iterator =
			mode === TextCountMode.Lines
				? null
				: new Intl.Segmenter(undefined, {
						granularity: mode === TextCountMode.Words ? 'word' : 'grapheme',
					})
						.segment(text)
						[Symbol.iterator]();
		let count = mode === TextCountMode.Lines ? 1 : 0;
		let offset = 0;
		this._countLabel.text = '…';
		this._countSource = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
			const deadline = GLib.get_monotonic_time() + 2000;
			let done: boolean;
			do {
				if (iterator) {
					const next = iterator.next();
					done = next.done ?? false;
					if (!done && (mode !== TextCountMode.Words || next.value?.isWordLike)) count++;
				} else {
					const end = Math.min(offset + 4096, text.length);
					for (; offset < end; offset++) if (text[offset] === '\n') count++;
					done = offset === text.length;
				}
			} while (!done && GLib.get_monotonic_time() < deadline);
			if (!done) return GLib.SOURCE_CONTINUE;
			this._countSource = 0;
			const label =
				mode === TextCountMode.Characters
					? ngettext('%d char', '%d chars', count)
					: mode === TextCountMode.Words
						? ngettext('%d word', '%d words', count)
						: ngettext('%d line', '%d lines', count);
			this._countLabel.text = label.format(count);
			return GLib.SOURCE_REMOVE;
		});
	}
}

@registerClass({
	Properties: {
		language: GObject.ParamSpec.string('language', null, null, GObject.ParamFlags.WRITABLE, null),
	},
})
export class CodeInfo extends TextInfo {
	private readonly _languageLabel: St.Label;

	constructor(text: string, textCountMode: TextCountMode, language: string | null) {
		super(text, textCountMode);

		this._languageLabel = new St.Label({
			style_class: 'language',
			text: language ?? '',
		});
		this.right.add_child(this._languageLabel);
	}

	set language(language: string | null) {
		this._languageLabel.text = language ?? '';
	}
}

@registerClass()
export class FileInfo extends ContentInfo {
	constructor(size: number | null = null) {
		super();

		this.add_style_class_name('file-info');

		if (size !== null) {
			const [value, unit] = formatBytes(size);

			const sizeBox = new St.BoxLayout({ style_class: 'file-info-size' });
			sizeBox.add_child(new St.Label({ style_class: 'content-info-number', text: value }));
			sizeBox.add_child(
				new St.Label({
					style_class: 'file-info-unit',
					text: unit,
					y_align: Clutter.ActorAlign.END,
				}),
			);
			this.left.add_child(sizeBox);
		}
	}
}

@registerClass()
export class MissingFileInfo extends FileInfo {
	constructor(ext: Extension) {
		super();

		this.add_style_class_name('missing-info');

		this.left.add_child(new St.Icon({ gicon: loadIcon(ext, Icon.Warning) }));
		this.left.add_child(new St.Label({ text: _('Missing File') }));
	}
}

@registerClass()
export class ErrorFileInfo extends FileInfo {
	constructor(ext: Extension) {
		super();

		this.add_style_class_name('error-info');

		this.left.add_child(new St.Icon({ gicon: loadIcon(ext, Icon.Warning) }));
		this.left.add_child(new St.Label({ text: _('Error') }));
	}
}

@registerClass()
export class DirectoryInfo extends FileInfo {
	constructor(ext: Extension, directoryCount: number, fileCount: number) {
		super();

		this.add_style_class_name('directory-info');

		const directories = new St.BoxLayout({ style_class: 'directory-count' });
		directories.add_child(new St.Icon({ gicon: loadIcon(ext, Icon.Folder) }));
		directories.add_child(new St.Label({ style_class: 'content-info-number', text: directoryCount.toString() }));
		this.left.add_child(directories);

		const files = new St.BoxLayout({ style_class: 'file-count' });
		files.add_child(new St.Icon({ gicon: loadIcon(ext, Icon.File) }));
		files.add_child(new St.Label({ style_class: 'content-info-number', text: fileCount.toString() }));
		this.left.add_child(files);
	}
}

@registerClass()
export class ImageInfo extends FileInfo {
	constructor(size: number, width: number, height: number) {
		super(size);

		this.add_style_class_name('image-info');

		const dimensions = new St.BoxLayout({ style_class: 'image-dimensions' });
		dimensions.add_child(new St.Label({ text: `${width}×${height}` }));
		this.right.add_child(dimensions);
	}
}

@registerClass()
export class MediaInfo extends FileInfo {
	constructor(ext: Extension, size: number, seconds: number) {
		super(size);

		this.add_style_class_name('media-info');

		const duration = new St.BoxLayout({ style_class: 'media-duration', y_align: Clutter.ActorAlign.END });
		duration.add_child(new St.Icon({ gicon: loadIcon(ext, Icon.Duration) }));
		duration.add_child(new St.Label({ text: formatTime(seconds) }));
		this.right.add_child(duration);
	}
}

Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'close_async');

export async function tryCreateDirectoryFileInfo(
	ext: Extension,
	file: Gio.File,
	cancellable: Gio.Cancellable,
): Promise<DirectoryInfo | null> {
	try {
		const enumerator = await file.enumerate_children_async(
			'standard::type',
			Gio.FileQueryInfoFlags.NONE,
			GLib.PRIORITY_DEFAULT,
			cancellable,
		);
		let directoryCount = 0;
		let fileCount = 0;
		try {
			while (!cancellable.is_cancelled()) {
				// oxlint-disable-next-line no-await-in-loop
				const files = await enumerator.next_files_async(64, GLib.PRIORITY_DEFAULT, cancellable);
				if (files.length === 0) break;
				for (const f of files) {
					if (f.get_file_type() === Gio.FileType.DIRECTORY) directoryCount++;
					else if (f.get_file_type() === Gio.FileType.REGULAR) fileCount++;
				}
			}
		} finally {
			await enumerator.close_async(GLib.PRIORITY_DEFAULT, null);
		}

		return new DirectoryInfo(ext, directoryCount, fileCount);
	} catch {
		return null;
	}
}

export async function tryCreateImageInfo(
	ext: Extension,
	file: Gio.File,
	size: number,
	cancellable: Gio.Cancellable,
): Promise<ImageInfo | null> {
	try {
		const [width, height] = await runMediaWorker<[number, number]>(ext, 'image-info', file.get_uri(), cancellable);
		if (cancellable.is_cancelled()) return null;
		return new ImageInfo(size, width, height);
	} catch {
		return null;
	}
}

export async function tryCreateMediaFileInfo(
	ext: CopyousExtension,
	file: Gio.File,
	size: number,
	cancellable: Gio.Cancellable,
): Promise<MediaInfo | null> {
	try {
		const duration = await runMediaWorker<number | null>(ext, 'media-info', file.get_uri(), cancellable);
		return duration === null || cancellable.is_cancelled() ? null : new MediaInfo(ext, size, duration);
	} catch {
		return null;
	}
}

export async function createFileInfo(
	ext: CopyousExtension,
	file: Gio.File,
	fileType: FileType,
	cancellable: Gio.Cancellable,
): Promise<FileInfo> {
	try {
		const info = await file.query_info_async(
			Gio.FILE_ATTRIBUTE_STANDARD_SIZE,
			Gio.FileQueryInfoFlags.NONE,
			GLib.PRIORITY_DEFAULT,
			cancellable,
		);
		const size = info.get_size();

		let fileInfo: FileInfo | null = null;
		switch (fileType) {
			case FileType.Directory:
				fileInfo = await tryCreateDirectoryFileInfo(ext, file, cancellable);
				break;
			case FileType.Image:
				fileInfo = await tryCreateImageInfo(ext, file, size, cancellable);
				break;
			case FileType.Audio:
			case FileType.Video:
				fileInfo = await tryCreateMediaFileInfo(ext, file, size, cancellable);
				break;
		}

		return fileInfo ?? new FileInfo(size);
	} catch (error) {
		if (error instanceof GLib.Error && error.matches(Gio.io_error_quark(), Gio.IOErrorEnum.NOT_FOUND))
			return new MissingFileInfo(ext);
		return new ErrorFileInfo(ext);
	}
}
