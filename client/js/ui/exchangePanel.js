// client/js/ui/exchangePanel.js — Биржа (с анимацией цен)
(function () {
  'use strict';

  const C = window.SharedConstants;
  const MD = window.MapData;

  let currentPrices = {};
  let previousPrices = {};
  let selectedPort = null;
  let selectedCargo = null;
  let warehouseData = {};
  let activeContainer = null;
  let listenerBound = false;

  function fmt(n) {
    return n.toLocaleString('ru-RU');
  }

  // ==================== LIVE UPDATE (без перерисовки) ====================
  function onPricesUpdate(newPrices) {
    const oldPrices = currentPrices;
    currentPrices = newPrices;

    if (!activeContainer) return;

    // Обновить ячейки таблицы на месте
    activeContainer.querySelectorAll('.ex-price').forEach(cell => {
      const portId = cell.dataset.port;
      const cargoId = cell.dataset.cargo;
      const field = cell.classList.contains('ex-buy') ? 'buyPrice' : 'sellPrice';

      const newEntry = newPrices[portId]?.[cargoId];
      const oldEntry = oldPrices[portId]?.[cargoId];
      if (!newEntry) return;

      const newVal = newEntry[field];
      const oldVal = oldEntry ? oldEntry[field] : newVal;

      // Обновить текст
      cell.textContent = '$' + fmt(newVal);

      // Анимация если цена изменилась
      if (newVal !== oldVal) {
        cell.classList.remove('ex-flash-up', 'ex-flash-down');
        // Force reflow для повторного запуска анимации
        void cell.offsetWidth;
        cell.classList.add(newVal > oldVal ? 'ex-flash-up' : 'ex-flash-down');
      }
    });

    // Обновить запасы
    activeContainer.querySelectorAll('.ex-supply-val').forEach(cell => {
      const portId = cell.dataset.port;
      const cargoId = cell.dataset.cargo;
      const entry = newPrices[portId]?.[cargoId];
      if (entry) cell.textContent = fmt(entry.supply) + ' т';
    });

    // Обновить торговую панель
    updateTradeInfo();
  }

  function updateTradeInfo() {
    if (!activeContainer || !selectedPort || !selectedCargo) return;
    const entry = currentPrices[selectedPort]?.[selectedCargo];
    if (!entry) return;

    const buyVal = activeContainer.querySelector('.ex-info-val.ex-buy');
    const sellVal = activeContainer.querySelector('.ex-info-val.ex-sell');

    if (buyVal) buyVal.textContent = '$' + fmt(entry.buyPrice) + '/\u0442';
    if (sellVal) sellVal.textContent = '$' + fmt(entry.sellPrice) + '/\u0442';

    // Пересчитать стоимость
    const tonsInput = activeContainer.querySelector('#ex-tons');
    if (tonsInput) {
      const tons = parseInt(tonsInput.value) || 0;
      const costBuy = activeContainer.querySelector('#ex-cost-buy');
      const costSell = activeContainer.querySelector('#ex-cost-sell');
      if (costBuy) costBuy.textContent = '$' + fmt(tons * entry.buyPrice);
      if (costSell) costSell.textContent = '$' + fmt(tons * entry.sellPrice);
    }
  }

  function ensureListener() {
    if (listenerBound) return;
    const socket = window.gameSocket;
    if (!socket) return;
    socket.on('exchange:prices', onPricesUpdate);
    listenerBound = true;
  }

  // ==================== RENDER ====================
  function render(container) {
    const socket = window.gameSocket;
    const gs = window.gameState;
    const isCharterer = gs.myPlayer && gs.myPlayer.role === 'charterer';

    activeContainer = container;
    ensureListener();

    container.innerHTML = '<p style="color:#888">\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0446\u0435\u043d...</p>';

    socket.emit('exchange:getPrices', null, (data) => {
      previousPrices = currentPrices;
      currentPrices = data.prices || {};
      const mainPorts = MD.PORTS.filter(p => p.isMain && currentPrices[p.id]);

      if (mainPorts.length === 0) {
        container.innerHTML = '<p style="color:#888">\u041d\u0435\u0442 \u0434\u0430\u043d\u043d\u044b\u0445 \u043e \u0446\u0435\u043d\u0430\u0445</p>';
        return;
      }

      // Build price matrix
      let html = '<div class="ex-wrapper">';

      // === Price Table ===
      html += '<div class="ex-prices">';
      html += '<table class="ex-table"><thead><tr>';
      html += '<th class="ex-th-port">\u041f\u043e\u0440\u0442</th>';
      C.CARGO_LIST.forEach(cargo => {
        html += `<th colspan="2" class="ex-th-cargo">${cargo.name}</th>`;
      });
      html += '</tr><tr><th></th>';
      C.CARGO_LIST.forEach(() => {
        html += '<th class="ex-th-sub ex-buy">\u041f\u043e\u043a\u0443\u043f.</th>';
        html += '<th class="ex-th-sub ex-sell">\u041f\u0440\u043e\u0434\u0430\u0436.</th>';
      });
      html += '</tr></thead><tbody>';

      mainPorts.forEach(port => {
        const prices = currentPrices[port.id];
        const oldPortPrices = previousPrices[port.id] || {};
        const isSel = selectedPort === port.id;
        html += `<tr class="ex-port-row${isSel ? ' ex-row-sel' : ''}" data-port="${port.id}">`;
        html += `<td class="ex-port-name">${port.name}</td>`;

        C.CARGO_LIST.forEach(cargo => {
          const e = prices[cargo.id];
          if (!e) {
            html += '<td>\u2014</td><td>\u2014</td>';
            return;
          }
          const old = oldPortPrices[cargo.id];
          const cellSel = isSel && selectedCargo === cargo.id ? ' ex-cell-sel' : '';

          // Начальная анимация если есть разница с предыдущими ценами
          let buyFlash = '', sellFlash = '';
          if (old) {
            if (e.buyPrice > old.buyPrice) buyFlash = ' ex-flash-up';
            else if (e.buyPrice < old.buyPrice) buyFlash = ' ex-flash-down';
            if (e.sellPrice > old.sellPrice) sellFlash = ' ex-flash-up';
            else if (e.sellPrice < old.sellPrice) sellFlash = ' ex-flash-down';
          }

          html += `<td class="ex-price ex-buy${cellSel}${buyFlash}" data-port="${port.id}" data-cargo="${cargo.id}">$${fmt(e.buyPrice)}</td>`;
          html += `<td class="ex-price ex-sell${cellSel}${sellFlash}" data-port="${port.id}" data-cargo="${cargo.id}">$${fmt(e.sellPrice)}</td>`;
        });
        html += '</tr>';

        // Строка запасов (если не бесконечные)
        if (!gs.infiniteSupply) {
          html += `<tr class="ex-supply-row" data-port="${port.id}">`;
          html += '<td class="ex-supply-label">запас</td>';
          C.CARGO_LIST.forEach(cargo => {
            const e = prices[cargo.id];
            const sup = e ? e.supply : 0;
            html += `<td colspan="2" class="ex-supply-val" data-port="${port.id}" data-cargo="${cargo.id}">${fmt(sup)} т</td>`;
          });
          html += '</tr>';
        }
      });

      html += '</tbody></table>';
      html += '</div>'; // .ex-prices

      // === Trade Panel (only for charterers) ===
      if (isCharterer && selectedPort && selectedCargo) {
        const priceEntry = currentPrices[selectedPort]?.[selectedCargo];
        const port = mainPorts.find(p => p.id === selectedPort);
        const cargo = C.CARGO_LIST.find(c => c.id === selectedCargo);

        if (priceEntry && port && cargo) {
          const whTons = warehouseData[selectedCargo] || 0;

          html += '<div class="ex-trade">';
          html += `<div class="ex-trade-header">`;
          html += `<span class="ex-trade-port">${port.name}</span>`;
          html += `<span class="ex-trade-sep">\u2192</span>`;
          html += `<span class="ex-trade-cargo">${cargo.name}</span>`;
          html += `</div>`;

          // Info cards
          html += '<div class="ex-info-row">';
          html += `<div class="ex-info-card"><div class="ex-info-label">\u0426\u0435\u043d\u0430 \u043f\u043e\u043a\u0443\u043f\u043a\u0438</div><div class="ex-info-val ex-buy">$${fmt(priceEntry.buyPrice)}/\u0442</div></div>`;
          html += `<div class="ex-info-card"><div class="ex-info-label">\u0426\u0435\u043d\u0430 \u043f\u0440\u043e\u0434\u0430\u0436\u0438</div><div class="ex-info-val ex-sell">$${fmt(priceEntry.sellPrice)}/\u0442</div></div>`;
          html += `<div class="ex-info-card"><div class="ex-info-label">\u041d\u0430 \u0441\u043a\u043b\u0430\u0434\u0435</div><div class="ex-info-val ex-wh">${fmt(whTons)} \u0442</div></div>`;
          html += '</div>';

          // Trade form
          html += '<div class="ex-trade-form">';
          html += '<div class="ex-input-group">';
          html += '<label>\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e (\u0442\u043e\u043d\u043d)</label>';
          html += `<input type="number" id="ex-tons" min="100" value="100" step="100" class="ex-input">`;
          html += '</div>';
          html += '<div class="ex-input-group">';
          html += '<label>\u0421\u0443\u043c\u043c\u0430 \u043f\u043e\u043a\u0443\u043f\u043a\u0438</label>';
          html += `<div id="ex-cost-buy" class="ex-calc ex-buy">$${fmt(100 * priceEntry.buyPrice)}</div>`;
          html += '</div>';
          html += '<div class="ex-input-group">';
          html += '<label>\u0421\u0443\u043c\u043c\u0430 \u043f\u0440\u043e\u0434\u0430\u0436\u0438</label>';
          html += `<div id="ex-cost-sell" class="ex-calc ex-sell">$${fmt(100 * priceEntry.sellPrice)}</div>`;
          html += '</div>';
          html += '</div>';

          // Buttons
          html += '<div class="ex-trade-buttons">';
          html += `<button class="ex-btn ex-btn-buy" id="ex-do-buy">\u041a\u0443\u043f\u0438\u0442\u044c ${cargo.name}</button>`;
          html += `<button class="ex-btn ex-btn-sell" id="ex-do-sell"${whTons <= 0 ? ' disabled' : ''}>\u041f\u0440\u043e\u0434\u0430\u0442\u044c ${cargo.name}</button>`;
          html += '</div>';

          // Balance
          html += `<div class="ex-balance">\u0411\u0430\u043b\u0430\u043d\u0441: <b>$${fmt(gs.myPlayer.balance)}</b></div>`;

          // Result message
          html += '<div id="ex-result" class="ex-result"></div>';
          html += '</div>'; // .ex-trade
        }
      } else if (isCharterer) {
        html += '<div class="ex-trade ex-trade-hint">\u041a\u043b\u0438\u043a\u043d\u0438\u0442\u0435 \u043d\u0430 \u044f\u0447\u0435\u0439\u043a\u0443 \u0446\u0435\u043d\u044b \u0434\u043b\u044f \u043f\u043e\u043a\u0443\u043f\u043a\u0438/\u043f\u0440\u043e\u0434\u0430\u0436\u0438</div>';
      }

      html += '</div>'; // .ex-wrapper

      container.innerHTML = html;
      applyStyles(container);
      bindEvents(container, socket, isCharterer);
    });
  }

  function applyStyles(container) {
    if (document.getElementById('ex-styles')) return;
    const style = document.createElement('style');
    style.id = 'ex-styles';
    style.textContent = `
      .ex-wrapper { display: flex; flex-direction: column; gap: 12px; }
      .ex-prices { overflow-x: auto; }
      .ex-table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .ex-table th, .ex-table td { padding: 5px 8px; text-align: center; white-space: nowrap; }
      .ex-th-port { text-align: left !important; color: #5aa8d0; background: #1e2130; font-size: 12px; position: sticky; top: 0; }
      .ex-th-cargo { color: #c8cdd6; background: #1e2130; font-size: 12px; border-bottom: none; position: sticky; top: 0; }
      .ex-th-sub { font-weight: normal; font-size: 10px; background: #1e2130; padding: 2px 8px; position: sticky; top: 22px; }
      .ex-th-sub.ex-buy { color: #66bb6a; }
      .ex-th-sub.ex-sell { color: #c89040; }
      .ex-port-row { cursor: pointer; border-bottom: 1px solid #1e2130; }
      .ex-port-row:hover td { background: #1e2840; }
      .ex-row-sel td { background: #1a2840 !important; }
      .ex-port-name { text-align: left !important; font-weight: 600; color: #8898a8; font-size: 12px; }
      .ex-price { font-family: 'Consolas', monospace; font-size: 12px; cursor: pointer; transition: color .3s; }
      .ex-price.ex-buy { color: #66bb6a; }
      .ex-price.ex-sell { color: #c89040; }
      .ex-price:hover { background: #1e3050 !important; border-radius: 3px; }
      .ex-cell-sel { background: #1a3858 !important; outline: 1px solid #3090d0; border-radius: 3px; }

      /* Price change animations */
      .ex-flash-up {
        animation: exFlashUp 1.5s ease-out;
      }
      .ex-flash-down {
        animation: exFlashDown 1.5s ease-out;
      }
      @keyframes exFlashUp {
        0%   { background: rgba(76, 175, 80, 0.5); color: #a5d6a7; }
        50%  { background: rgba(76, 175, 80, 0.2); }
        100% { background: transparent; }
      }
      @keyframes exFlashDown {
        0%   { background: rgba(244, 67, 54, 0.5); color: #ef9a9a; }
        50%  { background: rgba(244, 67, 54, 0.2); }
        100% { background: transparent; }
      }

      .ex-supply-row td { font-size: 11px; color: #4a5060; padding: 2px 8px; border-bottom: 2px solid #1e2840; }
      .ex-supply-label { text-align: left !important; color: #3a4050; font-style: italic; }
      .ex-supply-val { color: #4a5868; }
      .ex-trade { background: #1a1d26; border: 1px solid #262a34; border-radius: 6px; padding: 14px; }
      .ex-trade-hint { color: #3a4050; text-align: center; font-style: italic; padding: 20px; }
      .ex-trade-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 15px; }
      .ex-trade-port { color: #5aa8d0; font-weight: bold; }
      .ex-trade-sep { color: #3a4050; }
      .ex-trade-cargo { color: #c8a840; font-weight: bold; }
      .ex-info-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
      .ex-info-card { background: #0e1018; border-radius: 4px; padding: 8px; text-align: center; }
      .ex-info-label { font-size: 10px; color: #4a5060; margin-bottom: 3px; text-transform: uppercase; }
      .ex-info-val { font-size: 14px; font-weight: bold; color: #8890a0; font-family: 'Consolas', monospace; transition: color .3s; }
      .ex-info-val.ex-buy { color: #66bb6a; }
      .ex-info-val.ex-sell { color: #c89040; }
      .ex-info-val.ex-wh { color: #4090c0; }
      .ex-trade-form { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 14px; }
      .ex-input-group label { display: block; font-size: 10px; color: #4a5060; margin-bottom: 3px; text-transform: uppercase; }
      .ex-input { width: 100%; padding: 8px; background: #0e1018; border: 1px solid #262a34; border-radius: 4px; color: #c8cdd6; font-size: 14px; font-family: 'Consolas', monospace; }
      .ex-input:focus { outline: none; border-color: #3090d0; }
      .ex-calc { padding: 8px; background: #0e1018; border-radius: 4px; font-size: 14px; font-family: 'Consolas', monospace; border: 1px solid #1e2130; }
      .ex-calc.ex-buy { color: #66bb6a; }
      .ex-calc.ex-sell { color: #c89040; }
      .ex-trade-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
      .ex-btn { padding: 10px; border: none; border-radius: 4px; font-size: 13px; font-weight: bold; cursor: pointer; transition: background .15s; }
      .ex-btn:disabled { opacity: 0.35; cursor: not-allowed; }
      .ex-btn-buy { background: #1a5020; color: #a0d0a8; }
      .ex-btn-buy:hover:not(:disabled) { background: #286830; }
      .ex-btn-sell { background: #804800; color: #d8c090; }
      .ex-btn-sell:hover:not(:disabled) { background: #a06000; }
      .ex-balance { text-align: right; font-size: 13px; color: #5a6470; }
      .ex-balance b { color: #c8cdd6; font-family: 'Consolas', monospace; }
      .ex-result { text-align: center; font-size: 13px; margin-top: 8px; min-height: 20px; }
      .ex-result.ok { color: #66bb6a; }
      .ex-result.err { color: #ef5350; }
    `;
    document.head.appendChild(style);
  }

  function bindEvents(container, socket, isCharterer) {
    // Port row click — select port
    container.querySelectorAll('.ex-port-row').forEach(row => {
      row.addEventListener('click', () => {
        selectedPort = row.dataset.port;
        if (!selectedCargo) selectedCargo = C.CARGO_LIST[0].id;
        loadWarehouse(socket, () => render(container));
      });
    });

    // Price cell click — select port + cargo
    container.querySelectorAll('.ex-price').forEach(cell => {
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedPort = cell.dataset.port;
        selectedCargo = cell.dataset.cargo;
        loadWarehouse(socket, () => render(container));
      });
    });

    // Tons input — live cost calc
    const tonsInput = container.querySelector('#ex-tons');
    if (tonsInput && selectedPort && selectedCargo) {
      const priceEntry = currentPrices[selectedPort]?.[selectedCargo];
      if (priceEntry) {
        const update = () => {
          const tons = parseInt(tonsInput.value) || 0;
          const costBuy = container.querySelector('#ex-cost-buy');
          const costSell = container.querySelector('#ex-cost-sell');
          if (costBuy) costBuy.textContent = '$' + fmt(tons * priceEntry.buyPrice);
          if (costSell) costSell.textContent = '$' + fmt(tons * priceEntry.sellPrice);
        };
        tonsInput.addEventListener('input', update);
      }
    }

    // Buy button
    const buyBtn = container.querySelector('#ex-do-buy');
    if (buyBtn) {
      buyBtn.addEventListener('click', () => {
        const tons = parseInt(tonsInput.value) || 0;
        if (tons <= 0) return;
        buyBtn.disabled = true;
        socket.emit('exchange:buy', { portId: selectedPort, cargoTypeId: selectedCargo, tons }, (res) => {
          showResult(container, res);
          if (res.success) loadWarehouse(socket, () => render(container));
          else buyBtn.disabled = false;
        });
      });
    }

    // Sell button
    const sellBtn = container.querySelector('#ex-do-sell');
    if (sellBtn) {
      sellBtn.addEventListener('click', () => {
        const tons = parseInt(tonsInput.value) || 0;
        if (tons <= 0) return;
        sellBtn.disabled = true;
        socket.emit('exchange:sell', { portId: selectedPort, cargoTypeId: selectedCargo, tons }, (res) => {
          showResult(container, res);
          if (res.success) loadWarehouse(socket, () => render(container));
          else sellBtn.disabled = false;
        });
      });
    }
  }

  function loadWarehouse(socket, cb) {
    if (!selectedPort) return cb();
    socket.emit('exchange:getWarehouse', { portId: selectedPort }, (data) => {
      warehouseData = data.warehouse || {};
      cb();
    });
  }

  function showResult(container, res) {
    const el = container.querySelector('#ex-result');
    if (!el) return;
    if (res.error) {
      el.textContent = res.error;
      el.className = 'ex-result err';
    } else if (res.totalCost != null) {
      el.textContent = `\u041a\u0443\u043f\u043b\u0435\u043d\u043e! \u0421\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c: $${fmt(res.totalCost)}`;
      el.className = 'ex-result ok';
    } else if (res.totalIncome != null) {
      el.textContent = `\u041f\u0440\u043e\u0434\u0430\u043d\u043e! \u0414\u043e\u0445\u043e\u0434: $${fmt(res.totalIncome)}`;
      el.className = 'ex-result ok';
    }
  }

  window.ExchangePanel = { render };
})();
