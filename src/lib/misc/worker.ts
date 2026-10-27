import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

/** Private pipes: clipboard contents never appear in process arguments or on D-Bus. */
export class WorkerClient {
	private process: Gio.Subprocess;
	private input: Gio.DataInputStream;
	private output: Gio.OutputStream;
	private cancellable = new Gio.Cancellable();
	private tail: Promise<unknown> = Promise.resolve();
	private stopped = false;
	private queuedBytes = 0;
	private exited: Promise<void> = Promise.resolve();

	constructor(
		path: string,
		private timeout = 30000,
	) {
		this.process = Gio.Subprocess.new(
			['gjs', '-m', path],
			Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE,
		);
		this.input = new Gio.DataInputStream({ base_stream: this.process.get_stdout_pipe()! });
		this.output = this.process.get_stdin_pipe()!;
	}

	request<T>(method: string, args: unknown = null, cancellable?: Gio.Cancellable): Promise<T> {
		if (this.stopped) return Promise.reject(new Error('Clipboard worker is stopped'));
		const bytes = new TextEncoder().encode(JSON.stringify({ method, args }) + '\n');
		// Backpressure bounds retained clipboard payloads when the worker is busy.
		if (this.queuedBytes + bytes.length > 128 * 1024 * 1024) {
			return Promise.reject(new Error('Clipboard worker queue is full'));
		}
		this.queuedBytes += bytes.length;
		const request = this.tail.then(async () => {
			if (this.stopped || cancellable?.is_cancelled()) throw new Error('Clipboard work cancelled');
			const timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.timeout, () => {
				this.destroy();
				return GLib.SOURCE_REMOVE;
			});
			try {
				await new Promise<void>((resolve, reject) => {
					this.output.write_all_async(bytes, GLib.PRIORITY_DEFAULT, this.cancellable, (stream, result) => {
						try {
							stream!.write_all_finish(result);
							resolve();
						} catch (e) {
							reject(new Error('Clipboard worker transport failed'));
						}
					});
				});
				const line = await new Promise<Uint8Array>((resolve, reject) => {
					this.input.read_line_async(GLib.PRIORITY_DEFAULT, this.cancellable, (stream, result) => {
						try {
							const [data] = stream!.read_line_finish(result);
							if (data === null) throw new Error('Clipboard worker exited');
							resolve(data);
						} catch (e) {
							reject(new Error('Clipboard worker transport failed'));
						}
					});
				});
				const response = JSON.parse(new TextDecoder().decode(line)) as { value: T; error?: string };
				if (response.error) throw new Error(response.error);
				if (cancellable?.is_cancelled()) throw new Error('Clipboard work cancelled');
				return response.value;
			} finally {
				// The timeout may have removed itself already.
				if (GLib.MainContext.default().find_source_by_id(timer)) GLib.source_remove(timer);
			}
		});
		this.tail = request
			.then(
				() => {},
				() => {},
			)
			.finally(() => {
				this.queuedBytes -= bytes.length;
			});
		return request;
	}

	async close(): Promise<void> {
		try {
			await this.request('close');
		} finally {
			this.destroy();
		}
	}

	waitForExit(): Promise<void> {
		return this.exited;
	}

	destroy(): void {
		if (this.stopped) return;
		this.stopped = true;
		this.cancellable.cancel();
		this.process.force_exit();
		this.exited = new Promise((resolve) => {
			this.process.wait_async(null, (process, result) => {
				try {
					process!.wait_finish(result);
				} catch {
					/* Already reaped. */
				}
				resolve();
			});
		});
		try {
			this.input.close(null);
		} catch {
			/* Pipe closed. */
		}
		try {
			this.output.close(null);
		} catch {
			/* Pipe closed. */
		}
	}
}
