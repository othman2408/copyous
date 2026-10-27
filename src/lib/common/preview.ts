// These limits apply only to cards, never to stored, searched, or copied content.
export const PREVIEW_CHARACTERS = 4096;

export const PREVIEW_LINES = 40;

export function previewText(text: string): string {
	let end = Math.min(text.length, PREVIEW_CHARACTERS);
	let lines = 1;
	for (let i = 0; i < end; i++) {
		if (text[i] === '\n' && ++lines > PREVIEW_LINES) {
			end = i;
			break;
		}
	}
	// Do not cut a UTF-16 surrogate pair in half.
	if (end > 0 && /[\uD800-\uDBFF]/.test(text[end - 1]!)) end--;
	return text.slice(0, end);
}
