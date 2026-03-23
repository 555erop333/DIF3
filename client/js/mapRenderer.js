// client/js/mapRenderer.js — Карта + встроенный редактор (E — вкл/выкл)
(function () {
  'use strict';

  const MD = window.MapData;
  if (!MD) { console.error('MapData не загружен!'); return; }

  const canvas = document.getElementById('game-map');
  const ctx = canvas.getContext('2d');

  // ==================== BACKGROUND IMAGE ====================
  const bgImage = new Image();
  bgImage.src = '/img/bgmap.jpg';
  let bgReady = false;
  bgImage.onload = () => { bgReady = true; };

  // ==================== STATE ====================
  let scale = 1, offsetX = 0, offsetY = 0;
  let isDragging = false, dragStartX = 0, dragStartY = 0;
  let hoveredPort = null, selectedPort = null;
  let ships = {};

  // ==================== EDITOR STATE ====================
  let editorActive = false;
  let editorTool = 'ports'; // 'ports' | 'routes'
  let dragPort = null;       // порт, который тащим
  let routeDraw = null;      // { fromId, waypoints: [[x,y],...] }
  let selectedRouteIdx = -1;
  let editorPanel = null;
  let mouseWorld = { x: 0, y: 0 };

  // ==================== HELPERS ====================

  function toScreen(x, y) {
    return { x: x * scale + offsetX, y: y * scale + offsetY };
  }
  function toWorld(sx, sy) {
    return { x: (sx - offsetX) / scale, y: (sy - offsetY) / scale };
  }

  function clampView() {
    const pad = 60;
    const mw = MD.MAP_WIDTH * scale, mh = MD.MAP_HEIGHT * scale;
    if (mw + pad * 2 <= canvas.width) offsetX = (canvas.width - mw) / 2;
    else offsetX = Math.max(canvas.width - mw - pad, Math.min(pad, offsetX));
    if (mh + pad * 2 <= canvas.height) offsetY = (canvas.height - mh) / 2;
    else offsetY = Math.max(canvas.height - mh - pad, Math.min(pad, offsetY));
  }

  function findPortAt(wx, wy, radius) {
    radius = radius || 22;
    const r2 = radius * radius;
    for (const port of MD.PORTS) {
      if ((wx - port.x) ** 2 + (wy - port.y) ** 2 < r2) return port;
    }
    return null;
  }

  function findRouteIdx(wx, wy) {
    let best = -1, bestDist = 20;
    MD.ROUTES.forEach((r, idx) => {
      const from = MD.PORTS.find(p => p.id === r.from);
      const to = MD.PORTS.find(p => p.id === r.to);
      if (!from || !to) return;
      const pts = getRoutePoints(r, from, to);
      for (let i = 0; i < pts.length - 1; i++) {
        const d = distToSegment(wx, wy, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
        if (d < bestDist) { bestDist = d; best = idx; }
      }
    });
    return best;
  }

  function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function getRoutePoints(route, from, to) {
    const pts = [[from.x, from.y]];
    if (route.path) route.path.forEach(p => pts.push(p));
    pts.push([to.x, to.y]);
    return pts;
  }

  // ==================== SMOOTH CURVE ====================

  function traceSmoothRoute(pts) {
    // pts = array of [x,y] in map coords
    const sp = pts.map(p => toScreen(p[0], p[1]));
    if (sp.length < 2) return;
    ctx.moveTo(sp[0].x, sp[0].y);
    if (sp.length === 2) {
      ctx.lineTo(sp[1].x, sp[1].y);
      return;
    }
    const t = 0.35;
    for (let i = 0; i < sp.length - 1; i++) {
      const p0 = sp[Math.max(0, i - 1)];
      const p1 = sp[i];
      const p2 = sp[i + 1];
      const p3 = sp[Math.min(sp.length - 1, i + 2)];
      ctx.bezierCurveTo(
        p1.x + (p2.x - p0.x) * t, p1.y + (p2.y - p0.y) * t,
        p2.x - (p3.x - p1.x) * t, p2.y - (p3.y - p1.y) * t,
        p2.x, p2.y
      );
    }
  }

  // ==================== RESIZE ====================

  function resize() {
    const c = document.getElementById('map-container');
    canvas.width = c.clientWidth;
    canvas.height = c.clientHeight;
    const sx = canvas.width / (MD.MAP_WIDTH + 40);
    const sy = canvas.height / (MD.MAP_HEIGHT + 40);
    scale = Math.min(sx, sy) * 0.95;
    offsetX = (canvas.width - MD.MAP_WIDTH * scale) / 2;
    offsetY = (canvas.height - MD.MAP_HEIGHT * scale) / 2;
    clampView();
  }

  // ==================== RENDER ====================

  function render() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#050a12';
    ctx.fillRect(0, 0, W, H);

    drawBackground();
    drawGrid();
    drawGeoLabels();
    drawRoutes();

    // Превью рисуемого маршрута
    if (editorActive && routeDraw) drawRoutePenPreview();

    drawPorts();
    drawShips();

    // Editor overlays
    if (editorActive) drawEditorOverlays();

    if (!editorActive) {
      drawTooltip();
      drawCompass();
    }

    requestAnimationFrame(render);
  }

  // ---------- Background ----------
  function drawBackground() {
    if (!bgReady) return;
    const tl = toScreen(0, 0);
    ctx.drawImage(bgImage, tl.x, tl.y, MD.MAP_WIDTH * scale, MD.MAP_HEIGHT * scale);
  }

  // ---------- Grid ----------
  function drawGrid() {
    if (scale < 0.35) return;
    ctx.save();
    ctx.strokeStyle = editorActive ? 'rgba(80,130,180,0.15)' : 'rgba(80,130,180,0.07)';
    ctx.lineWidth = 0.5;
    const step = editorActive ? 50 : 100;
    for (let gx = 0; gx <= MD.MAP_WIDTH; gx += step) {
      const a = toScreen(gx, 0), b = toScreen(gx, MD.MAP_HEIGHT);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (let gy = 0; gy <= MD.MAP_HEIGHT; gy += step) {
      const a = toScreen(0, gy), b = toScreen(MD.MAP_WIDTH, gy);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- Geo Labels ----------
  function drawGeoLabels() {
    MD.GEO_LABELS.forEach(lbl => {
      const p = toScreen(lbl.x, lbl.y);
      const fs = Math.max(8, (lbl.fontSize || 14) * scale);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (lbl.type === 'sea') {
        ctx.font = `italic 600 ${fs}px 'Segoe UI',sans-serif`;
        ctx.fillStyle = 'rgba(120,180,240,0.3)';
      } else if (lbl.type === 'bay') {
        ctx.font = `italic ${fs}px 'Segoe UI',sans-serif`;
        ctx.fillStyle = 'rgba(100,160,220,0.25)';
      } else if (lbl.type === 'river') {
        ctx.font = `italic ${fs}px 'Segoe UI',sans-serif`;
        ctx.fillStyle = 'rgba(80,140,220,0.3)';
      } else if (lbl.type === 'desert') {
        ctx.font = `italic ${fs}px 'Segoe UI',sans-serif`;
        ctx.fillStyle = 'rgba(200,170,80,0.3)';
      }
      ctx.fillText(lbl.name, p.x, p.y);
      ctx.restore();
    });
  }

  // ---------- Routes ----------
  function drawRoutes() {
    ctx.save();

    // Collect active ship route keys for highlighting
    const activeShipRoutes = new Set();
    Object.values(ships).forEach(ship => {
      if (ship.status === 'en_route' && ship.fromPort && ship.toPort) {
        activeShipRoutes.add(ship.fromPort + '|' + ship.toPort);
        activeShipRoutes.add(ship.toPort + '|' + ship.fromPort);
      }
    });

    MD.ROUTES.forEach((r, idx) => {
      const from = MD.PORTS.find(p => p.id === r.from);
      const to = MD.PORTS.find(p => p.id === r.to);
      if (!from || !to) return;

      const isSel = editorActive && idx === selectedRouteIdx;
      const isHovered = hoveredPort && (r.from === hoveredPort || r.to === hoveredPort);
      const isShipRoute = activeShipRoutes.has(r.from + '|' + r.to);

      // In normal mode: only show routes connected to hovered port or active ship routes
      if (!editorActive && !isHovered && !isShipRoute) return;

      const pts = getRoutePoints(r, from, to);

      // Glow
      ctx.beginPath();
      traceSmoothRoute(pts);
      if (isSel) {
        ctx.strokeStyle = 'rgba(255,80,80,0.25)';
        ctx.lineWidth = 6;
      } else if (isShipRoute) {
        ctx.strokeStyle = 'rgba(80,220,120,0.2)';
        ctx.lineWidth = 5;
      } else if (isHovered) {
        ctx.strokeStyle = 'rgba(100,180,255,0.18)';
        ctx.lineWidth = 4;
      } else {
        ctx.strokeStyle = 'rgba(100,180,255,0.08)';
        ctx.lineWidth = 4;
      }
      ctx.setLineDash([]);
      ctx.stroke();

      // Dashed line
      ctx.beginPath();
      traceSmoothRoute(pts);
      ctx.setLineDash([6, 5]);
      if (isSel) {
        ctx.strokeStyle = 'rgba(255,100,100,0.6)';
        ctx.lineWidth = 2;
      } else if (isShipRoute) {
        ctx.strokeStyle = 'rgba(80,220,120,0.55)';
        ctx.lineWidth = 1.8;
      } else if (isHovered) {
        ctx.strokeStyle = 'rgba(120,180,240,0.5)';
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = 'rgba(120,180,240,0.28)';
        ctx.lineWidth = 1.2;
      }
      ctx.stroke();

      // Editor: draw waypoint dots
      if (editorActive && r.path && r.path.length > 0) {
        r.path.forEach(wp => {
          const sp = toScreen(wp[0], wp[1]);
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = isSel ? '#ff6666' : '#4488cc';
          ctx.fill();
          ctx.setLineDash([]);
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      }
    });
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ---------- Route Pen Preview ----------
  function drawRoutePenPreview() {
    if (!routeDraw) return;
    const fromPort = MD.PORTS.find(p => p.id === routeDraw.fromId);
    if (!fromPort) return;

    const pts = [[fromPort.x, fromPort.y], ...routeDraw.waypoints, [mouseWorld.x, mouseWorld.y]];

    // Preview line
    ctx.save();
    ctx.beginPath();
    traceSmoothRoute(pts);
    ctx.strokeStyle = 'rgba(0,220,255,0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Start port highlight
    const sp = toScreen(fromPort.x, fromPort.y);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 12, 0, Math.PI * 2);
    ctx.strokeStyle = '#00ddff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Waypoint dots
    routeDraw.waypoints.forEach(wp => {
      const s = toScreen(wp[0], wp[1]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#00ddff';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    ctx.restore();
  }

  // ---------- Ports ----------
  function drawPorts() {
    MD.PORTS.filter(p => !p.isMain).forEach(p => drawPort(p, true));
    MD.PORTS.filter(p => p.isMain).forEach(p => drawPort(p, false));
  }

  function drawPort(port, minor) {
    const p = toScreen(port.x, port.y);
    const r = minor ? Math.max(3.5, 5 * scale) : Math.max(5, 7.5 * scale);
    const sel = selectedPort === port.id;
    const hov = hoveredPort === port.id;
    const isDrag = dragPort === port;

    if (sel || hov || isDrag) {
      const grd = ctx.createRadialGradient(p.x, p.y, r * 0.5, p.x, p.y, r * 3.5);
      grd.addColorStop(0, isDrag ? 'rgba(0,220,255,0.6)' : sel ? 'rgba(255,200,0,0.6)' : 'rgba(255,120,50,0.45)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 3.5, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = isDrag ? '#006688' : sel ? '#b89500' : hov ? '#b84418' : (minor ? '#4a3015' : '#6a1515');
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = isDrag ? '#00ccee' : sel ? '#ffd633' : hov ? '#ff5533' : (minor ? '#c08030' : '#ee3333');
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x - r * 0.2, p.y - r * 0.25, r * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fill();

    // Name + coordinates in editor
    const fs = minor ? Math.max(8, 10 * scale) : Math.max(10, 13 * scale);
    ctx.font = `${minor ? '' : 'bold '}${fs}px 'Segoe UI',sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    let label = port.name;
    if (editorActive && isDrag) {
      label += ` (${Math.round(port.x)}, ${Math.round(port.y)})`;
    }

    const tw = ctx.measureText(label).width;
    const ty = p.y + r + 6;

    ctx.fillStyle = 'rgba(5,10,18,0.8)';
    ctx.beginPath();
    ctx.roundRect(p.x - tw / 2 - 5, ty - 2, tw + 10, fs + 5, 4);
    ctx.fill();

    ctx.fillStyle = isDrag ? '#00ddff' : minor ? '#99aabb' : '#e8e8f0';
    ctx.fillText(label, p.x, ty);
  }

  // ---------- Ships ----------
  function drawShips() {
    Object.values(ships).forEach(ship => {
      if (ship.x == null || ship.y == null) return;
      const p = toScreen(ship.x, ship.y);
      const sz = Math.max(6, 9 * scale);
      const gs = window.gameState;
      const isMine = gs && gs.myId && ship.ownerId === gs.myId;
      const color = ship.status === 'en_route' ? '#4488ff' : isMine ? '#33dd33' : '#ee9933';

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;

      ctx.beginPath();
      ctx.moveTo(0, -sz * 1.2);
      ctx.lineTo(sz * 0.5, -sz * 0.15);
      ctx.lineTo(sz * 0.38, sz * 0.6);
      ctx.lineTo(-sz * 0.38, sz * 0.6);
      ctx.lineTo(-sz * 0.5, -sz * 0.15);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      const nm = ship.name || '';
      if (nm) {
        const fs = Math.max(7, 9 * scale);
        ctx.font = `${fs}px 'Segoe UI',sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const ntw = ctx.measureText(nm).width;
        const ny = -sz * 1.2 - 4;
        ctx.fillStyle = 'rgba(5,10,18,0.85)';
        ctx.fillRect(-ntw / 2 - 3, ny - fs - 1, ntw + 6, fs + 3);
        ctx.fillStyle = '#bbbbdd';
        ctx.fillText(nm, 0, ny);
      }
      ctx.restore();
    });
  }

  // ---------- Editor Overlays ----------
  function drawEditorOverlays() {
    // Crosshair at mouse
    const ms = toScreen(mouseWorld.x, mouseWorld.y);
    ctx.save();
    ctx.strokeStyle = 'rgba(0,200,255,0.3)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(ms.x, 0); ctx.lineTo(ms.x, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, ms.y); ctx.lineTo(canvas.width, ms.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Coordinate label at cursor
    ctx.save();
    ctx.font = '11px Consolas, monospace';
    ctx.fillStyle = 'rgba(0,200,255,0.7)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${Math.round(mouseWorld.x)}, ${Math.round(mouseWorld.y)}`, ms.x + 10, ms.y - 6);
    ctx.restore();
  }

  // ---------- Tooltip ----------
  function drawTooltip() {
    if (!hoveredPort) return;
    const port = MD.PORTS.find(p => p.id === hoveredPort);
    if (!port) return;

    const p = toScreen(port.x, port.y);
    const lines = [port.name, port.isMain ? 'Основной порт' : 'Малый порт'];
    const inPort = Object.values(ships).filter(s => s.currentPort === port.id).length;
    if (inPort) lines.push('Судов: ' + inPort);

    const fs = 13;
    ctx.font = `${fs}px 'Segoe UI',sans-serif`;
    const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
    const pad = 10;
    const tw = maxW + pad * 2, th = lines.length * (fs + 5) + pad * 2 - 5;
    let tx = p.x + 18, ty = p.y - th / 2;
    if (tx + tw > canvas.width - 5) tx = p.x - tw - 18;
    if (ty < 5) ty = 5;
    if (ty + th > canvas.height - 5) ty = canvas.height - th - 5;

    ctx.fillStyle = 'rgba(8,14,28,0.93)';
    ctx.strokeStyle = '#0099cc';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, 6); ctx.fill(); ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? '#00d4ff' : '#8899aa';
      ctx.fillText(line, tx + pad, ty + pad + i * (fs + 5));
    });
  }

  // ---------- Compass ----------
  function drawCompass() {
    const cx = canvas.width - 48, cy = 48, r = 20;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#5599bb'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - r + 3); ctx.lineTo(cx - 4, cy); ctx.lineTo(cx + 4, cy); ctx.closePath();
    ctx.fillStyle = '#dd3333'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx, cy + r - 3); ctx.lineTo(cx - 4, cy); ctx.lineTo(cx + 4, cy); ctx.closePath();
    ctx.fillStyle = '#5599bb'; ctx.fill();
    ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#dd3333'; ctx.fillText('N', cx, cy - r - 9);
    ctx.fillStyle = '#5599bb';
    ctx.fillText('S', cx, cy + r + 9);
    ctx.fillText('W', cx - r - 9, cy);
    ctx.fillText('E', cx + r + 9, cy);
    ctx.restore();
  }

  // ==================== MOUSE / POINTER EVENTS ====================

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const w = toWorld(e.clientX - rect.left, e.clientY - rect.top);

    // --- Editor: port drag ---
    if (editorActive && editorTool === 'ports') {
      const port = (hoveredPort && MD.PORTS.find(p => p.id === hoveredPort))
                   || findPortAt(w.x, w.y, 40);
      if (port) {
        dragPort = port;
        isDragging = false;
        canvas.style.cursor = 'move';
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    // --- Editor: route pen ---
    if (editorActive && editorTool === 'routes') {
      const port = (hoveredPort && MD.PORTS.find(p => p.id === hoveredPort))
                   || findPortAt(w.x, w.y, 40);
      if (routeDraw) {
        if (port && port.id !== routeDraw.fromId) {
          finishRoute(port);
          return;
        }
        routeDraw.waypoints.push([Math.round(w.x), Math.round(w.y)]);
        return;
      } else {
        if (port) {
          routeDraw = { fromId: port.id, waypoints: [] };
          editorStatus('От: ' + port.name + ' → кликните точки маршрута → кликните порт назначения');
          return;
        }
        const idx = findRouteIdx(w.x, w.y);
        if (idx >= 0) {
          selectedRouteIdx = idx;
          const r = MD.ROUTES[idx];
          editorStatus('Выбран: ' + r.from + ' → ' + r.to + '  (Del — удалить)');
          return;
        }
        selectedRouteIdx = -1;
      }
    }

    // --- Normal pan ---
    isDragging = true;
    dragStartX = e.clientX - offsetX;
    dragStartY = e.clientY - offsetY;
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointermove', e => {
    const rect = canvas.getBoundingClientRect();
    const w = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    mouseWorld = w;

    // Port drag has absolute priority
    if (dragPort) {
      dragPort.x = Math.round(w.x);
      dragPort.y = Math.round(w.y);
      e.preventDefault();
      return;
    }

    if (isDragging) {
      offsetX = e.clientX - dragStartX;
      offsetY = e.clientY - dragStartY;
      clampView();
      return;
    }

    hoveredPort = null;
    const port = findPortAt(w.x, w.y, 22);
    if (port) {
      hoveredPort = port.id;
      canvas.style.cursor = editorActive ? (editorTool === 'ports' ? 'move' : 'crosshair') : 'pointer';
      return;
    }
    canvas.style.cursor = editorActive ? 'crosshair' : 'grab';
  });

  canvas.addEventListener('pointerup', e => {
    if (dragPort) {
      editorStatus(dragPort.name + ': x=' + dragPort.x + ', y=' + dragPort.y);
      dragPort = null;
      canvas.releasePointerCapture(e.pointerId);
    }
    isDragging = false;
    canvas.style.cursor = editorActive ? 'crosshair' : (hoveredPort ? 'pointer' : 'grab');
  });

  canvas.addEventListener('pointerleave', () => {
    isDragging = false;
    dragPort = null;
    hoveredPort = null;
  });

  canvas.addEventListener('click', e => {
    if (editorActive) return; // handled in mousedown
    if (hoveredPort) {
      selectedPort = hoveredPort === selectedPort ? null : hoveredPort;
      window.dispatchEvent(new CustomEvent('portSelected', { detail: { portId: selectedPort } }));
    }
  });

  // Right click
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();

    if (editorActive && routeDraw) {
      // Undo last waypoint
      if (routeDraw.waypoints.length > 0) {
        routeDraw.waypoints.pop();
        editorStatus('Точка убрана. Осталось: ' + routeDraw.waypoints.length);
      } else {
        routeDraw = null;
        editorStatus('Рисование отменено');
      }
      return;
    }

    if (editorActive) return;

    // Normal context menu
    const rect = canvas.getBoundingClientRect();
    const w = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    let cp = findPortAt(w.x, w.y);
    let cs = null;
    for (const ship of Object.values(ships)) {
      if (ship.x == null) continue;
      if ((w.x - ship.x) ** 2 + (w.y - ship.y) ** 2 < 300) { cs = ship; break; }
    }

    const items = [];
    if (cp) {
      items.push({ label: cp.name, head: true });
      items.push({ sep: true });
      items.push({ label: 'Порт', action() { selPort(cp.id); if (window.openPanel) window.openPanel('port'); } });
      items.push({ label: 'Суда в порту', action() { selPort(cp.id); if (window.openPanel) window.openPanel('fleet'); } });
      items.push({ label: 'Биржа', action() { selPort(cp.id); if (window.openPanel) window.openPanel('exchange'); } });
    }
    if (cs) {
      if (items.length) items.push({ sep: true });
      items.push({ label: cs.name || 'Судно', head: true });
      items.push({ sep: true });
      items.push({ label: 'Флот', action() { if (window.openPanel) window.openPanel('fleet'); } });
    }
    if (!items.length) {
      items.push({ label: 'Навигация', head: true });
      items.push({ sep: true });
      items.push({ label: 'Биржа', action() { if (window.openPanel) window.openPanel('exchange'); } });
      items.push({ label: 'Оферта', action() { if (window.openPanel) window.openPanel('offer'); } });
      items.push({ label: 'Договоры', action() { if (window.openPanel) window.openPanel('contracts'); } });
      items.push({ label: 'Флот', action() { if (window.openPanel) window.openPanel('fleet'); } });
    }
    showCtxMenu(e.clientX, e.clientY, items);
  });

  // Zoom
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const old = scale;
    scale *= e.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.max(0.4, Math.min(4, scale));
    offsetX = mx - (mx - offsetX) * (scale / old);
    offsetY = my - (my - offsetY) * (scale / old);
    clampView();
  });

  // ==================== EDITOR LOGIC ====================

  function finishRoute(toPort) {
    const fromId = routeDraw.fromId;
    const toId = toPort.id;
    const waypoints = routeDraw.waypoints.slice();
    routeDraw = null;

    // Replace existing route between same ports, or add new
    let existing = MD.ROUTES.findIndex(r =>
      (r.from === fromId && r.to === toId) || (r.from === toId && r.to === fromId)
    );

    if (existing >= 0) {
      const r = MD.ROUTES[existing];
      // If direction is reversed, reverse waypoints
      if (r.from === toId) {
        waypoints.reverse();
      }
      r.path = waypoints.length > 0 ? waypoints : undefined;
      editorStatus('Маршрут обновлён: ' + fromId + ' → ' + toId + ' (' + waypoints.length + ' точек)');
    } else {
      MD.ROUTES.push({
        from: fromId,
        to: toId,
        distance: 100,
        path: waypoints.length > 0 ? waypoints : undefined,
      });
      editorStatus('Новый маршрут: ' + fromId + ' → ' + toId + ' (' + waypoints.length + ' точек)');
    }
  }

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Escape — cancel route drawing
    if (e.key === 'Escape' && routeDraw) {
      routeDraw = null;
      editorStatus('Рисование отменено');
    }
    // Delete — delete selected route
    if (e.key === 'Delete' && editorActive && selectedRouteIdx >= 0) {
      const r = MD.ROUTES[selectedRouteIdx];
      editorStatus('Удалён: ' + r.from + ' → ' + r.to);
      MD.ROUTES.splice(selectedRouteIdx, 1);
      selectedRouteIdx = -1;
    }
  });

  // ==================== EDITOR UI ====================

  function createEditorUI() {
    if (editorPanel) return;
    editorPanel = document.createElement('div');
    editorPanel.id = 'editor-panel';
    editorPanel.style.cssText = 'position:fixed;top:50px;left:10px;background:rgba(10,16,28,0.96);border:1px solid #00a8dd;border-radius:8px;padding:12px;z-index:300;font-family:Segoe UI,sans-serif;color:#e0e0e0;font-size:13px;min-width:240px;user-select:none';

    editorPanel.innerHTML = `
      <div style="font-weight:bold;color:#00d4ff;margin-bottom:10px;font-size:15px">
        Редактор карты
      </div>
      <div style="display:flex;gap:6px;margin-bottom:10px" id="ed-tools">
        <button id="ed-btn-ports" style="flex:1">Порты</button>
        <button id="ed-btn-routes" style="flex:1">Маршруты</button>
      </div>
      <div id="ed-status" style="font-size:12px;color:#88aacc;min-height:28px;margin-bottom:8px">
        Перетащите порт для перемещения
      </div>
      <button id="ed-btn-export" style="width:100%;background:#1a5a1a">Экспорт в консоль</button>
      <button id="ed-btn-save" style="width:100%;background:#1a4a6a;margin-top:4px">Сохранить на сервер</button>
      <div style="font-size:11px;color:#445;margin-top:10px;border-top:1px solid #1a2540;padding-top:8px;line-height:1.6">
        <b>E</b> — вкл/выкл редактор<br>
        <b>ПКМ</b> — убрать последнюю точку<br>
        <b>Esc</b> — отмена маршрута<br>
        <b>Del</b> — удалить выбранный маршрут<br>
        <b>Порты</b>: тащите порт мышкой<br>
        <b>Маршруты</b>: порт → точки → порт
      </div>
    `;

    document.body.appendChild(editorPanel);

    // Style buttons
    editorPanel.querySelectorAll('button').forEach(b => {
      b.style.cssText += ';padding:6px 10px;border:1px solid #335;border-radius:4px;background:#1a2540;color:#ddd;cursor:pointer;font-size:12px';
      b.addEventListener('mouseenter', () => { if (!b._active) b.style.background = '#2a3560'; });
      b.addEventListener('mouseleave', () => { if (!b._active) b.style.background = b.id === 'ed-btn-export' ? '#1a5a1a' : b.id === 'ed-btn-save' ? '#1a4a6a' : '#1a2540'; });
    });

    document.getElementById('ed-btn-ports').addEventListener('click', () => {
      editorTool = 'ports'; routeDraw = null; updateEdToolBtns();
      editorStatus('Перетащите порт для перемещения');
    });
    document.getElementById('ed-btn-routes').addEventListener('click', () => {
      editorTool = 'routes'; updateEdToolBtns();
      editorStatus('Кликните на порт — начало маршрута');
    });
    document.getElementById('ed-btn-export').addEventListener('click', exportData);
    document.getElementById('ed-btn-save').addEventListener('click', saveToServer);

    updateEdToolBtns();
  }

  function updateEdToolBtns() {
    const bp = document.getElementById('ed-btn-ports');
    const br = document.getElementById('ed-btn-routes');
    if (!bp || !br) return;
    [bp, br].forEach(b => { b.style.background = '#1a2540'; b.style.borderColor = '#335'; b._active = false; });
    const act = editorTool === 'ports' ? bp : br;
    act.style.background = '#0a3560';
    act.style.borderColor = '#00a8dd';
    act._active = true;
  }

  function removeEditorUI() {
    if (editorPanel) { editorPanel.remove(); editorPanel = null; }
  }

  function editorStatus(msg) {
    const el = document.getElementById('ed-status');
    if (el) el.textContent = msg;
  }

  // ==================== EXPORT ====================

  function exportData() {
    const portsJS = MD.PORTS.map(p => {
      const pad = p.isMain ? 'true ' : 'false';
      return `  { id: '${p.id}', name: '${p.name}', x: ${p.x}, y: ${p.y}, isMain: ${pad} },`;
    }).join('\n');

    const routesJS = MD.ROUTES.map(r => {
      let s = `  { from: '${r.from}', to: '${r.to}', distance: ${r.distance}`;
      if (r.path && r.path.length > 0) {
        s += `, path: [${r.path.map(p => `[${p[0]},${p[1]}]`).join(',')}]`;
      }
      s += ' },';
      return s;
    }).join('\n');

    const output = `// === PORTS ===\nconst PORTS = [\n${portsJS}\n];\n\n// === ROUTES ===\nconst ROUTES = [\n${routesJS}\n];`;

    console.log(output);
    editorStatus('Данные выведены в консоль (F12)');

    // Also copy to clipboard
    navigator.clipboard.writeText(output).then(() => {
      editorStatus('Скопировано в буфер обмена!');
    }).catch(() => {
      editorStatus('Данные в консоли (F12). Ctrl+A → Ctrl+C');
    });
  }

  function saveToServer() {
    editorStatus('Сохранение...');
    const data = {
      ports: MD.PORTS.map(p => ({ id: p.id, name: p.name, x: p.x, y: p.y, isMain: p.isMain })),
      routes: MD.ROUTES.map(r => {
        const o = { from: r.from, to: r.to, distance: r.distance };
        if (r.path && r.path.length > 0) o.path = r.path;
        return o;
      }),
    };
    fetch('/api/mapData/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
      .then(r => r.json())
      .then(res => {
        if (res.ok) {
          editorStatus('Сохранено! Портов: ' + res.ports + ', маршрутов: ' + res.routes);
        } else {
          editorStatus('Ошибка: ' + (res.error || 'unknown'));
        }
      })
      .catch(err => {
        editorStatus('Ошибка сети: ' + err.message);
      });
  }

  // ==================== CONTEXT MENU ====================

  let ctxMenu = null;

  function showCtxMenu(x, y, items) {
    hideCtxMenu();
    ctxMenu = document.createElement('div');
    ctxMenu.style.cssText = `position:fixed;left:${x}px;top:${y}px;background:#12182a;border:1px solid #00a8dd;border-radius:6px;padding:4px 0;z-index:200;min-width:175px;box-shadow:0 6px 24px rgba(0,0,0,0.6);font-family:'Segoe UI',sans-serif`;
    items.forEach(it => {
      if (it.sep) {
        const d = document.createElement('div');
        d.style.cssText = 'height:1px;background:#1e2a42;margin:3px 0';
        ctxMenu.appendChild(d); return;
      }
      const el = document.createElement('div');
      el.style.cssText = `padding:7px 14px;font-size:13px;color:${it.head ? '#00d4ff' : '#d0d0e0'};cursor:${it.head ? 'default' : 'pointer'};white-space:nowrap;${it.head ? 'font-weight:600;font-size:12px' : ''}`;
      el.textContent = it.label;
      if (!it.head) {
        el.addEventListener('mouseenter', () => { el.style.background = '#1a2540'; });
        el.addEventListener('mouseleave', () => { el.style.background = 'transparent'; });
      }
      if (it.action) el.addEventListener('click', () => { hideCtxMenu(); it.action(); });
      ctxMenu.appendChild(el);
    });
    document.body.appendChild(ctxMenu);
    const rc = ctxMenu.getBoundingClientRect();
    if (rc.right > window.innerWidth) ctxMenu.style.left = (x - rc.width) + 'px';
    if (rc.bottom > window.innerHeight) ctxMenu.style.top = (y - rc.height) + 'px';
  }

  function hideCtxMenu() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } }
  document.addEventListener('click', hideCtxMenu);

  function selPort(id) {
    selectedPort = id;
    window.dispatchEvent(new CustomEvent('portSelected', { detail: { portId: id } }));
  }

  // ==================== PUBLIC API ====================

  window.MapRenderer = {
    resize,
    updateShips(s) { ships = s || {}; },
    getSelectedPort() { return selectedPort; },
    setSelectedPort(id) { selectedPort = id; },
    toggleEditor(on) {
      if (on === undefined) on = !editorActive;
      editorActive = on;
      if (editorActive) createEditorUI();
      else { removeEditorUI(); dragPort = null; routeDraw = null; selectedRouteIdx = -1; }
    },
    isEditorActive() { return editorActive; },
  };

  window.addEventListener('resize', resize);
  resize();
  render();
})();
