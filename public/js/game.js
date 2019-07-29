const SCREEN_WIDTH = 1100;
const SCREEN_HEIGHT = 540;
const PLAYER_SCALE = .6;
const PLAYER_SIZE = 50;
const PLAYER_SPEED = 600;
const PLAYER_JUMP = 1500;
const WEIGHT_SPEED_INFLUENCE = .7;
const WEIGHT_JUMP_INFLUENCE = 1.2;
const WATERDROP_SIZE = 50;
const FRAME_RATE = 2;
const GRAVITY_BASE = 3000;
const GRAVITY_REDUCED = 1000;
const SUN_BASE = Phaser.Display.Color.HexStringToColor('#ffffff');
const SUN_ANGRY = Phaser.Display.Color.HexStringToColor('#AA0000');
const SUN_FLASH = Phaser.Display.Color.HexStringToColor('#FADA5E');
const SUN_DROP_COLOR = Phaser.Display.Color.HexStringToColor('#FF0000');
const SUN_DURATION = 8000; //change GAME_TIMER in server too

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

var game = new Phaser.Game(config);
let player;
let friends;
let _friends = new Map();
let inProgress = false;
let suddenDeath = false;
let cursors;
let gameSocket;
let oldPosition;
let pointer;
let waterdrop;
let sundrops = new Map();
let size;
let sun;
let background;
let floor;
let platforms;
let tween;
let dummy;

function removeElement(elementId) {
  // Removes an element from the document
  var element = document.getElementById(elementId);
  element.parentNode.removeChild(element);
}

function addElement(parentId, elementTag, elementId, html) {
  // Adds an element to the document
  var p = document.getElementById(parentId);
  var newElement = document.createElement(elementTag);
  newElement.setAttribute('id', elementId);
  newElement.innerHTML = html;
  p.appendChild(newElement);
}
function preload() {
  this.load.image('waterdrop', 'assets/waterdrop.png');
  this.load.image('sun', 'assets/sun.png');
  this.load.spritesheet('waterboi', '../assets/dude2.png', { frameWidth: 59, frameHeight: 59 });
  this.load.image('platform', 'assets/platform.bmp');
}

function create() {
  let self = this;
  friends = this.physics.add.group();
  cursors = this.input.keyboard.createCursorKeys();
  //background = this.add.image(0, 0, 'background').setOrigin(0, 0);
  let background = { width: 12000, height: 1000 };
  this.physics.world.setBounds(0, 0, background.width, background.height, true, true, true, true);
  this.physics.world.setBoundsCollision();
  floor = this.physics.add.staticGroup();
  platforms = this.physics.add.staticGroup();

  let brickX = 0;
  while (brickX < background.width) {
    let f = floor.create(brickX, background.height, 'platform').setScale(2).refreshBody();
    brickX += f.width * 2;
  }

  sun = this.add.image(SCREEN_WIDTH / 1.05, 50, 'sun').setScrollFactor(0);
  self.tweenStep = 0;
  tween = self.tweens.add({
    targets: self,
    tweenStep: 100,
    onUpdate: () => {
      let col = Phaser.Display.Color.Interpolate.ColorWithColor(SUN_BASE, SUN_ANGRY, 100, self.tweenStep);
      let colourInt = Phaser.Display.Color.GetColor(col.r, col.g, col.b);
      sun.setTint(colourInt);
    },
    duration: SUN_DURATION,
    repeat: 0,
    yoyo: false
  });
  tween.stop();

  // animations
  this.anims.create({
    key: 'right',
    frames: this.anims.generateFrameNumbers('waterboi', { start: 0, end: 7 }),
    frameRate: 12,
    repeat: -1
  });
  this.anims.create({
    key: 'idle',
    frames: [{ key: 'waterboi', frame: 8 }],
    frameRate: 20,
  });
  this.anims.create({
    key: 'left',
    frames: this.anims.generateFrameNumbers('waterboi', { start: 9, end: 16 }),
    frameRate: 12,
    repeat: -1
  });

  console.log(this.anims);
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

  gameSocket.on('remove player', function (friendInfo) {
    if (_friends.has(friendInfo.name)) {
      let friend = _friends.get(friendInfo.name);
      friends.remove(friend);
      _friends.delete(friendInfo.name);
      friend.destroy();
    }
  })

  gameSocket.on('update player', function (friendInfo) {
    if (_friends.has(friendInfo.name)) {
      let friend = _friends.get(friendInfo.name);
      if (friendInfo.size > 0) {
        friend.setPosition(friendInfo.x, friendInfo.y);
        friend.animationState = friendInfo.z;
        friend.setScale(friendInfo.size * PLAYER_SCALE);
        let animation = friendInfo.z === 2 ? 'idle' : friendInfo.z === 1 ? 'right' : friendInfo.z === -1 ? 'left' : 'idle'
        friend.anims.play(animation, true);
      } else {
        friend.setTint(0xff0000);
        //player.anims.play('turn');
        friends.remove(friend);
        console.log(`Deleting friend: ${friendInfo.name} from ${_friends}`);
        _friends.delete(friendInfo.name);
      }
    }
  });

  gameSocket.on('create waterdrop', function (x, y) {
    createWaterdrop.call(self, { x, y });
  });

  gameSocket.on('create sundrop', function (vector2) {
    createSundrop.call(self, { x: Math.floor(vector2.x), y: Math.floor(vector2.y) });
  });

  gameSocket.on('remove sundrop', function (vector2) {
    let delDrop = sundrops.get(vector2.x);
    sundrops.delete(delDrop);
    delDrop.destroy();
  });
  gameSocket.on('start cinematic', function () {
    //timer for intro.
    //emit that we're ready
    setTimeout(function () {
      self.physics.pause();
    }, 400);
    setTimeout(function () {
      tween.restart();
      gameSocket.emit('player ready', Cookies.get('roomname'));
    }, Math.random() * 10000);

  })
  gameSocket.on('enable controls', function () {
    tween.restart();
    self.physics.resume();
  })
  gameSocket.on('countdown', function (suddenDeath) {
    if (_friends.size < 1 || size < 1 || suddenDeath) {
    }
    else {
      tween.restart();
      shrinkPlayer.call(self);
      gameSocket.emit('player update', Cookies.get('roomname'), null, size);
    }
  });
  gameSocket.on('game over', function () {
    console.log('gg');
    removeElement('game');
    let redirectTo = `${document.URL}over`;
    window.location.replace(redirectTo);
  });

}

function update() {
  pointer = this.input.activePointer;
  if (player) {
    let z = 0;
    if (pointer.isDown) {
      let touchX = pointer.x;
      let touchY = pointer.y;
      if (size > 0) {
        if (player.body.touching.down && touchY < SCREEN_HEIGHT / 1.5 && touchX > SCREEN_WIDTH / 5 && touchX < SCREEN_WIDTH / 1.25) { //middle top
          let y = (.7 - ((size ^ WEIGHT_JUMP_INFLUENCE) * .1));
          player.setVelocityY(-PLAYER_JUMP * (y > 0 ? y : 0));
          z = 2;
          player.body.setGravityY(GRAVITY_REDUCED);
        } else if (touchX < SCREEN_WIDTH / 2) { //left
          let x = (.7 - ((size ^ WEIGHT_SPEED_INFLUENCE) * .1));
          player.setVelocityX(-PLAYER_SPEED * (x > 0 ? x : 0));
          z = -1;
          player.anims.play('left', true);
        } else { //right
          let x = (.7 - ((size ^ WEIGHT_SPEED_INFLUENCE) * .1));
          player.setVelocityX(PLAYER_SPEED * (x > 0 ? x : 0));
          z = 1;
          player.anims.play('right', true);

        }
        if (!player.body.touching.down && player.body.velocity.y > 0) {
          player.body.setGravityY(GRAVITY_BASE);
        }
      }
    } else {
      //if we're grounded we can go back to idle state
      if (player.body.gravity.y < GRAVITY_BASE) {
        player.body.setGravityY(GRAVITY_BASE);
      }
      player.setVelocityX(0);
      z = 0;
      player.anims.play('idle', true);

    }

    let x = player.x;
    let y = player.y;
    if (oldPosition && (Math.abs(x - oldPosition.x) > FRAME_RATE || Math.abs(y - oldPosition.y) > FRAME_RATE || z != oldPosition.z)) {
      gameSocket.emit('player update', Cookies.get('roomname'), { x, y, z }, size);
      oldPosition = { x, y, z };
    }
  }
}

function addFriends(friendInfo) {
  if (_friends.has(friendInfo.name) || Cookies.get('username') === friendInfo.name) {
    console.log('Cannot recreate myself');
  } else {
    const friend = friends.create(friendInfo.x, friendInfo.y, 'waterboi')
    friend.setDisplaySize(PLAYER_SIZE, PLAYER_SIZE);
    friend.setScale(friendInfo.size * PLAYER_SCALE);
    friend.setBounce(0.0);
    friend.setCollideWorldBounds(true);
    friend.body.setGravityY(0);
    _friends.set(friendInfo.name, friend);
  }
}

function addPlayer(playerInfo) {
  player = this.physics.add.sprite(playerInfo.x, playerInfo.y, 'waterboi').setDisplaySize(PLAYER_SIZE, PLAYER_SIZE);
  player.setBounce(0.3);
  player.body.setGravityY(GRAVITY_BASE);
  size = playerInfo.size;
  oldPosition = { x: playerInfo.x, y: playerInfo.y, z: 0 };
  player.setScale(size * PLAYER_SCALE);
  player.body.setCollideWorldBounds(true);
  player.body.onWorldBounds = true;
  this.cameras.main.setBackgroundColor('#FEDBB7')
  this.cameras.main.startFollow(player);
  this.cameras.main.setFollowOffset(100, SCREEN_HEIGHT / 5);
  this.physics.add.collider(player, floor);
  player.anims.play('idle', true);

}

function createSundrop(vector2) {
  let sundrop = this.physics.add.sprite(vector2.x, vector2.y, 'waterdrop').setDisplaySize(WATERDROP_SIZE, WATERDROP_SIZE);
  sundrop.setTint(SUN_ANGRY);
  sundrops.set(vector2.x, sundrop);
  sundrop.worldPosition = vector2;
  this.physics.add.overlap(player, sundrop, function (p, s) {
    let delDrop = sundrops.get(s.worldPosition.x);
    sundrops.delete(delDrop);
    delDrop.destroy();
    shrinkPlayer.call(this);
    socket.emit('remove sundrop', Cookies.get('roomname'), s.worldPosition);
    socket.emit('player update', Cookies.get('roomname'), null, size);
  });
}

function createWaterdrop(vector2) {
  if (waterdrop) {
    waterdrop.destroy();
  }
  waterdrop = this.physics.add.sprite(vector2.x, vector2.y, 'waterdrop').setDisplaySize(WATERDROP_SIZE, WATERDROP_SIZE);
  this.physics.add.overlap(player, waterdrop, function (p, w) {
    if (waterdrop) {
      waterdrop.destroy();
    }
    growPlayer.call(this);
    inProgress |= true;
    socket.emit('remove waterdrop', Cookies.get('roomname'), inProgress);
    socket.emit('player update', Cookies.get('roomname'), null, size);
  });
}

function growPlayer() {
  size++;
  player.setScale(size * PLAYER_SCALE);
  player.setVelocityY(-600);
}

function shrinkPlayer() {
  size--;
  console.log(size);
  if (size > 0) {
    player.setScale(size * PLAYER_SCALE);
  }
  else {
    deletePlayer();
  }
}

function deletePlayer() {
  player.setTint(0xff0000);
  //player.anims.play('turn');
}