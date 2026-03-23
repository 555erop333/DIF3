// server/accountSystem.js — Счёт: история операций + переводы
'use strict';

let _io = null;
let _gameState = null;

function init(io, gameState) {
  _io = io;
  _gameState = gameState;
}

// Свободный перевод между контрагентами
function transferMoney(fromId, toId, amount, description) {
  if (!_gameState) return { error: 'Игра не начата' };
  const fromPlayer = _gameState.players[fromId];
  const toPlayer = _gameState.players[toId];
  if (!fromPlayer) return { error: 'Отправитель не найден' };
  if (!toPlayer) return { error: 'Получатель не найден' };
  if (fromId === toId) return { error: 'Нельзя перевести самому себе' };
  if (amount <= 0) return { error: 'Сумма должна быть положительной' };
  if (fromPlayer.balance < amount) return { error: 'Недостаточно средств' };

  const desc = description || `Перевод для ${toPlayer.companyName}`;
  const gameStateModule = require('./gameState');
  gameStateModule.adjustBalance(fromId, -amount,
    `Перевод → ${toPlayer.companyName}: ${desc}`);
  gameStateModule.adjustBalance(toId, amount,
    `Перевод ← ${fromPlayer.companyName}: ${desc}`);

  // Уведомление
  const mailSystem = require('./mailSystem');
  mailSystem.systemNotify(_gameState, toId,
    `Получен перевод $${amount.toLocaleString()}`,
    `${fromPlayer.companyName} перевёл вам $${amount.toLocaleString()}. ${desc}`);

  if (_io) {
    const fromSock = _io.sockets.sockets.get(fromId);
    const toSock = _io.sockets.sockets.get(toId);
    if (fromSock) fromSock.emit('player:balanceUpdate', { balance: fromPlayer.balance });
    if (toSock) toSock.emit('player:balanceUpdate', { balance: toPlayer.balance });
  }

  return { success: true, newBalance: fromPlayer.balance };
}

// Получить историю операций
function getTransactions(playerId) {
  if (!_gameState) return [];
  return _gameState.transactions[playerId] || [];
}

// Получить список контрагентов для переводов
function getCounterparties(playerId) {
  if (!_gameState) return [];
  return Object.values(_gameState.players)
    .filter(p => p.id !== playerId && !p.isNPC)
    .map(p => ({ id: p.id, companyName: p.companyName, role: p.role }));
}

function registerEvents(io, socket) {
  socket.on('account:getTransactions', (_, callback) => {
    const transactions = getTransactions(socket.id);
    if (callback) callback({ transactions });
  });

  socket.on('account:transfer', (data, callback) => {
    const result = transferMoney(socket.id, data.toId, data.amount, data.description);
    if (callback) callback(result);
    if (result.success) {
      const actionLog = require('./actionLog');
      const toPlayer = _gameState.players[data.toId];
      actionLog.log(socket.id, 'account', 'Перевод отправлен',
        `→ ${toPlayer ? toPlayer.companyName : data.toId}: ${data.description || ''}`, -data.amount);
      actionLog.log(data.toId, 'account', 'Перевод получен',
        `← ${_gameState.players[socket.id]?.companyName || socket.id}: ${data.description || ''}`, data.amount);
    }
  });

  socket.on('account:getCounterparties', (_, callback) => {
    const counterparties = getCounterparties(socket.id);
    if (callback) callback({ counterparties });
  });
}

module.exports = { init, transferMoney, getTransactions, getCounterparties, registerEvents };
