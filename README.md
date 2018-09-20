# mwoffliner

`mwoffliner` is a tool which allows to make a local HTML snapshot of
any online (recent) Mediawiki instance. It goes through all articles
(or a selection if specified) and write the HTML/pictures to a local
directory. It has mainly been tested against Wikimedia projects like
Wikipedia, Wiktionary, ... But it should also work for any recent
Mediawiki.

[![NPM](https://nodei.co/npm/mwoffliner.png)](https://nodei.co/npm/mwoffliner/)

[![Build Status](https://travis-ci.org/openzim/mwoffliner.svg?branch=master)](https://travis-ci.org/openzim/mwoffliner)
[![CodeFactor](https://www.codefactor.io/repository/github/openzim/mwoffliner/badge)](https://www.codefactor.io/repository/github/openzim/mwoffliner)

## Prerequisites

- *NIX Operating System (Linux/Unix/macOS)
- [NodeJS](https://nodejs.org/en/)
- Image Processing Tools
    - jpegoptim
    - advdef
    - gifsicle
    - pngquant
    - imagemagick
- [ZimWriterFS](https://github.com/openzim/zimwriterfs)

## Setup

### MacOS
#### NodeJS
```bash
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash && \
source ~/.bashrc && \
nvm install stable && \
node --version
```

#### Image Processing
> These instructions require that [Homebrew](https://brew.sh/) is already set-up on your machine
```bash
> brew install jpegoptim advancecomp gifsicle pngquant imagemagick
```

#### Redis
```bash
> brew install redis
```

#### ZimWriterFS
See [GitHub](https://github.com/openzim/zimwriterfs)

### Linux (Debian)
#### NodeJS
```bash
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash && \
source ~/.bashrc && \
nvm install stable && \
node --version
```

#### Image Processing
```bash
> sudo apt-get install jpegoptim advancecomp gifsicle pngquant imagemagick
```

#### Redis
```bash
> sudo apt-get install redis-server
```

#### ZimWriterFS
See [GitHub](https://github.com/openzim/zimwriterfs)

## Usage
### Command Line
```bash
> npm i -g mwoffliner
> mwoffliner --help

> mwoffliner \
    --mwUrl=https://es.wikipedia.org \
    --adminEmail=foo@bar.net \
    --localParsoid \
    --verbose \
    --format=nozim \ # Won't make a final ZIM file
    --articleList=./articleList # Will download one article
```

### Programmatic API
```javascript
const mwoffliner = require('mwoffliner');
const parameters = {
    mwUrl: "https://es.wikipedia.org",
    adminEmail: "foo@bar.net",
    localParsoid: true,
    verbose: true,
    format: "nozim",
    articleList: "./articleList"
};
mwoffliner.execute(parameters);
```

## Development

```bash
git clone https://github.com/openzim/mwoffliner.git
cd mwoffliner

npm i
./watch.sh # Watch for changes in "src/*"
```

### Debugging
There is a pre-configured debug config for [VSCode](https://code.visualstudio.com/), just click on the debugging tab.

Make sure you read [CONTRIBUTING.md](./CONTRIBUTING.md) for tips on how to best debug and submit issues.


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

**mwoffliner code and behavior are radically different for Mobile and
Desktop modes.**

*   Parsoid output for Mobile is radically different than for Desktop
    *   Mobile: Multiple structured sections, but not directly renderable
    *   Desktop: One renderable page
*   Therefore mwoffliner is quite different depending on whether it is
    in Mobile or Desktop mode.
