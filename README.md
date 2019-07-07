# mwoffliner

`mwoffliner` is a tool for making a local HTML snapshot of
any online (recent) Mediawiki instance. It goes through all articles
(or a selection if specified) and writes the HTML/images to a local
directory. It has mainly been tested against Wikimedia projects like
Wikipedia, Wiktionary, ... But it should also work for any recent
Mediawiki.

[![NPM](https://nodei.co/npm/mwoffliner.png)](https://nodei.co/npm/mwoffliner/)

![npm](https://img.shields.io/npm/v/mwoffliner.svg)
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

## Setup

### MacOS
#### NodeJS
```bash
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash && \
source ~/.bashrc && \
nvm install stable && \
node --version
```

#### Redis
```bash
> brew install redis
```

#### LibZim
See instructions here: [https://github.com/openzim/libzim](https://github.com/openzim/libzim)

### Linux (Debian)
#### NodeJS
```bash
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash && \
source ~/.bashrc && \
nvm install stable && \
node --version
```

#### Redis
```bash
> sudo apt-get install redis-server
```

## Usage
### Command Line
```bash
> npm i -g mwoffliner
> mwoffliner --help

> mwoffliner \
    --mwUrl=https://es.wikipedia.org \
    --adminEmail=foo@bar.net \
    --verbose \
    --format=nozim \ # Won't make a final ZIM file
    --articleList=./dev/articleList # Will download one article
```

### Programmatic API
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

## Development
> Please see [CONTRIBUTING.md](./CONTRIBUTING.md)

To setup mwoffliner locally:
```bash
git clone https://github.com/openzim/mwoffliner.git
cd mwoffliner
npm i

To run it (this is only an example):
```bash
./node_modules/.bin/ts-node ./src/cli.ts --mwUrl=https://bm.wikipedia.org --adminEmail=XXX
```

or

```bash
npm start -- --mwUrl=https://bm.wikipedia.org --adminEmail=XXX
```

### Tests
There are two test suites:

- Unit

```bash
npm run test:unit # (or just npm test)
```

- End to end (e2e)

```bash
npm run test:e2e
```

### Code Style
We follow a nearly exact `tslint:recommended` scheme - you can see more information here: [./tslint.json](./tslint.json)

It's best to use TSLint to check your code as you develop, this project is pre-configured for development with VSCode and the TSLint plugin.

### Debugging
There is a pre-configured debug config for [VSCode](https://code.visualstudio.com/), just click on the debugging tab.

Make sure you read [CONTRIBUTING.md](./CONTRIBUTING.md) for tips on how to best debug and submit issues.

### Publishing
To publish, it's best to use a clean clone of the project:
```
git clone https://github.com/openzim/mwoffliner.git
npm i
./dev/build.sh
npm publish  # you must be logged in already (npm login)
```

## Background

**There are two Wikitext parsers. mwoffliner uses Parsoid.**

*   Wikitext is the name of the markup language that Wikipedia uses.
*   MediaWiki is a PHP package that runs a wiki, including Wikipedia.
*   MediaWiki includes a parser for Wikitext into HTML, and this
    parser creates Wikipedia currently.
*   There is another Wikitext parser, called Parsoid, implemented in
    Javascript (Node.js).
*   Parsoid is planned to eventually become the main parser for
    Wikipedia.
*   mwoffliner uses Parsoid.
*   mwoffliner calls Parsoid and then post-processes the results for
    offline format.
