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
app.get('/gyro', function (req, res) {
  res.sendFile(__dirname + '/public/gyro/index.html')
})
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/public/html/index.html');
});

app.get('/game', function (req, res) {
  res.sendFile(__dirname + '/public/html/game.html');
});

//game management;
let _games = new Map();

ioGame.on('connection', function (socket) {
  console.log(`A new socket ${socket.id} has entered the game!`);

  socket.on('login game', function (roomName, userName) {
    let game;
    let player = {
      id: socket.id,
      z: 0,
      x: Math.floor(Math.random() * 2000) + 50,
      y: Math.floor(Math.random() * 800) + 50,
      size: 2,
      name: userName,
      room: roomName
    };

    let waterdropPos = { x: 2200 / 2, y: 1080 / 1.10 }
    if (!_games.has(roomName)) {
      game = {
        players: {},
        waterdrop: { x: waterdropPos.x, y: waterdropPos.y },
      };
      game.players[socket.id] = player;
      _games.set(roomName, game);
    }
    else {
      game = _games.get(roomName);
      game.players[socket.id] = player;
    }
    socket.join(roomName);
    socket.emit('update players', game.players);
    socket.to(roomName).emit('create player', player);
    console.log(`User ${userName} has entered ${roomName}`);
    ioGame.to(roomName).emit('create waterdrop', waterdropPos.x, waterdropPos.y);
  });

  socket.on('disconnect', function () {
    let roomName;
    let player;
    Array.from(_games.values()).forEach(function (game) {
      if (game.players.hasOwnProperty(socket.id)) {
        player = game.players[socket.id];
        roomName = player.room;
        delete game[socket.id];
      }
    });
    socket.to(roomName).emit('remove player', player);
  });

  socket.on('player moved', function (roomName, vector3) {
    let game = _games.get(roomName);
    if (game) {
      let player = game.players[socket.id];
      if (player) {
        socket.to(roomName).emit('player movement', player.name, vector3);
      }
    }
  });

  socket.on('begin game', function (roomName) {
    let game = _games.get(roomName);
    game.inProgress = true;
    setInterval(function () {
      ioGame.to(roomName).emit('play game');
      ioGame.to(roomName).emit('countdown');
    }, 1000);
  });

  socket.on('remove waterdrop', function (roomName) {
    let game = _games.get(roomName);
    if (game) {
      let newPos = { x: game.waterdrop.x + 1000, y: game.waterdrop.y + ((Math.random() * 200) - 100) }
      game.waterdrop = newPos;
      ioGame.to(roomName).emit('create waterdrop', newPos.x, newPos.y);
    }
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
