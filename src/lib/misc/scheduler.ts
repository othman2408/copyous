import GLib from 'gi://GLib';

/** Bound batches of GObject creation/signal work that must stay in Shell. */
export async function forEachCooperatively<T>(items: Iterable<T>, callback: (item: T) => void): Promise<void> {
	let deadline = GLib.get_monotonic_time() + 4000;
	for (const item of items) {
		callback(item);
		if (GLib.get_monotonic_time() < deadline) continue;
		// Signal attachment and teardown are ordered; yield between batches, not within an entry.
		// eslint-disable-next-line no-await-in-loop
		await new Promise<void>((resolve) => {
			GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
				resolve();
				return GLib.SOURCE_REMOVE;
			});
		});
		deadline = GLib.get_monotonic_time() + 4000;
	}
}
