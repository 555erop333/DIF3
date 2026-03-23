// shared/constants.js — Universal module (works in Node.js CommonJS and browser)
(function (exports) {
  'use strict';

  // ==================== РОЛИ ====================
  exports.PLAYER_ROLES = {
    CHARTERER: 'charterer',     // Фрахтователь
    SHIP_OWNER: 'shipOwner',    // Судовладелец
  };

  // ==================== ГРУЗЫ ====================
  exports.CARGO_TYPES = {
    FRUITS:      { id: 'fruits',      name: 'Фрукты',    nameEn: 'Fruits' },
    FERTILIZERS: { id: 'fertilizers', name: 'Удобрения',  nameEn: 'Fertilizers' },
    METAL:       { id: 'metal',       name: 'Металл',     nameEn: 'Metal' },
    WOOD:        { id: 'wood',        name: 'Лес',        nameEn: 'Wood' },
  };

  exports.CARGO_LIST = Object.values(exports.CARGO_TYPES);

  // ==================== СУДА (9 типов) ====================
  exports.SHIP_TYPES = {
    VOLGA_4001: {
      id: 'volga_4001',
      name: 'Волга-4001',
      project: '19610',
      capacityTons: 5500,
      grossTonnage: 4991,    // Валовая вместимость (ед)
      fuelUnderway: 8.3,     // Расход топлива в ходу (т/сут)
      fuelAtBerth: 0.5,      // Расход топлива на стоянке (т/сут)
    },
    RUSICH: {
      id: 'rusich',
      name: 'Русич',
      project: '00101',
      capacityTons: 5000,
      grossTonnage: 4960,
      fuelUnderway: 7.7,
      fuelAtBerth: 0.5,
    },
    VOLZHSKY: {
      id: 'volzhsky',
      name: 'Волжский (укороч.)',
      project: '05074A',
      capacityTons: 3660,
      grossTonnage: 3185,
      fuelUnderway: 5.5,
      fuelAtBerth: 0.4,
    },
    SORMOVSKY: {
      id: 'sormovsky',
      name: 'Сормовский',
      project: '488-AM',
      capacityTons: 3000,
      grossTonnage: 2240,
      fuelUnderway: 3.7,
      fuelAtBerth: 0.4,
    },
    SIBIRSKY_2101: {
      id: 'sibirsky_2101',
      name: 'Сибирский-2101',
      project: '292',
      capacityTons: 2870,
      grossTonnage: 3500,
      fuelUnderway: 4.6,
      fuelAtBerth: 0.4,
    },
    AMUR_2501: {
      id: 'amur_2501',
      name: 'Амур-2501',
      project: '92040',
      capacityTons: 2800,
      grossTonnage: 3086,
      fuelUnderway: 3.7,
      fuelAtBerth: 0.4,
    },
    BALTIYSKY_201: {
      id: 'baltiysky_201',
      name: 'Балтийский-201',
      project: '16290',
      capacityTons: 2560,
      grossTonnage: 2264,
      fuelUnderway: 4.2,
      fuelAtBerth: 0.4,
    },
    BALTIYSKY_101: {
      id: 'baltiysky_101',
      name: 'Балтийский-101',
      project: '613',
      capacityTons: 2000,
      grossTonnage: 1987,
      fuelUnderway: 5.2,
      fuelAtBerth: 0.4,
    },
    STK_1001: {
      id: 'stk_1001',
      name: 'СТК-1001',
      project: '326.1',
      capacityTons: 1200,
      grossTonnage: 1367,
      fuelUnderway: 3.6,
      fuelAtBerth: 0.4,
    },
  };

  exports.SHIP_LIST = Object.values(exports.SHIP_TYPES);

  // Поиск типа судна по номеру проекта
  exports.getShipTypeByProject = function (project) {
    return exports.SHIP_LIST.find(s => s.project === project) || null;
  };

  // ==================== НОРМЫ ЗАГРУЗКИ (тонн по типу груза) ====================
  // project -> { fruits, fertilizers, metal, wood, general }
  exports.LOADING_NORMS = {
    '19610':  { general: 5500, fruits: 3300, fertilizers: 5500, metal: 5500, wood: 4600 },
    '00101':  { general: 5000, fruits: 3500, fertilizers: 5000, metal: 5000, wood: 4500 },
    '05074A': { general: 3660, fruits: 2200, fertilizers: 3660, metal: 3660, wood: 3100 },
    '488-AM': { general: 3000, fruits: 2100, fertilizers: 3000, metal: 3000, wood: 2800 },
    '292':    { general: 2870, fruits: 2000, fertilizers: 2870, metal: 2870, wood: 2700 },
    '92040':  { general: 2800, fruits: 1800, fertilizers: 2800, metal: 2800, wood: 2550 },
    '16290':  { general: 2560, fruits: 1500, fertilizers: 2560, metal: 2560, wood: 2100 },
    '613':    { general: 2000, fruits: 1400, fertilizers: 2000, metal: 2000, wood: 1900 },
    '326.1':  { general: 1200, fruits: 850,  fertilizers: 1200, metal: 1200, wood: 1000 },
  };

  // Получить макс. загрузку для судна и груза
  exports.getMaxLoad = function (project, cargoTypeId) {
    const norms = exports.LOADING_NORMS[project];
    if (!norms) return 0;
    return norms[cargoTypeId] || norms.general || 0;
  };

  // ==================== СТАТУСЫ СУДОВ ====================
  exports.SHIP_STATUS = {
    IDLE: 'idle',               // В порту, без назначения
    EN_ROUTE: 'en_route',       // В пути между портами
    LOADING: 'loading',         // Погрузка
    UNLOADING: 'unloading',     // Разгрузка
    ANNOUNCED: 'announced',     // Анонсировано как свободное
  };

  // ==================== СТАТУСЫ ОФЕРТ ====================
  exports.OFFER_STATUS = {
    OPEN: 'open',               // Открыта (ожидает принятия)
    ACCEPTED: 'accepted',       // Принята судовладельцем
    IN_PROGRESS: 'in_progress', // Выполняется (погрузка/перевозка/разгрузка)
    COMPLETED: 'completed',     // Выполнена
    CANCELLED: 'cancelled',     // Отменена
    EXPIRED: 'expired',         // Истёк срок действия
  };

  // ==================== СТАТУСЫ ДОГОВОРОВ ====================
  exports.CONTRACT_STATUS = {
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    OVERDUE: 'overdue',
    CANCELLED: 'cancelled',
  };

  // ==================== ВИДЫ ОФЕРТ ====================
  exports.OFFER_TYPES = {
    FIRM: 'firm',       // Твёрдая
    FREE: 'free',       // Свободная
  };

  // ==================== ПРОФОРМЫ ЧАРТЕРА ====================
  exports.CHARTER_PROFORMAS = ['Gencon', 'Nuvoy', 'Baltime', 'Shelltime'];

  // ==================== УСЛОВИЯ ОПЛАТЫ ====================
  exports.PAYMENT_TERMS = [
    '50% до погрузки, 50% после выгрузки',
    '100% после выгрузки',
    '100% до погрузки',
    '30% до погрузки, 70% после выгрузки',
  ];

  // ==================== ГРУЗОВЫЕ РАБОТЫ ====================
  exports.CARGO_HANDLING_OPTIONS = [
    'Грузовладельца',
    'Перевозчика',
    '50/50',
  ];

  // ==================== ПРЕДСОЗДАННЫЕ КОМПАНИИ ====================
  exports.PRESET_COMPANIES = {
    charterers: [
      { id: 1,  name: 'Стокгруп' },
      { id: 2,  name: 'Мастер Трейд' },
      { id: 3,  name: 'Карго Экспресс' },
      { id: 4,  name: 'Глобал Фрейт' },
      { id: 5,  name: 'СиТрейд' },
      { id: 6,  name: 'Океан Коммерс' },
      { id: 7,  name: 'Порт Трейдинг' },
      { id: 8,  name: 'Маритайм Мерчанс' },
    ],
    shipOwners: [
      { id: 101, name: 'Ривер Флот' },
      { id: 102, name: 'Мортранс' },
      { id: 103, name: 'Шиппинг Ко.' },
      { id: 104, name: 'Нэйви Лайнс' },
      { id: 105, name: 'Волга Шиппинг' },
      { id: 106, name: 'Балтик Кэрриерс' },
      { id: 107, name: 'Нозерн Флит' },
      { id: 108, name: 'Истерн Шиппинг' },
    ],
  };

  // ==================== НАСТРОЙКИ ПО УМОЛЧАНИЮ ====================
  exports.DEFAULT_CONFIG = {
    startBalance: 5000000,
    timeSpeed: 30 / 60,   // 1 реал. сек = 30 игровых минут
    startDate: '2024-01-01T00:00:00',
    fuelPricePerTon: 500, // $/тонна топлива
  };

})(typeof window !== 'undefined'
  ? (window.SharedConstants = window.SharedConstants || {})
  : module.exports
);
