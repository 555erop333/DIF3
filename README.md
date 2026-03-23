# DIF3 — Морская торговая симуляция

Многопользовательская браузерная игра-симуляция морской торговли для локальной сети. Игроки управляют флотами и грузами в акватории Чёрного и Средиземного морей.

## Роли

- **Фрахтователь** — покупает и продаёт грузы на бирже, нанимает суда для перевозки
- **Судовладелец** — управляет флотом, назначает маршруты, зарабатывает на фрахте

## Возможности

- 9 типов судов (Волга-4001, СТК-1001 и др.) с реалистичным расходом топлива
- 4 типа грузов: фрукты, удобрения, металл, лес
- 17 портов и 27 морских маршрутов
- Интерактивная карта с pan/zoom (Canvas 2D)
- Динамическая биржа с ценами на грузы и портовые услуги
- Система оферт по стандарту Gencon (Laydays/Cancelling, Демередж/Диспач)
- Погрузка/разгрузка по реальным нормам обработки
- Внутриигровая почта и финансовый учёт
- Настраиваемая скорость игрового времени и пауза

## Стек

- **Сервер:** Node.js + Express + Socket.IO
- **Клиент:** HTML / CSS / vanilla JS + Canvas 2D
- **Сборка:** pkg (standalone .exe для Windows)

## Быстрый старт

```bash
# Установка зависимостей
npm install

# Запуск сервера
npm start
```

Откройте `http://localhost:3000` в браузере. Другие игроки в локальной сети подключаются по IP хоста.

## Сборка .exe

```bash
npm run build
```

Исполняемый файл появится в `dist/DIF3.exe`.

## Структура проекта

```
server/
  index.js           — точка входа сервера
  gameState.js        — центральное состояние игры
  gameClock.js        — игровое время (тики, скорость, пауза)
  mapData.js          — порты, маршруты, координаты
  referenceData.js    — нормы хода, обработки, стоимости
  shipManager.js      — управление судами
  exchange.js         — биржа грузов
  cargoManager.js     — погрузка/разгрузка
  offerSystem.js      — оферты и договоры
  contractHistory.js  — история договоров
  mailSystem.js       — внутриигровая почта
  accountSystem.js    — финансы и сче<img width="2560" height="1392" alt="vivaldi_Q4QW0JWLj5" src="https://github.com/user-attachments/assets/9c4d69a9-341e-41ac-b62e-d0577fcb2bf3" />
та<img width="2560" height="1392" alt="vivaldi_g87gqHYtB3" src="https://github.com/user-attachments/assets/a772d48b-f17e-4da0-9d96-e5eb5d46420b" />

  newsSystem.js       — новостная лента
  lobby.js            — лобби и подключение
  actionLog.js        — лог действий
client/
  index.html          — игровой интерфейс
  lobby.html          — лобби (выбор компании, настройки)
  admin.html          — панель администратора
  js/app.js           — клиентская логика
  js/mapRenderer.js   — рендер карты
  js/ui/              — UI-панели (флот, биржа, оферты, почта и др.)
shared/
  constants.js        — типы судов, грузов, нормы загрузки
```

## Лицензия

ISC



<img width="2560" height="1392" alt="vivaldi_g87gqHYtB3" src="https://github.com/user-attachments/assets/beefe9f3-ccfb-447e-bfbb-168a48409885" />
<img width="2560" height="1392" alt="vivaldi_Q4QW0JWLj5" src="https://github.com/user-attachments/assets/666e5aa4-77de-4d89-b6a5-477969f6ee72" />
<img width="2560" height="1392" alt="vivaldi_nOtQvTX4qZ" src="https://github.com/user-attachments/assets/2c626c5c-ed9e-4e2e-9977-2cbf8d01d257" />
<img width="1353" height="716" alt="WindowsTerminal_ZlJGRB66LE" src="https://github.com/user-attachments/assets/09840e94-8fa4-4fce-8ce8-082816e82cf0" />
