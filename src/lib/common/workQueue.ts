/** Limit concurrent optional I/O/decode work without blocking the main loop. */
export class WorkQueue {
	private active = 0;
	private readonly waiting: (() => void)[] = [];

	constructor(private readonly concurrency: number) {}

	async run<T>(work: () => Promise<T>): Promise<T> {
		if (this.active >= this.concurrency) {
			await new Promise<void>((resolve) => {
				this.waiting.push(resolve);
			});
		} else {
			this.active++;
		}
		try {
			return await work();
		} finally {
			const next = this.waiting.shift();
			if (next) next();
			else this.active--;
		}
	}
}
