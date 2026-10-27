import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';

const PREVIEW_TARGET_EDGE = 1024;
Gio._promisify(Gio.File.prototype, 'query_info_async');
Gio._promisify(Gio.File.prototype, 'read_async');
Gio._promisify(Gio.File.prototype, 'replace_async');
Gio._promisify(Gio.InputStream.prototype, 'close_async');
Gio._promisify(Gio.OutputStream.prototype, 'close_async');

export function imageSize(file: Gio.File, cancellable: Gio.Cancellable): Promise<[number, number]> {
	return new Promise<[number, number]>((resolve, reject: (error: Error) => void) => {
		GdkPixbuf.Pixbuf.get_file_info_async(file.get_path()!, cancellable, (_source, result) => {
			try {
				const [format, w, h] = GdkPixbuf.Pixbuf.get_file_info_finish(result);
				if (!format || w <= 0 || h <= 0) throw new Error('Invalid image');
				resolve([w, h]);
			} catch (error) {
				reject(error as Error);
			}
		});
	});
}

/** Decode and encode on GdkPixbuf's worker threads, keeping full-size textures out of Shell. */
export async function getSafePreviewFile(
	cache: Gio.File,
	image: Gio.File,
	cancellable: Gio.Cancellable,
	temporaryName: string,
): Promise<[Gio.File, number]> {
	if (cancellable.is_cancelled()) throw new Error('Preview cancelled');
	const info = await image.query_info_async(
		'standard::size,time::modified,time::modified-usec',
		Gio.FileQueryInfoFlags.NONE,
		GLib.PRIORITY_DEFAULT,
		cancellable,
	);
	const key = GLib.compute_checksum_for_string(
		GLib.ChecksumType.MD5,
		`${image.get_uri()}:${info.get_size()}:${info.get_attribute_uint64('time::modified')}:${info.get_attribute_uint32('time::modified-usec')}`,
		-1,
	);
	const previewDir = cache;
	if (!previewDir.query_exists(cancellable)) previewDir.make_directory_with_parents(cancellable);
	const preview = previewDir.get_child(`${key}-${PREVIEW_TARGET_EDGE}.png`);
	if (preview.query_exists(cancellable)) {
		try {
			const [w, h] = await imageSize(preview, cancellable);
			if (w <= PREVIEW_TARGET_EDGE && h <= PREVIEW_TARGET_EDGE) return [preview, h / w];
		} catch {
			/* Rebuild an incomplete or corrupt cache entry. */
		}
		preview.delete(cancellable);
	}
	const [width, height] = await imageSize(image, cancellable);
	if (width <= PREVIEW_TARGET_EDGE && height <= PREVIEW_TARGET_EDGE) return [image, height / width];

	if (!preview.query_exists(cancellable)) {
		const stream = await image.read_async(GLib.PRIORITY_DEFAULT, cancellable);
		let pixbuf: GdkPixbuf.Pixbuf;
		try {
			pixbuf = await new Promise<GdkPixbuf.Pixbuf>((resolve, reject: (error: Error) => void) => {
				GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(
					stream,
					PREVIEW_TARGET_EDGE,
					PREVIEW_TARGET_EDGE,
					true,
					cancellable,
					(_source, result) => {
						try {
							resolve(GdkPixbuf.Pixbuf.new_from_stream_finish(result));
						} catch (error) {
							reject(error as Error);
						}
					},
				);
			});
		} finally {
			await stream.close_async(GLib.PRIORITY_DEFAULT, null);
		}
		const temporary = previewDir.get_child(temporaryName);
		try {
			const out = await temporary.replace_async(
				null,
				false,
				Gio.FileCreateFlags.REPLACE_DESTINATION,
				GLib.PRIORITY_DEFAULT,
				cancellable,
			);
			try {
				await new Promise<void>((resolve, reject: (error: Error) => void) => {
					pixbuf.save_to_streamv_async(out, 'png', [], [], cancellable, (_source, result) => {
						try {
							GdkPixbuf.Pixbuf.save_to_stream_finish(result);
							resolve();
						} catch (error) {
							reject(error as Error);
						}
					});
				});
			} finally {
				await out.close_async(GLib.PRIORITY_DEFAULT, null);
			}
			// Publish only a complete image. A cancelled or concurrent encoder owns only its temporary file.
			temporary.move(preview, Gio.FileCopyFlags.OVERWRITE, cancellable, null);
		} finally {
			if (temporary.query_exists(null)) temporary.delete(null);
		}
	}
	return [preview, height / width];
}
