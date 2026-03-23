// client/js/ui/offerPanel.js — Оферта (полная форма по морским стандартам)
(function () {
  'use strict';

  const C = window.SharedConstants;
  const MD = window.MapData;

  function renderCreateForm(container) {
    const socket = window.gameSocket;
    const gs = window.gameState;
    const isCharterer = gs.myPlayer && gs.myPlayer.role === 'charterer';

    if (!isCharterer) {
      renderOfferList(container);
      return;
    }

    // Get ship owners for recipient list
    const shipOwners = Object.values(gs.players).filter(p => p.role === 'shipOwner');

    let html = '<div class="offer-form-header">';
    html += 'Уважаемый Сэр! Прошу Вас рассмотреть возможность выполнить следующие перевозки на нижеуказанных условиях.';
    html += '</div>';

    // From
    html += '<div class="offer-section">';
    html += `<div class="offer-section-title">Отправитель</div>`;
    html += `<p style="font-size:13px">${gs.myPlayer.companyName}</p>`;
    html += '</div>';

    // Recipient
    html += '<div class="offer-section">';
    html += '<div class="offer-section-title">Кому</div>';
    html += '<div class="panel-form-group"><select id="offer-recipient">';
    html += '<option value="">Всем судовладельцам</option>';
    shipOwners.forEach(p => {
      html += `<option value="${p.id}">${p.companyName}</option>`;
    });
    html += '</select></div>';
    html += '</div>';

    // Route & Cargo
    html += '<div class="offer-section">';
    html += '<div class="offer-section-title">Маршрут и груз</div>';
    html += '<div class="offer-row">';
    html += '<div class="panel-form-group"><label>Порт отправления</label><select id="offer-origin">';
    MD.PORTS.filter(p => p.isMain).forEach(p => {
      html += `<option value="${p.id}">${p.name}</option>`;
    });
    html += '</select></div>';
    html += '<div class="panel-form-group"><label>Порт назначения</label><select id="offer-dest">';
    MD.PORTS.filter(p => p.isMain).forEach(p => {
      html += `<option value="${p.id}">${p.name}</option>`;
    });
    html += '</select></div>';
    html += '</div>';

    html += '<div class="offer-row">';
    html += '<div class="panel-form-group"><label>Род груза</label><select id="offer-cargo">';
    C.CARGO_LIST.forEach(c => {
      html += `<option value="${c.id}">${c.name}</option>`;
    });
    html += '</select></div>';
    html += '<div class="panel-form-group"><label>Количество (т)</label><input type="number" id="offer-tons" value="1000" min="100" step="100"></div>';
    html += '</div>';

    html += '<div class="panel-form-group"><label>Транспортная характеристика груза</label><input type="text" id="offer-cargo-desc" placeholder="Описание груза"></div>';
    html += '</div>';

    // Freight & Offer Type
    html += '<div class="offer-section">';
    html += '<div class="offer-section-title">Фрахт и тип оферты</div>';
    html += '<div class="offer-row">';
    html += '<div class="panel-form-group"><label>Ставка фрахта ($)</label><input type="number" id="offer-rate" value="100000" min="1"></div>';
    html += '<div class="panel-form-group"><label>Вид оферты</label><select id="offer-type">';
    html += '<option value="firm">Твёрдая (Firm)</option>';
    html += '<option value="free">Свободная (Free)</option>';
    html += '</select></div>';
    html += '</div>';
    html += '<div class="panel-form-group"><label>Срок действия оферты (игровая дата)</label><input type="text" id="offer-valid" placeholder="дд.мм.гггг"></div>';
    html += '</div>';

    // Laydays / Cancelling
    html += '<div class="offer-section">';
    html += '<div class="offer-section-title">Сроки отгрузки</div>';
    html += '<div class="offer-row">';
    html += '<div class="panel-form-group"><label>Laydays (начало погрузки)</label><input type="text" id="offer-laydays" placeholder="дд.мм.гггг"></div>';
    html += '<div class="panel-form-group"><label>Cancelling (крайняя дата)</label><input type="text" id="offer-cancelling" placeholder="дд.мм.гггг"></div>';
    html += '</div>';
    html += '</div>';

    // Demurrage / Dispatch
    html += '<div class="offer-section">';
    html += '<div class="offer-section-title">Демередж / Диспач</div>';
    html += '<div class="offer-row">';
    html += '<div class="panel-form-group"><label>Демередж погрузка ($/сут)</label><input type="number" id="offer-dem-load" value="5000" min="0"></div>';
    html += '<div class="panel-form-group"><label>Демередж разгрузка ($/сут)</label><input type="number" id="offer-dem-unload" value="5000" min="0"></div>';
    html += '</div>';
    html += '<div class="offer-row">';
    html += '<div class="panel-form-group"><label>Диспач погрузка ($/сут)</label><input type="number" id="offer-disp-load" value="2500" min="0"></div>';
    html += '<div class="panel-form-group"><label>Диспач разгрузка ($/сут)</label><input type="number" id="offer-disp-unload" value="2500" min="0"></div>';
    html += '</div>';
    html += '</div>';

    // Conditions
    html += '<div class="offer-section">';
    html += '<div class="offer-section-title">Условия</div>';
    html += '<div class="panel-form-group"><label>Условия оплаты фрахта</label><select id="offer-payment">';
    C.PAYMENT_TERMS.forEach(t => {
      html += `<option value="${t}">${t}</option>`;
    });
    html += '</select></div>';

    html += '<div class="offer-row">';
    html += '<div class="panel-form-group"><label>Грузовые работы за счёт</label><select id="offer-handling">';
    C.CARGO_HANDLING_OPTIONS.forEach(o => {
      html += `<option value="${o}">${o}</option>`;
    });
    html += '</select></div>';
    html += '<div class="panel-form-group"><label>Проформа чартера</label><select id="offer-proforma">';
    C.CHARTER_PROFORMAS.forEach(p => {
      html += `<option value="${p}">${p}</option>`;
    });
    html += '</select></div>';
    html += '</div>';
    html += '</div>';

    // Buttons
    html += '<div style="display:flex;gap:12px;margin-top:16px">';
    html += '<button class="panel-btn panel-btn-primary" id="btn-send-offer">Отправить</button>';
    html += '<button class="panel-btn" id="btn-view-offers" style="background:#555;color:#fff">Мои оферты</button>';
    html += '</div>';

    container.innerHTML = html;

    // Bind send
    document.getElementById('btn-send-offer').addEventListener('click', () => {
      const data = {
        recipientId: document.getElementById('offer-recipient').value || null,
        originPort: document.getElementById('offer-origin').value,
        destPort: document.getElementById('offer-dest').value,
        cargoType: document.getElementById('offer-cargo').value,
        cargoDescription: document.getElementById('offer-cargo-desc').value,
        tons: parseInt(document.getElementById('offer-tons').value) || 0,
        freightRate: parseInt(document.getElementById('offer-rate').value) || 0,
        offerType: document.getElementById('offer-type').value,
        validUntil: document.getElementById('offer-valid').value || null,
        laydays: document.getElementById('offer-laydays').value || null,
        cancelling: document.getElementById('offer-cancelling').value || null,
        demurrageLoading: parseInt(document.getElementById('offer-dem-load').value) || 0,
        demurrageUnloading: parseInt(document.getElementById('offer-dem-unload').value) || 0,
        dispatchLoading: parseInt(document.getElementById('offer-disp-load').value) || 0,
        dispatchUnloading: parseInt(document.getElementById('offer-disp-unload').value) || 0,
        paymentTerms: document.getElementById('offer-payment').value,
        cargoHandling: document.getElementById('offer-handling').value,
        charterProforma: document.getElementById('offer-proforma').value,
      };

      if (data.originPort === data.destPort) return alert('Порты отправления и назначения совпадают');
      if (data.tons <= 0) return alert('Укажите количество груза');
      if (data.freightRate <= 0) return alert('Укажите ставку фрахта');

      socket.emit('offer:create', data, (result) => {
        if (result.error) {
          alert(result.error);
        } else {
          alert('Оферта отправлена!');
          renderOfferList(container);
        }
      });
    });

    document.getElementById('btn-view-offers').addEventListener('click', () => {
      renderOfferList(container);
    });
  }

  function renderOfferList(container) {
    const socket = window.gameSocket;
    const gs = window.gameState;
    const isOwner = gs.myPlayer && gs.myPlayer.role === 'shipOwner';

    container.innerHTML = '<p style="color:#888">Загрузка...</p>';

    socket.emit('offer:getList', null, (data) => {
      const offers = data.offers || [];

      let html = '';

      if (gs.myPlayer && gs.myPlayer.role === 'charterer') {
        html += '<div style="margin-bottom:12px"><button class="panel-btn panel-btn-primary" id="btn-new-offer">Создать оферту</button></div>';
      }

      if (offers.length === 0) {
        html += '<p style="color:#888">Нет оферт</p>';
        container.innerHTML = html;
        bindNewOfferBtn(container);
        return;
      }

      html += '<table class="panel-table"><thead><tr>';
      html += '<th>От</th><th>Маршрут</th><th>Груз</th><th>Тонн</th><th>Фрахт</th><th>Статус</th>';
      if (isOwner) html += '<th>Действие</th>';
      html += '</tr></thead><tbody>';

      offers.forEach(offer => {
        const originPort = MD.PORTS.find(p => p.id === offer.originPort);
        const destPort = MD.PORTS.find(p => p.id === offer.destPort);
        const cargoName = C.CARGO_LIST.find(c => c.id === offer.cargoType)?.name || offer.cargoType;

        const statusLabels = { open: 'Открыта', accepted: 'Принята', in_progress: 'Выполняется', completed: 'Выполнена', cancelled: 'Отменена', expired: 'Истекла' };
        const statusColors = { open: '#4caf50', accepted: '#2196f3', completed: '#888', cancelled: '#c0392b', expired: '#888' };

        html += `<tr>`;
        html += `<td>${offer.chartererName}</td>`;
        html += `<td>${originPort ? originPort.name : '?'} → ${destPort ? destPort.name : '?'}</td>`;
        html += `<td>${cargoName}</td>`;
        html += `<td>${offer.tons}</td>`;
        html += `<td>$${offer.freightRate.toLocaleString()}</td>`;
        html += `<td style="color:${statusColors[offer.status] || '#888'}">${statusLabels[offer.status] || offer.status}</td>`;

        if (isOwner && offer.status === 'open') {
          html += `<td><button class="panel-btn panel-btn-success btn-accept-offer" data-offer-id="${offer.id}" style="padding:3px 8px;font-size:11px">Принять</button></td>`;
        } else if (isOwner) {
          html += `<td>—</td>`;
        }

        html += `</tr>`;
      });

      html += '</tbody></table>';
      container.innerHTML = html;

      bindNewOfferBtn(container);

      // Bind accept buttons
      container.querySelectorAll('.btn-accept-offer').forEach(btn => {
        btn.addEventListener('click', () => {
          const offerId = btn.dataset.offerId;
          showShipSelector(container, offerId);
        });
      });
    });
  }

  function showShipSelector(container, offerId) {
    const socket = window.gameSocket;

    socket.emit('ship:getFleet', null, (data) => {
      const ships = (data.ships || []).filter(s => s.status === 'idle' || s.status === 'announced');

      if (ships.length === 0) {
        alert('Нет свободных судов для принятия оферты');
        return;
      }

      let msg = 'Выберите судно:\n';
      ships.forEach((s, i) => {
        const port = MD.PORTS.find(p => p.id === s.currentPort);
        msg += `${i + 1}. ${s.name} (${s.typeName}, ${port ? port.name : '?'})\n`;
      });
      const choice = prompt(msg, '1');
      const idx = parseInt(choice) - 1;
      if (isNaN(idx) || idx < 0 || idx >= ships.length) return;

      socket.emit('offer:accept', { offerId, shipId: ships[idx].id }, (result) => {
        if (result.error) {
          alert(result.error);
        } else {
          alert('Оферта принята! Договор создан.');
          renderOfferList(container);
        }
      });
    });
  }

  function bindNewOfferBtn(container) {
    const btn = document.getElementById('btn-new-offer');
    if (btn) {
      btn.addEventListener('click', () => renderCreateForm(container));
    }
  }

  function render(container) {
    const gs = window.gameState;
    if (gs.myPlayer && gs.myPlayer.role === 'charterer') {
      renderCreateForm(container);
    } else {
      renderOfferList(container);
    }
  }

  window.OfferPanel = { render };
})();
