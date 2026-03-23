// client/js/ui/mailPanel.js — Почта
(function () {
  'use strict';

  function render(container) {
    const socket = window.gameSocket;
    const gs = window.gameState;

    container.innerHTML = '<p style="color:#888">Загрузка...</p>';

    socket.emit('mail:getInbox', null, (data) => {
      const messages = data.messages || [];

      let html = '';
      html += '<div style="margin-bottom:12px;display:flex;gap:8px">';
      html += '<button class="panel-btn panel-btn-primary" id="btn-compose-mail">Написать</button>';
      html += '<button class="panel-btn" id="btn-refresh-mail" style="background:#555;color:#fff">Обновить</button>';
      html += '</div>';

      if (messages.length === 0) {
        html += '<p style="color:#888">Входящие пусто</p>';
      } else {
        // Show newest first
        const sorted = [...messages].reverse();

        sorted.forEach(msg => {
          const isUnread = !msg.read;
          const bgColor = isUnread ? '#1e2840' : '#16213e';
          const fontWeight = isUnread ? 'bold' : 'normal';

          html += `<div class="mail-item" data-mail-id="${msg.id}" style="padding:10px;margin-bottom:6px;background:${bgColor};border-radius:6px;cursor:pointer;border:1px solid #262a34">`;
          html += `<div style="display:flex;justify-content:space-between;font-size:12px;color:#888;margin-bottom:4px">`;
          html += `<span>От: ${msg.fromName}</span>`;
          html += `<span>${new Date(msg.timestamp).toLocaleString('ru-RU')}</span>`;
          html += `</div>`;
          html += `<div style="font-weight:${fontWeight};font-size:13px">${msg.subject}</div>`;
          html += `</div>`;
        });
      }

      container.innerHTML = html;

      // Bind mail items
      container.querySelectorAll('.mail-item').forEach(item => {
        item.addEventListener('click', () => {
          const mailId = item.dataset.mailId;
          const msg = messages.find(m => m.id === mailId);
          if (!msg) return;

          socket.emit('mail:markRead', { mailId });

          showMessage(container, msg);
        });
      });

      // Compose
      document.getElementById('btn-compose-mail').addEventListener('click', () => {
        showCompose(container);
      });

      document.getElementById('btn-refresh-mail').addEventListener('click', () => {
        render(container);
      });
    });
  }

  function showMessage(container, msg) {
    let html = '<div style="margin-bottom:12px"><button class="panel-btn" id="btn-back-inbox" style="background:#555;color:#fff">← Назад</button></div>';

    html += `<div style="padding:12px;background:#1e2130;border-radius:6px">`;
    html += `<div style="display:flex;justify-content:space-between;margin-bottom:8px">`;
    html += `<b style="color:#5aa8d0">${msg.subject}</b>`;
    html += `<span style="font-size:12px;color:#888">${new Date(msg.timestamp).toLocaleString('ru-RU')}</span>`;
    html += `</div>`;
    html += `<div style="font-size:12px;color:#888;margin-bottom:8px">От: ${msg.fromName}</div>`;
    html += `<div style="font-size:13px;white-space:pre-wrap">${msg.body || '(пустое сообщение)'}</div>`;
    html += `</div>`;

    container.innerHTML = html;

    document.getElementById('btn-back-inbox').addEventListener('click', () => {
      render(container);
    });
  }

  function showCompose(container) {
    const gs = window.gameState;
    const socket = window.gameSocket;

    const otherPlayers = Object.values(gs.players).filter(p => p.id !== gs.myId);

    let html = '<div style="margin-bottom:12px"><button class="panel-btn" id="btn-back-inbox2" style="background:#555;color:#fff">← Назад</button></div>';

    html += '<div class="panel-form-group"><label>Кому</label><select id="mail-to">';
    otherPlayers.forEach(p => {
      html += `<option value="${p.id}">${p.companyName} (${p.role === 'charterer' ? 'Фрахтователь' : 'Судовладелец'})</option>`;
    });
    html += '</select></div>';

    html += '<div class="panel-form-group"><label>Тема</label><input type="text" id="mail-subject" placeholder="Тема сообщения"></div>';
    html += '<div class="panel-form-group"><label>Текст</label><textarea id="mail-body" placeholder="Текст сообщения"></textarea></div>';
    html += '<button class="panel-btn panel-btn-primary" id="btn-send-mail">Отправить</button>';

    container.innerHTML = html;

    document.getElementById('btn-back-inbox2').addEventListener('click', () => {
      render(container);
    });

    document.getElementById('btn-send-mail').addEventListener('click', () => {
      const to = document.getElementById('mail-to').value;
      const subject = document.getElementById('mail-subject').value;
      const body = document.getElementById('mail-body').value;

      if (!subject) return alert('Укажите тему');

      socket.emit('mail:send', { to, subject, body }, (result) => {
        if (result.error) {
          alert(result.error);
        } else {
          alert('Сообщение отправлено!');
          render(container);
        }
      });
    });
  }

  window.MailPanel = { render };
})();
