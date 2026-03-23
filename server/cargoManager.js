// server/cargoManager.js — Грузы: погрузка/разгрузка по нормам
'use strict';

const { SHIP_STATUS } = require('../shared/constants');
const { getProcessingNorm, calcProcessingTime, calcPortCost } = require('./referenceData');

let _io = null;
let _gameState = null;

function init(io, gameState) {
  _io = io;
  _gameState = gameState;
}

// Начать погрузку
function startLoading(shipId, cargoTypeId, tons, chartererId) {
  if (!_gameState) return { error: 'Игра не начата' };

  const player = _gameState.players[chartererId];
  if (!player || player.role !== 'charterer') return { error: 'Только фрахтователь может выполнять погрузку' };

  const ship = _gameState.ships[shipId];
  if (!ship) return { error: 'Судно не найдено' };
  if (ship.status !== SHIP_STATUS.IDLE && ship.status !== SHIP_STATUS.ANNOUNCED) {
    return { error: 'Судно занято' };
  }
  if (!ship.currentPort) return { error: 'Судно не в порту' };

  const portId = ship.currentPort;

  // Проверить склад фрахтователя
  const wh = _gameState.ports[portId]?.warehouses?.[chartererId];
  if (!wh || (wh[cargoTypeId] || 0) < tons) {
    return { error: 'На складе недостаточно груза' };
  }

  // Проверить вместимость (нормы загрузки)
  const shipManager = require('./shipManager');
  const maxLoad = shipManager.getMaxLoadForCargo(ship, cargoTypeId);
  const currentLoad = shipManager.getCurrentLoad(ship);
  if (currentLoad + tons > maxLoad) {
    return { error: `Превышение вместимости (макс: ${maxLoad}т, текущая загрузка: ${currentLoad}т, доступно: ${maxLoad - currentLoad}т)` };
  }

  // Рассчитать время погрузки
  const processingDays = calcProcessingTime(tons, portId, cargoTypeId, 'loading', ship.project);
  const now = _gameState.clock.getTime();
  const completionTime = new Date(now.getTime() + processingDays * 24 * 3600 * 1000);

  // Списать стоимость портовых услуг
  const portCost = calcPortCost(tons, ship.grossTonnage, portId, cargoTypeId, 'loading');
  const gameStateModule = require('./gameState');
  gameStateModule.adjustBalance(chartererId, -portCost.total,
    `Портовые услуги (погрузка): ${tons}т ${cargoTypeId}, ${ship.name}. Стивидорные: $${portCost.stevedoreCost}, Интегральные: $${portCost.integralCost}`);

  // Убрать со склада
  wh[cargoTypeId] -= tons;
  if (wh[cargoTypeId] <= 0) delete wh[cargoTypeId];

  // Установить статус судна
  ship.status = SHIP_STATUS.LOADING;
  ship.operationInfo = {
    cargoType: cargoTypeId,
    tons,
    chartererId,
    operation: 'loading',
    startTime: now.toISOString(),
    completionTime: completionTime.toISOString(),
    processingDays,
  };

  if (_io) {
    _io.emit('ship:update', { ship });
    // Обновить баланс фрахтователя
    const charSocket = _io.sockets.sockets.get(chartererId);
    if (charSocket) {
      charSocket.emit('player:balanceUpdate', { balance: _gameState.players[chartererId].balance });
    }
  }

  return {
    success: true,
    processingDays,
    completionTime: completionTime.toISOString(),
    portCost: portCost.total,
  };
}

// Начать разгрузку
function startUnloading(shipId, cargoTypeId, tons, chartererId) {
  if (!_gameState) return { error: 'Игра не начата' };

  const player = _gameState.players[chartererId];
  if (!player || player.role !== 'charterer') return { error: 'Только фрахтователь может выполнять разгрузку' };

  const ship = _gameState.ships[shipId];
  if (!ship) return { error: 'Судно не найдено' };
  if (ship.status !== SHIP_STATUS.IDLE && ship.status !== SHIP_STATUS.ANNOUNCED) {
    return { error: 'Судно занято' };
  }
  if (!ship.currentPort) return { error: 'Судно не в порту' };

  // Проверить наличие груза на судне
  const cargoEntry = ship.cargo.find(c => c.type === cargoTypeId && c.chartererId === chartererId);
  if (!cargoEntry || cargoEntry.tons < tons) {
    return { error: 'На судне недостаточно такого груза' };
  }

  const portId = ship.currentPort;

  // Рассчитать время разгрузки
  const processingDays = calcProcessingTime(tons, portId, cargoTypeId, 'unloading', ship.project);
  const now = _gameState.clock.getTime();
  const completionTime = new Date(now.getTime() + processingDays * 24 * 3600 * 1000);

  // Списать стоимость портовых услуг
  const portCost = calcPortCost(tons, ship.grossTonnage, portId, cargoTypeId, 'unloading');
  const gameStateModule = require('./gameState');
  gameStateModule.adjustBalance(chartererId, -portCost.total,
    `Портовые услуги (разгрузка): ${tons}т ${cargoTypeId}, ${ship.name}`);

  // Установить статус судна
  ship.status = SHIP_STATUS.UNLOADING;
  ship.operationInfo = {
    cargoType: cargoTypeId,
    tons,
    chartererId,
    operation: 'unloading',
    startTime: now.toISOString(),
    completionTime: completionTime.toISOString(),
    processingDays,
  };

  if (_io) {
    _io.emit('ship:update', { ship });
    const charSocket = _io.sockets.sockets.get(chartererId);
    if (charSocket) {
      charSocket.emit('player:balanceUpdate', { balance: _gameState.players[chartererId].balance });
    }
  }

  return {
    success: true,
    processingDays,
    completionTime: completionTime.toISOString(),
    portCost: portCost.total,
  };
}

function registerEvents(io, socket) {
  socket.on('cargo:load', (data, callback) => {
    const result = startLoading(data.shipId, data.cargoTypeId, data.tons, socket.id);
    if (callback) callback(result);
    if (result.success) {
      const actionLog = require('./actionLog');
      const ship = _gameState.ships[data.shipId];
      actionLog.log(socket.id, 'cargo', 'Начало погрузки',
        `${ship ? ship.name : data.shipId}: ${data.tons}т ${data.cargoTypeId}`, -result.portCost);
    }
  });

  socket.on('cargo:unload', (data, callback) => {
    const result = startUnloading(data.shipId, data.cargoTypeId, data.tons, socket.id);
    if (callback) callback(result);
    if (result.success) {
      const actionLog = require('./actionLog');
      const ship = _gameState.ships[data.shipId];
      actionLog.log(socket.id, 'cargo', 'Начало разгрузки',
        `${ship ? ship.name : data.shipId}: ${data.tons}т ${data.cargoTypeId}`, -result.portCost);
    }
  });
}

module.exports = { init, startLoading, startUnloading, registerEvents };
