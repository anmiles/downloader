# @anmiles/lib/downloader

Wrapper for downloading data as string, buffer or complex types

----

## Installation

1. Install dependencies
`npm install`
1. Build
`npm run build`
1. Test everything
`npm test`

## Usage examples

```js
import { download } from '@anmiles/downloader';
const buffer = await download('http://url/page');
```

```js
import { download } from '@anmiles/downloader';
await download('http://url/file', '/path/to/file');
```

```js
import { downloadString } from '@anmiles/downloader';
const str = downloadString('http://url/string');
```

```js
import { downloadString } from '@anmiles/downloader';
const str = downloadString('http://url/base64-string', 'base64');
```

```js
import { downloadJSON } from '@anmiles/downloader';
const str = downloadJSON('http://url/json');
```

```js
import { downloadJSON } from '@anmiles/downloader';
const str = downloadJSON('http://url/base64-encoded-json', 'base64');
```
