import GLib from 'gi://GLib';

import { ClipboardEntry, type Language, type Metadata } from '../database/database.js';
import type { ItemType, Tag } from './constants.js';

export interface EntryData {
	id: number;
	type: ItemType;
	content: string;
	pinned: boolean;
	tag: Tag | null;
	datetime: string;
	metadata: Metadata | null;
	title: string;
}

export function encodeEntry(entry: ClipboardEntry): EntryData {
	return {
		id: entry.id,
		type: entry.type,
		content: entry.content,
		pinned: entry.pinned,
		tag: entry.tag,
		datetime: entry.datetime.format_iso8601()!,
		metadata: entry.metadata,
		title: entry.title,
	};
}

export function decodeEntry(entry: EntryData): ClipboardEntry {
	return new ClipboardEntry(
		entry.id,
		entry.type,
		entry.content,
		entry.pinned,
		entry.tag,
		GLib.DateTime.new_from_iso8601(entry.datetime, GLib.TimeZone.new_utc()),
		entry.metadata,
		entry.title,
	);
}

export interface QueryData {
	query: string;
	pinned: boolean;
	excludePinned: boolean;
	tag: Tag | null;
	excludeTagged: boolean;
	type: ItemType | null;
	locale: string;
}

export interface HighlightResult {
	value: string;
	relevance: number;
	language: Language | null;
}
