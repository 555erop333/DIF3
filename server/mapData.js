// server/mapData.js — Порты, маршруты, координаты, географические метки
// Координаты привязаны к bgmap.jpg (11184x6288) → система 1600x900
'use strict';

// ==================== ПОРТЫ ====================
const PORTS = [
  { id: 'nizhniy_belogorsk', name: 'Нижний Белогорск', x: 341, y: 240, isMain: true  },
  { id: 'dalnyaya_zastava', name: 'Дальняя Застава', x: 647, y: 122, isMain: true  },
  { id: 'long_island', name: 'Лонг Айленд', x: 969, y: 159, isMain: true  },
  { id: 'komport', name: 'Компорт', x: 1156, y: 357, isMain: true  },
  { id: 'nord_bridge', name: 'Норд Бридж', x: 1351, y: 131, isMain: true  },
  { id: 'rateon', name: 'Ратеон', x: 863, y: 553, isMain: true  },
  { id: 'zeleron', name: 'Зелерон', x: 587, y: 661, isMain: true  },
  { id: 'mintel', name: 'Минтел', x: 765, y: 738, isMain: true  },
  { id: 'ji_for', name: 'Джи Фор', x: 921, y: 680, isMain: true  },
  { id: 'us_bay', name: 'Юэс-Бэй', x: 1096, y: 739, isMain: true  },
  { id: 'south_bridge', name: 'Саут Бридж', x: 1314, y: 621, isMain: true  },
];

// ==================== МАРШРУТЫ (связи по воде) ====================
const ROUTES = [
  { from: 'nizhniy_belogorsk', to: 'dalnyaya_zastava', distance: 328 },
  { from: 'nizhniy_belogorsk', to: 'long_island', distance: 633 },
  { from: 'nizhniy_belogorsk', to: 'komport', distance: 823 },
  { from: 'nizhniy_belogorsk', to: 'nord_bridge', distance: 1016 },
  { from: 'nizhniy_belogorsk', to: 'rateon', distance: 609 },
  { from: 'nizhniy_belogorsk', to: 'zeleron', distance: 488 },
  { from: 'nizhniy_belogorsk', to: 'mintel', distance: 654 },
  { from: 'nizhniy_belogorsk', to: 'ji_for', distance: 728 },
  { from: 'nizhniy_belogorsk', to: 'us_bay', distance: 905 },
  { from: 'nizhniy_belogorsk', to: 'south_bridge', distance: 1045 },
  { from: 'dalnyaya_zastava', to: 'long_island', distance: 324 },
  { from: 'dalnyaya_zastava', to: 'komport', distance: 561 },
  { from: 'dalnyaya_zastava', to: 'nord_bridge', distance: 704 },
  { from: 'dalnyaya_zastava', to: 'rateon', distance: 482 },
  { from: 'dalnyaya_zastava', to: 'zeleron', distance: 542 },
  { from: 'dalnyaya_zastava', to: 'mintel', distance: 627 },
  { from: 'dalnyaya_zastava', to: 'ji_for', distance: 622 },
  { from: 'dalnyaya_zastava', to: 'us_bay', distance: 763 },
  { from: 'dalnyaya_zastava', to: 'south_bridge', distance: 833 },
  { from: 'long_island', to: 'komport', distance: 272 },
  { from: 'long_island', to: 'nord_bridge', distance: 383 },
  { from: 'long_island', to: 'rateon', distance: 408 },
  { from: 'long_island', to: 'zeleron', distance: 631 },
  { from: 'long_island', to: 'mintel', distance: 614 },
  { from: 'long_island', to: 'ji_for', distance: 523 },
  { from: 'long_island', to: 'us_bay', distance: 594 },
  { from: 'long_island', to: 'south_bridge', distance: 577 },
  { from: 'komport', to: 'nord_bridge', distance: 298 },
  { from: 'komport', to: 'rateon', distance: 353 },
  { from: 'komport', to: 'zeleron', distance: 645 },
  { from: 'komport', to: 'mintel', distance: 546 },
  { from: 'komport', to: 'ji_for', distance: 399 },
  { from: 'komport', to: 'us_bay', distance: 387 },
  { from: 'komport', to: 'south_bridge', distance: 308 },
  { from: 'nord_bridge', to: 'rateon', distance: 645 },
  { from: 'nord_bridge', to: 'zeleron', distance: 930 },
  { from: 'nord_bridge', to: 'mintel', distance: 844 },
  { from: 'nord_bridge', to: 'ji_for', distance: 697 },
  { from: 'nord_bridge', to: 'us_bay', distance: 659 },
  { from: 'nord_bridge', to: 'south_bridge', distance: 491 },
  { from: 'rateon', to: 'zeleron', distance: 296 },
  { from: 'rateon', to: 'mintel', distance: 209 },
  { from: 'rateon', to: 'ji_for', distance: 140 },
  { from: 'rateon', to: 'us_bay', distance: 298 },
  { from: 'rateon', to: 'south_bridge', distance: 456 },
  { from: 'zeleron', to: 'mintel', distance: 194 },
  { from: 'zeleron', to: 'ji_for', distance: 335 },
  { from: 'zeleron', to: 'us_bay', distance: 515 },
  { from: 'zeleron', to: 'south_bridge', distance: 728 },
  { from: 'mintel', to: 'ji_for', distance: 166 },
  { from: 'mintel', to: 'us_bay', distance: 331 },
  { from: 'mintel', to: 'south_bridge', distance: 561 },
  { from: 'ji_for', to: 'us_bay', distance: 185 },
  { from: 'ji_for', to: 'south_bridge', distance: 397 },
  { from: 'us_bay', to: 'south_bridge', distance: 248 },
];

// ==================== ГЕОГРАФИЧЕСКИЕ МЕТКИ ====================
const GEO_LABELS = [
  { name: 'Море Кайское',          x: 720,  y: 190,  type: 'sea',    fontSize: 28 },
  { name: 'залив Профит',          x: 400,  y: 500,  type: 'bay',    fontSize: 18 },
  { name: 'залив Центурийский',    x: 1060, y: 440,  type: 'bay',    fontSize: 18 },
  { name: 'р. Белогорка',          x: 310,  y: 195,  type: 'river',  fontSize: 14 },
  { name: 'р. Сбрейв',            x: 760,  y: 480,  type: 'river',  fontSize: 14 },
  { name: 'пустыня Байтс-Сент',   x: 260,  y: 740,  type: 'desert', fontSize: 16 },
  { name: 'пустыня Хард-Сент',    x: 1100, y: 770,  type: 'desert', fontSize: 16 },
];

// Map dimensions (logical coordinates, matches bgmap.jpg aspect ratio)
const MAP_WIDTH = 1600;
const MAP_HEIGHT = 900;

// Helper: find port by id
function getPort(portId) {
  return PORTS.find(p => p.id === portId) || null;
}

// Helper: get routes from a port
function getRoutesFrom(portId) {
  return ROUTES.filter(r => r.from === portId || r.to === portId)
    .map(r => ({
      ...r,
      neighbor: r.from === portId ? r.to : r.from,
    }));
}

module.exports = {
  PORTS,
  ROUTES,
  GEO_LABELS,
  MAP_WIDTH,
  MAP_HEIGHT,
  getPort,
  getRoutesFrom,
};
