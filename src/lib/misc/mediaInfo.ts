import Gio from 'gi://Gio';
import Gst from 'gi://Gst';

import { delay } from './delay.js';

/** Called only in the disposable media process, never in Shell. */
export async function mediaDuration(uri: string): Promise<number | null> {
	let pipeline: Gst.Element | null = null;
	try {
		if (!Gst.is_initialized()) Gst.init([]);
		pipeline = Gst.parse_launch('uridecodebin name=source');
		pipeline.set_property('uri', uri);
		pipeline.set_state(Gst.State.PAUSED);
		let [success, duration] = pipeline.query_duration(Gst.Format.TIME);
		if (!success) {
			pipeline.set_state(Gst.State.PLAYING);
			for (let i = 0; i < 6 && !success; i++) {
				// oxlint-disable-next-line no-await-in-loop
				await delay(50, new Gio.Cancellable());
				[success, duration] = pipeline.query_duration(Gst.Format.TIME);
			}
		}
		return success && duration >= 0 ? duration / (Gst.SECOND as unknown as number) : null;
	} finally {
		pipeline?.set_state(Gst.State.NULL);
	}
}
