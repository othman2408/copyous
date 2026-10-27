import Gio from 'gi://Gio';

import type { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { WorkQueue } from '../common/workQueue.js';
import { WorkerClient } from './worker.js';

const queue = new WorkQueue(2);

/** Bound all optional media decoders together, including metadata probes. */
export function runMediaWorker<T>(
	ext: Extension,
	method: string,
	args: unknown,
	cancellable: Gio.Cancellable,
): Promise<T> {
	return queue.run(async () => {
		if (cancellable.is_cancelled()) throw new Error('Media work cancelled');
		const worker = new WorkerClient(`${ext.path}/worker.js`, 15000);
		const signal = cancellable.connect(() => worker.destroy());
		try {
			return await worker.request<T>(method, args, cancellable);
		} finally {
			cancellable.disconnect(signal);
			worker.destroy();
			await worker.waitForExit();
		}
	});
}
