// client/js/ui/reportsPanel.js — Отчёты / НСИ
(function () {
  'use strict';

  const C = window.SharedConstants;
  const MD = window.MapData;

  function render(container) {
    let html = '';
    html += '<div style="margin-bottom:12px;display:flex;gap:6px;flex-wrap:wrap">';
    html += '<button class="panel-btn panel-btn-primary report-tab" data-tab="ships">Суда</button>';
    html += '<button class="panel-btn report-tab" data-tab="loading" style="background:#555;color:#fff">Нормы загрузки</button>';
    html += '<button class="panel-btn report-tab" data-tab="travel" style="background:#555;color:#fff">Нормы хода</button>';
    html += '</div>';
    html += '<div id="report-content"></div>';

    container.innerHTML = html;

    container.querySelectorAll('.report-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        showTab(tab);
      });
    });

    showTab('ships');
  }

  function showTab(tab) {
    const contentDiv = document.getElementById('report-content');
    if (!contentDiv) return;

    if (tab === 'ships') {
      showShipSpecs(contentDiv);
    } else if (tab === 'loading') {
      showLoadingNorms(contentDiv);
    } else if (tab === 'travel') {
      showTravelTimes(contentDiv);
    }
  }

  function showShipSpecs(div) {
    let html = '<table class="panel-table"><thead><tr>';
    html += '<th>Судно</th><th>Проект</th><th>Грузоподъёмность (т)</th><th>Вал. вместимость</th><th>Расход в ходу (т/сут)</th><th>Расход на стоянке (т/сут)</th>';
    html += '</tr></thead><tbody>';

    C.SHIP_LIST.forEach(ship => {
      html += `<tr>`;
      html += `<td>${ship.name}</td>`;
      html += `<td>${ship.project}</td>`;
      html += `<td>${ship.capacityTons}</td>`;
      html += `<td>${ship.grossTonnage}</td>`;
      html += `<td>${ship.fuelUnderway}</td>`;
      html += `<td>${ship.fuelAtBerth}</td>`;
      html += `</tr>`;
    });

    html += '</tbody></table>';
    div.innerHTML = html;
  }

  function showLoadingNorms(div) {
    let html = '<table class="panel-table"><thead><tr>';
    html += '<th>Судно (проект)</th><th>Общая</th>';
    C.CARGO_LIST.forEach(c => {
      html += `<th>${c.name}</th>`;
    });
    html += '</tr></thead><tbody>';

    C.SHIP_LIST.forEach(ship => {
      const norms = C.LOADING_NORMS[ship.project];
      if (!norms) return;

      html += `<tr>`;
      html += `<td>${ship.name} (${ship.project})</td>`;
      html += `<td>${norms.general}</td>`;
      C.CARGO_LIST.forEach(c => {
        html += `<td>${norms[c.id] || '—'}</td>`;
      });
      html += `</tr>`;
    });

    html += '</tbody></table>';
    div.innerHTML = html;
  }

  function showTravelTimes(div) {
    const times = MD.TRAVEL_TIMES;
    if (!times) {
      div.innerHTML = '<p style="color:#888">Данные о нормах хода недоступны</p>';
      return;
    }

    const portIds = Object.keys(times);
    const mainPorts = MD.PORTS.filter(p => p.isMain);

    let html = '<div style="overflow-x:auto"><table class="panel-table" style="font-size:11px"><thead><tr>';
    html += '<th></th>';
    mainPorts.forEach(p => {
      // Short name
      const shortName = p.name.length > 10 ? p.name.substring(0, 10) + '.' : p.name;
      html += `<th style="writing-mode:vertical-rl;transform:rotate(180deg);padding:4px;max-height:80px">${shortName}</th>`;
    });
    html += '</tr></thead><tbody>';

    mainPorts.forEach(fromPort => {
      html += `<tr><td style="font-weight:bold;white-space:nowrap">${fromPort.name}</td>`;
      mainPorts.forEach(toPort => {
        if (fromPort.id === toPort.id) {
          html += '<td style="background:#0e1018;text-align:center">—</td>';
        } else {
          const time = times[fromPort.id] && times[fromPort.id][toPort.id];
          html += `<td style="text-align:center">${time !== undefined ? time + 'ч' : '—'}</td>`;
        }
      });
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    div.innerHTML = html;
  }

  window.ReportsPanel = { render };
})();
