# mwoffliner

[![Build Status](https://travis-ci.org/openzim/mwoffliner.svg?branch=master)](https://travis-ci.org/openzim/mwoffliner)

`mwoffliner` is a tool which allows to make a local HTML snapshot of
any online (recent) Mediawiki instance. It goes through all articles
(or a selection if specified) and write the HTML/pictures to a local
directory. It has mainly been tested against Wikimedia projects like
Wikipedia, Wiktionary, ... But it should also work for any recent
Mediawiki.

## Prerequisites

To use `mwoffliner`, you need a recent version of Node.js and a POSIX
system (like GNU/Linux). But there are also a few other dependencies
described below.

Most of the instructions are given for a Debian based OS.

### Node.js

Install first Node.js

```
$curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
$sudo apt-get install -y nodejs
```

### Image manipulation softwares

`mwoffliner` makes some treatments on downloaded images, so the
following binaries are required : `jpegoptim, advdef, gifsicle,
pngquant, imagemagick`.

```
$sudo apt-get install jpegoptim advancecomp gifsicle pngquant imagemagick
```

### Zimwriterfs

`mwoffliner` is thought to write the snapshots in the ZIM archive file
format. One time the files written on the hard disk, this is done by
`zimwriterfs`. See https://github.com/openzim/zimwriterfs for more
details.

### Redis

Redis a software daemon to store huge quantity of key=value pairs. It is
used as a cache by `mwoffliner`.

You can install it from the source:

```
$wget http://download.redis.io/releases/redis-3.2.8.tar.gz
$tar xzf redis-3.2.8.tar.gz
$cd redis-3.2.8
$make
```

or directly from the repository:

```
$sudo apt-get install redis-server
```

Here are the important parts of the configuration
(/etc/redis/redis.conf):

```
unixsocket /dev/shm/redis.sock
unixsocketperm 777
save ""
appendfsync no
```

### Nscd

We also recommend to use a DNS cache like `nscd`.

## Installation

Then install `mwoffliner` and its dependencies itself:

```
$sudo npm -g install mwoffliner
```

or if you do not want to install it as root:

```
$npm install mwoffliner
```

## Usage

When you are done with the installation, you can start
mwoffliner. There are two ways to use mwoffliner.

### Basic usage

If installed as root (so in the $PATH):

```
mwoffliner
```

otherwise:

```
node ./node_modules/mwoffliner/bin/mwoffliner.script.js
```

This will show the usage() of the command.

### Advanced usage

#### As a npm script

If you want to run `mwoffliner` the `npm` way, you must create some
`npm` scripts through `package.json` definition. Add, for example, the
following scripts part in your `package.json`:

```
"scripts": {
  "mwoffliner": "mwoffliner",
  "create_archive": "mwoffliner --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net",
  "create_mywiki_archive": "mwoffliner --mwUrl=https://my.wiki.url/ --adminEmail=foo@bar.net"
}
```

Now you are able to run mwoffliner through npm:

```
$npm run mwoffliner -- --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net
```

The first "--" is meant to pass the following arguments to
`mwoffliner` module.

#### As a Javascript module

Include this script to the .js file of your project:

```
const mwoffliner = require('./lib/mwoffliner.lib.js')
const parameters = {
    mwUrl: 'https://en.wikipedia.org/',
    adminEmail: 'foo@bar.net'
}
mwoffliner.execute(parameters)
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

**mwoffliner code and behavior are radically different for Mobile and
Desktop modes.**

*   Parsoid output for Mobile is radically different than for Desktop
    *   Mobile: Multiple structured sections, but not directly renderable
    *   Desktop: One renderable page
*   Therefore mwoffliner is quite different depending on whether it is
    in Mobile or Desktop mode.
