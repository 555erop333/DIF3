// client/js/ui/accountPanel.js — Счёт: история операций + переводы
(function () {
  'use strict';

  function render(container) {
    const socket = window.gameSocket;
    const gs = window.gameState;

    container.innerHTML = '<p style="color:#888">Загрузка...</p>';

    socket.emit('account:getTransactions', null, (txData) => {
      socket.emit('account:getCounterparties', null, (cpData) => {
        const transactions = txData.transactions || [];
        const counterparties = cpData.counterparties || [];
        const balance = gs.myPlayer ? gs.myPlayer.balance : 0;

        let html = '';

        // Balance
        html += `<div style="padding:12px;background:#1e2130;border-radius:6px;margin-bottom:16px;text-align:center">`;
        html += `<div style="font-size:12px;color:#888">Текущий баланс</div>`;
        html += `<div style="font-size:24px;font-weight:bold;color:#4caf50">$${balance.toLocaleString('ru-RU')}</div>`;
        html += `</div>`;

        // Transfer section
        html += '<div style="padding:12px;background:#1e2130;border-radius:6px;margin-bottom:16px">';
        html += '<div style="font-weight:bold;color:#5aa8d0;margin-bottom:8px">Свободный перевод</div>';
        html += '<div class="panel-form-group"><label>Контрагент</label><select id="transfer-to">';
        counterparties.forEach(cp => {
          const roleLabel = cp.role === 'charterer' ? 'Фрахт.' : 'Судовл.';
          html += `<option value="${cp.id}">${cp.companyName} (${roleLabel})</option>`;
        });
        html += '</select></div>';
        html += '<div class="offer-row">';
        html += '<div class="panel-form-group"><label>Сумма ($)</label><input type="number" id="transfer-amount" min="100" step="100" value="10000"></div>';
        html += '<div class="panel-form-group"><label>Описание</label><input type="text" id="transfer-desc" placeholder="Назначение платежа"></div>';
        html += '</div>';
        html += '<button class="panel-btn panel-btn-primary" id="btn-transfer">Осуществить перевод</button>';
        html += '</div>';

        // Transaction history
        html += '<div style="font-weight:bold;color:#5aa8d0;margin-bottom:8px">История операций</div>';

        if (transactions.length === 0) {
          html += '<p style="color:#888">Нет операций</p>';
        } else {
          html += '<table class="panel-table"><thead><tr>';
          html += '<th>Дата</th><th>Описание</th><th>Сумма</th><th>Баланс</th>';
          html += '</tr></thead><tbody>';

          // Show newest first
          [...transactions].reverse().forEach(tx => {
            const isIncome = tx.type === 'income';
            const color = isIncome ? '#4caf50' : '#ff4444';
            const sign = isIncome ? '+' : '-';

            html += `<tr>`;
            html += `<td style="font-size:11px;white-space:nowrap">${new Date(tx.timestamp).toLocaleString('ru-RU')}</td>`;
            html += `<td style="font-size:12px">${tx.description}</td>`;
            html += `<td style="color:${color};font-weight:bold">${sign}$${tx.amount.toLocaleString()}</td>`;
            html += `<td>$${tx.balanceAfter.toLocaleString()}</td>`;
            html += `</tr>`;
          });

          html += '</tbody></table>';
        }

        container.innerHTML = html;

        // Bind transfer
        document.getElementById('btn-transfer').addEventListener('click', () => {
          const toId = document.getElementById('transfer-to').value;
          const amount = parseInt(document.getElementById('transfer-amount').value) || 0;
          const description = document.getElementById('transfer-desc').value;

          if (amount <= 0) return alert('Укажите сумму');

          socket.emit('account:transfer', { toId, amount, description }, (result) => {
            if (result.error) {
              alert(result.error);
            } else {
              alert('Перевод выполнен!');
              render(container);
            }
          });
        });
      });
    });
  }

  window.AccountPanel = { render };
})();
