// server/referenceData.js — НСИ: нормы хода, обработки, загрузки, стоимости портовых услуг
'use strict';

// ==================== НОРМЫ ХОДА (часы между портами) ====================
// Время хода рассчитывается из расстояния маршрута (distance)
// Формула: hours = distance * travelTimeMultiplier / baseSpeed
// baseSpeed = 10 (условных единиц расстояния в час)
// travelTimeMultiplier регулируется админом

const mapData = require('./mapData');

let travelTimeMultiplier = 1.0; // регулируется из админки

function setTravelTimeMultiplier(val) {
  travelTimeMultiplier = Math.max(0.1, Math.min(20, val));
  return travelTimeMultiplier;
}

function getTravelTimeMultiplier() {
  return travelTimeMultiplier;
}

const BASE_SPEED = 10; // distance units per hour

// Получить время хода между портами (часы), null если маршрут не найден
function getTravelTime(fromPort, toPort) {
  if (fromPort === toPort) return 0;
  const route = mapData.ROUTES.find(r =>
    (r.from === fromPort && r.to === toPort) ||
    (r.from === toPort && r.to === fromPort)
  );
  if (!route) return null;
  return (route.distance / BASE_SPEED) * travelTimeMultiplier;
}

// For client-side display — generated from route distances
const TRAVEL_TIMES_RAW = {};
(function buildTravelTimes() {
  mapData.PORTS.forEach(p => { TRAVEL_TIMES_RAW[p.id] = {}; });
  mapData.ROUTES.forEach(r => {
    const hours = Math.round(r.distance / BASE_SPEED);
    TRAVEL_TIMES_RAW[r.from][r.to] = hours;
    TRAVEL_TIMES_RAW[r.to][r.from] = hours;
  });
})();

// ==================== НОРМЫ ОБРАБОТКИ (т/сут) ====================
// processingNorms[portId][cargoTypeId][operation][project] = { rate, otherBerth }
// operation: 'loading' | 'unloading'
// rate — тонн/сутки, otherBerth — прочие стоянки (сутки)

const DEFAULT_OTHER_BERTH = 0.3;

// Базовые нормы обработки по проектам судов (порт-независимые значения по умолчанию)
// В реальных данных они различаются по портам — ниже переопределяем
const BASE_PROCESSING = {
  // project -> { cargoType -> { loading, unloading } } (тонн/сут)
  '19610':  { fruits: { loading: 2000, unloading: 1800 }, fertilizers: { loading: 2300, unloading: 2300 }, metal: { loading: 2300, unloading: 2300 }, wood: { loading: 2300, unloading: 2100 } },
  '00101':  { fruits: { loading: 2200, unloading: 2000 }, fertilizers: { loading: 2300, unloading: 2300 }, metal: { loading: 2300, unloading: 2300 }, wood: { loading: 2300, unloading: 2100 } },
  '05074A': { fruits: { loading: 1800, unloading: 1600 }, fertilizers: { loading: 2000, unloading: 2000 }, metal: { loading: 1900, unloading: 1900 }, wood: { loading: 2000, unloading: 1800 } },
  '488-AM': { fruits: { loading: 1800, unloading: 1600 }, fertilizers: { loading: 2000, unloading: 2000 }, metal: { loading: 1900, unloading: 1900 }, wood: { loading: 2000, unloading: 1800 } },
  '292':    { fruits: { loading: 1800, unloading: 1600 }, fertilizers: { loading: 2000, unloading: 2000 }, metal: { loading: 1900, unloading: 1900 }, wood: { loading: 2000, unloading: 1800 } },
  '92040':  { fruits: { loading: 1800, unloading: 1600 }, fertilizers: { loading: 2000, unloading: 2000 }, metal: { loading: 1900, unloading: 1900 }, wood: { loading: 2000, unloading: 1800 } },
  '16290':  { fruits: { loading: 1700, unloading: 1500 }, fertilizers: { loading: 1900, unloading: 1900 }, metal: { loading: 1900, unloading: 1900 }, wood: { loading: 1800, unloading: 1600 } },
  '613':    { fruits: { loading: 1600, unloading: 1400 }, fertilizers: { loading: 1800, unloading: 1800 }, metal: { loading: 1800, unloading: 1800 }, wood: { loading: 1800, unloading: 1600 } },
  '326.1':  { fruits: { loading: 1400, unloading: 1200 }, fertilizers: { loading: 1600, unloading: 1600 }, metal: { loading: 1600, unloading: 1600 }, wood: { loading: 1600, unloading: 1400 } },
};

// Получить норму обработки
// Возвращает { rate: тонн/сут, otherBerth: сут }
function getProcessingNorm(portId, cargoTypeId, operation, project) {
  const projectNorms = BASE_PROCESSING[project];
  if (!projectNorms) return { rate: 1500, otherBerth: DEFAULT_OTHER_BERTH };

  const cargoNorms = projectNorms[cargoTypeId];
  if (!cargoNorms) return { rate: 1500, otherBerth: DEFAULT_OTHER_BERTH };

  const rate = cargoNorms[operation] || 1500;
  return { rate, otherBerth: DEFAULT_OTHER_BERTH };
}

// Рассчитать время обработки (сутки)
function calcProcessingTime(tons, portId, cargoTypeId, operation, project) {
  const norm = getProcessingNorm(portId, cargoTypeId, operation, project);
  return tons / norm.rate + norm.otherBerth;
}

// ==================== СТОИМОСТЬ ПОРТОВЫХ УСЛУГ ====================
// portCharges[portId][cargoTypeId][operation] = { stevedore: $/т, integral: $/ед.ВВ }

const PORT_CHARGES = {
  'nizhniy_belogorsk': {
    fruits:      { loading: { stevedore: 11, integral: 0.5 }, unloading: { stevedore: 11, integral: 0.5 } },
    fertilizers: { loading: { stevedore: 5,  integral: 0.5 }, unloading: { stevedore: 6,  integral: 0.5 } },
    metal:       { loading: { stevedore: 8,  integral: 0.5 }, unloading: { stevedore: 8,  integral: 0.5 } },
    wood:        { loading: { stevedore: 7,  integral: 0.5 }, unloading: { stevedore: 8,  integral: 0.5 } },
  },
  'dalnyaya_zastava': {
    fruits:      { loading: { stevedore: 11, integral: 0.5 }, unloading: { stevedore: 11, integral: 0.5 } },
    fertilizers: { loading: { stevedore: 5,  integral: 0.5 }, unloading: { stevedore: 6,  integral: 0.5 } },
    metal:       { loading: { stevedore: 8,  integral: 0.5 }, unloading: { stevedore: 8,  integral: 0.5 } },
    wood:        { loading: { stevedore: 7,  integral: 0.5 }, unloading: { stevedore: 8,  integral: 0.5 } },
  },
  'long_island': {
    fruits:      { loading: { stevedore: 12, integral: 0.55 }, unloading: { stevedore: 12, integral: 0.55 } },
    fertilizers: { loading: { stevedore: 6,  integral: 0.55 }, unloading: { stevedore: 7,  integral: 0.55 } },
    metal:       { loading: { stevedore: 8,  integral: 0.55 }, unloading: { stevedore: 9,  integral: 0.55 } },
    wood:        { loading: { stevedore: 8,  integral: 0.55 }, unloading: { stevedore: 9,  integral: 0.55 } },
  },
  'komport': {
    fruits:      { loading: { stevedore: 12, integral: 0.55 }, unloading: { stevedore: 12, integral: 0.55 } },
    fertilizers: { loading: { stevedore: 6,  integral: 0.55 }, unloading: { stevedore: 7,  integral: 0.55 } },
    metal:       { loading: { stevedore: 9,  integral: 0.55 }, unloading: { stevedore: 9,  integral: 0.55 } },
    wood:        { loading: { stevedore: 8,  integral: 0.55 }, unloading: { stevedore: 9,  integral: 0.55 } },
  },
  'nord_bridge': {
    fruits:      { loading: { stevedore: 13, integral: 0.6 }, unloading: { stevedore: 13, integral: 0.6 } },
    fertilizers: { loading: { stevedore: 7,  integral: 0.6 }, unloading: { stevedore: 7,  integral: 0.6 } },
    metal:       { loading: { stevedore: 9,  integral: 0.6 }, unloading: { stevedore: 10, integral: 0.6 } },
    wood:        { loading: { stevedore: 9,  integral: 0.6 }, unloading: { stevedore: 9,  integral: 0.6 } },
  },
  'rateon': {
    fruits:      { loading: { stevedore: 10, integral: 0.5 }, unloading: { stevedore: 10, integral: 0.5 } },
    fertilizers: { loading: { stevedore: 5,  integral: 0.5 }, unloading: { stevedore: 6,  integral: 0.5 } },
    metal:       { loading: { stevedore: 7,  integral: 0.5 }, unloading: { stevedore: 8,  integral: 0.5 } },
    wood:        { loading: { stevedore: 7,  integral: 0.5 }, unloading: { stevedore: 7,  integral: 0.5 } },
  },
  'zeleron': {
    fruits:      { loading: { stevedore: 10, integral: 0.5 }, unloading: { stevedore: 10, integral: 0.5 } },
    fertilizers: { loading: { stevedore: 5,  integral: 0.5 }, unloading: { stevedore: 5,  integral: 0.5 } },
    metal:       { loading: { stevedore: 7,  integral: 0.5 }, unloading: { stevedore: 7,  integral: 0.5 } },
    wood:        { loading: { stevedore: 6,  integral: 0.5 }, unloading: { stevedore: 7,  integral: 0.5 } },
  },
  'mintel': {
    fruits:      { loading: { stevedore: 10, integral: 0.5 }, unloading: { stevedore: 10, integral: 0.5 } },
    fertilizers: { loading: { stevedore: 5,  integral: 0.5 }, unloading: { stevedore: 5,  integral: 0.5 } },
    metal:       { loading: { stevedore: 7,  integral: 0.5 }, unloading: { stevedore: 7,  integral: 0.5 } },
    wood:        { loading: { stevedore: 6,  integral: 0.5 }, unloading: { stevedore: 7,  integral: 0.5 } },
  },
  'ji_for': {
    fruits:      { loading: { stevedore: 11, integral: 0.5 }, unloading: { stevedore: 11, integral: 0.5 } },
    fertilizers: { loading: { stevedore: 5,  integral: 0.5 }, unloading: { stevedore: 6,  integral: 0.5 } },
    metal:       { loading: { stevedore: 8,  integral: 0.5 }, unloading: { stevedore: 8,  integral: 0.5 } },
    wood:        { loading: { stevedore: 7,  integral: 0.5 }, unloading: { stevedore: 8,  integral: 0.5 } },
  },
  'us_bay': {
    fruits:      { loading: { stevedore: 11, integral: 0.55 }, unloading: { stevedore: 11, integral: 0.55 } },
    fertilizers: { loading: { stevedore: 6,  integral: 0.55 }, unloading: { stevedore: 6,  integral: 0.55 } },
    metal:       { loading: { stevedore: 8,  integral: 0.55 }, unloading: { stevedore: 8,  integral: 0.55 } },
    wood:        { loading: { stevedore: 7,  integral: 0.55 }, unloading: { stevedore: 8,  integral: 0.55 } },
  },
  'south_bridge': {
    fruits:      { loading: { stevedore: 12, integral: 0.55 }, unloading: { stevedore: 12, integral: 0.55 } },
    fertilizers: { loading: { stevedore: 6,  integral: 0.55 }, unloading: { stevedore: 7,  integral: 0.55 } },
    metal:       { loading: { stevedore: 9,  integral: 0.55 }, unloading: { stevedore: 9,  integral: 0.55 } },
    wood:        { loading: { stevedore: 8,  integral: 0.55 }, unloading: { stevedore: 9,  integral: 0.55 } },
  },
};

// Получить стоимость портовых услуг
// Возвращает { stevedore: $/т, integral: $/ед.ВВ }
function getPortCharges(portId, cargoTypeId, operation) {
  const port = PORT_CHARGES[portId];
  if (!port) return { stevedore: 10, integral: 0.5 }; // fallback

  const cargo = port[cargoTypeId];
  if (!cargo) return { stevedore: 10, integral: 0.5 };

  return cargo[operation] || { stevedore: 10, integral: 0.5 };
}

// Рассчитать полную стоимость портовых услуг
function calcPortCost(tons, grossTonnage, portId, cargoTypeId, operation) {
  const charges = getPortCharges(portId, cargoTypeId, operation);
  const stevedoreCost = charges.stevedore * tons;
  const integralCost = charges.integral * grossTonnage;
  return { stevedoreCost, integralCost, total: stevedoreCost + integralCost };
}

module.exports = {
  TRAVEL_TIMES_RAW,
  getTravelTime,
  getTravelTimeMultiplier,
  setTravelTimeMultiplier,
  BASE_PROCESSING,
  getProcessingNorm,
  calcProcessingTime,
  PORT_CHARGES,
  getPortCharges,
  calcPortCost,
};
