"use strict";
const SCREEN_WIDTH = 1100;
const SCREEN_HEIGHT = 540;
const BACKGROUND_WIDTH = 12000;
const BACKGROUND_HEIGHT = 1000;
const scale = .2;
let express = require('express');
let app = express();
let http = require('http');
let server = http.Server(app);
let io = require('socket.io')(server);
let port = 3000;
const ioGame = io.of('/game');
const ioLobby = io.of('/lobby');
const GAME_TIMER = 8000;

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
app.get('/gameover', function (req, res) {
  res.sendFile(__dirname + '/public/html/gameover.html');

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
      x: Math.floor(Math.random() * SCREEN_WIDTH / 4) + 200,
      y: Math.floor(Math.random() * BACKGROUND_HEIGHT / 2) + 100,
      size: 3,
      name: userName,
      room: roomName,
      ready: false
    };

    let waterdropPos = { x: SCREEN_WIDTH, y: BACKGROUND_HEIGHT / 1.10 }
    if (!_games.has(roomName)) {
      game = {
        players: {},
        waterdrop: { x: waterdropPos.x, y: waterdropPos.y },
        sundrop: { x: waterdropPos.x, y: waterdropPos.y },
        inProgress: false,
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

  socket.on('player update', function (roomName, vector3, size) {
    let game = _games.get(roomName);
    if (game) {
      let player = game.players[socket.id];
      if (player) {
        player.x = vector3 ? vector3.x : player.x;
        player.y = vector3 ? vector3.y : player.y;
        player.z = vector3 ? vector3.z : player.z;
        player.size = size;
        socket.to(roomName).emit('update player', player);
        if (size <= 0) {
          delete game.players[socket.id];
          if (game.players.length < 2) {
            _games.delete(game);
          }
        }
      }
    }
  });

  socket.on('remove waterdrop', function (roomName, inProgress) {
    let game = _games.get(roomName);
    if (game) {
      //start game on first star;
      if (!game.inProgress && inProgress) {
        game.inProgress = true;
        ioGame.to(roomName).emit('start cinematic');
      }
      let y = game.waterdrop.y + (Math.random() * -250) + 200;
      y = y < BACKGROUND_HEIGHT / 1.1 ? y : y - SCREEN_HEIGHT / 2;
      let x = game.waterdrop.x + SCREEN_WIDTH;
      let newPos = { x, y };
      ioGame.to(roomName).emit('create sundrop', { x: game.waterdrop.x + 750, y: game.waterdrop.y });
      game.waterdrop = newPos;
      ioGame.to(roomName).emit('create waterdrop', newPos.x, newPos.y);

    }
  });

  socket.on('remove sundrop', function (roomName, vector2) {
    socket.to(roomName).emit('remove sundrop', vector2);

  });

  socket.on('player ready', function (roomName) {
    let game = _games.get(roomName);
    if (game) {
      let player = game.players[socket.id];
      if (player) {
        player.ready = true;
        for (let id in game.players) {
          if (game.players.hasOwnProperty(id)) {
            if (game.players[id].ready == false) {
              return;
            };
          }
        }
        ioGame.to(roomName).emit('enable controls');

        console.log('begin the game!!!');
        let gameLoop = setInterval(function () {
          let suddenDeath = true;
          for (let id in game.players) {
            if (game.players.hasOwnProperty(id)) {
              suddenDeath &= game.players[id].size < 2;
            };
          }
          console.log(Object.keys(game.players).length);
          if (Object.keys(game.players).length > 1) {
            ioGame.to(roomName).emit('countdown', suddenDeath);
            ioGame.to(roomName).emit('create sundrop', { x: game.waterdrop.x + 1000, y: game.waterdrop.y - 50 });
            ioGame.to(roomName).emit('create sundrop', { x: game.waterdrop.x + 200, y: game.waterdrop.y - 75 });
            ioGame.to(roomName).emit('create sundrop', { x: game.waterdrop.x + 500, y: game.waterdrop.y - 25 });
            ioGame.to(roomName).emit('create sundrop', { x: game.waterdrop.x + 700, y: game.waterdrop.y - 100 });
          }
          else {
            ioGame.to(roomName).emit('game over');
            clearInterval(gameLoop);
          }

        }, GAME_TIMER);
      }

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
