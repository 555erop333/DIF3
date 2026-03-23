// server/newsSystem.js — Система новостей: бегущая строка + изменение цен
'use strict';

const fs = require('fs');
const path = require('path');
const { PORTS } = require('./mapData');

let _io = null;
let _gameState = null;

// Загруженные новости: portId -> { city, byCommodity: { commodity: [newsItem, ...] } }
const newsByPort = {};

// Round-robin очередь портов (псевдорандом — все города играют по кругу)
let cityQueue = [];
let queueIndex = 0;

// Время последней новости
let lastNewsTime = null;

// Список товаров для рандома
const COMMODITIES = ['фрукты', 'удобрения', 'металл', 'лес'];

// Маппинг русских названий товаров на ID
const COMMODITY_MAP = {
  'фрукты': 'fruits',
  'удобрения': 'fertilizers',
  'металл': 'metal',
  'лес': 'wood',
};

// Маппинг русских названий городов (из JSON) на portId
const CITY_TO_PORT = {};

function init(io, gameState) {
  _io = io;
  _gameState = gameState;
  loadNewsFiles();
  buildCityQueue();
  // Установить lastNewsTime в прошлое, чтобы первая новость вышла сразу
  const freq = (gameState.config && gameState.config.newsFrequencyHours) || 2;
  lastNewsTime = new Date(gameState.clock.getTime() - freq * 3600 * 1000);
}

function loadNewsFiles() {
  const newsDir = path.join(__dirname, '..', 'News');
  if (!fs.existsSync(newsDir)) {
    console.log('Папка News не найдена, новости отключены.');
    return;
  }

  // Построить маппинг имён портов → ID
  PORTS.filter(p => p.isMain).forEach(p => {
    CITY_TO_PORT[p.name] = p.id;
  });

  const files = fs.readdirSync(newsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(newsDir, file), 'utf8');
      const data = JSON.parse(raw);
      const portId = CITY_TO_PORT[data.city];
      if (!portId) {
        console.log(`Новости: город "${data.city}" не найден среди портов, пропущен.`);
        continue;
      }

      // Группировка новостей по товару
      const byCommodity = {};
      for (const c of COMMODITIES) {
        byCommodity[c] = [];
      }
      for (const item of (data.news || [])) {
        const c = item.commodity;
        if (byCommodity[c]) {
          byCommodity[c].push(item);
        }
      }

      // Перемешать каждую группу (Fisher-Yates)
      for (const c of COMMODITIES) {
        const arr = byCommodity[c];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
      }

      const totalLoaded = Object.values(byCommodity).reduce((s, a) => s + a.length, 0);
      const breakdown = COMMODITIES.map(c => `${c}:${byCommodity[c].length}`).join(', ');

      newsByPort[portId] = {
        city: data.city,
        byCommodity,
        indices: { 'фрукты': 0, 'удобрения': 0, 'металл': 0, 'лес': 0 },
      };
      console.log(`Новости: ${data.city} — ${totalLoaded} (${breakdown})`);
    } catch (e) {
      console.error(`Ошибка загрузки ${file}:`, e.message);
    }
  }
}

function buildCityQueue() {
  // Shuffle всех портов, у которых есть новости
  const portIds = Object.keys(newsByPort);
  // Fisher-Yates shuffle
  for (let i = portIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [portIds[i], portIds[j]] = [portIds[j], portIds[i]];
  }
  cityQueue = portIds;
  queueIndex = 0;
}

function getNextCity() {
  if (cityQueue.length === 0) return null;
  if (queueIndex >= cityQueue.length) {
    // Reshuffle когда все города отыграли
    buildCityQueue();
  }
  return cityQueue[queueIndex++];
}

// Псевдорандом: случайный товар, случайный тип, случайный процент, текст из файла
function getNextNews(portId) {
  const entry = newsByPort[portId];
  if (!entry) return null;

  // Случайный товар
  const commodity = COMMODITIES[Math.floor(Math.random() * COMMODITIES.length)];
  const group = entry.byCommodity[commodity];
  if (!group || group.length === 0) {
    // Фоллбэк: любой товар с новостями
    const fallback = COMMODITIES.find(c => entry.byCommodity[c] && entry.byCommodity[c].length > 0);
    if (!fallback) return null;
    return pickFromGroup(entry, fallback);
  }
  return pickFromGroup(entry, commodity);
}

function pickFromGroup(entry, commodity) {
  const group = entry.byCommodity[commodity];
  const idx = entry.indices[commodity] % group.length;
  entry.indices[commodity]++;
  const item = group[idx];

  return {
    text: item.text,
    commodity: item.commodity,
    price_type: item.price_type,
    change_percent: item.change_percent,
    city: entry.city,
    portId: undefined, // будет установлен ниже
  };
}

// Применить новость к ценам
function applyNewsToPrice(newsItem) {
  if (!_gameState || !_gameState.prices) return;

  const portPrices = _gameState.prices[newsItem.portId];
  if (!portPrices) return;

  const cargoId = COMMODITY_MAP[newsItem.commodity];
  if (!cargoId) return;

  const entry = portPrices[cargoId];
  if (!entry) return;

  const base = entry.baseBuyPrice || entry.buyPrice;
  // Масштабировать эффект новости: чем дальше от базовой — тем слабее
  const deviation = Math.abs(entry.buyPrice - base) / base;
  const dampening = Math.max(0.2, 1 - deviation * 1.5); // от 1.0 до 0.2
  const pct = (newsItem.change_percent / 100) * dampening;

  if (newsItem.price_type === 'покупка') {
    let newBuy = Math.round(entry.buyPrice * (1 + pct));
    // Ограничить коридором ±50% от базовой
    const min = Math.round(base * 0.50);
    const max = Math.round(base * 1.50);
    newBuy = Math.max(min, Math.min(max, newBuy));
    entry.buyPrice = Math.max(10, newBuy);
  } else if (newsItem.price_type === 'продажа') {
    let newSell = Math.round(entry.sellPrice * (1 + pct));
    const minSell = Math.round(base * 0.45);
    const maxSell = Math.round(base * 1.40);
    newSell = Math.max(minSell, Math.min(maxSell, newSell));
    entry.sellPrice = Math.max(10, newSell);
  }
}

// Вызывается из тика
function tickNews() {
  if (!_gameState || !_gameState.prices) return;
  if (cityQueue.length === 0) return;

  // Режим: проверить newsMode
  const mode = _gameState.newsMode || 'news_and_drift';
  if (mode === 'drift_only') return;

  const now = _gameState.clock.getTime();
  if (!lastNewsTime) {
    lastNewsTime = now;
    return;
  }

  // Частота из конфига (по умолчанию 2 часа)
  const freqHours = (_gameState.config && _gameState.config.newsFrequencyHours) || 2;
  const hoursSince = (now - lastNewsTime) / (3600 * 1000);
  if (hoursSince < freqHours) return;

  lastNewsTime = now;

  // Выбрать город и новость
  const portId = getNextCity();
  if (!portId) return;

  const newsItem = getNextNews(portId);
  if (!newsItem) return;
  newsItem.portId = portId;

  // Применить к ценам
  applyNewsToPrice(newsItem);

  // Отправить всем клиентам
  if (_io) {
    _io.emit('news:new', {
      text: newsItem.text,
      city: newsItem.city,
      commodity: newsItem.commodity,
      priceType: newsItem.price_type,
      changePercent: newsItem.change_percent,
    });

    // Обновить цены у клиентов
    _io.emit('exchange:prices', _gameState.prices);
  }
}

function getNewsCount() {
  let total = 0;
  Object.values(newsByPort).forEach(e => {
    for (const c of COMMODITIES) {
      total += e.byCommodity[c].length;
    }
  });
  return { cities: Object.keys(newsByPort).length, totalNews: total };
}

module.exports = { init, tickNews, getNewsCount };
