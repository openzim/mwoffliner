[![Build Status](https://travis-ci.org/tirithen/node-jsoncompress.svg?branch=master)](https://travis-ci.org/tirithen/node-jsoncompress)

# node-jsoncompress

A Node.js and browser JSON compression tool that uses JSON templates (inspired by https://github.com/Raveler/packetflattener), LZ, and optional float decimal reduction to compress JSON data for storage or sending over a network.

## Why this module

I needed a really simple way to compress JSON data that was to be sent via WebSockets to reduce the network traffic of an application that I was working on. I also needed to be able to share the code in the browser as on the server.

## Goal for this module

The module is supposed to be plug and play, while the compression techniques inside this module hopefully will be changed to get better and smarter, the goal is that the API for the jsoncompress object/module will change as little as possible.

## Installation for Node.js


    $ cd /my/project/directory
    $ npm install jsoncompress --save

## WebSocket example and demo

Start the server with

    $ node example/socketserver.js

Visit [http://localhost:3000]() in your browser and open up the console to see the output.

## Example for Node.js

    'use strict';

    var jsoncompress = require('jsoncompress');

    var data = { position: { x: 123.3432123, y: 3.2342233, z: 643.3423423 } };
    var template = { position: { x: 0, y: 0, z: 0 } };

    var compressed = jsoncompress.compress(data, template);
    console.log('Compressed string', compressed);

    var decompressed = jsoncompress.decompress(compressed, template);
    console.log('Decompressed and restored data', decompressed);

## Example for browser
    The only file that is needed in the browser is browser/jsoncompress.min.js, if you make any changes to the other files, remember to run Grunt to generate a new version of this file. Once the script is imported the global "jsoncompress" is avaliable.

    <script src="/path/to/jsoncompress/browser/jsoncompress.min.js"></script>
    <script>
        'use strict';

        var jsoncompress = require('jsoncompress');

        var data = { position: { x: 123.3432123, y: 3.2342233, z: 643.3423423 } };
        var template = { position: { x: 0, y: 0, z: 0 } };

        var compressed = jsoncompress.compress(data, template);
        console.log('Compressed string', compressed);

        var decompressed = jsoncompress.decompress(compressed, template);
        console.log('Decompressed and restored data', decompressed);
    </script>

## Contribute

What is you oppinion of this module? Send you pull requests so we can make this module even better.

## License

This project is released under the GPLv3 license.
