// client/js/ui/contractPanel.js — История договоров
(function () {
  'use strict';

  const MD = window.MapData;
  const C = window.SharedConstants;

  const STATUS_LABELS = {
    in_progress: 'В процессе',
    completed: 'Выполнен',
    overdue: 'Просрочен',
    cancelled: 'Отменён',
  };
  const STATUS_COLORS = {
    in_progress: '#2196f3',
    completed: '#4caf50',
    overdue: '#ff9800',
    cancelled: '#c0392b',
  };

  function render(container) {
    const socket = window.gameSocket;

    container.innerHTML = '<p style="color:#888">Загрузка...</p>';

    socket.emit('contracts:getList', null, (data) => {
      const contracts = data.contracts || [];

      if (contracts.length === 0) {
        container.innerHTML = '<p style="color:#888">Нет договоров</p>';
        return;
      }

      let html = '<table class="panel-table"><thead><tr>';
      html += '<th>Договор</th><th>Маршрут</th><th>Груз</th><th>Судно</th><th>Статус</th><th>Фрахт</th>';
      html += '</tr></thead><tbody>';

      contracts.forEach(c => {
        const originPort = MD.PORTS.find(p => p.id === c.originPort);
        const destPort = MD.PORTS.find(p => p.id === c.destPort);
        const cargoName = C.CARGO_LIST.find(cr => cr.id === c.cargoType)?.name || c.cargoType;
        const statusColor = STATUS_COLORS[c.status] || '#888';
        const statusLabel = STATUS_LABELS[c.status] || c.status;

        html += `<tr>`;
        html += `<td style="font-size:11px">${c.id.substring(0, 16)}...</td>`;
        html += `<td>${originPort ? originPort.name : '?'} → ${destPort ? destPort.name : '?'}</td>`;
        html += `<td>${c.tons}т ${cargoName}</td>`;
        html += `<td>${c.shipName || '—'}</td>`;
        html += `<td style="color:${statusColor}">${statusLabel}</td>`;
        html += `<td>$${(c.freightRate || 0).toLocaleString()}</td>`;
        html += `</tr>`;

        // Detail row
        html += `<tr><td colspan="6" style="font-size:11px;color:#888;padding:4px 10px 10px">`;
        html += `Фрахтователь: ${c.chartererName} | Судовладелец: ${c.shipOwnerName || '—'}`;
        if (c.demurrageCharged > 0) html += ` | Демередж: $${c.demurrageCharged}`;
        if (c.dispatchEarned > 0) html += ` | Диспач: $${c.dispatchEarned}`;
        html += `</td></tr>`;
      });

      html += '</tbody></table>';
      container.innerHTML = html;
    });
  }

  window.ContractPanel = { render };
})();
