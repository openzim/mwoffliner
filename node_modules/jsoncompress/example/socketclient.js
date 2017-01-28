'use strict';

/* global io, jsoncompress */

window.addEventListener('load', function () {
  var template = {
    message: '',
    places: [
      {
	name: '',
	date: Date,
	coordinates: {
	  longitude: 0,
	  latitude: 0
	}
      }
    ]
  };

  var socket = io();
  socket.on('data', function (data) {
    console.log('Compressed data', data);
    console.log('Decompressed data', jsoncompress.decompress(data, template));

    socket.emit('data', jsoncompress.compress({
      message: 'Message to server',
      places: [
	{
	  name: 'A place',
	  date: new Date()
	}
      ]
    }, template));
  });
});
