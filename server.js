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

app.get('/lobby/:lobbyID/user/:userName', function (req, res) {
  res.send(req.params)
});

let _users = new Map();
let _rooms = new Map();
//socket management
io.on('connection', function (socket) {
  console.log(`Socket ${socket.id} has connected`);
  _users.set(socket.id, socket.id);
  io.emit('update users', Array.from(_users.values()));

  socket.on('disconnect', function () {
    console.log(`A user has disconnected: ${socket.id}.`);
    _users.delete(socket.id);
    io.emit('update users', Array.from(_users.values()));
  });

  socket.on('new room', function (roomName) {
    if (!_rooms.has(roomName)) {
      io.emit('update rooms', 'test');
      _rooms.set(roomName, {
        users: [],
        capacity: 4,
        inProgress: false,
        socket: io.to(roomName)
      });
      console.log(`A new room ${roomName} has been created!`);
    }
    socket.emit('join room', roomName);
  });

  socket.on('join room', function (roomName) {
    let room = _rooms.get(roomName);
    if (room.users.length < 4 && !room.users.includes(socket.id)) {
      socket.join(roomName);
      room.users.push(socket.id);
      io.to(roomName).emit('new user', 'test');
      console.log(`User: ${_users.get(socket.id)} has successfully joined the room ${roomName}.`);
    } else {
      socket.emit('join fail', roomName);
      console.log(`User: ${_users.get(socket.id)} has failed to join the room ${roomName}.`);
    }
  });
});
