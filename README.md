# MWoffliner

MWoffliner is a tool for making a local offline HTML snapshot of any
online [Mediawiki](https://mediawiki.org) instance. It goes through
all online articles (or a selection if specified) and create the
corresponding [ZIM](https://openzim.org) file. It has mainly been
tested against Wikimedia projects like
[Wikipedia](https://wikipedia.org),
[Wiktionary](https://wiktionary.org), ... But it should also work for
any recent Mediawiki.

Read [CONTRIBUTING.md](./CONTRIBUTING.md) to know more about
MWoffliner development.

[![NPM](https://nodei.co/npm/mwoffliner.png)](https://www.npmjs.com/package/mwoffliner)

[![npm](https://img.shields.io/npm/v/mwoffliner.svg)](https://www.npmjs.com/package/mwoffliner)
[![Docker Image](https://img.shields.io/docker/v/openzim/mwoffliner?arch=amd64&label=docker&sort=semver)](https://hub.docker.com/r/openzim/mwoffliner)
[![Build Status](https://github.com/openzim/mwoffliner/workflows/CI/badge.svg?query=branch%3Amaster)](https://github.com/openzim/mwoffliner/actions?query=branch%3Amaster)
[![codecov](https://codecov.io/gh/openzim/mwoffliner/branch/master/graph/badge.svg)](https://codecov.io/gh/openzim/mwoffliner)
[![CodeFactor](https://www.codefactor.io/repository/github/openzim/mwoffliner/badge)](https://www.codefactor.io/repository/github/openzim/mwoffliner)
![License](https://img.shields.io/npm/l/mwoffliner.svg)

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
- [NodeJS](https://nodejs.org/en/) version 10 or greater
- [Libzim](https://github.com/openzim/libzim) (On GNU/Linux & macOS we automatically download it)
- Various build tools which are probably already installed on your
  machine (packages `libjpeg-dev`, `autoconf`, `automake`, `gcc` on
  Debian/Ubuntu)

... and an online Mediawiki with its API available.

## Usage

To install MWoffliner globally:
```bash
npm i -g mwoffliner
```

You might need to run this command with the `sudo` command, depending
how your `npm` is configured.

Then to run it:
```bash
mwoffliner --help
```

To use MWoffliner with a S3 cache, you should provide a S3 URL like
this:
```bash
--optimisationCacheUrl="https://wasabisys.com/?bucketName=my-bucket&keyId=my-key-id&secretAccessKey=my-sac"
```

## API

MWoffliner provides also an API and therefore can be used as a NodeJS
library. Here a stub example:
```javascript
const mwoffliner = require('mwoffliner');
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
* There is another WikiText parser, called Parsoid, implemented in
  Javascript/NodeJS. MWoffliner uses Parsoid.
* Parsoid is planned to eventually become the main parser for
  MediaWiki.
* MWoffliner calls Parsoid and then post-processes the results for
  offline format.

### GNU/Linux - Debian based distributions

Install NodeJS:
```bash
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash && \
source ~/.bashrc && \
nvm install stable && \
node --version
```

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
