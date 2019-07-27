"use strict";

let express = require('express');
let app = express();
let http = require('http');
let server = http.Server(app);
let io = require('socket.io')(server);
let port = 3000;

server.listen(port, function () {
  console.log("Listening on port 3000!");
});

//static content
app.use(express.static(__dirname + '/public'));
app.use(express.static(__dirname + 'node_modules/jquery/dist'));

//routes
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/public/html/index.html');
});


let statusManager = io.of('/player-status');
//socket management
statusManager.on('connection', function (socket) {
  console.log(`Socket ${socket.id} has connected`);
  statusManager.emit('update users', socket.id);

  socket.on('disconnect', function () {
    console.log(`A user has disconnected: ${socket.id}.`);
    io.emit('update users', socket.id);
  });
});



