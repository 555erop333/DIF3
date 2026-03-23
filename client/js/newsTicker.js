// client/js/newsTicker.js — Бегущая строка новостей
// Архитектура: каждая новость — отдельный абсолютно позиционированный элемент
// внутри контейнера tape. Tape сдвигается через translateX.
// Элементы всегда входят строго с правого края экрана.
(function () {
  'use strict';

  const SPEED       = 400;  // px/sec (базовая)
  const ITEM_GAP    = 40;   // px между элементами
  const MAX_HISTORY = 100;

  const track  = document.getElementById('news-ticker-track');
  const tape   = document.getElementById('news-ticker-text');
  const ticker = document.getElementById('news-ticker');
  if (!track || !tape) return;

  // ==================== ДАННЫЕ ====================
  let allHistory = [];
  let totalCount = 0;     // общий счётчик (не ограничен MAX_HISTORY)
  let queue      = [];    // очередь новостей на показ
  let items      = [];    // {el, x, width} — элементы в DOM
  let scrollOfs  = 0;     // общее смещение (растёт со временем)
  let nextX      = 0;     // позиция для следующего элемента (в координатах tape)
  let lastTime   = 0;
  let running    = false;

  // ==================== ФОРМАТ ====================
  function formatNewsItem(item) {
    const arrow = item.changePercent >= 0 ? '\u2191' : '\u2193';
    const cls   = item.changePercent >= 0 ? 'news-change-up' : 'news-change-down';
    const pct   = Math.abs(item.changePercent);
    const pl    = item.priceType === '\u043f\u043e\u043a\u0443\u043f\u043a\u0430' ? '\u043f\u043e\u043a.' : '\u043f\u0440\u043e\u0434.';
    return '<span class="news-city">' + item.city + ':</span> ' + item.text +
      ' <span class="' + cls + '">' + arrow + pct + '% ' + pl + '</span>';
  }

  // ==================== DOM ====================
  function createItemEl(newsItem) {
    const el = document.createElement('span');
    el.className = 'nt-item';

    // Разделитель перед элементом (кроме самого первого)
    if (items.length > 0) {
      el.innerHTML = '<span class="news-sep">\u2502</span>' + formatNewsItem(newsItem);
    } else {
      el.innerHTML = formatNewsItem(newsItem);
    }

    el.style.left = nextX + 'px';
    tape.appendChild(el);

    const w = el.offsetWidth;
    items.push({ el, x: nextX, width: w });
    nextX += w + ITEM_GAP;
    return w;
  }

  // ==================== ГЛАВНЫЙ ЦИКЛ ====================
  function tick(now) {
    requestAnimationFrame(tick);
    if (!lastTime) { lastTime = now; return; }
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (!running) return;

    // Ограничиваем dt чтобы не было гигантских прыжков после скрытия вкладки
    if (dt > 0.1) dt = 0.1;

    // Адаптивная скорость: ускоряемся если очередь копится (макс ×3)
    const speedMul = Math.min(3, 1 + queue.length * 0.3);
    const speed = SPEED * speedMul;
    scrollOfs += speed * dt;

    const trackW = track.offsetWidth;

    // Подтянуть элементы из очереди — строго с правого края экрана
    while (queue.length > 0) {
      // Гарантировать: элемент входит не раньше правого края viewport
      nextX = Math.max(nextX, scrollOfs + trackW);

      if (nextX - scrollOfs <= trackW) {
        createItemEl(queue.shift());
      } else {
        break;
      }
    }

    // Сдвинуть ленту
    tape.style.transform = 'translateX(' + Math.round(-scrollOfs) + 'px)';

    // Удалить элементы, ушедшие за левый край
    while (items.length > 0) {
      const first = items[0];
      if (first.x + first.width - scrollOfs < -50) {
        first.el.remove();
        items.shift();
      } else {
        break;
      }
    }

    // Перебазирование координат: когда scrollOfs слишком большой,
    // сдвигаем всё назад чтобы избежать потери точности float
    if (scrollOfs > 100000 && items.length === 0 && queue.length === 0) {
      nextX -= scrollOfs;
      scrollOfs = 0;
      tape.style.transform = 'translateX(0px)';
    }
  }

  // Компенсация при скрытии/сворачивании окна
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && running && lastTime) {
      const now = performance.now();
      const elapsed = (now - lastTime) / 1000;
      lastTime = now;

      // Прокрутить как будто тикер работал всё время
      scrollOfs += SPEED * elapsed;

      // Удалить DOM-элементы, ушедшие за левый край
      while (items.length > 0) {
        const first = items[0];
        if (first.x + first.width - scrollOfs < -50) {
          first.el.remove();
          items.shift();
        } else {
          break;
        }
      }

      // Из очереди оставить только последние 2 новости (актуальные)
      if (queue.length > 2) {
        queue.splice(0, queue.length - 2);
      }

      // Сбросить nextX чтобы следующие элементы входили с правого края
      nextX = scrollOfs + track.offsetWidth;
    }
  });

  // ==================== ПУБЛИЧНЫЙ API ====================
  function addNews(item) {
    allHistory.unshift(item);
    if (allHistory.length > MAX_HISTORY) allHistory.length = MAX_HISTORY;
    totalCount++;
    updateBadge();
    if (historyOpen && historyPanel) insertHistoryItem(item);

    // Всегда в очередь — элемент появится строго с правого края
    queue.push(item);

    if (!running) {
      nextX = track.offsetWidth + scrollOfs;
      running = true;
    }
  }

  // ==================== БЕЙДЖ ====================
  function updateBadge() {
    let badge = document.getElementById('news-ticker-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'news-ticker-badge';
      const label = document.getElementById('news-ticker-label');
      if (label) label.appendChild(badge);
    }
    badge.textContent = totalCount;
    badge.style.cssText = 'margin-left:6px;background:#c03030;color:#fff;font-size:8px;' +
      'padding:1px 4px;border-radius:6px;font-weight:600;letter-spacing:0';
  }

  // ==================== ПАНЕЛЬ ИСТОРИИ ====================
  let historyOpen  = false;
  let historyPanel = null;

  function createHistoryPanel() {
    historyPanel = document.createElement('div');
    historyPanel.id = 'news-history-panel';
    document.body.appendChild(historyPanel);
  }

  function buildItemHTML(item, isNew) {
    const arrow = item.changePercent >= 0 ? '\u2191' : '\u2193';
    const cls   = item.changePercent >= 0 ? 'nh-up' : 'nh-down';
    const pl    = item.priceType === '\u043f\u043e\u043a\u0443\u043f\u043a\u0430' ? '\u043f\u043e\u043a\u0443\u043f\u043a\u0430' : '\u043f\u0440\u043e\u0434\u0430\u0436\u0430';
    return '<div class="nh-item' + (isNew ? ' nh-slide-in' : '') + '">' +
      '<div class="nh-item-row">' +
        '<span class="nh-item-city">' + item.city + '</span>' +
        '<span class="nh-item-meta">' +
          '<span class="nh-commodity">' + item.commodity + '</span> ' +
          '<span class="' + cls + '">' + arrow + Math.abs(item.changePercent) + '% ' + pl + '</span>' +
        '</span>' +
      '</div>' +
      '<div class="nh-item-text">' + item.text + '</div>' +
    '</div>';
  }

  function insertHistoryItem(item) {
    const list = historyPanel.querySelector('.nh-list');
    if (!list) return;
    const empty = list.querySelector('.nh-empty');
    if (empty) empty.remove();
    list.querySelectorAll('.nh-slide-in').forEach(el => el.classList.remove('nh-slide-in'));
    const temp = document.createElement('div');
    temp.innerHTML = buildItemHTML(item, true);
    list.insertBefore(temp.firstChild, list.firstChild);
    const countEl = historyPanel.querySelector('.nh-count');
    if (countEl) countEl.textContent = totalCount + ' записей';
    while (list.children.length > MAX_HISTORY) list.removeChild(list.lastChild);
  }

  function renderHistory() {
    if (!historyPanel) createHistoryPanel();
    let html = '<div class="nh-header">' +
      '<span class="nh-title">\u041d\u043e\u0432\u043e\u0441\u0442\u0438</span>' +
      '<span class="nh-count">' + totalCount + ' записей</span>' +
      '<button class="nh-close" id="nh-close">\u00d7</button>' +
      '</div><div class="nh-list">';
    if (allHistory.length === 0) {
      html += '<div class="nh-empty">\u041d\u043e\u0432\u043e\u0441\u0442\u0435\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442</div>';
    } else {
      allHistory.forEach(item => { html += buildItemHTML(item, false); });
    }
    html += '</div>';
    historyPanel.innerHTML = html;
    historyPanel.classList.add('open');
    document.getElementById('nh-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeHistory();
    });
  }

  function closeHistory() {
    if (historyPanel) historyPanel.classList.remove('open');
    historyOpen = false;
  }

  ticker.addEventListener('click', (e) => {
    e.stopPropagation();
    historyOpen = !historyOpen;
    if (historyOpen) renderHistory();
    else closeHistory();
  });

  document.addEventListener('click', (e) => {
    if (historyOpen && historyPanel && !historyPanel.contains(e.target) && !ticker.contains(e.target)) {
      closeHistory();
    }
  });

  // ==================== СТИЛИ ====================
  const style = document.createElement('style');
  style.textContent = `
    #news-ticker-text {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
    }
    .nt-item {
      position: absolute;
      top: 0;
      white-space: nowrap;
      font-size: 20px;
      color: #8898a8;
      line-height: 48px;
    }
    #news-history-panel {
      position: fixed;
      bottom: 49px;
      left: 0;
      width: 520px;
      max-height: 60vh;
      background: #161a28;
      border: 1px solid #262a34;
      border-bottom: none;
      border-radius: 0 6px 0 0;
      display: none;
      flex-direction: column;
      z-index: 250;
      box-shadow: 0 -4px 24px rgba(0,0,0,.5);
    }
    #news-history-panel.open { display: flex; }
    .nh-header {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px;
      background: #1a1d26;
      border-bottom: 1px solid #262a34;
      border-radius: 0 6px 0 0;
      flex-shrink: 0;
    }
    .nh-title { font-size: 14px; font-weight: bold; color: #c89040; }
    .nh-count { font-size: 11px; color: #3a4050; }
    .nh-close {
      margin-left: auto; background: none; border: none;
      color: #4a5060; font-size: 20px; cursor: pointer; padding: 0 4px;
    }
    .nh-close:hover { color: #c8cdd6; }
    .nh-list { flex: 1; overflow-y: auto; padding: 4px 0; }
    .nh-empty { text-align: center; color: #3a4050; padding: 30px; font-size: 13px; }
    .nh-item {
      padding: 6px 14px;
      border-bottom: 1px solid #1a1d26;
    }
    .nh-item:hover { background: #1e2230; }
    .nh-item-row {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 2px;
    }
    .nh-item-city { font-size: 11px; font-weight: 600; color: #5aa8d0; }
    .nh-item-text { font-size: 12px; color: #6a7888; line-height: 1.4; }
    .nh-item-meta { display: flex; gap: 8px; font-size: 11px; }
    .nh-commodity { color: #4a5060; }
    .nh-up { color: #66bb6a; font-weight: 600; }
    .nh-down { color: #ef5350; font-weight: 600; }
    .nh-slide-in {
      animation: nhSlideIn .5s ease-out;
      background: #1a2840;
      border-left: 3px solid #c89040;
    }
    @keyframes nhSlideIn {
      0%   { opacity: 0; transform: translateY(-100%); max-height: 0; padding-top: 0; padding-bottom: 0; }
      40%  { opacity: 0.5; max-height: 80px; }
      100% { opacity: 1; transform: translateY(0); max-height: 80px; padding-top: 6px; padding-bottom: 6px; }
    }
  `;
  document.head.appendChild(style);

  requestAnimationFrame(tick);
  window.NewsTicker = { addNews };
})();
