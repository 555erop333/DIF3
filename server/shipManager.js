// server/shipManager.js — Суда: движение, статусы, расход топлива
'use strict';

const { SHIP_TYPES, SHIP_LIST, SHIP_STATUS, LOADING_NORMS } = require('../shared/constants');
const { PORTS, getPort } = require('./mapData');
const { getTravelTime } = require('./referenceData');

let _io = null;
let _gameState = null;

function init(io, gameState) {
  _io = io;
  _gameState = gameState;
}

// Создать судно
function createShip(id, name, typeId, ownerId, portId) {
  const shipType = SHIP_LIST.find(s => s.id === typeId);
  if (!shipType) return null;

  const port = getPort(portId);
  if (!port) return null;

  return {
    id,
    name,
    typeId: shipType.id,
    typeName: shipType.name,
    project: shipType.project,
    capacityTons: shipType.capacityTons,
    grossTonnage: shipType.grossTonnage,
    fuelUnderway: shipType.fuelUnderway,
    fuelAtBerth: shipType.fuelAtBerth,
    ownerId,
    currentPort: portId,
    status: SHIP_STATUS.IDLE,
    cargo: [],            // [{ type, tons, chartererId }]
    // Route info (when en_route)
    fromPort: null,
    toPort: null,
    departureTime: null,
    arrivalTime: null,
    travelHours: null,
    // Position for map rendering
    x: port.x,
    y: port.y,
    // Loading/unloading info
    operationInfo: null,  // { cargoType, tons, startTime, completionTime, chartererId, operation }
    // Offer assignment
    offerId: null,
  };
}

// Назначить судно в порт
function assignShipToPort(shipId, destinationPortId) {
  const ship = _gameState.ships[shipId];
  if (!ship) return { error: 'Судно не найдено' };
  if (ship.status !== SHIP_STATUS.IDLE && ship.status !== SHIP_STATUS.ANNOUNCED) {
    return { error: 'Судно занято' };
  }
  if (!ship.currentPort) return { error: 'Судно не в порту' };
  if (ship.currentPort === destinationPortId) return { error: 'Судно уже в этом порту' };

  const travelHours = getTravelTime(ship.currentPort, destinationPortId);
  if (travelHours === null) return { error: 'Маршрут не найден' };

  const now = _gameState.clock.getTime();
  const arrivalTime = new Date(now.getTime() + travelHours * 3600 * 1000);

  ship.status = SHIP_STATUS.EN_ROUTE;
  ship.fromPort = ship.currentPort;
  ship.toPort = destinationPortId;
  ship.departureTime = now.toISOString();
  ship.arrivalTime = arrivalTime.toISOString();
  ship.travelHours = travelHours;
  ship.currentPort = null;

  return { success: true, travelHours, arrivalTime: arrivalTime.toISOString() };
}

// Обновить позиции судов (вызывается каждый тик)
function updatePositions() {
  if (!_gameState) return;

  const now = _gameState.clock.getTime();

  Object.values(_gameState.ships).forEach(ship => {
    if (ship.status === SHIP_STATUS.EN_ROUTE) {
      const departure = new Date(ship.departureTime);
      const arrival = new Date(ship.arrivalTime);

      if (now >= arrival) {
        // Судно прибыло
        arriveAtPort(ship);
      } else {
        // Интерполяция позиции
        const progress = (now - departure) / (arrival - departure);
        const fromPort = getPort(ship.fromPort);
        const toPort = getPort(ship.toPort);
        if (fromPort && toPort) {
          ship.x = fromPort.x + (toPort.x - fromPort.x) * progress;
          ship.y = fromPort.y + (toPort.y - fromPort.y) * progress;
        }
      }
    }

    // Проверка завершения погрузки/разгрузки
    if ((ship.status === SHIP_STATUS.LOADING || ship.status === SHIP_STATUS.UNLOADING)
        && ship.operationInfo) {
      const completion = new Date(ship.operationInfo.completionTime);
      if (now >= completion) {
        completeOperation(ship);
      }
    }
  });
}

// Судно прибыло в порт
function arriveAtPort(ship) {
  const port = getPort(ship.toPort);
  ship.currentPort = ship.toPort;
  ship.status = SHIP_STATUS.IDLE;
  ship.x = port.x;
  ship.y = port.y;

  const fromPort = ship.fromPort;
  ship.fromPort = null;
  ship.toPort = null;
  ship.departureTime = null;
  ship.arrivalTime = null;

  // Расход топлива за рейс
  const travelDays = ship.travelHours / 24;
  const fuelConsumed = ship.fuelUnderway * travelDays;
  const fuelCost = fuelConsumed * _gameState.config.fuelPricePerTon;

  // Списать стоимость топлива с судовладельца
  const gameStateModule = require('./gameState');
  gameStateModule.adjustBalance(
    ship.ownerId,
    -fuelCost,
    `Топливо: ${ship.name}, ${getPort(fromPort)?.name} → ${port.name}, ${fuelConsumed.toFixed(1)}т`
  );

  // Обновить баланс в UI
  if (_io) {
    const ownerSocket = _io.sockets.sockets.get(ship.ownerId);
    if (ownerSocket) {
      ownerSocket.emit('player:balanceUpdate', { balance: _gameState.players[ship.ownerId].balance });
    }
  }

  ship.travelHours = null;

  // Системное уведомление
  const mailSystem = require('./mailSystem');
  mailSystem.systemNotify(
    _gameState, ship.ownerId,
    `Судно ${ship.name} прибыло`,
    `Судно ${ship.name} прибыло в порт ${port.name}. Расход топлива: ${fuelConsumed.toFixed(1)}т ($${fuelCost.toFixed(0)})`
  );

  // Уведомить фрахтователя если есть оферта
  if (ship.offerId) {
    const offer = _gameState.offers[ship.offerId];
    if (offer) {
      mailSystem.systemNotify(
        _gameState, offer.chartererId,
        `Судно ${ship.name} прибыло`,
        `Судно ${ship.name} по договору прибыло в порт ${port.name}.`
      );
    }
  }

  if (_io) {
    _io.emit('ship:arrived', { shipId: ship.id, portId: ship.currentPort, shipName: ship.name, portName: port.name });
  }

  // Лог прибытия
  const actionLog = require('./actionLog');
  actionLog.log(ship.ownerId, 'ship', 'Прибытие',
    `${ship.name} прибыло в ${port.name}`, -fuelCost);
}

// Завершение погрузки/разгрузки
function completeOperation(ship) {
  const op = ship.operationInfo;
  if (!op) return;

  if (op.operation === 'loading') {
    // Переместить груз на судно
    ship.cargo.push({
      type: op.cargoType,
      tons: op.tons,
      chartererId: op.chartererId,
    });
    ship.status = SHIP_STATUS.IDLE;

    // Расход топлива на стоянке
    chargeBerthFuel(ship, op);

    const mailSystem = require('./mailSystem');
    mailSystem.systemNotify(_gameState, ship.ownerId,
      `Погрузка завершена`, `${ship.name}: погружено ${op.tons}т ${op.cargoType}`);
    mailSystem.systemNotify(_gameState, op.chartererId,
      `Погрузка завершена`, `${ship.name}: погружено ${op.tons}т ${op.cargoType}`);
  } else if (op.operation === 'unloading') {
    // Переместить груз на склад порта
    const cargoIdx = ship.cargo.findIndex(c => c.type === op.cargoType && c.chartererId === op.chartererId);
    if (cargoIdx >= 0) {
      ship.cargo[cargoIdx].tons -= op.tons;
      if (ship.cargo[cargoIdx].tons <= 0) {
        ship.cargo.splice(cargoIdx, 1);
      }
    }

    // Добавить на склад фрахтователя в порту
    const portId = ship.currentPort;
    if (!_gameState.ports[portId]) _gameState.ports[portId] = { warehouses: {} };
    if (!_gameState.ports[portId].warehouses[op.chartererId]) {
      _gameState.ports[portId].warehouses[op.chartererId] = {};
    }
    const wh = _gameState.ports[portId].warehouses[op.chartererId];
    wh[op.cargoType] = (wh[op.cargoType] || 0) + op.tons;

    ship.status = SHIP_STATUS.IDLE;

    chargeBerthFuel(ship, op);

    const mailSystem = require('./mailSystem');
    mailSystem.systemNotify(_gameState, ship.ownerId,
      `Разгрузка завершена`, `${ship.name}: выгружено ${op.tons}т ${op.cargoType}`);
    mailSystem.systemNotify(_gameState, op.chartererId,
      `Разгрузка завершена`, `${ship.name}: выгружено ${op.tons}т ${op.cargoType}`);
  }

  ship.operationInfo = null;

  if (_io) {
    _io.emit('ship:operationComplete', { shipId: ship.id, operation: op.operation });
  }

  // Лог завершения операции
  const actionLog = require('./actionLog');
  const opName = op.operation === 'loading' ? 'Погрузка завершена' : 'Разгрузка завершена';
  actionLog.log(ship.ownerId, 'cargo', opName,
    `${ship.name}: ${op.tons}т ${op.cargoType}`);
  if (op.chartererId !== ship.ownerId) {
    actionLog.log(op.chartererId, 'cargo', opName,
      `${ship.name}: ${op.tons}т ${op.cargoType}`);
  }
}

// Списать топливо на стоянке
function chargeBerthFuel(ship, operationInfo) {
  const startTime = new Date(operationInfo.startTime);
  const endTime = new Date(operationInfo.completionTime);
  const days = (endTime - startTime) / (24 * 3600 * 1000);
  const fuelConsumed = ship.fuelAtBerth * days;
  const fuelCost = fuelConsumed * _gameState.config.fuelPricePerTon;

  const gameStateModule = require('./gameState');
  gameStateModule.adjustBalance(ship.ownerId, -fuelCost,
    `Топливо на стоянке: ${ship.name}, ${fuelConsumed.toFixed(2)}т`);

  // Обновить баланс в UI
  if (_io) {
    const ownerSocket = _io.sockets.sockets.get(ship.ownerId);
    if (ownerSocket) {
      ownerSocket.emit('player:balanceUpdate', { balance: _gameState.players[ship.ownerId].balance });
    }
  }
}

// Анонсировать свободные суда
function announceShips(ownerId) {
  let count = 0;
  Object.values(_gameState.ships).forEach(ship => {
    if (ship.ownerId === ownerId && ship.status === SHIP_STATUS.IDLE) {
      ship.status = SHIP_STATUS.ANNOUNCED;
      count++;
    }
  });
  if (_io) {
    _io.emit('ships:announced', { ownerId, count });
  }
  return count;
}

// Получить текущую загрузку судна (тонн)
function getCurrentLoad(ship) {
  return ship.cargo.reduce((sum, c) => sum + c.tons, 0);
}

// Получить макс. загрузку для типа груза
function getMaxLoadForCargo(ship, cargoTypeId) {
  const norms = LOADING_NORMS[ship.project];
  if (!norms) return 0;
  return norms[cargoTypeId] || norms.general || 0;
}

// Получить суда по владельцу
function getShipsByOwner(ownerId) {
  return Object.values(_gameState.ships).filter(s => s.ownerId === ownerId);
}

// Получить суда в порту
function getShipsInPort(portId) {
  return Object.values(_gameState.ships).filter(s => s.currentPort === portId);
}

// Получить анонсированные суда
function getAnnouncedShips() {
  return Object.values(_gameState.ships).filter(s => s.status === SHIP_STATUS.ANNOUNCED);
}

// Создать начальный набор судов для судовладельцев
function createInitialShips(players) {
  const shipOwners = Object.entries(players)
    .filter(([, p]) => p.role === 'shipOwner');

  // Распределить суда по владельцам
  const shipDefs = [
    { type: 'volga_4001', name: 'Волга' },
    { type: 'rusich', name: 'Русич' },
    { type: 'volzhsky', name: 'Волжский' },
    { type: 'sormovsky', name: 'Сормовский' },
    { type: 'sibirsky_2101', name: 'Сибирский' },
    { type: 'amur_2501', name: 'Амур' },
    { type: 'baltiysky_201', name: 'Балтийский-201' },
    { type: 'baltiysky_101', name: 'Балтийский-101' },
    { type: 'stk_1001', name: 'СТК' },
  ];

  // Порты для начальной расстановки
  const startPorts = [
    'nizhniy_belogorsk', 'dalnyaya_zastava', 'long_island',
    'rateon', 'komport', 'zeleron', 'ji_for', 'us_bay', 'south_bridge'
  ];

  // Если нет судовладельцев (соло-фрахтователь), создать NPC-суда
  if (shipOwners.length === 0) {
    const charterers = Object.entries(players).filter(([, p]) => p.role === 'charterer');
    if (charterers.length > 0) {
      // Создать "NPC Судовладельца" и 5 анонсированных судов
      const npcId = '__npc_shipowner__';
      _gameState.players[npcId] = {
        id: npcId,
        companyId: 999,
        companyName: 'NPC Флот',
        role: 'shipOwner',
        balance: 10000000,
        isNPC: true,
      };
      _gameState.transactions[npcId] = [];

      let shipCounter = 0;
      for (let i = 0; i < 5; i++) {
        const def = shipDefs[i % shipDefs.length];
        const portIdx = i % startPorts.length;
        const shipId = `ship_${++shipCounter}`;
        const shipName = `${def.name}-${shipCounter}`;
        const ship = createShip(shipId, shipName, def.type, npcId, startPorts[portIdx]);
        if (ship) {
          ship.status = SHIP_STATUS.ANNOUNCED;
          _gameState.ships[shipId] = ship;
        }
      }
    }
    return;
  }

  let shipCounter = 0;
  shipOwners.forEach(([ownerId], ownerIdx) => {
    // Каждый судовладелец получает 3 судна
    const shipsPerOwner = Math.min(3, shipDefs.length);
    for (let i = 0; i < shipsPerOwner; i++) {
      const defIdx = (ownerIdx * shipsPerOwner + i) % shipDefs.length;
      const def = shipDefs[defIdx];
      const portIdx = shipCounter % startPorts.length;
      const shipId = `ship_${++shipCounter}`;
      const shipName = `${def.name}-${shipCounter}`;

      const ship = createShip(shipId, shipName, def.type, ownerId, startPorts[portIdx]);
      if (ship) {
        _gameState.ships[shipId] = ship;
      }
    }
  });
}

// Создать суда для поздно присоединившегося игрока
function createShipsForLatePlayer(ownerId, role) {
  if (!_gameState) return;

  const shipDefs = [
    { type: 'volga_4001', name: 'Волга' },
    { type: 'rusich', name: 'Русич' },
    { type: 'volzhsky', name: 'Волжский' },
    { type: 'sormovsky', name: 'Сормовский' },
    { type: 'sibirsky_2101', name: 'Сибирский' },
    { type: 'amur_2501', name: 'Амур' },
    { type: 'baltiysky_201', name: 'Балтийский-201' },
    { type: 'baltiysky_101', name: 'Балтийский-101' },
    { type: 'stk_1001', name: 'СТК' },
  ];
  const startPorts = [
    'nizhniy_belogorsk', 'dalnyaya_zastava', 'long_island',
    'rateon', 'komport', 'zeleron', 'ji_for', 'us_bay', 'south_bridge'
  ];

  if (role !== 'shipOwner') return;

  // Determine next ship counter
  const existingIds = Object.keys(_gameState.ships)
    .map(id => parseInt(id.replace('ship_', '')) || 0);
  let counter = existingIds.length > 0 ? Math.max(...existingIds) : 0;

  const shipsPerOwner = 3;
  for (let i = 0; i < shipsPerOwner; i++) {
    const defIdx = i % shipDefs.length;
    const def = shipDefs[defIdx];
    const portIdx = (counter) % startPorts.length;
    const shipId = `ship_${++counter}`;
    const shipName = `${def.name}-${counter}`;
    const ship = createShip(shipId, shipName, def.type, ownerId, startPorts[portIdx]);
    if (ship) {
      _gameState.ships[shipId] = ship;
    }
  }
}

// Регистрация Socket.IO событий
function registerEvents(io, socket) {
  // Назначить судно в порт
  socket.on('ship:assign', (data, callback) => {
    if (!_gameState) return callback && callback({ error: 'Игра не начата' });
    const { shipId, destinationPortId } = data;
    const ship = _gameState.ships[shipId];
    if (!ship) return callback && callback({ error: 'Судно не найдено' });
    if (ship.ownerId !== socket.id) return callback && callback({ error: 'Это не ваше судно' });

    const result = assignShipToPort(shipId, destinationPortId);
    if (callback) callback(result);
    if (result.success) {
      io.emit('ship:update', { ship: _gameState.ships[shipId] });
      const actionLog = require('./actionLog');
      const destPort = getPort(destinationPortId);
      actionLog.log(socket.id, 'ship', 'Назначение маршрута',
        `${ship.name} → ${destPort ? destPort.name : destinationPortId}, ${result.travelHours.toFixed(1)}ч`);
    }
  });

  // Анонсировать
  socket.on('ship:announce', (_, callback) => {
    if (!_gameState) return callback && callback({ error: 'Игра не начата' });
    const count = announceShips(socket.id);
    if (callback) callback({ success: true, count });
    if (count > 0) {
      const actionLog = require('./actionLog');
      actionLog.log(socket.id, 'ship', 'Анонс судов', `Анонсировано ${count} судов`);
    }
  });

  // Получить свой флот
  socket.on('ship:getFleet', (_, callback) => {
    if (!_gameState) return callback && callback({ ships: [] });
    const player = _gameState.players[socket.id];
    if (!player) return callback && callback({ ships: [] });

    if (player.role === 'shipOwner') {
      callback({ ships: getShipsByOwner(socket.id) });
    } else {
      // Фрахтователь видит анонсированные суда + суда по его офертам
      const announced = getAnnouncedShips();
      const myOfferShips = Object.values(_gameState.ships).filter(s =>
        s.offerId && _gameState.offers[s.offerId]?.chartererId === socket.id
      );
      callback({ ships: [...announced, ...myOfferShips] });
    }
  });

  // Суда в порту
  socket.on('ship:inPort', (data, callback) => {
    if (!_gameState) return callback && callback({ ships: [] });
    const ships = getShipsInPort(data.portId);
    callback({ ships });
  });
}

module.exports = {
  init,
  createShip,
  assignShipToPort,
  updatePositions,
  announceShips,
  getCurrentLoad,
  getMaxLoadForCargo,
  getShipsByOwner,
  getShipsInPort,
  getAnnouncedShips,
  createInitialShips,
  createShipsForLatePlayer,
  registerEvents,
};
