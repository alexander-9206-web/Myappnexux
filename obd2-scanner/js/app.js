(function () {
  'use strict';

  var elm = null;
  var liveTimer = null;
  var liveRunning = false;
  var scanResults = {};
  var activeModuleId = null;
  var dtcMode = 'stored';

  var $ = function (id) { return document.getElementById(id); };

  function toast(msg, type) {
    var el = $('toast');
    el.textContent = msg;
    el.className = 'toast' + (type ? ' ' + type : '');
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.hidden = true; }, 3200);
  }
  window.__tachoToast = toast;

  function setConn(state, label) {
    $('conn-badge').dataset.state = state;
    $('conn-label').textContent = label;
  }

  function setConnected(on) {
    var ids = ['btn-disconnect', 'btn-start-live', 'btn-read-dtc', 'btn-clear-dtc',
      'btn-read-vin', 'btn-scan-all'];
    ids.forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = !on;
      if (id === 'btn-disconnect') el.hidden = !on;
    });
    document.querySelectorAll('.connect-btn').forEach(function (b) { b.disabled = on; });
    if (window.TachometerModule) TachometerModule.setConnected(on);
  }

  function showInitLog(lines) {
    $('init-log-card').hidden = false;
    $('init-log').textContent = lines.join('\n');
  }

  function switchTab(id) {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.tab === id);
    });
    document.querySelectorAll('.panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'panel-' + id);
    });
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function buildGauges() {
    var grid = $('gauge-grid');
    grid.innerHTML = '';
    window.OBD_PIDS.forEach(function (p) {
      var el = document.createElement('div');
      el.className = 'gauge';
      el.dataset.pid = p.pid;
      el.innerHTML =
        '<div class="gauge-label">' + p.name + '</div>' +
        '<div><span class="gauge-value">—</span><span class="gauge-unit">' + p.unit + '</span></div>';
      grid.appendChild(el);
    });
  }

  function countModuleCodes(entry) {
    if (!entry) return 0;
    return (entry.stored || []).length + (entry.pending || []).length + (entry.permanent || []).length;
  }

  function buildModuleGrid() {
    var grid = $('module-grid');
    grid.innerHTML = '';
    window.OBD_MODULES.forEach(function (mod) {
      var entry = scanResults[mod.id];
      var count = countModuleCodes(entry);
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'module-card' + (count ? ' has-codes' : '') + (entry && entry.error ? ' has-error' : '');
      card.dataset.moduleId = mod.id;
      card.innerHTML =
        '<span class="module-icon">' + mod.icon + '</span>' +
        '<span class="module-name">' + mod.name + '</span>' +
        '<span class="module-short">' + mod.short + ' · ' + mod.header + '</span>' +
        '<span class="module-badge">' + (count ? count + ' DTC' : (entry && entry.error ? 'Error' : 'OK')) + '</span>';
      card.addEventListener('click', function () { openModuleDetail(mod.id); });
      grid.appendChild(card);
    });
  }

  function updateSummary() {
    var total = 0;
    var withCodes = 0;
    window.OBD_MODULES.forEach(function (mod) {
      var c = countModuleCodes(scanResults[mod.id]);
      if (c) { total += c; withCodes++; }
    });
    $('module-summary').hidden = !Object.keys(scanResults).length;
    $('summary-total').textContent = total + ' código' + (total !== 1 ? 's' : '');
    $('summary-modules').textContent = withCodes + ' módulo' + (withCodes !== 1 ? 's' : '') + ' con fallos';
  }

  function renderDtcGroup(label, codes, typeClass) {
    if (!codes || !codes.length) return '';
    var html = '<div class="dtc-group-label">' + label + '</div>';
    codes.forEach(function (c) {
      html += '<div class="dtc-item ' + (typeClass || '') + '">' +
        '<span class="dtc-code">' + c + '</span>' +
        '<div class="dtc-desc">' + describeDTC(c) + '</div></div>';
    });
    return html;
  }

  function openModuleDetail(moduleId) {
    activeModuleId = moduleId;
    var mod = OBD_MODULE_MAP[moduleId];
    var entry = scanResults[moduleId];
    $('module-grid').hidden = true;
    $('module-detail').hidden = false;
    $('detail-name').textContent = mod.icon + ' ' + mod.name;
    $('detail-header').textContent = 'CAN TX ' + mod.header + ' · RX ' + mod.rx;
    renderModuleDtcList(entry);
  }

  function closeModuleDetail() {
    activeModuleId = null;
    $('module-grid').hidden = false;
    $('module-detail').hidden = true;
  }

  function renderModuleDtcList(entry) {
    var list = $('module-dtc-list');
    if (!entry) {
      list.innerHTML = '<p class="empty">Pulsa «Leer módulo» para escanear este ECU.</p>';
      return;
    }
    if (entry.error && !countModuleCodes(entry)) {
      list.innerHTML = '<div class="dtc-item"><span class="dtc-code">Sin respuesta</span>' +
        '<div class="dtc-desc">' + entry.error + ' — módulo no presente o no responde en este vehículo.</div></div>';
      return;
    }
    if (!countModuleCodes(entry)) {
      list.innerHTML = '<div class="dtc-item ok"><span class="dtc-code">Sin códigos</span>' +
        '<div class="dtc-desc">Este módulo no reporta DTC activos.</div></div>';
      return;
    }
    list.innerHTML =
      renderDtcGroup('Almacenados', entry.stored) +
      renderDtcGroup('Pendientes', entry.pending) +
      renderDtcGroup('Permanentes', entry.permanent);
  }

  function updateGauge(pid, value) {
    var el = document.querySelector('.gauge[data-pid="' + pid + '"]');
    if (!el) return;
    var def = window.OBD_PID_MAP[pid];
    var display = (typeof value === 'number') ? (Math.round(value * 10) / 10) : '—';
    el.querySelector('.gauge-value').textContent = display;
    if (def && typeof value === 'number') {
      var max = def.max || 100;
      var ratio = def.signed
        ? Math.min(1, Math.abs(value) / max)
        : Math.min(1, Math.max(0, value / max));
      el.style.setProperty('--fill', ratio);
    }
  }

  async function connectTransport(factory) {
    if (elm) return;
    setConn('busy', 'Conectando…');
    try {
      var transport = factory();
      elm = new Elm327(transport);
      var log = await elm.connect();
      showInitLog(log);
      setConn('on', 'Conectado');
      setConnected(true);
      $('info-adapter').textContent = elm.adapterInfo || transport.name;
      $('info-protocol').textContent = elm.protocol || 'Auto';
      toast('Adaptador listo — escanea módulos', 'ok');
      switchTab('modules');
    } catch (e) {
      elm = null;
      setConn('off', 'Desconectado');
      setConnected(false);
      toast(e.message || 'Error de conexión', 'error');
    }
  }

  async function disconnect() {
    stopLive();
    if (window.TachometerModule) TachometerModule.stop();
    scanResults = {};
    buildModuleGrid();
    updateSummary();
    closeModuleDetail();
    if (elm) {
      try { await elm.disconnect(); } catch (e) {}
      elm = null;
    }
    setConn('off', 'Desconectado');
    setConnected(false);
    toast('Desconectado');
  }

  async function scanAllModules() {
    if (!elm) return;
    setConn('busy', 'Escaneando…');
    $('btn-scan-all').disabled = true;
    $('scan-progress').textContent = '0 / ' + OBD_MODULES.length;
    scanResults = {};
    try {
      var results = await elm.scanAllModules(function (mod, cur, total) {
        $('scan-progress').textContent = cur + ' / ' + total + ' · ' + mod.short;
      });
      results.forEach(function (r) { scanResults[r.module.id] = r; });
      buildModuleGrid();
      updateSummary();
      var total = 0;
      results.forEach(function (r) { total += countModuleCodes(r); });
      toast('Escaneo completo — ' + total + ' código(s)', total ? 'error' : 'ok');
    } catch (e) {
      toast(e.message, 'error');
    }
    $('btn-scan-all').disabled = false;
    $('scan-progress').textContent = '';
    setConn('on', 'Conectado');
  }

  async function readActiveModule() {
    if (!elm || !activeModuleId) return;
    var mod = OBD_MODULE_MAP[activeModuleId];
    setConn('busy', 'Leyendo…');
    var entry = { module: mod, stored: [], pending: [], permanent: [], error: null };
    try {
      entry.stored = await elm.readModuleDTCs(mod, 'stored');
      entry.pending = await elm.readModuleDTCs(mod, 'pending');
      try { entry.permanent = await elm.readModuleDTCs(mod, 'permanent'); } catch (e) {}
    } catch (e) {
      entry.error = e.message;
    }
    scanResults[activeModuleId] = entry;
    renderModuleDtcList(entry);
    buildModuleGrid();
    updateSummary();
    setConn('on', 'Conectado');
    toast('Módulo ' + mod.short + ' leído', 'ok');
  }

  async function clearActiveModule() {
    if (!elm || !activeModuleId) return;
    var mod = OBD_MODULE_MAP[activeModuleId];
    if (!confirm('¿Borrar códigos del módulo ' + mod.name + '?')) return;
    setConn('busy', 'Borrando…');
    try {
      await elm.clearModuleDTCsProtected(mod);
      scanResults[activeModuleId] = { module: mod, stored: [], pending: [], permanent: [], error: null };
      renderModuleDtcList(scanResults[activeModuleId]);
      buildModuleGrid();
      updateSummary();
      toast('Códigos borrados en ' + mod.short, 'ok');
    } catch (e) {
      toast(e.message, 'error');
    }
    setConn('on', 'Conectado');
  }

  async function startLive() {
    if (!elm || liveRunning) return;
    liveRunning = true;
    $('btn-start-live').hidden = true;
    $('btn-stop-live').hidden = false;
    var t0 = Date.now();
    var count = 0;
    async function poll() {
      if (!liveRunning || !elm) return;
      for (var i = 0; i < window.OBD_PIDS.length; i++) {
        if (!liveRunning) break;
        var p = window.OBD_PIDS[i];
        try {
          var r = await elm.readPID(p.pid);
          if (r) updateGauge(p.pid, r.value);
        } catch (e) {}
        await new Promise(function (r) { setTimeout(r, 40); });
      }
      count++;
      $('poll-rate').textContent = (count / ((Date.now() - t0) / 1000)).toFixed(1) + ' ciclos/s';
      liveTimer = setTimeout(poll, 200);
    }
    poll();
  }

  function stopLive() {
    liveRunning = false;
    clearTimeout(liveTimer);
    $('btn-start-live').hidden = false;
    $('btn-stop-live').hidden = true;
    $('poll-rate').textContent = '';
  }

  async function readDTCs() {
    if (!elm) return;
    setConn('busy', 'Leyendo…');
    var list = $('dtc-list');
    list.innerHTML = '<p class="empty">Leyendo códigos ECM…</p>';
    try {
      var mod = OBD_MODULE_MAP.engine;
      var codes = await elm.readModuleDTCs(mod, dtcMode);
      if (!codes.length) {
        list.innerHTML = '<div class="dtc-item ok"><span class="dtc-code">Sin códigos</span>' +
          '<div class="dtc-desc">No hay DTC ' + DTC_MODES[dtcMode].label.toLowerCase() + ' en el motor.</div></div>';
      } else {
        list.innerHTML = '';
        codes.forEach(function (c) {
          var div = document.createElement('div');
          div.className = 'dtc-item';
          div.innerHTML = '<span class="dtc-code">' + c + '</span><div class="dtc-desc">' + describeDTC(c) + '</div>';
          list.appendChild(div);
        });
      }
      toast(codes.length ? codes.length + ' código(s)' : 'Sin códigos', 'ok');
    } catch (e) {
      list.innerHTML = '<p class="empty">Error: ' + e.message + '</p>';
      toast(e.message, 'error');
    }
    setConn('on', 'Conectado');
  }

  async function clearDTCs() {
    if (!elm) return;
    if (!confirm('¿Borrar códigos del motor (ECM)?')) return;
    setConn('busy', 'Borrando…');
    try {
      await elm.clearModuleDTCs(OBD_MODULE_MAP.engine);
      $('dtc-list').innerHTML = '<div class="dtc-item ok"><span class="dtc-code">Limpiado</span>' +
        '<div class="dtc-desc">Códigos ECM borrados.</div></div>';
      toast('ECM limpiado', 'ok');
    } catch (e) {
      toast(e.message, 'error');
    }
    setConn('on', 'Conectado');
  }

  async function readVIN() {
    if (!elm) return;
    $('info-vin').textContent = 'Leyendo…';
    try {
      var vin = await elm.readVIN();
      $('info-vin').textContent = vin || 'No disponible';
      toast(vin ? 'VIN leído' : 'VIN no disponible', vin ? 'ok' : 'error');
    } catch (e) {
      $('info-vin').textContent = '—';
      toast(e.message, 'error');
    }
  }

  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () { switchTab(tab.dataset.tab); });
  });

  document.querySelectorAll('.mode-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.mode-tab').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      dtcMode = btn.dataset.dtcMode;
    });
  });

  $('btn-serial').addEventListener('click', function () { connectTransport(OBDConnectors.serial); });
  $('btn-ble').addEventListener('click', function () { connectTransport(OBDConnectors.ble); });
  $('btn-bridge-connect').addEventListener('click', function () {
    var url = $('bridge-url').value.trim();
    connectTransport(function () { return OBDConnectors.websocket(url); });
  });
  $('btn-disconnect').addEventListener('click', disconnect);
  $('btn-start-live').addEventListener('click', startLive);
  $('btn-stop-live').addEventListener('click', stopLive);
  $('btn-read-dtc').addEventListener('click', readDTCs);
  $('btn-clear-dtc').addEventListener('click', clearDTCs);
  $('btn-read-vin').addEventListener('click', readVIN);
  $('btn-scan-all').addEventListener('click', scanAllModules);
  $('btn-module-back').addEventListener('click', closeModuleDetail);
  $('btn-read-module').addEventListener('click', readActiveModule);
  $('btn-clear-module').addEventListener('click', clearActiveModule);

  buildGauges();
  buildModuleGrid();
  if (window.TachometerModule) {
    TachometerModule.init(function () { return elm; });
  }

  if (isIOS()) {
    $('ios-banner').hidden = false;
    if (!('serial' in navigator)) {
      $('btn-serial').disabled = true;
      $('btn-serial').querySelector('small').textContent = 'No disponible en iOS';
    }
    if (!navigator.bluetooth) {
      $('btn-ble').disabled = true;
      $('btn-ble').querySelector('small').textContent = 'No disponible en Safari iOS';
    }
  } else {
    if (!('serial' in navigator)) {
      $('btn-serial').disabled = true;
      $('btn-serial').querySelector('small').textContent = 'No soportado en este navegador';
    }
    if (!navigator.bluetooth) {
      $('btn-ble').disabled = true;
      $('btn-ble').querySelector('small').textContent = 'No soportado en Safari';
    }
  }
})();
