# MWoffliner

MWoffliner is a tool for making a local offline HTML snapshot of any
online [MediaWiki](https://mediawiki.org) instance. It goes through
all online articles (or a selection if specified) and create the
corresponding [ZIM](https://openzim.org) file. It has mainly been
tested against Wikimedia projects like
[Wikipedia](https://wikipedia.org) and
[Wiktionary](https://wiktionary.org) --- but it should also work for
any recent MediaWiki.

Read [CONTRIBUTING.md](./CONTRIBUTING.md) to know more about
MWoffliner development.

User Help is available in the for a a
[FAQ](https://github.com/openzim/mwoffliner/wiki/Frequently-Asked-Questions).

[![NPM](https://nodei.co/npm/mwoffliner.png)](https://www.npmjs.com/package/mwoffliner)

[![npm](https://img.shields.io/npm/v/mwoffliner.svg)](https://www.npmjs.com/package/mwoffliner)
[![node](https://img.shields.io/node/v/mwoffliner.svg)](https://www.npmjs.com/package/mwoffliner)
[![Docker](https://ghcr-badge.deta.dev/openzim/mwoffliner/latest_tag?label=container)](https://ghcr.io/openzim/mwoffliner)
[![Build Status](https://github.com/openzim/mwoffliner/workflows/CI/badge.svg?query=branch%3Amain)](https://github.com/openzim/mwoffliner/actions/workflows/ci.yml?query=branch%3Amain)
[![codecov](https://codecov.io/gh/openzim/mwoffliner/branch/main/graph/badge.svg)](https://codecov.io/gh/openzim/mwoffliner)
[![CodeFactor](https://www.codefactor.io/repository/github/openzim/mwoffliner/badge)](https://www.codefactor.io/repository/github/openzim/mwoffliner)
[![License](https://img.shields.io/npm/l/mwoffliner.svg)](LICENSE)

## Features

- Scrape with or without image thumbnail
- Scrape with or without audio/video multimedia content
- S3 cache (optional)
- Image size optimiser / Webp converter
- Scrape all articles in namespaces or title list based
- Specify additional/non-main namespaces to scrape

Run `mwoffliner --help` to get all the possible options.

## Prerequisites

- *NIX Operating System (GNU/Linux, macOS, ...)
- [Redis](https://redis.io/)
- [NodeJS](https://nodejs.org/en/) version 16 or greater
- [Libzim](https://github.com/openzim/libzim) (On GNU/Linux & macOS we automatically download it)
- Various build tools which are probably already installed on your
  machine (packages `libjpeg-dev`, `libglu1`, `autoconf`, `automake`, `gcc` on
  Debian/Ubuntu)

... and an online MediaWiki with its API available.

## Usage

To install MWoffliner globally:
```bash
npm i -g mwoffliner
```

You might need to run this command with the `sudo` command, depending
how your `npm` is configured.

`npm` permission checking can be a bit annoying for a
newcomer. Please read the documentation carefully if you hit
problems: https://docs.npmjs.com/cli/v7/using-npm/scripts#user

Then to run it:
```bash
mwoffliner --help
```

To install and run it locally:
```bash
npm i
npm run mwoffliner -- --help
```

To use MWoffliner with a S3 cache, you should provide a S3 URL like
this:
```bash
--optimisationCacheUrl="https://wasabisys.com/?bucketName=my-bucket&keyId=my-key-id&secretAccessKey=my-sac"
```

## API

MWoffliner provides also an API and therefore can be used as a NodeJS
library. Here a stub example that could go in your index.mjs file:
```javascript
import * as mwoffliner from 'mwoffliner';

const parameters = {
    mwUrl: "https://es.wikipedia.org",
    adminEmail: "foo@bar.net",
    verbose: true,
    format: "nopic",
    articleList: "./articleList"
};
mwoffliner.execute(parameters); // returns a Promise
```

## Background

Complementary information about MWoffliner:

* MediaWiki software is used by thousands of wikis, the most
  famous ones being the Wikimedia ones, including [Wikipedia](https://wikipedia.org).
* MediaWiki is a PHP wiki runtime engine.
* Wikitext is the name of the markup language that MediaWiki uses.
* MediaWiki includes a parser for WikiText into HTML, and this
  parser creates the HTML pages displayed in your browser.

### GNU/Linux - Debian based distributions

Install NodeJS:
Read https://nodejs.org/en/download/current/

Install Redis:
```bash
sudo apt-get install redis-server
```

## Troubleshooting

Older GNU/Linux distributions and/or versions of Node.js might be
shipped with a deprecated version of `npm`. Older versions of `npm`
have incompatbilities with certain versions of Node.js and might
simply fail to install `mwoffliner` package.

We recommend to use a recent version of `npm`. Recent versions can
perfectly deal with older Node.js 10. Do install the packaged
version of `npm` and then use it to install a newer version like:

```bash
sudo npm install --unsafe-perm -g npm
```

Don't forget to remove the packaged version of `npm` afterward.

License
-------

[GPLv3](https://www.gnu.org/licenses/gpl-3.0) or later, see
[LICENSE](LICENSE) for more details.
