import EventEmitter from 'events';
import fs from 'fs';
import http from 'http';
import https from 'https';

import iconv from 'iconv-lite';

import { download, downloadJSON, downloadString } from '../downloader';
import type { BufferEncoding } from '../downloader';

let request: http.ClientRequest;
let response: http.IncomingMessage;

let emitFakeResponse: ()=> void = () => {};

/* eslint-disable promise/prefer-await-to-callbacks -- similar signature to original http.get */
function get(_url: URL | string, _options: https.RequestOptions, callback?: ((res: http.IncomingMessage)=> void) | undefined): http.ClientRequest {
	if (callback) {
		callback(response);
	}

	return request;
}
/* eslint-enable promise/prefer-await-to-callbacks */

beforeEach(() => {
	request  = new EventEmitter() as typeof request; // eslint-disable-line @typescript-eslint/no-unsafe-type-assertion
	response = new EventEmitter() as typeof response; // eslint-disable-line @typescript-eslint/no-unsafe-type-assertion

	emitFakeResponse = () => {
		response.emit('data', new Uint8Array([ 10, 11, 12 ]));
		response.emit('data', new Uint8Array([ 20, 21, 22 ]));
		response.emit('data', new Uint8Array([ 30, 31, 32 ]));
		response.emit('end');
	};

	response.pipe   = jest.fn();
	response.resume = jest.fn();

	response.statusCode = 200;
});

const httpGetSpy  = jest.spyOn(http, 'get').mockImplementation(get);
const httpsGetSpy = jest.spyOn(https, 'get').mockImplementation(get);

describe('src/lib/downloader', () => {
	describe('download', () => {
		it('should throw if url protocol is not supported', async () => {
			const promise = download('ftp://url');
			emitFakeResponse();

			await expect(promise).rejects.toEqual(new Error('Unknown protocol in url ftp://url, expected one of "http" or "https"'));
		});

		it('should call http.get if url protocol is http', async () => {
			const promise = download('http://url');
			emitFakeResponse();
			await promise;

			expect(httpGetSpy.mock.calls[0]?.[0]).toEqual('http://url');
		});

		it('should call https.get if url protocol is https', async () => {
			const promise = download('https://url');
			emitFakeResponse();
			await promise;

			expect(httpsGetSpy.mock.calls[0]?.[0]).toEqual('https://url');
		});

		it('should pass user-agent in options', async () => {
			const promise = download('http://url');
			emitFakeResponse();
			await promise;

			expect(httpGetSpy.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
				},
			}));
		});

		it('should reject and resume response if status code is not 200', async () => {
			response.statusCode = 404;

			const promise = download('http://url');

			await expect(promise).rejects.toEqual(new Error('Request to http://url returned with status code: 404'));
			expect(response.resume).toHaveBeenCalled(); // eslint-disable-line @typescript-eslint/unbound-method
		});

		it('should reject if response errored', async () => {
			const promise = download('http://url');
			request.emit('error', new Error('request error'));

			await expect(promise).rejects.toEqual(new Error('Request to http://url failed with error: request error'));
		});

		it('should concat and resolve received data if no file specified', async () => {
			const promise = download('http://url');
			emitFakeResponse();
			const result = await promise;

			expect(result).toEqual(Buffer.from([ 10, 11, 12, 20, 21, 22, 30, 31, 32 ]));
		});

		it('should pipe response stream to file if specified with write mode', async () => {
			const stream               = {} as fs.WriteStream; // eslint-disable-line @typescript-eslint/no-unsafe-type-assertion
			const createWriteStreamSpy = jest.spyOn(fs, 'createWriteStream').mockReturnValue(stream);

			const promise = download('http://url', 'file');
			emitFakeResponse();
			await promise;

			expect(createWriteStreamSpy).toHaveBeenCalledWith('file', { flags: 'w' });
			expect(response.pipe).toHaveBeenCalledWith(stream); // eslint-disable-line @typescript-eslint/unbound-method
			createWriteStreamSpy.mockRestore();
		});

		it('should pipe response stream to file if specified with append mode', async () => {
			const stream               = {} as fs.WriteStream; // eslint-disable-line @typescript-eslint/no-unsafe-type-assertion
			const createWriteStreamSpy = jest.spyOn(fs, 'createWriteStream').mockReturnValue(stream);

			const promise = download('http://url', 'file', { append: true });
			emitFakeResponse();
			await promise;

			expect(createWriteStreamSpy).toHaveBeenCalledWith('file', { flags: 'a' });
			expect(response.pipe).toHaveBeenCalledWith(stream); // eslint-disable-line @typescript-eslint/unbound-method
			createWriteStreamSpy.mockRestore();
		});
	});

	describe('downloadString', () => {
		it('should throw if unknown encoding specified', async () => {
			const promise = downloadString('http://url', 'wrong_encoding' as BufferEncoding); // eslint-disable-line @typescript-eslint/no-unsafe-type-assertion
			emitFakeResponse();

			await expect(promise).rejects.toEqual(new Error('Unknown encoding wrong_encoding'));
		});

		it('should return string decoded with utf8', async () => {
			const text  = iconv.encode('test', 'utf8');
			const bytes = Buffer.from(text);

			const promise = downloadString('http://url');
			response.emit('data', bytes);
			response.emit('end');
			const result = await promise;

			expect(result).toEqual('test');
		});

		it('should return string decoded with specified encoding', async () => {
			const text  = iconv.encode('test', 'base64');
			const bytes = Buffer.from(text);

			const promise = downloadString('http://url', 'base64');
			response.emit('data', bytes);
			response.emit('end');
			const result = await promise;

			expect(result).toEqual('test');
		});

		it('should return string decoded with different encoding', async () => {
			const text  = iconv.encode('test', 'utf8');
			const bytes = Buffer.from(text);

			const promise = downloadString('http://url', 'base64');
			response.emit('data', bytes);
			response.emit('end');
			const result = await promise;

			expect(result).toEqual('dGVzdA==');
		});
	});

	describe('downloadJSON', () => {
		it('should JSON.parse downloaded string decoded with utf8', async () => {
			const text  = iconv.encode('{"key1": "value", "key2": 5}', 'utf8');
			const bytes = Buffer.from(text);

			const promise = downloadJSON('http://url');
			response.emit('data', bytes);
			response.emit('end');
			const result = await promise;

			expect(result).toEqual({ key1: 'value', key2: 5 });
		});

		it('should JSON.parse downloaded string decoded with specified encoding', async () => {
			const text  = iconv.encode('{"key1": "value", "key2": 5}', 'ucs2');
			const bytes = Buffer.from(text);

			const promise = downloadJSON('http://url', 'ucs2');
			response.emit('data', bytes);
			response.emit('end');
			const result = await promise;

			expect(result).toEqual({ key1: 'value', key2: 5 });
		});
	});
});
