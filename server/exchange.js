// server/exchange.js — Биржа: динамические цены
'use strict';

const { CARGO_LIST } = require('../shared/constants');
const { PORTS } = require('./mapData');

let _io = null;
let _gameState = null;
let lastPriceUpdate = null;
let lastRestockTime = null;

// Максимальное отклонение от базовой цены (±40%)
const MAX_DEVIATION = 0.40;
// Сила притяжения к базовой цене (0..1, чем больше — тем быстрее возврат)
const REVERSION_STRENGTH = 0.05;

function init(io, gameState) {
  _io = io;
  _gameState = gameState;
}

// Ограничить цену в коридоре вокруг базовой
function clampToBase(price, basePrice) {
  const min = Math.round(basePrice * (1 - MAX_DEVIATION));
  const max = Math.round(basePrice * (1 + MAX_DEVIATION));
  return Math.max(min, Math.min(max, price));
}

// Притянуть цену к базовой (mean reversion)
function revertToBase(price, basePrice, strength) {
  if (price === basePrice) return price;
  const diff = basePrice - price;
  return Math.round(price + diff * strength);
}

// Генерация начальных цен
function initializePrices() {
  if (!_gameState) return;

  const basePrices = {
    fruits: 800,
    fertilizers: 400,
    metal: 600,
    wood: 500,
  };

  _gameState.prices = {};
  PORTS.filter(p => p.isMain).forEach(port => {
    _gameState.prices[port.id] = {};
    CARGO_LIST.forEach(cargo => {
      const globalBase = basePrices[cargo.id] || 500;
      // Каждый порт получает свою базовую цену (±20% от глобальной)
      const portBase = Math.round(globalBase * (0.80 + Math.random() * 0.40));
      // Начальная цена = базовая ± небольшое отклонение
      const startVariation = 0.95 + Math.random() * 0.10;
      const buyPrice = Math.round(portBase * startVariation);
      const spread = 0.85 + Math.random() * 0.1;
      _gameState.prices[port.id][cargo.id] = {
        baseBuyPrice: portBase,
        buyPrice,
        sellPrice: Math.round(buyPrice * spread),
        supply: Math.floor(500 + Math.random() * 2000),
      };
    });
  });

  lastPriceUpdate = new Date(_gameState.clock.getTime() - 7 * 3600 * 1000);
  lastRestockTime = _gameState.clock.getTime();

  // Сразу отправить начальные цены клиентам
  if (_io) {
    _io.emit('exchange:prices', _gameState.prices);
  }
}

// Ресток запасов (вызывается из тика)
function tickRestock() {
  if (!_gameState || !_gameState.prices) return;

  const restockDays = _gameState.restockDays || 3;
  const now = _gameState.clock.getTime();
  if (!lastRestockTime) {
    lastRestockTime = now;
    return;
  }

  const daysSince = (now - lastRestockTime) / (24 * 3600 * 1000);
  if (daysSince < restockDays) return;

  lastRestockTime = now;

  Object.keys(_gameState.prices).forEach(portId => {
    Object.keys(_gameState.prices[portId]).forEach(cargoId => {
      const entry = _gameState.prices[portId][cargoId];
      entry.supply = Math.floor(2000 + Math.random() * 5000); // 2000-7000
    });
  });

  if (_io) {
    _io.emit('exchange:prices', _gameState.prices);
  }
}

// Обновление цен (вызывается из тика)
function tickPrices() {
  if (!_gameState || !_gameState.prices) return;

  // Drift отключён в режиме "только новости"
  const mode = _gameState.newsMode || 'news_and_drift';
  if (mode === 'news_only') return;

  const now = _gameState.clock.getTime();
  if (!lastPriceUpdate) {
    lastPriceUpdate = now;
    return;
  }

  // Обновлять каждые 6 игровых часов
  const hoursSinceUpdate = (now - lastPriceUpdate) / (3600 * 1000);
  if (hoursSinceUpdate < 6) return;

  lastPriceUpdate = now;

  Object.keys(_gameState.prices).forEach(portId => {
    Object.keys(_gameState.prices[portId]).forEach(cargoId => {
      const entry = _gameState.prices[portId][cargoId];
      const base = entry.baseBuyPrice || entry.buyPrice;

      // 1. Случайное блуждание
      const drift = (Math.random() - 0.48) * 0.06;
      let newBuy = Math.round(entry.buyPrice * (1 + drift));

      // 2. Mean reversion — притянуть к базовой
      newBuy = revertToBase(newBuy, base, REVERSION_STRENGTH);

      // 3. Ограничить коридор
      newBuy = clampToBase(newBuy, base);

      entry.buyPrice = Math.max(50, newBuy);
      entry.sellPrice = Math.round(entry.buyPrice * (0.85 + Math.random() * 0.1));
    });
  });

  if (_io) {
    _io.emit('exchange:prices', _gameState.prices);
  }
}

// Купить груз (фрахтователь)
function buyCargo(playerId, portId, cargoTypeId, tons) {
  if (!_gameState) return { error: 'Игра не начата' };
  const player = _gameState.players[playerId];
  if (!player) return { error: 'Игрок не найден' };
  if (player.role !== 'charterer') return { error: 'Только фрахтователь может покупать' };

  const priceEntry = _gameState.prices[portId]?.[cargoTypeId];
  if (!priceEntry) return { error: 'Цена не найдена' };
  if (!_gameState.infiniteSupply && priceEntry.supply < tons) return { error: `Недостаточно товара (доступно: ${priceEntry.supply}т)` };

  const totalCost = priceEntry.buyPrice * tons;
  if (player.balance < totalCost) return { error: `Недостаточно средств (нужно: $${totalCost.toLocaleString()})` };

  // Списать деньги
  const gameStateModule = require('./gameState');
  gameStateModule.adjustBalance(playerId, -totalCost,
    `Покупка ${tons}т ${cargoTypeId} в ${portId} по $${priceEntry.buyPrice}/т`);

  // Уменьшить предложение (если не бесконечные)
  if (!_gameState.infiniteSupply) priceEntry.supply -= tons;

  // Добавить на склад фрахтователя в порту
  if (!_gameState.ports[portId]) _gameState.ports[portId] = { warehouses: {} };
  if (!_gameState.ports[portId].warehouses[playerId]) _gameState.ports[portId].warehouses[playerId] = {};
  const wh = _gameState.ports[portId].warehouses[playerId];
  wh[cargoTypeId] = (wh[cargoTypeId] || 0) + tons;

  // Рост цены от спроса
  const base = priceEntry.baseBuyPrice || priceEntry.buyPrice;
  priceEntry.buyPrice = clampToBase(Math.round(priceEntry.buyPrice * 1.02), base);
  priceEntry.sellPrice = Math.round(priceEntry.buyPrice * 0.9);

  return { success: true, totalCost, newBalance: player.balance };
}

// Продать груз (фрахтователь)
function sellCargo(playerId, portId, cargoTypeId, tons) {
  if (!_gameState) return { error: 'Игра не начата' };
  const player = _gameState.players[playerId];
  if (!player) return { error: 'Игрок не найден' };
  if (player.role !== 'charterer') return { error: 'Только фрахтователь может продавать' };

  // Проверить склад
  const wh = _gameState.ports[portId]?.warehouses?.[playerId];
  if (!wh || (wh[cargoTypeId] || 0) < tons) {
    return { error: `На складе недостаточно товара` };
  }

  const priceEntry = _gameState.prices[portId]?.[cargoTypeId];
  if (!priceEntry) return { error: 'Цена не найдена' };

  const totalIncome = priceEntry.sellPrice * tons;

  // Зачислить деньги
  const gameStateModule = require('./gameState');
  gameStateModule.adjustBalance(playerId, totalIncome,
    `Продажа ${tons}т ${cargoTypeId} в ${portId} по $${priceEntry.sellPrice}/т`);

  // Убрать со склада
  wh[cargoTypeId] -= tons;
  if (wh[cargoTypeId] <= 0) delete wh[cargoTypeId];

  // Увеличить предложение, снизить цену
  if (!_gameState.infiniteSupply) priceEntry.supply += tons;
  const base2 = priceEntry.baseBuyPrice || priceEntry.buyPrice;
  priceEntry.buyPrice = clampToBase(Math.max(50, Math.round(priceEntry.buyPrice * 0.98)), base2);
  priceEntry.sellPrice = Math.round(priceEntry.buyPrice * 0.9);

  return { success: true, totalIncome, newBalance: player.balance };
}

function registerEvents(io, socket) {
  socket.on('exchange:getPrices', (_, callback) => {
    if (!_gameState) return callback && callback({ prices: {} });
    callback({ prices: _gameState.prices });
  });

  socket.on('exchange:buy', (data, callback) => {
    const result = buyCargo(socket.id, data.portId, data.cargoTypeId, data.tons);
    if (callback) callback(result);
    if (result.success && _io) {
      _io.emit('exchange:prices', _gameState.prices);
      socket.emit('player:balanceUpdate', { balance: _gameState.players[socket.id].balance });
      const actionLog = require('./actionLog');
      actionLog.log(socket.id, 'exchange', 'Покупка',
        `${data.tons}т ${data.cargoTypeId} в ${data.portId}`, -result.totalCost);
    }
  });

  socket.on('exchange:sell', (data, callback) => {
    const result = sellCargo(socket.id, data.portId, data.cargoTypeId, data.tons);
    if (callback) callback(result);
    if (result.success && _io) {
      _io.emit('exchange:prices', _gameState.prices);
      socket.emit('player:balanceUpdate', { balance: _gameState.players[socket.id].balance });
      const actionLog = require('./actionLog');
      actionLog.log(socket.id, 'exchange', 'Продажа',
        `${data.tons}т ${data.cargoTypeId} в ${data.portId}`, result.totalIncome);
    }
  });

  socket.on('exchange:getWarehouse', (data, callback) => {
    if (!_gameState) return callback && callback({ warehouse: {} });
    const wh = _gameState.ports[data.portId]?.warehouses?.[socket.id] || {};
    callback({ warehouse: wh });
  });
}

module.exports = { init, initializePrices, tickPrices, tickRestock, buyCargo, sellCargo, registerEvents };
