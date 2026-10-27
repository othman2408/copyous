import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import type CopyousExtension from '../../extension.js';
import { UserAgent, getCachePath } from '../common/constants.js';
import { WorkQueue } from '../common/workQueue.js';
import { LinkMetadata } from '../database/database.js';
import { readBounded } from './stream.js';

const linkQueue = new WorkQueue(2);

Gio._promisify(Soup.Session.prototype, 'send_async');
Gio._promisify(Gio.File.prototype, 'replace_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_async');
Gio._promisify(Gio.OutputStream.prototype, 'splice_async');

async function getMetadata(ext: CopyousExtension, url: string, cancellable: Gio.Cancellable): Promise<LinkMetadata> {
	const empty: LinkMetadata = { title: null, description: null, image: null };

	let session: Soup.Session | null = null;
	try {
		const uri = GLib.uri_parse(url, GLib.UriFlags.NONE);

		session = new Soup.Session({ user_agent: UserAgent, idle_timeout: 5, timeout: 10 });
		const message = Soup.Message.new_from_uri('GET', uri);
		// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept
		message.request_headers.append('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');

		const response = await session.send_async(message, GLib.PRIORITY_DEFAULT, cancellable);
		if (response == null) return empty;

		const [contentType] = message.response_headers.get_content_type();
		if (contentType && Gio.content_type_is_a(contentType, 'image/*')) {
			// Since the response has already been received, write image to cache
			const imagePath = getLinkImagePath(ext, url);
			if (imagePath == null) return empty;

			if (!imagePath.query_exists(cancellable)) {
				const data = await readBounded(response, 8 * 1024 * 1024, cancellable);
				await imagePath.replace_contents_async(
					data,
					null,
					false,
					Gio.FileCreateFlags.REPLACE_DESTINATION,
					cancellable,
				);
			}

			return { title: null, description: null, image: url };
		}

		if (!contentType || !Gio.content_type_is_a(contentType, 'text/html')) return empty;

		const data = await readBounded(response, 1024 * 1024, cancellable, true);

		const text = new TextDecoder().decode(data);

		// This regex is enough for most cases without having to resort to using a HTML parser
		const metaRegex = /<meta\s+(?:property|name)="([^"]*?)"\s+content="([^"]*?)"/gm;
		const reverseMetaRegex = /<meta\s+content="([^"]*?)"\s+(?:property|name)="([^"]*?)"/gm;
		const meta: Record<string, string> = {};
		for (const match of text.matchAll(metaRegex)) meta[match[1]!] = match[2]!;
		for (const match of text.matchAll(reverseMetaRegex)) meta[match[2]!] = match[1]!;

		let title = meta['title'] ?? meta['og:title'] ?? meta['twitter:title'] ?? null;
		if (title == null) {
			const titleRegex = /<title>\s*(.*?)\s*<\/title>/s;
			const titleMatch = text.match(titleRegex);
			title = titleMatch ? titleMatch[1]! : null;
		}

		let description = meta['description'] ?? meta['og:description'] ?? meta['twitter:description'] ?? null;

		let image =
			meta['image'] ??
			meta['og:image'] ??
			meta['og:image:url'] ??
			meta['og:image:secure_url'] ??
			meta['twitter:image'] ??
			null;
		if (image) {
			try {
				image = uri.parse_relative(image, GLib.UriFlags.NONE).to_string();
			} catch {
				image = null;
			}
		}

		title = title ? decodeHtml(title).trim() : null;
		description = description ? decodeHtml(description).trim() : null;

		return { title: title, description: description, image: image };
	} catch (err) {
		if (!cancellable.is_cancelled()) ext.logger.error('Failed to get metadata', err);
	} finally {
		session?.abort();
	}

	return empty;
}

function decodeHtml(html: string): string {
	return html
		.replace(/&amp;/g, '&') // Pre-check for `&amp;` to fix wrong encoding on many websites
		.replace(/&([^;]+);/g, (_, s: string) => {
			switch (s) {
				case 'lt':
					return '<';
				case 'gt':
					return '>';
				case 'amp':
					return '&';
				case 'quot':
					return '"';
				case 'apos':
					return "'";
				case 'mdash':
					return '—';
				case 'ndash':
					return '–';
				default:
					return '';
			}
		})
		.replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(+n));
}

export function getLinkImagePath(ext: Extension, url: string): Gio.File | null {
	const checksum = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, url, url.length);
	if (checksum == null) return null;

	const cacheDir = getCachePath(ext);
	if (!cacheDir.query_exists(null)) cacheDir.make_directory_with_parents(null);

	return cacheDir.get_child(checksum);
}

async function getLinkImage(
	ext: CopyousExtension,
	url: string,
	cancellable: Gio.Cancellable,
): Promise<Gio.File | null> {
	let session: Soup.Session | null = null;
	try {
		const uri = GLib.uri_parse(url, GLib.UriFlags.NONE);

		const imagePath = getLinkImagePath(ext, url);
		if (imagePath == null) return null;
		if (imagePath.query_exists(cancellable)) return imagePath;

		session = new Soup.Session({ user_agent: UserAgent, idle_timeout: 5, timeout: 10 });
		const message = Soup.Message.new_from_uri('GET', uri);
		// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept
		message.request_headers.append(
			'Accept',
			'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5',
		);

		const response = await session.send_async(message, GLib.PRIORITY_DEFAULT, cancellable);
		if (response == null) return null;

		const data = await readBounded(response, 8 * 1024 * 1024, cancellable);

		const [contentType] = message.response_headers.get_content_type();
		if (contentType == null || !contentType.startsWith('image/')) return null;

		await imagePath.replace_contents_async(data, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, cancellable);
		return imagePath;
	} catch {
		if (!cancellable.is_cancelled()) ext.logger.error('Failed to get link image');
	} finally {
		session?.abort();
	}

	return null;
}

export function tryGetMetadata(
	ext: CopyousExtension,
	url: string,
	cancellable: Gio.Cancellable,
): Promise<LinkMetadata> {
	return linkQueue.run(async () => {
		if (cancellable.is_cancelled()) return { title: null, description: null, image: null };
		return getMetadata(ext, url, cancellable);
	});
}

export function tryGetLinkImage(
	ext: CopyousExtension,
	url: string,
	cancellable: Gio.Cancellable,
): Promise<Gio.File | null> {
	return linkQueue.run(async () => {
		if (cancellable.is_cancelled()) return null;
		return getLinkImage(ext, url, cancellable);
	});
}
