const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { Server } = require('socket.io');

const app = express();
app.use(express.json({ limit: '2mb' }));
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// Redirect root to lobby
app.get('/', (req, res) => {
  res.redirect('/lobby.html');
});

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'client')));

// Serve shared constants for browser
app.get('/shared/constants.js', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'shared', 'constants.js'));
});

// Serve mapData for browser (clear cache so edits are picked up)
app.get('/shared/mapData.js', (req, res) => {
  res.type('application/javascript');
  delete require.cache[require.resolve('./mapData')];
  const mapData = require('./mapData');
  const refData = require('./referenceData');
  res.send(`
    (function(exports) {
      exports.PORTS = ${JSON.stringify(mapData.PORTS)};
      exports.ROUTES = ${JSON.stringify(mapData.ROUTES)};
      exports.GEO_LABELS = ${JSON.stringify(mapData.GEO_LABELS)};
      exports.MAP_WIDTH = ${mapData.MAP_WIDTH};
      exports.MAP_HEIGHT = ${mapData.MAP_HEIGHT};
      exports.TRAVEL_TIMES = ${JSON.stringify(refData.TRAVEL_TIMES_RAW)};
    })(typeof window !== 'undefined' ? (window.MapData = window.MapData || {}) : module.exports);
  `);
});

// Save mapData from editor
app.post('/api/mapData/save', (req, res) => {
  const { ports, routes } = req.body;
  if (!ports || !routes) return res.status(400).json({ error: 'Missing ports or routes' });

  // Read current file to preserve GEO_LABELS and helpers
  const mapDataPath = path.join(__dirname, 'mapData.js');

  const portsJS = ports.map(p => {
    const pad = p.isMain ? 'true ' : 'false';
    const pathStr = p.path ? `, path: ${JSON.stringify(p.path)}` : '';
    return `  { id: '${p.id}', name: '${p.name}', x: ${p.x}, y: ${p.y}, isMain: ${pad} },`;
  }).join('\n');

  const routesJS = routes.map(r => {
    let s = `  { from: '${r.from}', to: '${r.to}', distance: ${r.distance}`;
    if (r.path && r.path.length > 0) {
      s += `, path: ${JSON.stringify(r.path)}`;
    }
    s += ' },';
    return s;
  }).join('\n');

  // Read existing file to extract GEO_LABELS and everything after ROUTES
  const oldContent = fs.readFileSync(mapDataPath, 'utf8');
  const geoMatch = oldContent.match(/(\/\/ =+ ГЕОГРАФИЧЕСКИЕ МЕТКИ =+[\s\S]*$)/);
  const tail = geoMatch ? geoMatch[1] : '';

  const newContent = `// server/mapData.js — Порты, маршруты, координаты, географические метки
// Координаты привязаны к bgmap.jpg (11184x6288) → система 1600x900
'use strict';

// ==================== ПОРТЫ ====================
const PORTS = [
${portsJS}
];

// ==================== МАРШРУТЫ (связи по воде) ====================
const ROUTES = [
${routesJS}
];

${tail}`;

  try {
    fs.writeFileSync(mapDataPath, newContent, 'utf8');
    // Clear require cache so next request picks up changes
    delete require.cache[require.resolve('./mapData')];
    delete require.cache[require.resolve('./referenceData')];
    res.json({ ok: true, ports: ports.length, routes: routes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'admin.html'));
});

// Serve popup panel pages
app.get('/panel/:name', (req, res) => {
  const panelName = req.params.name;
  const PANEL_TITLES = {
    fleet: 'Суда / Дислокация',
    exchange: 'Биржа',
    offer: 'Оферта',
    contracts: 'Договоры',
    mail: 'Почта',
    account: 'Счёт',
    port: 'Порт',
    reports: 'Отчёты / НСИ',
    log: 'Журнал',
  };
  const title = PANEL_TITLES[panelName];
  if (!title) return res.status(404).send('Panel not found');

  res.type('html').send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>DIF3 — ${title}</title>
  <link rel="stylesheet" href="/css/main.css">
  <link rel="stylesheet" href="/css/panels.css">
  <style>
    body { background: #151820; overflow: auto; height: auto; }
    .popup-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 16px; background: #1a1d26; border-bottom: 1px solid #262a34;
    }
    .popup-title { font-size: 16px; font-weight: bold; color: #5aa8d0; }
    .popup-status { font-size: 12px; color: #6a7080; }
    .popup-content { padding: 14px; }
  </style>
</head>
<body>
  <div class="popup-header">
    <span class="popup-title">${title}</span>
    <span class="popup-status" id="status">Подключение...</span>
  </div>
  <div class="popup-content" id="panel-content"></div>
  <script src="/socket.io/socket.io.js"></script>
  <script src="/shared/constants.js"></script>
  <script src="/shared/mapData.js"></script>
  <script src="/js/ui/${panelName}Panel.js"></script>
  <script>
    var socket = io();
    window.gameSocket = socket;
    window.gameState = { myId: null, myPlayer: null, players: {}, config: {}, ships: {} };
    var companyId = parseInt(new URLSearchParams(location.search).get('cid'));
    socket.on('connect', function() {
      document.getElementById('status').textContent = 'Подключено';
      document.getElementById('status').style.color = '#4caf50';
      if (companyId) {
        socket.emit('game:popupAttach', { companyId: companyId }, function() {
          socket.emit('game:getState');
        });
      } else {
        socket.emit('game:getState');
      }
    });
    socket.on('game:state', function(state) {
      window.gameState.myId = state.myId;
      window.gameState.players = state.players;
      window.gameState.config = state.config;
      window.gameState.isHost = state.isHost;
      window.gameState.ships = state.ships || {};
      if (state.myId && state.players[state.myId]) {
        window.gameState.myPlayer = state.players[state.myId];
      }
      var panel = window.${panelName.charAt(0).toUpperCase() + panelName.slice(1)}Panel;
      if (panel && panel.render) panel.render(document.getElementById('panel-content'));
    });
    socket.on('game:tick', function(data) {
      if (data.ships) window.gameState.ships = data.ships;
    });
    socket.on('player:balanceUpdate', function(data) {
      if (window.gameState.myPlayer) window.gameState.myPlayer.balance = data.balance;
    });
    socket.on('game:playersUpdate', function(data) {
      window.gameState.players = data.players;
      if (data.ships) window.gameState.ships = data.ships;
      if (window.gameState.myId && data.players[window.gameState.myId]) {
        window.gameState.myPlayer = data.players[window.gameState.myId];
      }
      var panel = window.${panelName.charAt(0).toUpperCase() + panelName.slice(1)}Panel;
      if (panel && panel.render) panel.render(document.getElementById('panel-content'));
    });
    socket.on('disconnect', function() {
      document.getElementById('status').textContent = 'Отключено';
      document.getElementById('status').style.color = '#ff4444';
    });
  </script>
</body>
</html>`);
});

// Game modules
const lobby = require('./lobby');
const gameStateModule = require('./gameState');
const mapData = require('./mapData');
const referenceData = require('./referenceData');
const shipManager = require('./shipManager');
const exchange = require('./exchange');
const cargoManager = require('./cargoManager');
const offerSystem = require('./offerSystem');
const contractHistory = require('./contractHistory');
const mailSystem = require('./mailSystem');
const accountSystem = require('./accountSystem');
const newsSystem = require('./newsSystem');
const actionLog = require('./actionLog');

// Popup window sockets (don't mark player as disconnected on close)
const popupSockets = new Set();

// ==================== GAME TICK ====================
function setupGameTick() {
  const state = gameStateModule.getState();
  if (!state || !state.clock) return;

  // Initialize modules
  shipManager.init(io, state);
  exchange.init(io, state);
  cargoManager.init(io, state);
  offerSystem.init(io, state);
  mailSystem.init(io);
  accountSystem.init(io, state);
  actionLog.init(io, state);

  // Create initial ships and prices
  shipManager.createInitialShips(state.players);
  exchange.initializePrices();

  // Initialize news system
  newsSystem.init(io, state);

  // Default news mode
  state.newsMode = state.newsMode || 'news_and_drift';

  // Infinite supply by default
  state.infiniteSupply = true;

  // Default restock interval (days)
  state.restockDays = state.restockDays || 3;

  state.clock.onTick((gameTime) => {
    // Update ship positions, check operation completions
    shipManager.updatePositions();

    // Update exchange prices
    exchange.tickPrices();

    // Restock supplies
    exchange.tickRestock();

    // Update news (frequency configured in settings)
    newsSystem.tickNews();

    // Broadcast tick to all connected clients
    io.emit('game:tick', {
      time: gameTime.toISOString(),
      ships: state.ships,
    });
  });

  state.clock.start();
  console.log('Игра началась! Время тикает.');
}

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
  console.log(`Игрок подключился: ${socket.id}`);

  // Lobby events
  lobby.registerEvents(io, socket);

  // Game module events (active once game is started)
  shipManager.registerEvents(io, socket);
  exchange.registerEvents(io, socket);
  cargoManager.registerEvents(io, socket);
  offerSystem.registerEvents(io, socket);
  contractHistory.registerEvents(io, socket);
  mailSystem.registerEvents(io, socket);
  accountSystem.registerEvents(io, socket);
  actionLog.registerEvents(io, socket);

  // ---- Admin events ----
  socket.on('admin:getAll', (_, callback) => {
    const state = gameStateModule.getState();
    if (!state) return callback && callback({ error: 'Игра не начата' });
    // Отфильтровать popup-сокеты из списка игроков для админки
    const filteredPlayers = {};
    Object.entries(state.players).forEach(([id, p]) => {
      if (!popupSockets.has(id)) filteredPlayers[id] = p;
    });
    callback({
      players: filteredPlayers,
      prices: state.prices,
      config: state.config,
      gameTime: state.clock.getTimeISO(),
      paused: state.clock.paused,
      speed: state.clock.speedMultiplier,
      infiniteSupply: !!state.infiniteSupply,
      travelMultiplier: referenceData.getTravelTimeMultiplier(),
      newsMode: state.newsMode || 'news_and_drift',
      newsStats: newsSystem.getNewsCount(),
      newsFrequencyHours: state.config.newsFrequencyHours || 2,
      restockDays: state.restockDays || 3,
    });
  });

  socket.on('admin:setPrice', (data, callback) => {
    const state = gameStateModule.getState();
    if (!state) return callback && callback({ error: 'Игра не начата' });
    const { portId, cargoId, buyPrice, sellPrice, supply } = data;
    if (!state.prices[portId] || !state.prices[portId][cargoId]) {
      return callback && callback({ error: 'Порт/груз не найден' });
    }
    const e = state.prices[portId][cargoId];
    if (buyPrice != null) e.buyPrice = Math.max(1, Math.round(buyPrice));
    if (sellPrice != null) e.sellPrice = Math.max(1, Math.round(sellPrice));
    if (supply != null) e.supply = Math.max(0, Math.round(supply));
    io.emit('exchange:prices', state.prices);
    callback && callback({ success: true });
  });

  socket.on('admin:setBalance', (data, callback) => {
    const state = gameStateModule.getState();
    if (!state) return callback && callback({ error: 'Игра не начата' });
    const { playerId, balance } = data;
    const player = state.players[playerId];
    if (!player) return callback && callback({ error: 'Игрок не найден' });
    const diff = balance - player.balance;
    gameStateModule.adjustBalance(playerId, diff, 'Корректировка администратором');
    io.to(playerId).emit('player:balanceUpdate', { balance: player.balance });
    callback && callback({ success: true, newBalance: player.balance });
  });

  socket.on('admin:setTime', (data, callback) => {
    const state = gameStateModule.getState();
    if (!state) return callback && callback({ error: 'Игра не начата' });
    if (data.action === 'pause') { state.clock.pause(); io.emit('game:paused'); }
    else if (data.action === 'resume') { state.clock.resume(); io.emit('game:resumed'); }
    else if (data.action === 'setSpeed') {
      const s = Math.max(0.1, Math.min(100, parseFloat(data.speed) || 1));
      state.clock.setSpeed(s);
      io.emit('game:speedChanged', s);
    }
    callback && callback({ success: true, speed: state.clock.speedMultiplier });
  });

  socket.on('admin:setInfiniteSupply', (data, callback) => {
    const state = gameStateModule.getState();
    if (!state) return callback && callback({ error: 'Игра не начата' });
    state.infiniteSupply = !!data.enabled;
    io.emit('exchange:infiniteSupply', state.infiniteSupply);
    if (!state.infiniteSupply) {
      io.emit('exchange:prices', state.prices);
    }
    callback && callback({ success: true, infiniteSupply: state.infiniteSupply });
  });

  socket.on('admin:setAllSupply', (data, callback) => {
    const state = gameStateModule.getState();
    if (!state) return callback && callback({ error: 'Игра не начата' });
    const val = Math.max(0, Math.round(data.supply));
    Object.keys(state.prices).forEach(portId => {
      Object.keys(state.prices[portId]).forEach(cargoId => {
        state.prices[portId][cargoId].supply = val;
      });
    });
    io.emit('exchange:prices', state.prices);
    callback && callback({ success: true });
  });

  socket.on('admin:setAllBalance', (data, callback) => {
    const state = gameStateModule.getState();
    if (!state) return callback && callback({ error: 'Игра не начата' });
    const balance = Math.round(data.balance) || 0;
    Object.entries(state.players).forEach(([pid, player]) => {
      if (player.isNPC) return;
      const diff = balance - player.balance;
      gameStateModule.adjustBalance(pid, diff, 'Единый баланс (администратор)');
      io.to(pid).emit('player:balanceUpdate', { balance: player.balance });
    });
    callback && callback({ success: true, balance });
  });

  socket.on('admin:startGame', (_, callback) => {
    const lobbyState = lobby.getLobbyState();
    if (lobbyState.started) return callback && callback({ error: 'Игра уже запущена' });
    const players = Object.values(lobbyState.players);
    if (players.length < 1) return callback && callback({ error: 'Нет игроков в лобби' });

    lobbyState.started = true;
    gameStateModule.initGame(lobbyState.players, lobbyState.config);
    setupGameTick();
    io.emit('lobby:gameStarted', {
      config: lobbyState.config,
      players: lobbyState.players,
    });
    callback && callback({ success: true });
  });

  socket.on('admin:toggleEditor', (data, callback) => {
    const enabled = !!data.enabled;
    io.emit('editor:toggle', { enabled });
    callback && callback({ success: true, enabled });
  });

  socket.on('admin:setTravelMultiplier', (data, callback) => {
    const val = parseFloat(data.multiplier) || 1;
    const result = referenceData.setTravelTimeMultiplier(val);
    callback && callback({ success: true, multiplier: result });
  });

  socket.on('admin:setNewsMode', (data, callback) => {
    const state = gameStateModule.getState();
    if (!state) return callback && callback({ error: 'Игра не начата' });
    const valid = ['news_only', 'news_and_drift', 'drift_only'];
    const mode = valid.includes(data.mode) ? data.mode : 'news_and_drift';
    state.newsMode = mode;
    callback && callback({ success: true, newsMode: mode });
  });

  socket.on('admin:setRestockDays', (data, callback) => {
    const state = gameStateModule.getState();
    if (!state) return callback && callback({ error: 'Игра не начата' });
    const days = Math.max(1, Math.min(30, parseFloat(data.days) || 3));
    state.restockDays = days;
    callback && callback({ success: true, restockDays: days });
  });

  socket.on('admin:setNewsFrequency', (data, callback) => {
    const state = gameStateModule.getState();
    if (!state) return callback && callback({ error: 'Игра не начата' });
    const hours = Math.max(1, Math.min(48, parseInt(data.hours) || 3));
    state.config.newsFrequencyHours = hours;
    callback && callback({ success: true, newsFrequencyHours: hours });
  });

  // ---- Game state request ----
  socket.on('game:getState', () => {
    const state = gameStateModule.getState();
    if (!state) return;

    const lobbyState = lobby.getLobbyState();
    socket.emit('game:state', {
      myId: socket.id,
      players: state.players,
      config: state.config,
      isHost: socket.id === lobbyState.hostId,
      ships: state.ships,
      gameTime: state.clock.getTimeISO(),
      paused: state.clock.paused,
      speed: state.clock.speedMultiplier,
      infiniteSupply: !!state.infiniteSupply,
    });
  });

  // ---- Host controls ----
  socket.on('game:pause', () => {
    const lobbyState = lobby.getLobbyState();
    if (socket.id !== lobbyState.hostId) return;
    const state = gameStateModule.getState();
    if (!state) return;
    state.clock.pause();
    io.emit('game:paused');
    console.log('Игра на паузе');
  });

  socket.on('game:resume', () => {
    const lobbyState = lobby.getLobbyState();
    if (socket.id !== lobbyState.hostId) return;
    const state = gameStateModule.getState();
    if (!state) return;
    state.clock.resume();
    io.emit('game:resumed');
    console.log('Игра возобновлена');
  });

  socket.on('game:setSpeed', (speed) => {
    const lobbyState = lobby.getLobbyState();
    if (socket.id !== lobbyState.hostId) return;
    const state = gameStateModule.getState();
    if (!state) return;
    const s = Math.max(0.1, Math.min(100, parseFloat(speed) || 1));
    state.clock.setSpeed(s);
    io.emit('game:speedChanged', s);
    console.log(`Скорость времени: x${s}`);
  });

  // ---- Popup window attach (share player identity without breaking main window) ----
  socket.on('game:popupAttach', (data, callback) => {
    const state = gameStateModule.getState();
    if (!state) return callback && callback({ error: 'Игра не начата' });

    const { companyId } = data;
    // Find the player by companyId
    const entry = Object.entries(state.players).find(([, p]) =>
      p.companyId === companyId
    );
    if (!entry) return callback && callback({ error: 'Компания не найдена' });

    const [, player] = entry;
    // Register popup socket with same player object (by reference)
    state.players[socket.id] = player;
    popupSockets.add(socket.id);
    console.log(`Popup окно подключено к ${player.companyName} (${socket.id})`);
    callback && callback({ success: true });
  });

  // ---- Disconnect ----
  socket.on('disconnect', () => {
    console.log(`Игрок отключился: ${socket.id}`);
    lobby.handleDisconnect(io, socket);

    const state = gameStateModule.getState();
    if (state && state.players[socket.id]) {
      if (popupSockets.has(socket.id)) {
        // Popup window closed — just remove the reference, don't mark player as disconnected
        delete state.players[socket.id];
        popupSockets.delete(socket.id);
      } else {
        // Main window disconnected
        state.players[socket.id].disconnected = true;
        state.players[socket.id].disconnectedAt = Date.now();
        console.log(`Игрок ${state.players[socket.id].companyName} отключился от игры (данные сохранены)`);
      }
    }
  });

  // ---- Reconnect to game ----
  socket.on('game:reconnect', (data, callback) => {
    const state = gameStateModule.getState();
    if (!state) return callback && callback({ error: 'Игра не найдена' });

    const { companyId } = data;
    // Найти игрока по companyId (отключённого ИЛИ с другим socketId после навигации)
    const entry = Object.entries(state.players).find(([id, p]) =>
      p.companyId === companyId && id !== socket.id
    );
    if (!entry) return callback && callback({ error: 'Компания не найдена' });

    const [oldSocketId, player] = entry;

    // Перенести данные на новый socket id
    player.id = socket.id;
    player.disconnected = false;
    delete player.disconnectedAt;
    state.players[socket.id] = player;
    delete state.players[oldSocketId];

    // Перенести владение судами
    Object.values(state.ships).forEach(ship => {
      if (ship.ownerId === oldSocketId) ship.ownerId = socket.id;
    });

    // Перенести транзакции
    if (state.transactions[oldSocketId]) {
      state.transactions[socket.id] = state.transactions[oldSocketId];
      delete state.transactions[oldSocketId];
    }

    // Перенести склады
    Object.values(state.ports).forEach(port => {
      if (port.warehouses && port.warehouses[oldSocketId]) {
        port.warehouses[socket.id] = port.warehouses[oldSocketId];
        delete port.warehouses[oldSocketId];
      }
    });

    // Перенести оферты
    Object.values(state.offers).forEach(offer => {
      if (offer.chartererId === oldSocketId) offer.chartererId = socket.id;
      if (offer.shipOwnerId === oldSocketId) offer.shipOwnerId = socket.id;
    });

    // Перенести контракты
    Object.values(state.contracts).forEach(contract => {
      if (contract.chartererId === oldSocketId) contract.chartererId = socket.id;
      if (contract.shipOwnerId === oldSocketId) contract.shipOwnerId = socket.id;
    });

    // Перенести почту
    state.mail.forEach(msg => {
      if (msg.to === oldSocketId) msg.to = socket.id;
      if (msg.from === oldSocketId) msg.from = socket.id;
    });

    // Перенести логи действий
    actionLog.transferLogs(oldSocketId, socket.id);

    console.log(`Игрок ${player.companyName} переподключился (${oldSocketId} → ${socket.id})`);
    if (callback) callback({ success: true });

    // Оповестить всех о переподключении (без popup-сокетов)
    const playersFiltered = {};
    Object.entries(state.players).forEach(([id, p]) => {
      if (!popupSockets.has(id)) playersFiltered[id] = p;
    });
    io.emit('game:playersUpdate', { players: playersFiltered, ships: state.ships });

    socket.emit('game:state', {
      myId: socket.id,
      players: state.players,
      config: state.config,
      isHost: false,
      ships: state.ships,
      gameTime: state.clock.getTimeISO(),
      paused: state.clock.paused,
      infiniteSupply: !!state.infiniteSupply,
    });
  });
});

// ---- Listen for game start from lobby ----
// Override lobby:gameStarted to init game state
const origRegister = lobby.registerEvents;
lobby.registerEvents = function(io, socket) {
  origRegister(io, socket);

  // Intercept lobby:start to initialize game
  socket.on('lobby:start', () => {
    const lobbyState = lobby.getLobbyState();
    if (!lobbyState.started) return; // not yet started
    if (gameStateModule.getState()) return; // already initialized

    // Init game state
    gameStateModule.initGame(lobbyState.players, lobbyState.config);
    setupGameTick();
  });
};

// ==================== SERVER START ====================
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const isLAN = iface.address.startsWith('192.168.') ||
                      iface.address.startsWith('10.') ||
                      iface.address.startsWith('172.');
        const isWifi = /wi-?fi|wlan|wireless|беспроводн/i.test(name);
        ips.push({ name, address: iface.address, isLAN, isWifi });
      }
    }
  }
  // Sort: WiFi/LAN first
  ips.sort((a, b) => (b.isWifi + b.isLAN) - (a.isWifi + a.isLAN));
  return ips;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  console.log('='.repeat(50));
  console.log('  DIF3 — Морская торговая симуляция');
  console.log('='.repeat(50));
  console.log(`  Сервер запущен на порте ${PORT}`);
  console.log(`  Локально:  http://localhost:${PORT}`);
  if (ips.length > 0) {
    console.log('  По сети:');
    ips.forEach(ip => {
      const tag = ip.isWifi ? ' <-- WiFi' : '';
      console.log(`    http://${ip.address}:${PORT}  (${ip.name})${tag}`);
    });
    const lan = ips.find(ip => ip.isWifi) || ips.find(ip => ip.isLAN);
    if (lan) {
      console.log('');
      console.log(`  >>> Для LAN используй: http://${lan.address}:${PORT}`);
    }
  } else {
    console.log('  Сетевые интерфейсы не найдены');
  }
  console.log('='.repeat(50));
  console.log('');
  console.log('  Если ноутбуки в сети не видят игру — запустите');
  console.log('  firewall-setup.bat от имени администратора!');
  console.log('');

  // Auto-open browser
  const url = `http://localhost:${PORT}`;
  if (process.platform === 'win32') {
    exec(`start ${url}`);
  } else if (process.platform === 'darwin') {
    exec(`open ${url}`);
  } else {
    exec(`xdg-open ${url}`);
  }
});
