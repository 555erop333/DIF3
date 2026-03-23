// server/actionLog.js — Лог действий компании
'use strict';

let _io = null;
let _gameState = null;

// Logs stored per playerId
const logs = {}; // playerId -> [{ id, timestamp, category, action, details, amount? }]
let nextLogId = 1;

function init(io, gameState) {
  _io = io;
  _gameState = gameState;
}

/**
 * Записать действие в лог
 * @param {string} playerId - ID игрока
 * @param {string} category - Категория: exchange, ship, offer, cargo, account, contract, system
 * @param {string} action - Краткое действие
 * @param {string} details - Подробное описание
 * @param {number} [amount] - Сумма (опционально)
 */
function log(playerId, category, action, details, amount) {
  if (!playerId) return;

  if (!logs[playerId]) logs[playerId] = [];

  const entry = {
    id: nextLogId++,
    timestamp: _gameState ? _gameState.clock.getTimeISO() : new Date().toISOString(),
    category,
    action,
    details,
  };
  if (amount !== undefined) entry.amount = amount;

  logs[playerId].push(entry);

  // Notify client
  if (_io) {
    const sock = _io.sockets.sockets.get(playerId);
    if (sock) sock.emit('log:new', entry);
  }
}

function getLogs(playerId, category) {
  const playerLogs = logs[playerId] || [];
  if (category && category !== 'all') {
    return playerLogs.filter(e => e.category === category);
  }
  return playerLogs;
}

// Transfer logs when player reconnects with new socket id
function transferLogs(oldId, newId) {
  if (logs[oldId]) {
    logs[newId] = logs[oldId];
    delete logs[oldId];
  }
}

function registerEvents(io, socket) {
  socket.on('log:getAll', (data, callback) => {
    const category = data && data.category;
    const entries = getLogs(socket.id, category);
    if (callback) callback({ logs: entries });
  });
}

module.exports = { init, log, getLogs, transferLogs, registerEvents };
