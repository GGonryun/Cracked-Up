const SCREEN_WIDTH = 2200;
const SCREEN_HEIGHT = 1080;
var config = {
  type: Phaser.AUTO,
  scene: {
    preload: preload,
    create: create,
    update: update,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: {
        y: 0
      },
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: "game",
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT
  },
  input: {
    activePointers: 1,
  },
  "render.transparent": true,
  "render.autoResize": true,
};

const frameRate = 5;
var game = new Phaser.Game(config);
let player;
let friends;
let _friends = new Map();
let inProgress = false;
let cursors;
let gameSocket;
let oldPosition;
let pointer;
let waterdrop;
let size;

function preload() {
  this.load.image('water-boi', 'assets/water-boi.png');
  this.load.image('waterdrop', 'assets/waterdrop.png');
}

function create() {
  let self = this;
  friends = this.physics.add.group();
  cursors = this.input.keyboard.createCursorKeys();
  //socket init.
  gameSocket = socket;
  gameSocket.emit('login game', Cookies.get('roomname'), Cookies.get('username'));
  gameSocket.on('update players', function (players) {
    Object.keys(players).forEach(function (id) {
      if (id === gameSocket.id) {
        addPlayer.call(self, players[id]);
      }
      else {
        addFriends.call(self, players[id]);
      }
    });
  });

  gameSocket.on('create player', function (player) {
    addFriends.call(self, player);
  });

  gameSocket.on('remove player', function (playerInfo) {
    if (_friends.has(playerInfo.name)) {
      let friend = _friends.get(playerInfo.name);
      friends.remove(friend);
      _friends.delete(playerInfo.name);
      friend.destroy();
    }
  })

  gameSocket.on('player movement', function (playerName, vector3) {
    if (_friends.has(playerName)) {
      let friend = _friends.get(playerName);
      friend.setPosition(vector3.x, vector3.y);
      friend.animationState = vector3.z;
      //friend.anims.play();
    }
    console.log(jumpingFriends);
  });

  gameSocket.on('create waterdrop', function (x, y) {
    createWaterdrop.call(self, { x, y });
  });

  gameSocket.on('start game', function () {
    console.log('start game!');
  })

  gameSocket.on('countdown', function () {
    console.log('1sec has passed');
  });
}

function update() {
  pointer = this.input.activePointer;
  if (player) {
    let z = 0;
    if (pointer.isDown) {
      let touchX = pointer.x;
      let touchY = pointer.y;

      //player.body.touching.down
      if (touchY < SCREEN_HEIGHT / 1.5 && touchX > SCREEN_WIDTH / 5 && touchX < SCREEN_WIDTH / 1.25) { //middle top
        player.setVelocityY(-800 / (size > 0 ? size : .0001));
        z = 2;
      } else if (touchX < SCREEN_WIDTH / 2) { //left
        player.setVelocityX(-500 / (size > 0 ? size : .0001));
        z = -1;
      } else { //right
        player.setVelocityX(500 / (size > 0 ? size : .0001));
        z = 1;
      }
    } else {
      //if we're grounded we can go back to idle statek
      player.setVelocityX(0);
      z = 0;
    }

  }
}

function addFriends(playerInfo) {
  if (_friends.has(playerInfo.name) || Cookies.get('username') === playerInfo.name) {
    console.log('Cannot recreate myself');
  } else {
    const friend = friends.create(playerInfo.x, playerInfo.y, 'water-boi')
    friend.setDisplaySize(140, 140);
    friend.setBounce(0.2);
    friend.setCollideWorldBounds(true);
    friend.body.setGravityY(0);
    _friends.set(playerInfo.name, friend);
  }
}

function addPlayer(playerInfo) {
  player = this.physics.add.sprite(playerInfo.x, playerInfo.y, 'water-boi').setDisplaySize(140, 140);
  player.setBounce(0.2);
  player.setCollideWorldBounds(true);
  player.body.setGravityY(400);
  size = 2;
  oldPosition = { x: playerInfo.x, y: playerInfo.y, z: 0 };
}

function createWaterdrop(vector2) {
  if (waterdrop) {
    waterdrop.destroy();
  }
  waterdrop = this.physics.add.sprite(vector2.x, vector2.y, 'waterdrop').setDisplaySize(60, 60);
  this.physics.add.overlap(player, waterdrop, function (p, w) {
    socket.emit('remove waterdrop', Cookies.get('roomname'));
  });
}

