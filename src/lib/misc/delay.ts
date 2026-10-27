import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export function delay(milliseconds: number, cancellable: Gio.Cancellable): Promise<void> {
	if (cancellable.is_cancelled()) return Promise.resolve();
	let sourceId = 0;
	let cancelId = 0;
	return new Promise<void>((resolve) => {
		sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, milliseconds, () => {
			sourceId = 0;
			resolve();
			return GLib.SOURCE_REMOVE;
		});
		cancelId = cancellable.connect(() => {
			if (sourceId) GLib.source_remove(sourceId);
			sourceId = 0;
			resolve();
		});
	}).finally(() => {
		if (cancelId) cancellable.disconnect(cancelId);
	});
}
