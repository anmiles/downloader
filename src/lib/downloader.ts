import fs from 'fs';
import http from 'http';
import https from 'https';
import iconv from 'iconv-lite';

import downloader from './downloader';

type BufferEncoding = Parameters<Buffer['toString']>[0];

function download(url: string): Promise<Buffer>;
function download(url: string, file: string, options?: { append? : boolean }): Promise<undefined>;
async function download(url: string, file?: string, options?: { append? : boolean }): Promise<Buffer | undefined> {
	return new Promise<Buffer | undefined>((resolve, reject) => {
		let protocol : typeof http | typeof https;

		if (url.startsWith('https://')) {
			protocol = https;
		} else if (url.startsWith('http://')) {
			protocol = http;
		} else {
			throw new Error(`Unknown protocol in url ${url}, expected one of "http" or "https"`);
		}

		const reqOptions = {
			headers : {
				'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
			},
		};

		protocol.get(url, reqOptions, function(res) {
			if (res.statusCode !== 200) {
				reject(new Error(`Request to ${url} returned with status code: ${res.statusCode}`));
				res.resume();
			}

			const chunks: Uint8Array[] = [];

			if (typeof file === 'undefined') {
				res.on('data', function(chunk: Uint8Array) {
					chunks.push(chunk);
				});

				res.on('end', function() {
					resolve(Buffer.concat(chunks));
				});
			} else {
				res.pipe(fs.createWriteStream(file, { flags : options?.append ? 'a' : 'w' }));

				res.on('end', function() {
					resolve(undefined);
				});
			}
		}).on('error', (e) => {
			reject(new Error(`Request to ${url} failed with error: ${e.message}`));
		});
	});
}

async function downloadString(url: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
	if (!Buffer.isEncoding(encoding)) {
		throw new Error(`Unknown encoding ${String(encoding)}`);
	}

	const buffer = await downloader.download(url);
	return iconv.decode(buffer, encoding);
}

async function downloadJSON(url: string, encoding: BufferEncoding = 'utf8'): Promise<unknown> {
	const json = await downloader.downloadString(url, encoding);
	return JSON.parse(json) as unknown;
}

export { download, downloadString, downloadJSON };
export default { download, downloadString, downloadJSON };
