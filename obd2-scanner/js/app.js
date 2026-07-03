(function () {
  'use strict';

  var elm = null;
  var liveTimer = null;
  var liveRunning = false;

  var $ = function (id) { return document.getElementById(id); };

  function toast(msg, type) {
    var el = $('toast');
    el.textContent = msg;
    el.className = 'toast' + (type ? ' ' + type : '');
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.hidden = true; }, 3200);
  }

  function setConn(state, label) {
    $('conn-badge').dataset.state = state;
    $('conn-label').textContent = label;
  }

  function setConnected(on) {
    $('btn-disconnect').hidden = !on;
    $('btn-start-live').disabled = !on;
    $('btn-read-dtc').disabled = !on;
    $('btn-clear-dtc').disabled = !on;
    $('btn-read-vin').disabled = !on;
    document.querySelectorAll('.connect-btn').forEach(function (b) { b.disabled = on; });
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
      toast('Adaptador ELM327 listo', 'ok');
      switchTab('live');
    } catch (e) {
      elm = null;
      setConn('off', 'Desconectado');
      setConnected(false);
      toast(e.message || 'Error de conexión', 'error');
    }
  }

  async function disconnect() {
    stopLive();
    if (elm) {
      try { await elm.disconnect(); } catch (e) {}
      elm = null;
    }
    setConn('off', 'Desconectado');
    setConnected(false);
    toast('Desconectado');
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
        } catch (e) { /* skip pid */ }
        await new Promise(function (r) { setTimeout(r, 40); });
      }
      count++;
      var elapsed = (Date.now() - t0) / 1000;
      $('poll-rate').textContent = (count / elapsed).toFixed(1) + ' ciclos/s';
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
    list.innerHTML = '<p class="empty">Leyendo códigos…</p>';
    try {
      var codes = await elm.readDTCs();
      if (!codes.length) {
        list.innerHTML = '<div class="dtc-item ok"><span class="dtc-code">Sin códigos</span><div class="dtc-desc">No hay DTC activos almacenados.</div></div>';
      } else {
        list.innerHTML = '';
        codes.forEach(function (c) {
          var div = document.createElement('div');
          div.className = 'dtc-item';
          div.innerHTML = '<span class="dtc-code">' + c + '</span><div class="dtc-desc">' + describeDTC(c) + '</div>';
          list.appendChild(div);
        });
      }
      toast(codes.length ? codes.length + ' código(s) encontrado(s)' : 'Sin códigos DTC', 'ok');
    } catch (e) {
      list.innerHTML = '<p class="empty">Error: ' + e.message + '</p>';
      toast(e.message, 'error');
    }
    setConn('on', 'Conectado');
  }

  async function clearDTCs() {
    if (!elm) return;
    if (!confirm('¿Borrar todos los códigos DTC? El check engine se apagará si no hay fallos activos.')) return;
    setConn('busy', 'Borrando…');
    try {
      await elm.clearDTCs();
      $('dtc-list').innerHTML = '<div class="dtc-item ok"><span class="dtc-code">Limpiado</span><div class="dtc-desc">Códigos borrados correctamente.</div></div>';
      toast('Códigos borrados', 'ok');
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
      toast(vin ? 'VIN leído' : 'VIN no soportado por este ECU', vin ? 'ok' : 'error');
    } catch (e) {
      $('info-vin').textContent = '—';
      toast(e.message, 'error');
    }
  }

  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () { switchTab(tab.dataset.tab); });
  });

  $('btn-serial').addEventListener('click', function () {
    connectTransport(OBDConnectors.serial);
  });

  $('btn-ble').addEventListener('click', function () {
    connectTransport(OBDConnectors.ble);
  });

  $('btn-bridge').addEventListener('click', function () {
    $('bridge-config').hidden = !$('bridge-config').hidden;
  });

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

  buildGauges();

  if (!('serial' in navigator)) {
    $('btn-serial').disabled = true;
    $('btn-serial').querySelector('small').textContent = 'No soportado en este navegador';
  }
  if (!navigator.bluetooth) {
    $('btn-ble').disabled = true;
    $('btn-ble').querySelector('small').textContent = 'No soportado en Safari/iOS';
  }
})();
