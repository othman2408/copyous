import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import type CopyousExtension from '../../../extension.js';
import { ActiveState, getCachePath } from '../../common/constants.js';
import { enumParamSpec, flagsParamSpec, registerClass } from '../../common/gjs.js';
import { Icon, loadIcon } from '../../common/icons.js';
import { BackgroundSize, FilePreviewType } from '../../common/settings.js';
import { runMediaWorker } from '../../misc/mediaWorker.js';
import { CodeLabel, CodeLabelConstructorProps } from './codeLabel.js';

export const FileType = {
	Unknown: 'Unknown',
	Directory: 'Directory',
	Text: 'Text',
	Image: 'Image',
	Audio: 'Audio',
	Video: 'Video',
} as const;

export type FileType = (typeof FileType)[keyof typeof FileType];

@registerClass()
export class ContentPreview extends St.BoxLayout {
	constructor() {
		super({
			style_class: 'content-preview',
			orientation: Clutter.Orientation.VERTICAL,
			x_expand: true,
			y_expand: true,
		});
	}
}

Gio._promisify(Gio.InputStream.prototype, 'close_async');
Gio._promisify(Gio.File.prototype, 'delete_async');

/** Disposable workers isolate image decoders and release their working memory on exit. */
async function getSafePreviewFile(
	ext: Extension,
	image: Gio.File,
	cancellable: Gio.Cancellable,
): Promise<[Gio.File, number]> {
	if (cancellable.is_cancelled()) throw new Error('Preview cancelled');
	const cache = getCachePath(ext).get_child('previews');
	const temporaryName = `${GLib.uuid_string_random()}.tmp`;
	try {
		const result = await runMediaWorker<[string, number]>(
			ext,
			'image',
			{ uri: image.get_uri(), cache: cache.get_uri(), temporaryName },
			cancellable,
		);
		return [Gio.File.new_for_uri(result[0]), result[1]];
	} finally {
		// The child has exited before unfinished output is removed.
		await cache
			.get_child(temporaryName)
			.delete_async(GLib.PRIORITY_DEFAULT, null)
			.catch(() => {});
	}
}

@registerClass({
	Properties: {
		'background-size': enumParamSpec(
			'background-size',
			GObject.ParamFlags.READWRITE,
			BackgroundSize,
			BackgroundSize.Cover,
		),
		'active': flagsParamSpec('active', GObject.ParamFlags.WRITABLE, ActiveState, ActiveState.None),
	},
})
export class ImagePreview extends ContentPreview {
	private _backgroundSize: BackgroundSize = BackgroundSize.Cover;
	private _ratio: number | null = null;
	private readonly _cancellable = new Gio.Cancellable();
	private _started = false;
	private _effect?: Clutter.BrightnessContrastEffect;

	constructor(ext: Extension, image: Gio.File) {
		super();

		this.connect('destroy', () => this.cleanupImagePreview());

		this.add_style_class_name('image-preview');

		// Hidden history should not start image decoding during startup or copying.
		this.connect('notify::mapped', () => {
			if (!this.mapped || this._started) return;
			this._started = true;
			this.load(ext, image).catch(() => {});
		});
	}

	private async load(ext: Extension, image: Gio.File) {
		try {
			const [preview, ratio] = await getSafePreviewFile(ext, image, this._cancellable);
			if (this._cancellable.is_cancelled()) return;
			this._ratio = ratio;
			const imageBox = new St.Widget({
				style_class: 'image-box',
				x_expand: true,
				y_expand: true,
				style: `background-image: url("${preview.get_uri()}");`,
			});
			this.add_child(imageBox);
			this._effect = new Clutter.BrightnessContrastEffect();
			imageBox.add_effect(this._effect);
			this.queue_relayout();
		} catch {
			if (this._cancellable.is_cancelled()) return;
			this.add_style_class_name('missing-image');
			this.add_child(
				new St.Icon({
					gicon: loadIcon(ext, Icon.MissingImage),
					x_align: Clutter.ActorAlign.CENTER,
					y_align: Clutter.ActorAlign.CENTER,
					x_expand: true,
					y_expand: true,
					min_height: 0,
				}),
			);
		}
	}

	private cleanupImagePreview(): void {
		this._cancellable.cancel();
	}

	get backgroundSize() {
		return this._backgroundSize;
	}

	set backgroundSize(backgroundSize: BackgroundSize) {
		this._backgroundSize = backgroundSize;
		this.notify('background-size');

		if (backgroundSize === BackgroundSize.Cover) {
			this.remove_style_class_name('contain');
		} else {
			this.add_style_class_name('contain');
		}
	}

	set active(active: ActiveState) {
		if (!this._effect) return;

		if ((active & ActiveState.Active) > 0) {
			this._effect.set_brightness(0.2);
		} else if ((active & ActiveState.FocusHover) === (ActiveState.FocusHover as number)) {
			this._effect.set_brightness(0.1);
		} else if (active & ActiveState.Focus || active & ActiveState.Hover) {
			this._effect.set_brightness(0.05);
		} else {
			this._effect.enabled = false;
			return;
		}

		this._effect.enabled = true;
	}

	override vfunc_get_preferred_height(for_width: number): [number, number] {
		if (this._ratio === null) return super.vfunc_get_preferred_height(for_width);

		const [min] = super.vfunc_get_preferred_height(for_width);
		return [min, Math.round(for_width * Math.clamp(this._ratio, 0.3, 1))];
	}
}

@registerClass()
export class ThumbnailPreview extends ImagePreview {}

@registerClass({
	Properties: {
		'syntax-highlighting': GObject.ParamSpec.boolean(
			'syntax-highlighting',
			null,
			null,
			GObject.ParamFlags.READWRITE,
			true,
		),
		'show-line-numbers': GObject.ParamSpec.boolean(
			'show-line-numbers',
			null,
			null,
			GObject.ParamFlags.READWRITE,
			true,
		),
		'tab-width': GObject.ParamSpec.int('tab-width', null, null, GObject.ParamFlags.READWRITE, 1, 8, 4),
	},
})
export class TextPreview extends ContentPreview {
	declare syntaxHighlighting: boolean;
	declare showLineNumbers: boolean;
	declare tabWidth: number;

	constructor(ext: CopyousExtension, text: string, language?: string) {
		super();

		this.add_style_class_name('text-preview');

		const props: Partial<CodeLabelConstructorProps> = { code: text };
		if (language) props.language = { id: language, name: language };
		const label = new CodeLabel(ext, props);
		this.add_child(label);

		this.bind_property('syntax-highlighting', label, 'syntax-highlighting', GObject.BindingFlags.DEFAULT);
		this.bind_property('show-line-numbers', label, 'show-line-numbers', GObject.BindingFlags.DEFAULT);
		this.bind_property('tab-width', label, 'tab-width', GObject.BindingFlags.DEFAULT);
	}
}

Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.File.prototype, 'read_async');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async');

/**
 * Creates a text preview by reading the first 4096 bytes
 * @returns The text preview
 */
async function createTextPreview(
	ext: CopyousExtension,
	file: Gio.File,
	cancellable: Gio.Cancellable | null,
): Promise<TextPreview> {
	const extension = file.get_uri().match(/\.(\w+)$/)?.[1];
	const stream = await file.read_async(GLib.PRIORITY_DEFAULT, cancellable);
	try {
		const bytes = await stream.read_bytes_async(4096, GLib.PRIORITY_DEFAULT, cancellable);
		const text = new TextDecoder().decode(bytes.toArray());
		return new TextPreview(ext, text, extension);
	} finally {
		await stream.close_async(GLib.PRIORITY_DEFAULT, null);
	}
}

/**
 * Gets the file type for a file
 * @param file The file to find the file type for
 * @returns The file type and a Gio.File if a thumbnail was found for the file
 */
export async function getFileType(
	file: Gio.File,
	cancellable: Gio.Cancellable | null = null,
): Promise<[FileType, Gio.File | null]> {
	let info: Gio.FileInfo;
	try {
		info = await file.query_info_async(
			'standard::type,standard::content-type,thumbnail::path,thumbnail::is-valid',
			Gio.FileQueryInfoFlags.NONE,
			GLib.PRIORITY_DEFAULT,
			cancellable,
		);
	} catch {
		return [FileType.Unknown, null];
	}
	const fileType = info.get_file_type();
	if (fileType === Gio.FileType.DIRECTORY) return [FileType.Directory, null];
	if (fileType !== Gio.FileType.REGULAR) return [FileType.Unknown, null];
	const thumbnailPath = info.get_attribute_byte_string('thumbnail::path');
	const thumbnail =
		thumbnailPath && info.get_attribute_boolean('thumbnail::is-valid')
			? Gio.File.new_for_path(thumbnailPath)
			: null;
	const contentType = info.get_content_type();
	if (!contentType) return [FileType.Unknown, thumbnail];

	// Check image before text since svg is also classified as text/plain
	if (Gio.content_type_is_a(contentType, 'image/*')) return [FileType.Image, thumbnail];
	if (Gio.content_type_is_a(contentType, 'audio/*')) return [FileType.Audio, thumbnail];
	if (Gio.content_type_is_a(contentType, 'video/*')) return [FileType.Video, thumbnail];
	if (Gio.content_type_is_a(contentType, 'text/plain')) return [FileType.Text, thumbnail];

	return [FileType.Unknown, thumbnail];
}

/**
 * Try to create a file preview for a file type
 * @param ext The extension
 * @param file The file to create a preview for
 * @param fileType The type of the file
 * @param thumbnail The thumbnail of the file if it exists
 * @returns the created file preview or null if either the file preview could not be created or if it is not allowed
 */
export async function tryCreateFilePreview(
	ext: CopyousExtension,
	file: Gio.File,
	fileType: FileType,
	thumbnail: Gio.File | null,
	cancellable: Gio.Cancellable | null = null,
): Promise<ContentPreview | null> {
	const allowedTypes = ext.settings.get_child('file-item').get_flags('file-preview-types');

	try {
		if (cancellable?.is_cancelled()) return null;

		switch (fileType) {
			case FileType.Text:
				return allowedTypes & FilePreviewType.Text ? await createTextPreview(ext, file, cancellable) : null;
			case FileType.Image:
				return allowedTypes & FilePreviewType.Image ? new ImagePreview(ext, file) : null;
		}

		return thumbnail && allowedTypes & FilePreviewType.Thumbnail ? new ThumbnailPreview(ext, thumbnail) : null;
	} catch (error) {
		if (!cancellable?.is_cancelled()) ext.logger.error(error);
		return null;
	}
}
