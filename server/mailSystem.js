// server/mailSystem.js — Почта: личные + системные
'use strict';

let _io = null;

function init(io) {
  _io = io;
}

function sendMail(gameState, { from, to, subject, body }) {
  const msg = {
    id: 'mail_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    from,          // playerId или 'system'
    fromName: from === 'system' ? 'Система' : (gameState.players[from]?.companyName || from),
    to,
    subject,
    body,
    timestamp: gameState.clock.getTimeISO(),
    read: false,
    readBy: {},    // Для broadcast-сообщений: { playerId: true }
  };
  gameState.mail.push(msg);

  if (_io && to !== 'all') {
    const sock = _io.sockets.sockets.get(to);
    if (sock) sock.emit('mail:new', msg);
  } else if (_io && to === 'all') {
    _io.emit('mail:new', msg);
  }
  return msg;
}

function systemNotify(gameState, playerId, subject, body) {
  return sendMail(gameState, { from: 'system', to: playerId, subject, body });
}

function getInbox(gameState, playerId) {
  return gameState.mail
    .filter(m => m.to === playerId || m.to === 'all')
    .map(m => {
      if (m.to === 'all') {
        return { ...m, read: !!m.readBy[playerId] };
      }
      return m;
    });
}

function getUnreadCount(gameState, playerId) {
  return getInbox(gameState, playerId).filter(m => !isReadByPlayer(m, playerId)).length;
}

function isReadByPlayer(msg, playerId) {
  if (msg.to === 'all') return !!msg.readBy[playerId];
  return msg.read;
}

function markRead(gameState, mailId, playerId) {
  const msg = gameState.mail.find(m => m.id === mailId);
  if (!msg) return;
  if (msg.to === 'all') {
    msg.readBy[playerId] = true;
  } else {
    msg.read = true;
  }
}

function registerEvents(io, socket) {
  socket.on('mail:send', (data, callback) => {
    const gameState = require('./gameState').getState();
    if (!gameState) return callback && callback({ error: 'Игра не начата' });

    const { to, subject, body } = data;
    if (!to || !subject) return callback && callback({ error: 'Укажите получателя и тему' });

    const msg = sendMail(gameState, { from: socket.id, to, subject, body: body || '' });
    if (callback) callback({ success: true, msg });
  });

  socket.on('mail:getInbox', (_, callback) => {
    const gameState = require('./gameState').getState();
    if (!gameState) return callback && callback({ messages: [] });
    callback({ messages: getInbox(gameState, socket.id) });
  });

  socket.on('mail:markRead', (data) => {
    const gameState = require('./gameState').getState();
    if (!gameState) return;
    markRead(gameState, data.mailId, socket.id);
  });

  socket.on('mail:getUnread', (_, callback) => {
    const gameState = require('./gameState').getState();
    if (!gameState) return callback && callback({ count: 0 });
    callback({ count: getUnreadCount(gameState, socket.id) });
  });
}

module.exports = { init, sendMail, systemNotify, getInbox, getUnreadCount, isReadByPlayer, markRead, registerEvents };
