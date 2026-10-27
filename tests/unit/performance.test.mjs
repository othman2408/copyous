import assert from 'node:assert/strict';
import test from 'node:test';

import { PREVIEW_CHARACTERS, PREVIEW_LINES, previewText } from '../../dist/lib/common/preview.js';
import { localeContains } from '../../dist/lib/common/search.js';
import { WorkQueue } from '../../dist/lib/common/workQueue.js';

test('card previews bound single lines, line counts, and surrogate pairs without changing the source', () => {
	const source = 'x'.repeat(1_000_000);
	assert.equal(previewText(source).length, PREVIEW_CHARACTERS);
	assert.equal(source.length, 1_000_000);
	assert.equal(previewText('line\n'.repeat(10000)).split('\n').length, PREVIEW_LINES);
	assert.equal(previewText('x'.repeat(PREVIEW_CHARACTERS - 1) + '😀').length, PREVIEW_CHARACTERS - 1);
	assert.equal(previewText('hello 😀'), 'hello 😀');
});

function originalContains(collator, text, query) {
	for (let i = 0; i <= text.length - query.length; i++) {
		if (collator.compare(text.substring(i, i + query.length), query) === 0) return true;
	}
	return false;
}

test('search preserves locale matching for accents, Turkish case, punctuation, and control characters', () => {
	const texts = [
		'Hello WORLD\nconst result = 42;',
		'CAFÉ naïve résumé',
		'İstanbul I ı i',
		'å ä ö æ ø ß',
		'hello\tworld',
		'a\0b',
		'a\x01b',
		'a-b',
		'中文 العربية',
		'HELLO',
	];
	const queries = [
		'',
		'hello',
		'WORLD',
		'cafe',
		'resume',
		'i',
		'I',
		'ı',
		'å',
		'a',
		'a\x01b',
		'hello\nworld',
		'impossible',
		'a-b',
		'42',
	];
	for (const locale of ['en', 'de', 'fr', 'tr', 'sv', 'da', 'cs', 'ar']) {
		const collator = new Intl.Collator(locale, { sensitivity: 'base' });
		for (const text of texts)
			for (const query of queries) {
				assert.equal(
					localeContains(collator, text, query),
					originalContains(collator, text, query),
					JSON.stringify({ locale, text, query }),
				);
			}
	}
});

test('optional work stays within its concurrency limit and errors release their slot', async () => {
	const queue = new WorkQueue(2);
	let running = 0,
		peak = 0;
	const results = await Promise.allSettled(
		Array.from({ length: 20 }, (_, i) =>
			queue.run(async () => {
				running++;
				peak = Math.max(peak, running);
				await new Promise((resolve) => setTimeout(resolve, 2));
				running--;
				if (i % 3 === 0) throw new Error('synthetic failure');
				return i;
			}),
		),
	);
	assert.equal(peak, 2);
	assert.equal(running, 0);
	assert.equal(results.filter((r) => r.status === 'fulfilled').length, 13);
	assert.equal(await queue.run(async () => 42), 42);
});
