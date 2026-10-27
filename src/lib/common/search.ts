/** Keep locale-aware matching, with a native substring fast path for ASCII code/logs. */
export function localeContains(collator: Intl.Collator, text: string, query: string): boolean {
	if (text.includes(query)) return true;
	const options = collator.resolvedOptions();
	if (
		options.sensitivity === 'base' &&
		!options.ignorePunctuation &&
		!options.numeric &&
		/^[\t\r\n\x20-\x7E]*$/.test(text) &&
		/^[\x20-\x7E]*$/.test(query) &&
		collator.compare('I', 'i') === 0
	) {
		return text.toLowerCase().includes(query.toLowerCase());
	}
	for (let offset = 0; offset <= text.length - query.length; offset++) {
		if (collator.compare(text.substring(offset, offset + query.length), query) === 0) return true;
	}
	return false;
}
