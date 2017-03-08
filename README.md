# mwoffliner
mwoffliner is a tool which allows to "dump" a Wikimedia project (Wikipedia, Wiktionary, ...) to a local storage.

It should also work for any Mediawiki instance having parsoid installed.

It goes through all articles (or a selection if specified) of the project and write the HTML/pictures to local files.

## Installation

To use mwoffliner, you need a recent version of nodejs and a POSIX system (like GNU/Linux).

There are also other dependencies  descrbed below

### Node and JS dependencies

```
$ curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
$ sudo apt-get install -y nodejs
```

Then, install dependencies:

```
$ npm install
```

### Image manipulation dependencies

mwoffliner make some treatments on downloaded images, so the following binaries are required : `jpegoptim, advdef, gifsicle, pngquant, imagekick`

On a debian-based OS, they can be install using apt :

```
$ apt-get install jpegoptim, advancecomp, gifsicle, pngquant, imagekick
```

### Zimwriterfs

mwoffliner uses the zim archive format for locally store data; this is done using the zimwriterfs binary.

Zimwriterfs is a sub-project of OpenZim which locally stores an archive of a remote website.

Installation can be processed by following official installation documentation : https://github.com/wikimedia/openzim/tree/master/zimwriterfs for install documentation.

### Redis
```
$ wget http://download.redis.io/releases/redis-3.2.8.tar.gz
$ tar xzf redis-3.2.8.tar.gz
$ cd redis-3.2.8
$ make
```
redis should listen, by default, on a socket /dev/shm/redis.sock

### Other (optionnal) dependencies

We also recommend to use a DNS cache like nscd.

## Usage

When you are done with the installation, you can start mwoffliner. There are two ways to use mwoffliner.

### Basic usage

By default, mwoffliner does not export anything, so the way to execute it is the following one:

    node ./node_packages/mwoffliner.js

This will show the usage() of the command.

### Advanced usage (the npm way)

If you want to run mwoffliner the npm way, you must export some npm scripts through package.json definition. Add a `package.json` file to your project, with (for example) the following scripts part:

```
"scripts": {
  "mwoffliner": "mwoffliner",
  "create_archive": "mwoffliner --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net",
  "create_mywiki_archive": "mwoffliner --mwUrl=https://my.wiki.url/ --adminEmail=foo@bar.net"
}
```

Now you are able to run mwoffliner through npm:

```
$ npm run mwoffliner -- --mwUrl=https://en.wikipedia.org/ --adminEmail=foo@bar.net
```
The first "--" is meant to pass the following arguments to the npm mwoffliner module. [Learn more about --](http://unix.stackexchange.com/questions/52167/what-does-mean-in-linux-unix-command-line)

You can also execute it with preconfigured commands *create_archive* or *create_mywiki_archive* :

```
$ npm run create_mywiki_archive
```

Of course, you are free to add/adapt preconfigured commands to your needs.
