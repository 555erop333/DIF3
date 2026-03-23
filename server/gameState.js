// server/gameState.js — Центральный объект состояния игры
'use strict';

const GameClock = require('./gameClock');
const { SHIP_STATUS, DEFAULT_CONFIG } = require('../shared/constants');

let gameState = null;

function initGame(lobbyPlayers, config) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  gameState = {
    clock: new GameClock(cfg.startDate, cfg.timeSpeed),
    config: cfg,
    players: {},    // socketId -> { id, companyId, companyName, role, balance }
    ships: {},      // shipId -> { id, name, type, project, ownerId, currentPort, status, cargo, ... }
    ports: {},      // portId -> { shipsInPort: [], warehouses: {} }
    offers: {},     // offerId -> { ... }
    contracts: {},  // contractId -> { ... }
    mail: [],       // { id, from, to, subject, body, timestamp, read }
    transactions: {}, // playerId -> [{ type, amount, description, timestamp, balanceAfter }]
    prices: {},     // portId -> { cargoTypeId -> { buyPrice, sellPrice, supply } }
    nextId: 1,
  };

  // Initialize players from lobby
  for (const [socketId, lobbyPlayer] of Object.entries(lobbyPlayers)) {
    gameState.players[socketId] = {
      id: socketId,
      companyId: lobbyPlayer.companyId,
      companyName: lobbyPlayer.companyName,
      role: lobbyPlayer.role,
      balance: cfg.startBalance,
    };
    gameState.transactions[socketId] = [];
  }

  return gameState;
}

function getState() {
  return gameState;
}

function generateId() {
  if (!gameState) return 'id_0';
  return 'id_' + (gameState.nextId++);
}

function getPlayerById(socketId) {
  return gameState ? gameState.players[socketId] : null;
}

function adjustBalance(playerId, amount, description) {
  const player = gameState.players[playerId];
  if (!player) return false;

  player.balance += amount;

  if (!gameState.transactions[playerId]) {
    gameState.transactions[playerId] = [];
  }

  gameState.transactions[playerId].push({
    id: generateId(),
    type: amount >= 0 ? 'income' : 'expense',
    amount: Math.abs(amount),
    description,
    timestamp: gameState.clock.getTimeISO(),
    balanceAfter: player.balance,
  });

  return true;
}

function addPlayer(socketId, playerData) {
  if (!gameState) return null;
  gameState.players[socketId] = {
    id: socketId,
    companyId: playerData.companyId,
    companyName: playerData.companyName,
    role: playerData.role,
    balance: gameState.config.startBalance,
  };
  gameState.transactions[socketId] = [];
  return gameState.players[socketId];
}

function resetGame() {
  if (gameState && gameState.clock) {
    gameState.clock.destroy();
  }
  gameState = null;
}

module.exports = {
  initGame,
  getState,
  generateId,
  getPlayerById,
  adjustBalance,
  addPlayer,
  resetGame,
};
