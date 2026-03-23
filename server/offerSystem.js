// server/offerSystem.js — Оферты: полная форма по морским стандартам
'use strict';

const { OFFER_STATUS, CONTRACT_STATUS } = require('../shared/constants');

let _io = null;
let _gameState = null;

// Доля оплаты при принятии оферты (до погрузки)
function getFirstPaymentRatio(terms) {
  if (terms === '100% до погрузки') return 1.0;
  if (terms === '50% до погрузки, 50% после выгрузки') return 0.5;
  if (terms === '30% до погрузки, 70% после выгрузки') return 0.3;
  if (terms === '100% после выгрузки') return 0;
  return 0;
}

// Доля оплаты при завершении контракта (после выгрузки)
function getRemainingPaymentRatio(terms) {
  return 1.0 - getFirstPaymentRatio(terms);
}

function init(io, gameState) {
  _io = io;
  _gameState = gameState;
}

function createOffer(chartererId, data) {
  if (!_gameState) return { error: 'Игра не начата' };
  const player = _gameState.players[chartererId];
  if (!player || player.role !== 'charterer') return { error: 'Только фрахтователь может создавать оферты' };

  const id = 'offer_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const offer = {
    id,
    chartererId,
    chartererName: player.companyName,
    recipientId: data.recipientId || null,        // null = для всех судовладельцев
    recipientName: data.recipientId ? _gameState.players[data.recipientId]?.companyName : 'Всем',
    // Основные поля
    originPort: data.originPort,
    destPort: data.destPort,
    cargoType: data.cargoType,
    cargoDescription: data.cargoDescription || '',
    tons: data.tons,
    freightRate: data.freightRate,                 // Ставка фрахта (общая сумма)
    // Оферта
    offerType: data.offerType || 'firm',           // firm / free
    validUntil: data.validUntil || null,           // Срок действия
    // Сроки
    laydays: data.laydays || null,                 // Дата начала погрузки
    cancelling: data.cancelling || null,           // Крайняя дата
    // Демередж / Диспач
    demurrageLoading: data.demurrageLoading || 0,  // $/сут в порту погрузки
    demurrageUnloading: data.demurrageUnloading || 0,
    dispatchLoading: data.dispatchLoading || 0,    // $/сут
    dispatchUnloading: data.dispatchUnloading || 0,
    // Условия
    paymentTerms: data.paymentTerms || '50% до погрузки, 50% после выгрузки',
    cargoHandling: data.cargoHandling || 'Грузовладельца',
    charterProforma: data.charterProforma || 'Gencon',
    // Статус
    status: OFFER_STATUS.OPEN,
    createdAt: _gameState.clock.getTimeISO(),
    // Принятие
    shipOwnerId: null,
    shipOwnerName: null,
    assignedShipId: null,
    assignedShipName: null,
    // Контракт
    contractId: null,
  };

  _gameState.offers[id] = offer;

  // Отправить судовладельцу или всем
  if (offer.recipientId) {
    const sock = _io?.sockets?.sockets?.get(offer.recipientId);
    if (sock) sock.emit('offer:new', offer);
  } else {
    // Всем судовладельцам
    Object.entries(_gameState.players).forEach(([pid, p]) => {
      if (p.role === 'shipOwner') {
        const sock = _io?.sockets?.sockets?.get(pid);
        if (sock) sock.emit('offer:new', offer);
      }
    });
  }

  // Уведомление по почте
  const mailSystem = require('./mailSystem');
  if (offer.recipientId) {
    mailSystem.systemNotify(_gameState, offer.recipientId,
      `Новая оферта от ${offer.chartererName}`,
      `${offer.tons}т ${offer.cargoType}, ${offer.originPort} → ${offer.destPort}, фрахт: $${offer.freightRate}`);
  }

  return { success: true, offer };
}

function acceptOffer(offerId, shipOwnerId, shipId) {
  if (!_gameState) return { error: 'Игра не начата' };
  const offer = _gameState.offers[offerId];
  if (!offer) return { error: 'Оферта не найдена' };
  if (offer.status !== OFFER_STATUS.OPEN) return { error: 'Оферта уже не активна' };

  const player = _gameState.players[shipOwnerId];
  if (!player || player.role !== 'shipOwner') return { error: 'Только судовладелец может принять' };

  const ship = _gameState.ships[shipId];
  if (!ship) return { error: 'Судно не найдено' };
  if (ship.ownerId !== shipOwnerId) return { error: 'Это не ваше судно' };

  // Обновить оферту
  offer.status = OFFER_STATUS.ACCEPTED;
  offer.shipOwnerId = shipOwnerId;
  offer.shipOwnerName = player.companyName;
  offer.assignedShipId = shipId;
  offer.assignedShipName = ship.name;

  // Привязать судно к оферте
  ship.offerId = offerId;

  // Создать контракт
  const contractHistory = require('./contractHistory');
  const contract = contractHistory.createContract(_gameState, offer);
  offer.contractId = contract.id;

  // Оплата первой части фрахта по условиям
  const firstPaymentRatio = getFirstPaymentRatio(offer.paymentTerms);
  if (firstPaymentRatio > 0) {
    const firstPayment = Math.round(offer.freightRate * firstPaymentRatio);
    const gameStateModule = require('./gameState');
    gameStateModule.adjustBalance(offer.chartererId, -firstPayment,
      `Фрахт (аванс ${Math.round(firstPaymentRatio * 100)}%): оферта ${offerId}, ${ship.name}`);
    gameStateModule.adjustBalance(shipOwnerId, firstPayment,
      `Фрахт (аванс ${Math.round(firstPaymentRatio * 100)}%): оферта ${offerId}, ${ship.name}`);
  }

  // Уведомления
  const mailSystem = require('./mailSystem');
  mailSystem.systemNotify(_gameState, offer.chartererId,
    `Оферта принята`,
    `${player.companyName} принял вашу оферту судном ${ship.name}. Договор №${contract.id}`);
  mailSystem.systemNotify(_gameState, shipOwnerId,
    `Вы приняли оферту`,
    `Оферта от ${offer.chartererName}: ${offer.tons}т ${offer.cargoType}. Судно: ${ship.name}. Договор №${contract.id}`);

  if (_io) {
    _io.emit('offer:update', offer);
  }

  return { success: true, offer, contract };
}

function cancelOffer(offerId, playerId) {
  if (!_gameState) return { error: 'Игра не начата' };
  const offer = _gameState.offers[offerId];
  if (!offer) return { error: 'Оферта не найдена' };
  if (offer.chartererId !== playerId && offer.shipOwnerId !== playerId) {
    return { error: 'Вы не участник этой оферты' };
  }
  if (offer.status === OFFER_STATUS.COMPLETED || offer.status === OFFER_STATUS.CANCELLED) {
    return { error: 'Оферта уже завершена' };
  }

  offer.status = OFFER_STATUS.CANCELLED;

  // Отвязать судно
  if (offer.assignedShipId) {
    const ship = _gameState.ships[offer.assignedShipId];
    if (ship) ship.offerId = null;
  }

  if (_io) _io.emit('offer:update', offer);

  return { success: true };
}

function getOffers(playerId) {
  if (!_gameState) return [];
  const player = _gameState.players[playerId];
  if (!player) return [];

  return Object.values(_gameState.offers).filter(o => {
    if (player.role === 'charterer') return o.chartererId === playerId;
    // Судовладелец видит открытые оферты для него или для всех
    return o.status === OFFER_STATUS.OPEN && (!o.recipientId || o.recipientId === playerId)
        || o.shipOwnerId === playerId;
  });
}

function registerEvents(io, socket) {
  socket.on('offer:create', (data, callback) => {
    const result = createOffer(socket.id, data);
    if (callback) callback(result);
    if (result.success) {
      const actionLog = require('./actionLog');
      const o = result.offer;
      actionLog.log(socket.id, 'offer', 'Создание оферты',
        `${o.tons}т ${o.cargoType}, ${o.originPort} → ${o.destPort}, фрахт: $${o.freightRate}`, -o.freightRate);
    }
  });

  socket.on('offer:accept', (data, callback) => {
    const result = acceptOffer(data.offerId, socket.id, data.shipId);
    if (callback) callback(result);
    if (result.success) {
      const actionLog = require('./actionLog');
      const o = result.offer;
      actionLog.log(socket.id, 'offer', 'Принятие оферты',
        `${o.tons}т ${o.cargoType}, судно: ${o.assignedShipName}, договор: ${result.contract.id}`);
      actionLog.log(o.chartererId, 'offer', 'Оферта принята',
        `${o.shipOwnerName} принял, судно: ${o.assignedShipName}`);
    }
  });

  socket.on('offer:cancel', (data, callback) => {
    const result = cancelOffer(data.offerId, socket.id);
    if (callback) callback(result);
    if (result.success) {
      const actionLog = require('./actionLog');
      actionLog.log(socket.id, 'offer', 'Отмена оферты', `Оферта ${data.offerId} отменена`);
    }
  });

  socket.on('offer:getList', (_, callback) => {
    const offers = getOffers(socket.id);
    if (callback) callback({ offers });
  });
}

module.exports = { init, createOffer, acceptOffer, cancelOffer, getOffers, registerEvents };
