// server/lobby.js — Лобби: подключение, выбор роли, настройки
const { PRESET_COMPANIES, PLAYER_ROLES, DEFAULT_CONFIG } = require('../shared/constants');
const gameStateModule = require('./gameState');
const shipManager = require('./shipManager');

const lobbyState = {
  players: {},       // socketId -> { id, companyId, companyName, role, ready }
  config: { ...DEFAULT_CONFIG },
  started: false,
  hostId: null,
};

function registerEvents(io, socket) {
  // Присоединиться к лобби (или к идущей игре)
  socket.on('lobby:join', (data, callback) => {
    const { companyId, role } = data;

    // Найти компанию в пресетах
    const list = role === PLAYER_ROLES.CHARTERER
      ? PRESET_COMPANIES.charterers
      : PRESET_COMPANIES.shipOwners;
    const company = list.find(c => c.id === companyId);
    if (!company) {
      return callback({ error: 'Компания не найдена' });
    }

    // --- Игра уже идёт: подключить к игре напрямую ---
    if (lobbyState.started) {
      const state = gameStateModule.getState();
      if (!state) return callback({ error: 'Ошибка состояния игры' });

      // Проверить, что компания не занята в игре
      const taken = Object.values(state.players).find(
        p => p.companyId === companyId && !p.disconnected
      );
      if (taken) {
        return callback({ error: 'Эта компания уже занята другим игроком' });
      }

      // Может быть disconnected игрок с такой компанией — переподключить
      const disconnected = Object.entries(state.players).find(
        ([, p]) => p.companyId === companyId && p.disconnected
      );
      if (disconnected) {
        const [oldId, player] = disconnected;
        player.id = socket.id;
        player.disconnected = false;
        delete player.disconnectedAt;
        state.players[socket.id] = player;
        delete state.players[oldId];
        // Перенести владение судами
        Object.values(state.ships).forEach(ship => {
          if (ship.ownerId === oldId) ship.ownerId = socket.id;
        });
        if (state.transactions[oldId]) {
          state.transactions[socket.id] = state.transactions[oldId];
          delete state.transactions[oldId];
        }
        console.log(`Игрок ${player.companyName} переподключился через лобби`);
      } else {
        // Новый игрок — добавить в игру
        gameStateModule.addPlayer(socket.id, {
          companyId: company.id,
          companyName: company.name,
          role,
        });
        // Создать суда для судовладельца
        shipManager.createShipsForLatePlayer(socket.id, role);
        console.log(`Новый игрок ${company.name} (${role}) присоединился к идущей игре`);
      }

      // Оповестить всех о новом/вернувшемся игроке
      io.emit('game:playersUpdate', { players: state.players, ships: state.ships });

      callback({ success: true, isHost: false, lateJoin: true });
      return;
    }

    // --- Обычное лобби ---
    // Проверить, что компания не занята
    const taken = Object.values(lobbyState.players).find(p => p.companyId === companyId);
    if (taken) {
      return callback({ error: 'Эта компания уже занята другим игроком' });
    }

    // Первый игрок — хост
    if (!lobbyState.hostId) {
      lobbyState.hostId = socket.id;
    }

    lobbyState.players[socket.id] = {
      id: socket.id,
      companyId: company.id,
      companyName: company.name,
      role,
      ready: false,
    };

    callback({ success: true, isHost: socket.id === lobbyState.hostId });
    broadcastLobbyState(io);
  });

  // Готовность
  socket.on('lobby:ready', (_, callback) => {
    const player = lobbyState.players[socket.id];
    if (!player) return;
    player.ready = !player.ready;
    if (callback) callback({ ready: player.ready });
    broadcastLobbyState(io);
  });

  // Хост: настройка
  socket.on('lobby:configure', (config, callback) => {
    if (socket.id !== lobbyState.hostId) {
      return callback && callback({ error: 'Только хост может настраивать' });
    }
    Object.assign(lobbyState.config, config);
    if (callback) callback({ success: true });
    broadcastLobbyState(io);
  });

  // Хост: запуск игры
  socket.on('lobby:start', (_, callback) => {
    if (socket.id !== lobbyState.hostId) {
      return callback && callback({ error: 'Только хост может начать игру' });
    }

    const players = Object.values(lobbyState.players);
    if (players.length < 1) {
      return callback && callback({ error: 'Нужен минимум 1 игрок' });
    }

    const allReady = players.length === 1 || players.every(p => p.ready);
    if (!allReady) {
      return callback && callback({ error: 'Не все игроки готовы' });
    }

    lobbyState.started = true;
    if (callback) callback({ success: true });
    io.emit('lobby:gameStarted', {
      config: lobbyState.config,
      players: lobbyState.players,
    });
  });

  // Запрос текущего состояния
  socket.on('lobby:getState', (_, callback) => {
    if (callback) {
      callback({
        ...lobbyState,
        isHost: socket.id === lobbyState.hostId,
        myId: socket.id,
      });
    }
  });
}

function handleDisconnect(io, socket) {
  delete lobbyState.players[socket.id];

  // Если хост ушёл — назначить нового
  if (socket.id === lobbyState.hostId) {
    const remaining = Object.keys(lobbyState.players);
    lobbyState.hostId = remaining.length > 0 ? remaining[0] : null;
  }

  broadcastLobbyState(io);
}

function broadcastLobbyState(io) {
  const sockets = Array.from(io.sockets.sockets.keys());
  sockets.forEach(socketId => {
    const s = io.sockets.sockets.get(socketId);
    if (s) {
      s.emit('lobby:state', {
        players: lobbyState.players,
        config: lobbyState.config,
        started: lobbyState.started,
        hostId: lobbyState.hostId,
        isHost: socketId === lobbyState.hostId,
        myId: socketId,
      });
    }
  });
}

function getLobbyState() {
  return lobbyState;
}

function resetLobby() {
  lobbyState.players = {};
  lobbyState.config = { ...DEFAULT_CONFIG };
  lobbyState.started = false;
  lobbyState.hostId = null;
}

module.exports = { registerEvents, handleDisconnect, getLobbyState, resetLobby };
