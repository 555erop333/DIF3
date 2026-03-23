// app.js — Client entry point
(function () {
  'use strict';

  const socket = io();
  const C = window.SharedConstants;

  // ==================== STATE ====================
  let gameState = {
    myId: null,
    myPlayer: null,
    players: {},
    config: {},
    isHost: false,
    gameTime: null,
    ships: {},
    paused: false,
    infiniteSupply: true,
  };

  // ==================== TOP BAR ====================
  function updateTopBar() {
    if (gameState.myPlayer) {
      document.getElementById('company-name').textContent = gameState.myPlayer.companyName;
      const roleEl = document.getElementById('company-role');
      if (gameState.myPlayer.role === 'charterer') {
        roleEl.textContent = 'Фрахтователь';
        roleEl.className = 'role-badge charterer';
      } else {
        roleEl.textContent = 'Судовладелец';
        roleEl.className = 'role-badge shipowner';
      }
      document.getElementById('balance-value').textContent =
        (gameState.myPlayer.balance || 0).toLocaleString('ru-RU');
    }

    if (gameState.isHost) {
      document.getElementById('host-controls').classList.remove('hidden');
    }
  }

  function updateGameTime(isoTime) {
    if (!isoTime) return;
    const d = new Date(isoTime);
    const date = d.toLocaleDateString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
    const time = d.toLocaleTimeString('ru-RU', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    document.getElementById('game-date').textContent = date;
    document.getElementById('game-clock').textContent = time;
    gameState.gameTime = d;
  }

  // ==================== PANEL SYSTEM (2-slot split) ====================
  const PANEL_NAMES = {
    reports: 'Отчёты / НСИ',
    account: 'Счёт',
    mail: 'Почта',
    port: 'Порт',
    offer: 'Оферта',
    contracts: 'Договоры',
    fleet: 'Суда / Дислокация',
    exchange: 'Биржа',
    log: 'Журнал',
  };

  const PANEL_RENDERERS = {
    fleet: window.FleetPanel,
    exchange: window.ExchangePanel,
    offer: window.OfferPanel,
    contracts: window.ContractPanel,
    mail: window.MailPanel,
    account: window.AccountPanel,
    port: window.PortPanel,
    reports: window.ReportsPanel,
    log: window.LogPanel,
  };

  const panelArea = document.getElementById('panel-area');
  const slotEls = [
    document.getElementById('slot-0'),
    document.getElementById('slot-1'),
  ];
  const divider = document.getElementById('slot-divider');

  // slots[i] = panel name or null
  const slots = [null, null];
  let focusedSlot = 0;

  function getSlotContent(idx) {
    return slotEls[idx].querySelector('.slot-content');
  }
  function getSlotTitle(idx) {
    return slotEls[idx].querySelector('.slot-title');
  }

  function updatePanelArea() {
    const count = slots.filter(s => s !== null).length;

    if (count === 0) {
      panelArea.classList.add('hidden');
      panelDivider.classList.add('hidden');
      divider.classList.add('hidden');
      // Trigger map resize
      if (window.MapRenderer && window.MapRenderer.resize) {
        setTimeout(() => window.MapRenderer.resize(), 0);
      }
      return;
    }

    panelArea.classList.remove('hidden');
    panelDivider.classList.remove('hidden');

    for (let i = 0; i < 2; i++) {
      const el = slotEls[i];
      // Reset manual resize heights
      el.style.flex = '';
      el.style.height = '';
      if (slots[i]) {
        el.classList.remove('empty', 'collapsed');
        getSlotTitle(i).textContent = PANEL_NAMES[slots[i]] || slots[i];
      } else if (count === 1) {
        // Hide empty slot when only 1 panel is open
        el.classList.add('collapsed');
        el.classList.remove('empty');
      } else {
        el.classList.add('empty');
        el.classList.remove('collapsed');
      }
      el.classList.toggle('focused', i === focusedSlot && count > 1);
    }

    divider.classList.toggle('hidden', count < 2);

    // Update sidebar active states
    const sidebarBtns = document.querySelectorAll('.sidebar-btn[data-panel]');
    sidebarBtns.forEach(b => {
      b.classList.toggle('active', slots.includes(b.dataset.panel));
    });

    // Trigger map resize
    if (window.MapRenderer && window.MapRenderer.resize) {
      setTimeout(() => window.MapRenderer.resize(), 0);
    }
  }

  function renderSlot(idx) {
    const name = slots[idx];
    const content = getSlotContent(idx);
    if (!name) { content.innerHTML = ''; return; }

    const renderer = PANEL_RENDERERS[name];
    if (renderer && renderer.render) {
      content.innerHTML = '';
      renderer.render(content);
    } else {
      content.innerHTML = `<p style="color:#888">Панель "${PANEL_NAMES[name]}" будет реализована в следующих фазах.</p>`;
    }
  }

  function openPanel(name, targetSlot) {
    // If already open in a slot, close it (toggle)
    const existingIdx = slots.indexOf(name);
    if (existingIdx !== -1 && targetSlot === undefined) {
      closeSlot(existingIdx);
      return;
    }

    // Remove from existing slot if moving
    if (existingIdx !== -1) {
      slots[existingIdx] = null;
      getSlotContent(existingIdx).innerHTML = '';
    }

    let idx;
    if (targetSlot !== undefined) {
      idx = targetSlot;
    } else if (slots[0] === null) {
      idx = 0;
    } else if (slots[1] === null) {
      idx = 1;
    } else {
      idx = focusedSlot;
    }

    slots[idx] = name;
    focusedSlot = idx;
    updatePanelArea();
    renderSlot(idx);
  }

  function closeSlot(idx) {
    slots[idx] = null;
    getSlotContent(idx).innerHTML = '';

    // If closing focused slot, focus the other
    if (focusedSlot === idx) {
      focusedSlot = 1 - idx;
    }

    updatePanelArea();
  }

  function closeAllPanels() {
    slots[0] = null;
    slots[1] = null;
    getSlotContent(0).innerHTML = '';
    getSlotContent(1).innerHTML = '';
    updatePanelArea();
  }

  // Slot header click — focus slot
  slotEls.forEach((el, idx) => {
    el.querySelector('.slot-header').addEventListener('click', () => {
      focusedSlot = idx;
      updatePanelArea();
    });

    el.querySelector('.slot-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeSlot(idx);
    });

    el.querySelector('.slot-popout').addEventListener('click', (e) => {
      e.stopPropagation();
      const name = slots[idx];
      if (name) {
        const cid = gameState.myPlayer ? gameState.myPlayer.companyId : '';
        window.open(`/panel/${name}?cid=${cid}`, name, 'width=700,height=550,resizable=yes');
      }
    });

    // Drop target
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const panel = e.dataTransfer.getData('text/panel');
      if (panel && PANEL_NAMES[panel]) {
        openPanel(panel, idx);
      }
    });
  });

  // ==================== SIDEBAR ====================
  const sidebarBtns = document.querySelectorAll('.sidebar-btn[data-panel]');

  sidebarBtns.forEach(btn => {
    // Click — open panel
    btn.addEventListener('click', () => {
      openPanel(btn.dataset.panel);
    });

    // Double-click opens panel in popup window
    btn.addEventListener('dblclick', (e) => {
      e.preventDefault();
      const panel = btn.dataset.panel;
      if (panel) {
        const cid = gameState.myPlayer ? gameState.myPlayer.companyId : '';
        window.open(`/panel/${panel}?cid=${cid}`, panel, 'width=700,height=550,resizable=yes');
      }
    });

    // Drag support
    btn.setAttribute('draggable', 'true');
    btn.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/panel', btn.dataset.panel);
      e.dataTransfer.effectAllowed = 'move';
      btn.classList.add('dragging');
      // Show panel area with empty slots as drop targets
      if (slots[0] === null && slots[1] === null) {
        panelArea.classList.remove('hidden');
        slotEls[0].classList.remove('collapsed');
        slotEls[0].classList.add('empty');
        slotEls[1].classList.remove('collapsed');
        slotEls[1].classList.add('empty');
        divider.classList.remove('hidden');
      } else if (slots[0] === null || slots[1] === null) {
        // Show the empty slot
        for (let i = 0; i < 2; i++) {
          if (slots[i] === null) {
            slotEls[i].classList.remove('collapsed');
            slotEls[i].classList.add('empty');
          }
        }
        divider.classList.remove('hidden');
      }
    });
    btn.addEventListener('dragend', () => {
      btn.classList.remove('dragging');
      slotEls.forEach(el => el.classList.remove('drag-over'));
      updatePanelArea(); // reset layout
    });
  });

  // Exit button
  document.getElementById('btn-exit').addEventListener('click', () => {
    if (confirm('Выйти из игры?')) {
      window.location.href = '/lobby.html';
    }
  });

  // ==================== DIVIDER DRAG (resize slots) ====================
  let dividerDragging = false;
  let dividerStartY = 0;
  let slot0StartH = 0;
  let slot1StartH = 0;

  divider.addEventListener('pointerdown', (e) => {
    dividerDragging = true;
    dividerStartY = e.clientY;
    slot0StartH = slotEls[0].offsetHeight;
    slot1StartH = slotEls[1].offsetHeight;
    divider.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  divider.addEventListener('pointermove', (e) => {
    if (!dividerDragging) return;
    const dy = e.clientY - dividerStartY;
    const totalH = slot0StartH + slot1StartH;
    const minH = 80;
    const newH0 = Math.max(minH, Math.min(totalH - minH, slot0StartH + dy));
    const newH1 = totalH - newH0;
    slotEls[0].style.flex = 'none';
    slotEls[1].style.flex = 'none';
    slotEls[0].style.height = newH0 + 'px';
    slotEls[1].style.height = newH1 + 'px';
  });

  divider.addEventListener('pointerup', () => {
    dividerDragging = false;
  });

  // ==================== PANEL AREA WIDTH DRAG ====================
  const panelDivider = document.getElementById('panel-area-divider');
  let panelDivDragging = false;
  let panelDivStartX = 0;
  let panelStartW = 0;

  panelDivider.addEventListener('pointerdown', (e) => {
    panelDivDragging = true;
    panelDivStartX = e.clientX;
    panelStartW = panelArea.offsetWidth;
    panelDivider.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  panelDivider.addEventListener('pointermove', (e) => {
    if (!panelDivDragging) return;
    const dx = panelDivStartX - e.clientX;
    const containerW = document.getElementById('main-content').offsetWidth - 140; // minus sidebar
    const minW = 300;
    const maxW = containerW - 120; // keep at least 120px for map
    const newW = Math.max(minW, Math.min(maxW, panelStartW + dx));
    panelArea.style.width = newW + 'px';
    if (window.MapRenderer && window.MapRenderer.resize) window.MapRenderer.resize();
  });

  panelDivider.addEventListener('pointerup', () => {
    panelDivDragging = false;
  });

  // ==================== HOST CONTROLS ====================
  document.getElementById('btn-pause').addEventListener('click', () => {
    socket.emit('game:pause');
    document.getElementById('btn-pause').classList.add('hidden');
    document.getElementById('btn-play').classList.remove('hidden');
  });

  document.getElementById('btn-play').addEventListener('click', () => {
    socket.emit('game:resume');
    document.getElementById('btn-play').classList.add('hidden');
    document.getElementById('btn-pause').classList.remove('hidden');
  });

  document.getElementById('speed-input').addEventListener('change', (e) => {
    const minutes = parseFloat(e.target.value);
    if (minutes > 0) socket.emit('game:setSpeed', minutes / 60);
  });

  // ==================== CONTEXT MENU PREVENTION ====================
  document.addEventListener('contextmenu', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
  });

  // ==================== INFO MODAL ====================
  const infoModal = document.getElementById('info-modal');
  document.getElementById('btn-info-sidebar').addEventListener('click', () => {
    infoModal.classList.remove('hidden');
  });
  document.getElementById('info-close').addEventListener('click', () => {
    infoModal.classList.add('hidden');
  });
  infoModal.addEventListener('click', (e) => {
    if (e.target === infoModal) infoModal.classList.add('hidden');
  });

  // ==================== SOCKET EVENTS ====================
  socket.on('connect', () => {
    console.log('Подключено к серверу');
    socket.emit('game:getState');
  });

  socket.on('game:state', (state) => {
    gameState.myId = state.myId;
    gameState.players = state.players;
    gameState.config = state.config;
    gameState.isHost = state.isHost;
    gameState.ships = state.ships || {};
    gameState.infiniteSupply = !!state.infiniteSupply;

    if (state.myId && state.players[state.myId]) {
      gameState.myPlayer = state.players[state.myId];
      sessionStorage.removeItem('dif3_companyId');
      updateTopBar();
    } else {
      const savedCompanyId = sessionStorage.getItem('dif3_companyId');
      if (savedCompanyId) {
        socket.emit('game:reconnect', { companyId: parseInt(savedCompanyId) }, (res) => {
          if (res && res.error) {
            console.warn('Reconnect failed:', res.error);
          }
        });
      } else {
        console.warn('Нет данных игрока и нет сохранённого companyId');
      }
    }
    if (state.gameTime) updateGameTime(state.gameTime);
    if (state.speed) {
      document.getElementById('speed-input').value = Math.round(state.speed * 60);
    }
  });

  socket.on('exchange:infiniteSupply', (val) => {
    gameState.infiniteSupply = !!val;
  });

  socket.on('game:tick', (data) => {
    if (data.time) updateGameTime(data.time);
    if (data.ships) {
      gameState.ships = data.ships;
      if (window.MapRenderer) window.MapRenderer.updateShips(data.ships);
    }
  });

  socket.on('game:paused', () => {
    gameState.paused = true;
    document.getElementById('btn-pause').classList.add('hidden');
    document.getElementById('btn-play').classList.remove('hidden');
  });
  socket.on('game:resumed', () => {
    gameState.paused = false;
    document.getElementById('btn-play').classList.add('hidden');
    document.getElementById('btn-pause').classList.remove('hidden');
  });
  socket.on('game:speedChanged', (speed) => {
    document.getElementById('speed-input').value = Math.round(speed * 60);
  });

  socket.on('editor:toggle', (data) => {
    if (window.MapRenderer) {
      window.MapRenderer.toggleEditor(data.enabled);
    }
  });

  socket.on('player:balanceUpdate', (data) => {
    if (gameState.myPlayer) {
      gameState.myPlayer.balance = data.balance;
      document.getElementById('balance-value').textContent =
        data.balance.toLocaleString('ru-RU');
    }
  });

  // Обновление списка игроков (новый игрок, переподключение)
  socket.on('game:playersUpdate', (data) => {
    gameState.players = data.players;
    if (data.ships) gameState.ships = data.ships;
    if (gameState.myId && data.players[gameState.myId]) {
      gameState.myPlayer = data.players[gameState.myId];
      updateTopBar();
    }
    // Перерендерить открытые панели
    for (let i = 0; i < 2; i++) {
      if (slots[i]) renderSlot(i);
    }
  });

  socket.on('mail:new', () => { updateMailBadge(); });

  // News ticker
  socket.on('news:new', (data) => {
    if (window.NewsTicker) {
      window.NewsTicker.addNews(data);
    }
  });

  // Refresh panels on events
  function refreshPanelIfOpen(panelName) {
    for (let i = 0; i < 2; i++) {
      if (slots[i] === panelName) {
        renderSlot(i);
      }
    }
  }

  socket.on('ship:arrived', () => {
    refreshPanelIfOpen('fleet');
  });

  socket.on('ship:operationComplete', () => {
    refreshPanelIfOpen('port');
    refreshPanelIfOpen('fleet');
  });

  function updateMailBadge() {
    socket.emit('mail:getUnread', null, (data) => {
      const badge = document.getElementById('mail-badge');
      if (data.count > 0) {
        badge.textContent = data.count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    });
  }

  setInterval(updateMailBadge, 5000);

  // Make socket and state available globally for panels
  window.gameSocket = socket;
  window.gameState = gameState;
  window.openPanel = openPanel;
  window.closePanel = closeAllPanels;
})();
