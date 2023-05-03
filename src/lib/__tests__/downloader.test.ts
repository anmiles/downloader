import fs from 'fs';
import http from 'http';
import https from 'https';
import iconv from 'iconv-lite';

import downloader from '../downloader';
const original = jest.requireActual('../downloader').default as typeof downloader;

jest.mock<Partial<typeof downloader>>('../downloader', () => ({
	download       : jest.fn().mockImplementation(() => downloaded),
	downloadString : jest.fn().mockImplementation((...args: Parameters<typeof original.downloadString>) => original.downloadString(...args)),
}));

const request = {} as http.ClientRequest;
request.on    = jest.fn().mockImplementation((ev: string, listener: () => void) => {
	switch (ev) {
		case 'error':
			requestError = listener;
			break;
	}
});

const response = {} as http.IncomingMessage;

let data: (data: Uint8Array) => void = () => {};
let end: () => void                  = () => {};
let requestError: (e: Error) => void = () => {};

function get(url: string | URL, options: https.RequestOptions, callback?: ((res: http.IncomingMessage) => void) | undefined): http.ClientRequest {
	if (callback) {
		callback(response);
	}

	return request;
}

beforeEach(() => {
	response.statusCode = 200;
	response.on         = jest.fn().mockImplementation((ev: string, listener: () => void) => {
		switch (ev) {
			case 'data':
				data = listener;
				break;
			case 'end':
				end = listener;
				break;
		}
	});
	response.pipe   = jest.fn();
	response.resume = jest.fn();
});

let httpGetSpy: jest.SpyInstance;
let httpsGetSpy: jest.SpyInstance;
let downloaded: Buffer;

beforeAll(() => {
	httpGetSpy  = jest.spyOn(http, 'get');
	httpsGetSpy = jest.spyOn(https, 'get');
});

beforeEach(() => {
	httpGetSpy.mockImplementation(get);
	httpsGetSpy.mockImplementation(get);
});

afterAll(() => {
	httpGetSpy.mockRestore();
});

describe('src/lib/downloader', () => {
	describe('download', () => {
		it('should throw if url protocol is not supported', async () => {
			await expect(() => original.download('ftp://url')).rejects.toEqual('Unknown protocol in url ftp://url, expected one of "http" or "https"');
		});

		it('should call http.get if url protocol is http', async () => {
			const promise = original.download('http://url');
			end();
			await promise;
			expect(httpGetSpy.mock.calls[0][0]).toEqual('http://url');
		});

		it('should call https.get if url protocol is https', async () => {
			const promise = original.download('https://url');
			end();
			await promise;
			expect(httpsGetSpy.mock.calls[0][0]).toEqual('https://url');
		});

		it('should pass user-agent in options', async () => {
			const promise = original.download('http://url');
			end();
			await promise;
			expect(httpGetSpy.mock.calls[0][1]).toEqual(expect.objectContaining({
				headers : {
					'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
				},
			}));
		});

		it('should reject and resume response if status code is not 200', async () => {
			response.statusCode = 404;
			await expect(() => original.download('http://url')).rejects.toEqual('Request to http://url returned with status code: 404');
			expect(response.resume).toHaveBeenCalled();
		});

		it('should reject if response errored', async () => {
			const promise = original.download('http://url');
			requestError(new Error('request error'));
			await expect(() => promise).rejects.toEqual('Request to http://url failed with error: request error');
		});

		it('should concat and resolve received data if no file specified', async () => {
			const promise = original.download('http://url');
			data(new Uint8Array([ 10, 11, 12 ]));
			data(new Uint8Array([ 20, 21, 22 ]));
			data(new Uint8Array([ 30, 31, 32 ]));
			end();
			const result = await promise;
			expect(result).toEqual(Buffer.from([ 10, 11, 12, 20, 21, 22, 30, 31, 32 ]));
		});

		it('should pipe response stream to file if specified', async () => {
			const stream               = {} as fs.WriteStream;
			const createWriteStreamSpy = jest.spyOn(fs, 'createWriteStream').mockReturnValue(stream);
			const promise              = original.download('http://url', 'file');
			data(new Uint8Array([ 10, 11, 12 ]));
			data(new Uint8Array([ 20, 21, 22 ]));
			data(new Uint8Array([ 30, 31, 32 ]));
			end();
			const result = await promise;
			expect(createWriteStreamSpy).toHaveBeenCalledWith('file');
			expect(response.pipe).toHaveBeenCalledWith(stream);
			expect(result).toEqual(undefined);
			createWriteStreamSpy.mockRestore();
		});
	});

	describe('downloadString', () => {
		it('should throw if unknown encoding specified', async () => {
			await expect(() => original.downloadString('http://url', 'wrong_encoding' as any)).rejects.toEqual('Unknown encoding wrong_encoding');
		});

		it('should return string decoded with utf8', async () => {
			downloaded   = iconv.encode('test', 'utf8');
			const result = await original.downloadString('http://url');
			expect(downloader.download).toHaveBeenCalledWith('http://url');
			expect(result).toEqual('test');
		});

		it('should return string decoded with specified encoding', async () => {
			downloaded   = iconv.encode('test', 'base64');
			const result = await original.downloadString('http://url', 'base64');
			expect(downloader.download).toHaveBeenCalledWith('http://url');
			expect(result).toEqual('test');
		});
	});

	describe('downloadJSON', () => {
		it('should JSON.parse downloaded string decoded with utf8', async () => {
			downloaded   = iconv.encode('{"key1": "value", "key2": 5}', 'utf8');
			const result = await original.downloadJSON('http://url');
			expect(downloader.download).toHaveBeenCalledWith('http://url');
			expect(downloader.downloadString).toHaveBeenCalledWith('http://url', 'utf8');
			expect(result).toEqual({ key1 : 'value', key2 : 5 });
		});

		it('should JSON.parse downloaded string decoded with specified encoding', async () => {
			downloaded   = iconv.encode('{"key1": "value", "key2": 5}', 'ucs2');
			const result = await original.downloadJSON('http://url', 'ucs2');
			expect(downloader.download).toHaveBeenCalledWith('http://url');
			expect(downloader.downloadString).toHaveBeenCalledWith('http://url', 'ucs2');
			expect(result).toEqual({ key1 : 'value', key2 : 5 });
		});
	});
});
