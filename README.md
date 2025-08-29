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
[![Docker](https://ghcr-badge.egpl.dev/openzim/mwoffliner/latest_tag?label=container)](https://ghcr.io/openzim/mwoffliner)
[![Build Status](https://github.com/openzim/mwoffliner/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/openzim/mwoffliner/actions/workflows/ci.yml?query=branch%3Amain)
[![codecov](https://codecov.io/gh/openzim/mwoffliner/branch/main/graph/badge.svg)](https://codecov.io/gh/openzim/mwoffliner)
[![CodeFactor](https://www.codefactor.io/repository/github/openzim/mwoffliner/badge)](https://www.codefactor.io/repository/github/openzim/mwoffliner)
[![License](https://img.shields.io/npm/l/mwoffliner.svg)](LICENSE)
[![Join Slack](https://img.shields.io/badge/Join%20us%20on%20Slack%20%23mwoffliner-2EB67D)](https://slack.kiwix.org)

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
- [NodeJS](https://nodejs.org/en/) version 24 (we support only one single Node.JS version, other versions might work or not)
- [Libzim](https://github.com/openzim/libzim) (On GNU/Linux & macOS we automatically download it)
- Various build tools which are probably already installed on your
  machine (packages `libjpeg-dev`, `libglu1`, `autoconf`, `automake`, `gcc` on
  Debian/Ubuntu)

... and an online MediaWiki with its API available.

## Usage

To install latest released MWoffliner version from NPM repo (use `-g` to install globally, not only in current folder):
```bash
npm i -g mwoffliner
```

> [!WARNING] 
> Note that you might need to run this command with the `sudo` command, depending
how your `npm` / OS is configured. `npm` permission checking can be a bit annoying for a
newcomer. Please read the documentation carefully if you hit problems: https://docs.npmjs.com/cli/v7/using-npm/scripts#user

> [!WARNING]
> Installing with `npm` on Apple Silicon devices specifically requires the following steps:
```
brew install jpeg
echo 'export PATH="/opt/homebrew/opt/jpeg/bin:$PATH"' >> ~/.zshrc
export LDFLAGS="-L/opt/homebrew/opt/jpeg/lib"
export CPPFLAGS="-I/opt/homebrew/opt/jpeg/include"
npm i -g mwoffliner
```

Then you can run the scraper:
```bash
mwoffliner --help
```

To use MWoffliner with a S3 cache, you should provide a S3 URL like
this:
```bash
--optimisationCacheUrl="https://wasabisys.com/?bucketName=my-bucket&keyId=my-key-id&secretAccessKey=my-sac"
```

## Contribute

If you've retrieved mwoffliner source code (e.g. with a git clone of our repo), you can then install and run it locally (including with your local modifications):

```bash
npm i
npm run mwoffliner -- --help
```

Detailed [contribution documentation and guidelines](CONTRIBUTING.md) are available.

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
* Have a look at the scraper [functional architecture](docs/functional_architecture.md)

License
-------

[GPLv3](https://www.gnu.org/licenses/gpl-3.0) or later, see
[LICENSE](LICENSE) for more details.
