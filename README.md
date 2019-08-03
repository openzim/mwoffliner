# MWoffliner

MWoffliner is a tool for making a local offline HTML snapshot of any
online [Mediawiki](https://mediawiki.org) instance. It goes through
all articles (or a selection if specified) and writes the HTML/images
to a local directory. It has mainly been tested against Wikimedia
projects like Wikipedia, Wiktionary, ... But it should also work for
any recent Mediawiki.

It can write the raw HTML/JS/CSS/PNG... files to the filesystem
or pack them all in a highly compressed [ZIM](https://openzim.org) file.

Read [CONTRIBUTING.md](./CONTRIBUTING.md) to know more about MWoffliner development.

[![NPM](https://nodei.co/npm/mwoffliner.png)](https://nodei.co/npm/mwoffliner/)

[![npm](https://img.shields.io/npm/v/mwoffliner.svg)](https://www.npmjs.com/package/mwoffliner)
[![Docker Build Status](https://img.shields.io/docker/build/openzim/mwoffliner)](https://hub.docker.com/r/openzim/mwoffliner)
[![Build Status](https://travis-ci.org/openzim/mwoffliner.svg?branch=master)](https://travis-ci.org/openzim/mwoffliner)
[![codecov](https://codecov.io/gh/openzim/mwoffliner/branch/master/graph/badge.svg)](https://codecov.io/gh/openzim/mwoffliner)
[![CodeFactor](https://www.codefactor.io/repository/github/openzim/mwoffliner/badge)](https://www.codefactor.io/repository/github/openzim/mwoffliner)
![NPM](https://img.shields.io/npm/l/mwoffliner.svg)

## Prerequisites

- *NIX Operating System (Linux/macOS)
- [NodeJS](https://nodejs.org/en/)
- [Redis](https://redis.io/)
- [Libzim](https://github.com/openzim/libzim) (On linux we automatically download binaries)
- Various build tools that are probably already installed on your machine (libjpeg, gcc)

See [Environment setup hints](#environment-setup-hints) to
know more about how to install them.

## Usage

To install MWoffliner globally:
```bash
npm i -g mwoffliner
```

You might need to run this command with the `sudo` command, depending
how your npm is configured.

Then to run it:
```bash
mwoffliner --help
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
    format: "nozim",
    articleList: "./articleList"
};
mwoffliner.execute(parameters); // returns a Promise
```

## Background

Complementary information about MWoffliner:

* MediaWiki software is used by dozen of thousands of wikis, the most
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

## Environment setup hints

### MacOS

Install NodeJS:
```bash
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash && \
source ~/.bashrc && \
nvm install stable && \
node --version
```

Install Redis:
```bash
brew install redis
```

Install libzim:
Read [these instructions](https://github.com/openzim/libzim)

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
