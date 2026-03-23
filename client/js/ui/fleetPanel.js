// client/js/ui/fleetPanel.js — Суда / Дислокация
(function () {
  'use strict';

  const C = window.SharedConstants;
  const MD = window.MapData;

  const STATUS_LABELS = {
    idle: 'В ожидании',
    en_route: 'В пути',
    loading: 'Погрузка',
    unloading: 'Разгрузка',
    announced: 'Анонсировано',
  };

  function render(container) {
    const socket = window.gameSocket;
    const gs = window.gameState;

    container.innerHTML = '<p style="color:#888">Загрузка...</p>';

    socket.emit('ship:getFleet', null, (data) => {
      const ships = data.ships || [];
      if (ships.length === 0) {
        container.innerHTML = '<p style="color:#888">Нет судов</p>';
        return;
      }

      const isOwner = gs.myPlayer && gs.myPlayer.role === 'shipOwner';

      let html = '';

      if (isOwner) {
        html += '<div style="margin-bottom:12px"><button class="panel-btn panel-btn-primary" id="btn-announce-all">Анонсировать свободные суда</button></div>';
      }

      html += '<table class="panel-table"><thead><tr>';
      html += '<th>Судно</th><th>Тип</th><th>Статус</th><th>Местоположение</th><th>Груз</th>';
      if (isOwner) html += '<th>Действие</th>';
      html += '</tr></thead><tbody>';

      ships.forEach(ship => {
        const statusClass = 'status-' + ship.status.replace('_', '-');
        const statusText = STATUS_LABELS[ship.status] || ship.status;

        let location = '';
        if (ship.currentPort) {
          const port = MD.PORTS.find(p => p.id === ship.currentPort);
          location = port ? port.name : ship.currentPort;
        } else if (ship.toPort) {
          const from = MD.PORTS.find(p => p.id === ship.fromPort);
          const to = MD.PORTS.find(p => p.id === ship.toPort);
          location = `${from ? from.name : '?'} → ${to ? to.name : '?'}`;
        }

        const cargoStr = ship.cargo && ship.cargo.length > 0
          ? ship.cargo.map(c => `${c.tons}т ${c.type}`).join(', ')
          : '—';

        html += `<tr>`;
        html += `<td><b>${ship.name}</b></td>`;
        html += `<td>${ship.typeName}</td>`;
        html += `<td class="${statusClass}">${statusText}</td>`;
        html += `<td>${location}</td>`;
        html += `<td>${cargoStr}</td>`;

        if (isOwner) {
          if (ship.status === 'idle' || ship.status === 'announced') {
            html += `<td><select class="ship-assign-select" data-ship-id="${ship.id}" style="width:120px;padding:4px;background:#0e1018;color:#c8cdd6;border:1px solid #262a34;border-radius:4px;font-size:12px">`;
            html += `<option value="">Назначить...</option>`;
            MD.PORTS.forEach(port => {
              if (port.id !== ship.currentPort && port.isMain) {
                html += `<option value="${port.id}">${port.name}</option>`;
              }
            });
            html += `</select></td>`;
          } else {
            html += `<td>—</td>`;
          }
        }

        html += `</tr>`;
      });

      html += '</tbody></table>';
      container.innerHTML = html;

      // Bind events
      container.querySelectorAll('.ship-assign-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
          const shipId = e.target.dataset.shipId;
          const destPort = e.target.value;
          if (!destPort) return;

          socket.emit('ship:assign', { shipId, destinationPortId: destPort }, (result) => {
            if (result.error) {
              alert(result.error);
            } else {
              render(container);
            }
          });
        });
      });

      const announceBtn = document.getElementById('btn-announce-all');
      if (announceBtn) {
        announceBtn.addEventListener('click', () => {
          socket.emit('ship:announce', null, (result) => {
            if (result.error) {
              alert(result.error);
            } else {
              alert(`Анонсировано судов: ${result.count}`);
              render(container);
            }
          });
        });
      }
    });
  }

  window.FleetPanel = { render };
})();
