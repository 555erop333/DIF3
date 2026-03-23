// client/js/ui/logPanel.js — Панель «Журнал действий»
(function () {
  'use strict';

  const CATEGORIES = {
    all: 'Все',
    exchange: 'Биржа',
    ship: 'Суда',
    offer: 'Оферты',
    cargo: 'Грузы',
    account: 'Счёт',
    contract: 'Договоры',
    system: 'Система',
  };

  const CATEGORY_COLORS = {
    exchange: '#4caf50',
    ship: '#2196f3',
    offer: '#ff9800',
    cargo: '#9c27b0',
    account: '#00bcd4',
    contract: '#e91e63',
    system: '#607d8b',
  };

  let currentCategory = 'all';
  let allLogs = [];
  let containerRef = null;

  let socketListenerAttached = false;

  function attachSocketListener() {
    if (socketListenerAttached || !window.gameSocket) return;
    socketListenerAttached = true;
    window.gameSocket.on('log:new', (entry) => {
      allLogs.push(entry);
      const el = document.getElementById('log-content');
      if (el) {
        if (currentCategory === 'all' || currentCategory === entry.category) {
          el.innerHTML = renderLogs();
          el.scrollTop = el.scrollHeight;
        }
      }
    });
  }

  function render(container) {
    containerRef = container;
    attachSocketListener();

    let html = '<div class="log-panel">';

    // Tabs
    html += '<div style="margin-bottom:10px;display:flex;gap:4px;flex-wrap:wrap">';
    Object.entries(CATEGORIES).forEach(([key, label]) => {
      const active = key === currentCategory;
      const bg = active ? '#5aa8d0' : '#333';
      html += `<button class="panel-btn log-tab" data-cat="${key}" style="background:${bg};color:#fff;font-size:11px;padding:4px 8px">${label}</button>`;
    });
    html += '</div>';

    // Content
    html += '<div id="log-content" style="overflow-y:auto;max-height:calc(100vh - 200px)">';
    html += renderLogs();
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;

    // Tab click handlers
    container.querySelectorAll('.log-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        currentCategory = btn.dataset.cat;
        render(container);
      });
    });

    // Load logs from server
    loadLogs();
  }

  function loadLogs() {
    const socket = window.gameSocket;
    if (!socket) return;

    socket.emit('log:getAll', { category: currentCategory }, (data) => {
      if (data && data.logs) {
        allLogs = data.logs;
        const el = document.getElementById('log-content');
        if (el) {
          el.innerHTML = renderLogs();
          el.scrollTop = el.scrollHeight;
        }
      }
    });
  }

  function renderLogs() {
    if (allLogs.length === 0) {
      return '<p style="color:#666;text-align:center;margin-top:30px">Нет записей</p>';
    }

    let html = '<table class="panel-table" style="font-size:12px"><thead><tr>';
    html += '<th style="width:130px">Время</th>';
    html += '<th style="width:80px">Категория</th>';
    html += '<th>Действие</th>';
    html += '<th>Подробности</th>';
    html += '<th style="width:90px">Сумма</th>';
    html += '</tr></thead><tbody>';

    // Show newest first
    const sorted = [...allLogs].reverse();

    sorted.forEach(entry => {
      const d = new Date(entry.timestamp);
      const date = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const catLabel = CATEGORIES[entry.category] || entry.category;
      const catColor = CATEGORY_COLORS[entry.category] || '#888';

      let amountStr = '';
      if (entry.amount !== undefined) {
        const sign = entry.amount >= 0 ? '+' : '';
        const color = entry.amount >= 0 ? '#4caf50' : '#f44336';
        amountStr = `<span style="color:${color}">${sign}$${Math.abs(entry.amount).toLocaleString('ru-RU')}</span>`;
      }

      html += '<tr>';
      html += `<td style="white-space:nowrap;color:#888">${date} ${time}</td>`;
      html += `<td><span style="color:${catColor};font-weight:bold;font-size:11px">${catLabel}</span></td>`;
      html += `<td>${entry.action}</td>`;
      html += `<td style="color:#aaa;font-size:11px">${entry.details}</td>`;
      html += `<td style="text-align:right">${amountStr}</td>`;
      html += '</tr>';
    });

    html += '</tbody></table>';
    return html;
  }

  window.LogPanel = { render };
})();
