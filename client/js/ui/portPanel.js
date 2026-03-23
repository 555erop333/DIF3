// client/js/ui/portPanel.js — Порт: информация, суда, погрузка/разгрузка
(function () {
  'use strict';

  const C = window.SharedConstants;
  const MD = window.MapData;

  function render(container) {
    const socket = window.gameSocket;
    const gs = window.gameState;

    // Get selected port from map or default
    let selectedPort = null;
    if (window.MapRenderer && window.MapRenderer.getSelectedPort) {
      selectedPort = window.MapRenderer.getSelectedPort();
    }

    let html = '';

    // Port selector
    html += '<div class="panel-form-group"><label>Выберите порт</label><select id="port-select">';
    html += '<option value="">— Выберите порт —</option>';
    MD.PORTS.filter(p => p.isMain).forEach(p => {
      html += `<option value="${p.id}" ${selectedPort === p.id ? 'selected' : ''}>${p.name}</option>`;
    });
    html += '</select></div>';

    html += '<div id="port-details"></div>';

    container.innerHTML = html;

    const portSelect = document.getElementById('port-select');
    if (selectedPort) {
      loadPortDetails(selectedPort, container);
    }

    portSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        loadPortDetails(e.target.value, container);
      } else {
        document.getElementById('port-details').innerHTML = '';
      }
    });
  }

  function loadPortDetails(portId, container) {
    const socket = window.gameSocket;
    const gs = window.gameState;
    const port = MD.PORTS.find(p => p.id === portId);
    if (!port) return;

    const detailsDiv = document.getElementById('port-details');

    // Get ships in port
    socket.emit('ship:inPort', { portId }, (shipData) => {
      // Get warehouse
      socket.emit('exchange:getWarehouse', { portId }, (whData) => {
        const ships = shipData.ships || [];
        const warehouse = whData.warehouse || {};

        let html = '';
        html += `<h3 style="color:#5aa8d0;margin:12px 0 8px">${port.name}</h3>`;

        // Ships in port
        html += '<div style="margin-bottom:16px">';
        html += '<div style="font-weight:bold;color:#5aa8d0;margin-bottom:6px;font-size:13px">Суда в порту</div>';

        if (ships.length === 0) {
          html += '<p style="color:#888;font-size:13px">Нет судов</p>';
        } else {
          html += '<table class="panel-table"><thead><tr>';
          html += '<th>Судно</th><th>Владелец</th><th>Статус</th><th>Груз</th>';
          html += '</tr></thead><tbody>';

          ships.forEach(ship => {
            const owner = gs.players[ship.ownerId];
            const statusLabels = { idle: 'Свободно', loading: 'Погрузка', unloading: 'Разгрузка', announced: 'Анонсировано' };
            const cargoStr = ship.cargo && ship.cargo.length > 0
              ? ship.cargo.map(c => `${c.tons}т ${c.type}`).join(', ')
              : '—';

            html += `<tr>`;
            html += `<td>${ship.name} (${ship.typeName})</td>`;
            html += `<td>${owner ? owner.companyName : '?'}</td>`;
            html += `<td>${statusLabels[ship.status] || ship.status}</td>`;
            html += `<td>${cargoStr}</td>`;
            html += `</tr>`;
          });

          html += '</tbody></table>';
        }
        html += '</div>';

        // Warehouse (charterer only)
        if (gs.myPlayer && gs.myPlayer.role === 'charterer') {
          html += '<div style="margin-bottom:16px">';
          html += '<div style="font-weight:bold;color:#5aa8d0;margin-bottom:6px;font-size:13px">Ваш склад в порту</div>';

          const cargoKeys = Object.keys(warehouse);
          if (cargoKeys.length === 0) {
            html += '<p style="color:#888;font-size:13px">Склад пуст</p>';
          } else {
            cargoKeys.forEach(cargoId => {
              const cargo = C.CARGO_LIST.find(c => c.id === cargoId);
              html += `<div style="font-size:13px;margin-bottom:4px">${cargo ? cargo.name : cargoId}: <b>${warehouse[cargoId]}т</b></div>`;
            });
          }
          html += '</div>';

          // Loading/unloading controls — only for idle ships
          const idleShips = ships.filter(s => s.status === 'idle' || s.status === 'announced');

          if (idleShips.length > 0 && (cargoKeys.length > 0 || idleShips.some(s => s.cargo && s.cargo.length > 0))) {
            html += '<div style="padding:12px;background:#1e2130;border-radius:6px;margin-bottom:16px">';
            html += '<div style="font-weight:bold;color:#5aa8d0;margin-bottom:8px;font-size:13px">Грузовые операции</div>';

            html += '<div class="offer-row">';
            html += '<div class="panel-form-group"><label>Судно</label><select id="cargo-ship">';
            idleShips.forEach(s => {
              html += `<option value="${s.id}">${s.name}</option>`;
            });
            html += '</select></div>';
            html += '<div class="panel-form-group"><label>Груз</label><select id="cargo-type">';
            C.CARGO_LIST.forEach(c => {
              html += `<option value="${c.id}">${c.name}</option>`;
            });
            html += '</select></div>';
            html += '</div>';

            html += '<div class="offer-row">';
            html += '<div class="panel-form-group"><label>Тонн</label><input type="number" id="cargo-tons" value="500" min="100" step="100"></div>';
            html += '<div class="panel-form-group" style="display:flex;gap:8px;align-items:flex-end">';
            html += '<button class="panel-btn panel-btn-success" id="btn-load" style="padding:6px 12px">Погрузить</button>';
            html += '<button class="panel-btn panel-btn-danger" id="btn-unload" style="padding:6px 12px">Выгрузить</button>';
            html += '</div>';
            html += '</div>';
            html += '</div>';
          }
        }

        detailsDiv.innerHTML = html;

        // Bind load/unload
        const btnLoad = document.getElementById('btn-load');
        const btnUnload = document.getElementById('btn-unload');

        if (btnLoad) {
          btnLoad.addEventListener('click', () => {
            const shipId = document.getElementById('cargo-ship').value;
            const cargoTypeId = document.getElementById('cargo-type').value;
            const tons = parseInt(document.getElementById('cargo-tons').value) || 0;
            if (tons <= 0) return;

            socket.emit('cargo:load', { shipId, cargoTypeId, tons }, (result) => {
              if (result.error) {
                alert(result.error);
              } else {
                alert(`Погрузка началась! Время: ${result.processingDays.toFixed(2)} сут. Стоимость порт. услуг: $${result.portCost}`);
                loadPortDetails(portId, container);
              }
            });
          });
        }

        if (btnUnload) {
          btnUnload.addEventListener('click', () => {
            const shipId = document.getElementById('cargo-ship').value;
            const cargoTypeId = document.getElementById('cargo-type').value;
            const tons = parseInt(document.getElementById('cargo-tons').value) || 0;
            if (tons <= 0) return;

            socket.emit('cargo:unload', { shipId, cargoTypeId, tons }, (result) => {
              if (result.error) {
                alert(result.error);
              } else {
                alert(`Разгрузка началась! Время: ${result.processingDays.toFixed(2)} сут. Стоимость порт. услуг: $${result.portCost}`);
                loadPortDetails(portId, container);
              }
            });
          });
        }
      });
    });
  }

  window.PortPanel = { render };
})();
