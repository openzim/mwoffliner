'use strict';

var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var jsoncompress = require('../jsoncompress');

var date = new Date(1413108095936);

var data = {
  message: 'Testing compressed messages with websockets',
  places: [
    {
      name: 'Arholma brygga',
      date: date,
      coordinates: {
	longitude: 59.851160,
	latitude: 19.108029
      }
    }
  ]
};

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

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

app.get('/browser/:staticFile', function (req, res) {
  res.sendFile(req.params.staticFile, { root: __dirname + '/../browser/' });
});

app.get('/:staticFile', function (req, res) {
  res.sendFile(req.params.staticFile, { root: __dirname });
});

io.on('connection', function (socket) {
  socket.emit('data', jsoncompress.compress(data, template));

  socket.on('data', function (data) {
    console.log('Compressed data', data);
    console.log('Decompressed data', jsoncompress.decompress(data, template));
  });
});

http.listen(3000);
