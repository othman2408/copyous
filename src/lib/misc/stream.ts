import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async');
Gio._promisify(Gio.InputStream.prototype, 'close_async');

/** Read a bounded response and always release its file descriptor/pipe. */
export async function readBounded(
	stream: Gio.InputStream,
	limit: number,
	cancellable: Gio.Cancellable,
	truncate: boolean = false,
): Promise<Uint8Array> {
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		while (true) {
			if (truncate && length === limit) break;
			// Reads are deliberately sequential, with at most one chunk in flight.
			// oxlint-disable-next-line no-await-in-loop
			const bytes = await stream.read_bytes_async(
				Math.min(65536, limit - length + (truncate ? 0 : 1)),
				GLib.PRIORITY_DEFAULT,
				cancellable,
			);
			const chunk = bytes.toArray();
			if (chunk.length === 0) break;
			length += chunk.length;
			if (length > limit) throw new Error(`Response exceeds ${limit} bytes`);
			chunks.push(chunk);
		}
		const result = new Uint8Array(length);
		let offset = 0;
		for (const chunk of chunks) {
			result.set(chunk, offset);
			offset += chunk.length;
		}
		return result;
	} finally {
		// A cancelled operation still needs to close its stream.
		await stream.close_async(GLib.PRIORITY_DEFAULT, null);
	}
}
