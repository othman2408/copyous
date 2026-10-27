/* Requests, writes and grammar registrations must remain ordered, with bounded memory. */
/* oxlint-disable no-await-in-loop */
// Standalone GJS process. Never import GNOME Shell UI modules here.
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';

import type { HLJSApi, LanguageFn } from 'highlight.js';

import type CopyousExtension from './extension.js';
import { ItemType } from './lib/common/constants.js';
import { previewText } from './lib/common/preview.js';
import { localeContains } from './lib/common/search.js';
import type { ClipboardHistory } from './lib/common/settings.js';
import { type EntryData, type QueryData, encodeEntry } from './lib/common/workerProtocol.js';
import type { ClipboardEntry, Database, Language, Metadata } from './lib/database/database.js';
import { GdaDatabase } from './lib/database/gda.js';
import { JsonDatabase } from './lib/database/json.js';

const input = new Gio.DataInputStream({ base_stream: new GioUnix.InputStream({ fd: 0, close_fd: false }) });
const output = new GioUnix.OutputStream({ fd: 1, close_fd: false });
const loop = new GLib.MainLoop(null, false);
let database: Database | undefined;
let entries = new Map<number, ClipboardEntry>();
let snapshot: ClipboardEntry[] = [];
let snapshotOffset = 0;
let hljs: HLJSApi | undefined;
const index = new Map<number, { entry: EntryData; texts: string[] }>();
const logger = {
	log() {},
	info() {},
	warn() {},
	error() {
		throw new Error('Clipboard database operation failed');
	},
};
const context = { logger, uuid: 'copyous@boerdereinar.dev' } as unknown as CopyousExtension;

function indexEntry(entry: EntryData) {
	let texts = [entry.content];
	if (entry.type === ItemType.Image) texts = [];
	if (entry.type === ItemType.File || entry.type === ItemType.Files) {
		texts = entry.content.split('\n').flatMap((uri) => {
			const file = Gio.File.new_for_uri(uri);
			const relative = Gio.File.new_for_path(GLib.get_home_dir()).get_relative_path(file);
			return [uri.substring('file://'.length), file.get_path() ?? '', relative === null ? '' : `~/${relative}`];
		});
	}
	if (entry.type === ItemType.Link && entry.metadata) {
		const metadata = entry.metadata as { title?: string; description?: string };
		texts.push(metadata.title ?? '', metadata.description ?? '');
	}
	texts.push(entry.title);
	index.set(entry.id, { entry, texts });
}

async function handle(method: string, payload: unknown): Promise<unknown> {
	switch (method) {
		case 'configure': {
			const args = payload as { path: string; languages: [string, string][] };
			if (!Gio.File.new_for_uri(args.path).query_exists(null)) return [];
			hljs = ((await import(args.path)) as { default: HLJSApi }).default;
			for (const [id, uri] of args.languages) {
				if (Gio.File.new_for_uri(uri).query_exists(null)) {
					try {
						hljs.registerLanguage(id, ((await import(uri)) as { default: LanguageFn }).default);
					} catch {
						/* Optional grammar. */
					}
				} else hljs.unregisterLanguage(id);
			}
			return hljs.listLanguages().map((id) => ({ id, name: hljs!.getLanguage(id)?.name ?? id }));
		}
		case 'image-info': {
			const { imageSize } = await import('./lib/misc/imagePreview.js');
			return imageSize(Gio.File.new_for_uri(payload as string), new Gio.Cancellable());
		}
		case 'media-info': {
			const { mediaDuration } = await import('./lib/misc/mediaInfo.js');
			return mediaDuration(payload as string);
		}
		case 'image': {
			const args = payload as { uri: string; cache: string; temporaryName: string };
			const { getSafePreviewFile } = await import('./lib/misc/imagePreview.js');
			const [file, ratio] = await getSafePreviewFile(
				Gio.File.new_for_uri(args.cache),
				Gio.File.new_for_uri(args.uri),
				new Gio.Cancellable(),
				args.temporaryName,
			);
			return [file.get_uri(), ratio];
		}
		case 'highlight': {
			const args = payload as { text: string; language: string | null };
			if (!hljs) return null;
			const text = previewText(args.text);
			const result =
				args.language && hljs.getLanguage(args.language)
					? hljs.highlight(text, { language: args.language })
					: hljs.highlightAuto(text);
			const language: Language | null = result.language
				? { id: result.language, name: hljs.getLanguage(result.language)?.name ?? result.language }
				: null;
			return { value: result.value, relevance: result.relevance, language };
		}
		case 'index':
			for (const entry of payload as EntryData[]) indexEntry(entry);
			return null;
		case 'unindex':
			for (const id of payload as number[]) index.delete(id);
			return null;
		case 'reset-index':
			index.clear();
			return null;
		case 'search': {
			const query = payload as QueryData;
			const collator = new Intl.Collator(query.locale, { usage: 'search', sensitivity: 'base' });
			return Array.from(index.values())
				.filter(
					({ entry, texts }) =>
						((!query.pinned && !query.excludePinned) || query.pinned === entry.pinned) &&
						((query.tag === null && !query.excludeTagged) || query.tag === entry.tag) &&
						(query.type === null || query.type === entry.type) &&
						(!query.query || texts.some((text) => localeContains(collator, text, query.query))),
				)
				.map(({ entry }) => entry.id);
		}
		case 'init': {
			const args = payload as { file: string; backend: string };
			const file = Gio.File.new_for_uri(args.file);
			if (args.backend === 'json') database = new JsonDatabase(context, file);
			else {
				const version = GLib.getenv('DEBUG_COPYOUS_GDA_VERSION');
				if (version) imports.package.require({ Gda: version });
				const gda = (await import('gi://Gda')).default;
				database = new GdaDatabase(context, gda, file);
			}
			await database.init();
			snapshot = await database.entries();
			snapshotOffset = 0;
			entries = new Map(snapshot.map((entry) => [entry.id, entry]));
			return null;
		}
		case 'snapshot':
			snapshot = Array.from(entries.values()).sort((a, b) => b.datetime.compare(a.datetime));
			snapshotOffset = 0;
			return null;
		case 'entries': {
			// Bound individual replies; do not serialize the entire history on Shell's main thread.
			const page: EntryData[] = [];
			let bytes = 0;
			while (snapshotOffset < snapshot.length && page.length < 64 && bytes < 256 * 1024) {
				const entry = snapshot[snapshotOffset++]!;
				page.push(encodeEntry(entry));
				bytes += entry.content.length * 2;
			}
			const more = snapshotOffset < snapshot.length;
			if (!more) snapshot = [];
			return { entries: page, more };
		}
		case 'conflict':
			return database!.selectConflict(payload as { type: ItemType; content: string });
		case 'insert': {
			const args = payload as { type: ItemType; content: string; metadata: Metadata | null };
			const entry = await database!.insert(args.type, args.content, args.metadata);
			if (entry) entries.set(entry.id, entry);
			await checkpoint();
			return entry ? encodeEntry(entry) : null;
		}
		case 'update': {
			const args = payload as { id: number; property: string; value: string | boolean | Metadata | null };
			const entry = entries.get(args.id);
			if (!entry) return -1;
			const property = args.property as 'content' | 'pinned' | 'tag' | 'datetime' | 'metadata' | 'title';
			switch (property) {
				case 'datetime':
					entry.datetime = GLib.DateTime.new_from_iso8601(args.value as string, GLib.TimeZone.new_utc());
					break;
				case 'pinned':
					entry.pinned = args.value as boolean;
					break;
				case 'tag':
					entry.tag = args.value as ClipboardEntry['tag'];
					break;
				case 'metadata':
					entry.metadata = args.value as Metadata | null;
					break;
				case 'content':
				case 'title':
					entry[property] = args.value as string;
					break;
				default:
					throw new Error('Unknown clipboard property');
			}
			const result = await database!.updateProperty(entry, property);
			await checkpoint();
			return result;
		}
		case 'delete': {
			const entry = entries.get(payload as number);
			const result = entry ? await database!.delete(entry) : false;
			entries.delete(payload as number);
			await checkpoint();
			return result;
		}
		case 'clear':
		case 'prune': {
			const deleted =
				method === 'clear'
					? await database!.clear(payload as ClipboardHistory)
					: await database!.deleteOldest(
							(payload as { offset: number }).offset,
							(payload as { minutes: number }).minutes,
						);
			for (const id of deleted) entries.delete(id);
			await checkpoint();
			return deleted;
		}
		case 'close':
			await database?.close();
			database = undefined;
			return null;
		default:
			throw new Error('Unknown clipboard worker operation');
	}
}

async function checkpoint() {
	// An acknowledged JSON mutation has reached the atomic replacement, even if the worker later crashes.
	if (database instanceof JsonDatabase) await database.flush();
}

async function serve() {
	try {
		while (true) {
			const line = await new Promise<Uint8Array | null>((resolve, reject) => {
				input.read_line_async(GLib.PRIORITY_DEFAULT, null, (stream, result) => {
					try {
						resolve(stream!.read_line_finish(result)[0]);
					} catch (e) {
						reject(new Error('Clipboard worker transport failed'));
					}
				});
			});
			if (line === null) break;
			let response: unknown;
			let close = false;
			try {
				const request = JSON.parse(new TextDecoder().decode(line)) as { method: string; args: unknown };
				close = request.method === 'close';
				response = { value: await handle(request.method, request.args) };
			} catch {
				// Never include clipboard content or database queries in protocol errors.
				response = { error: 'Clipboard worker operation failed' };
			}
			const bytes = new TextEncoder().encode(JSON.stringify(response) + '\n');
			await new Promise<void>((resolve, reject) => {
				output.write_all_async(bytes, GLib.PRIORITY_DEFAULT, null, (stream, result) => {
					try {
						stream!.write_all_finish(result);
						resolve();
					} catch (e) {
						reject(new Error('Clipboard worker transport failed'));
					}
				});
			});
			if (close) break;
		}
	} finally {
		await database?.close();
		loop.quit();
	}
}

serve().catch(() => loop.quit());
loop.run();
