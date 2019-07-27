"use strict";

let express = require('express');
let app = express();
let http = require('http');
let server = http.Server(app);
let io = require('socket.io')(server);
let port = 3000;
const ioGame = io.of('/game');
const ioLobby = io.of('/lobby');

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


app.get('/game', function (req, res) {
  res.sendFile(__dirname + '/public/html/game.html');
});

//game management;
let _games = new Map();
let _players = new Map();

ioGame.on('connection', function (socket) {
  console.log(`A new socket ${socket.id} has entered the game!`);
  socket.on('load game', function (roomName, userName) {
    if (!_games.has(roomName)) {
      _games.set(roomName, {
        players: [socket.id],
      });
    }
    else {
      _games.get(roomName).players.push(socket.id);
    }

    socket.join(roomName);
    console.log(`User ${userName} has entered ${roomName}`);
    ioGame.to(roomName).emit('test', roomName);
  });

});

//lobby management
let _rooms = new Map();
let _users = new Map();
ioLobby.on('connection', function (socket) {
  //initialization
  console.log(`Socket ${socket.id} has connected`);
  let defaultUsername = socket.id.substring(socket.id.indexOf('#') + 1, socket.id.length);

  _users.set(socket.id, defaultUsername);
  socket.emit('connect success', defaultUsername);
  ioLobby.emit('update users', Array.from(_users.values()));
  ioLobby.emit('update rooms', Array.from(_rooms.values()));

  //callbacks
  socket.on('disconnect', function () {
    console.log(`A user has disconnected: ${socket.id}.`);
    let username = _users.get(socket.id);
    _rooms.forEach(function (room) {
      if (room.users.includes(username)) {
        if (room.users.length > 1) {
          room.users.splice(room.users.indexOf(username), 1);
        } else {
          _rooms.delete(room.name);
        }
        ioLobby.emit('update rooms', Array.from(_rooms.values()));
      };
    });
    _users.delete(socket.id);
    io.emit('update users', Array.from(_users.values()));
  });

  socket.on('new room', function (roomName) {
    if (!_rooms.has(roomName)) {
      _rooms.set(roomName, {
        name: roomName,
        users: [],
        capacity: 4,
      });
      ioLobby.emit('update rooms', Array.from(_rooms.values()));
      console.log(`A new room ${roomName} has been created!`);
    }
  });

  socket.on('join room', function (roomName) {
    let room = _rooms.get(roomName);
    if (room.users.length < 4 && !room.users.includes(socket.id)) {
      // join the new room
      socket.join(roomName);
      // add yourself to the room list.
      room.users.push(_users.get(socket.id));
      // let everyone else know.
      socket.to(roomName).emit('update room', room);
      ioLobby.emit('update rooms', Array.from(_rooms.values()));

      socket.emit('join success', room);
      console.log(`User: ${_users.get(socket.id)} has successfully joined the room ${roomName}.`);
    } else {
      socket.emit('join fail', roomName);
      console.log(`User: ${_users.get(socket.id)} has failed to join the room ${roomName}.`);
    }
  });

  socket.on('leave room', function (roomName) {
    let room = _rooms.get(roomName);
    let user = _users.get(socket.id);
    if (room && room.users.includes(user)) {
      if (room.users.length > 1) {
        room.users.splice(room.users.indexOf(user), 1);
        socket.to(roomName).emit('update room', room);
      } else {
        _rooms.delete(roomName);
      }
      socket.leave(roomName);
      ioLobby.emit('update rooms', Array.from(_rooms.values()));
      socket.emit('leave success', room);
      console.log(`User: ${user} has left room ${roomName}.`);
    }
    else {
      console.log(`Invalid State for Socket ${socket.id}, cannot leave ${roomName} since you don't belong to it.`);
    }
  });

  socket.on('close room', function (roomName) {

    console.log(_users.get(socket.id));
    ioLobby.in(roomName).emit('launch game', roomName, _users.get(socket.id));
    _rooms.delete(roomName);
    socket.broadcast.emit('update rooms', Array.from(_rooms.values()));
  });
});
