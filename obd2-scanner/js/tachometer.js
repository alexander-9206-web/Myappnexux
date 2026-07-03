(function (global) {
  'use strict';

  var STORAGE_KEY = 'cardiag_tacho_config';
  var DEFAULTS = {
    maxRpm: 8000,
    redlineRpm: 6500,
    warnRpm: 5500,
    calibration: 0,
    theme: 'sport',
    needleColor: '#22d3ee',
    showDigital: true,
    smoothNeedle: true
  };

  function loadConfig() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return Object.assign({}, DEFAULTS, JSON.parse(raw));
    } catch (e) {}
    return Object.assign({}, DEFAULTS);
  }

  function saveConfig(cfg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }

  function themeColors(theme) {
    var map = {
      sport: { track: '#1e293b', arc: '#22d3ee', red: '#ef4444', text: '#e8eef7' },
      classic: { track: '#292524', arc: '#fbbf24', red: '#dc2626', text: '#fafaf9' },
      neon: { track: '#0f0520', arc: '#a855f7', red: '#f472b6', text: '#f5d0fe' }
    };
    return map[theme] || map.sport;
  }

  var TachometerModule = {
    config: loadConfig(),
    timer: null,
    running: false,
    currentRpm: 0,
    getElm: null,

    init: function (getElmFn) {
      this.getElm = getElmFn;
      this.config = loadConfig();
      this.applyConfigToUI();
      this.drawGauge(0);

      var self = this;
      document.getElementById('btn-tacho-start').addEventListener('click', function () { self.start(); });
      document.getElementById('btn-tacho-stop').addEventListener('click', function () { self.stop(); });
      document.getElementById('btn-tacho-edit').addEventListener('click', function () { self.toggleEditor(true); });
      document.getElementById('btn-tacho-save').addEventListener('click', function () { self.saveEditor(); });
      document.getElementById('btn-tacho-cancel').addEventListener('click', function () { self.toggleEditor(false); });
      document.getElementById('btn-odo-read').addEventListener('click', function () { self.readOdometer(); });
      document.getElementById('btn-odo-write').addEventListener('click', function () { self.writeOdometer(); });

      ['cfg-max-rpm', 'cfg-redline', 'cfg-warn', 'cfg-calibration', 'cfg-theme'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', function () { self.syncPreview(); });
      });
    },

    setConnected: function (on) {
      document.getElementById('btn-tacho-start').disabled = !on;
      document.getElementById('btn-odo-read').disabled = !on;
      document.getElementById('btn-odo-write').disabled = !on;
      if (!on) this.stop();
    },

    applyConfigToUI: function () {
      var c = this.config;
      document.getElementById('cfg-max-rpm').value = c.maxRpm;
      document.getElementById('cfg-redline').value = c.redlineRpm;
      document.getElementById('cfg-warn').value = c.warnRpm;
      document.getElementById('cfg-calibration').value = c.calibration;
      document.getElementById('cfg-theme').value = c.theme;
      document.getElementById('tacho-max-label').textContent = c.maxRpm;
      document.getElementById('tacho-redline-label').textContent = c.redlineRpm;
    },

    toggleEditor: function (show) {
      document.getElementById('tacho-editor').hidden = !show;
      document.getElementById('tacho-display').hidden = show;
      if (show) this.applyConfigToUI();
    },

    syncPreview: function () {
      var max = parseInt(document.getElementById('cfg-max-rpm').value, 10) || 8000;
      document.getElementById('tacho-max-label').textContent = max;
      document.getElementById('tacho-redline-label').textContent =
        document.getElementById('cfg-redline').value;
      this.drawGauge(this.currentRpm);
    },

    saveEditor: function () {
      var max = parseInt(document.getElementById('cfg-max-rpm').value, 10) || 8000;
      var red = parseInt(document.getElementById('cfg-redline').value, 10) || 6500;
      var warn = parseInt(document.getElementById('cfg-warn').value, 10) || 5500;
      this.config = {
        maxRpm: Math.max(2000, Math.min(12000, max)),
        redlineRpm: Math.max(1000, Math.min(max, red)),
        warnRpm: Math.max(1000, Math.min(red, warn)),
        calibration: parseInt(document.getElementById('cfg-calibration').value, 10) || 0,
        theme: document.getElementById('cfg-theme').value,
        needleColor: DEFAULTS.needleColor,
        showDigital: true,
        smoothNeedle: true
      };
      saveConfig(this.config);
      this.applyConfigToUI();
      this.drawGauge(this.currentRpm);
      this.toggleEditor(false);
      if (global.__tachoToast) global.__tachoToast('Configuración guardada', 'ok');
    },

    drawGauge: function (rpm) {
      var c = this.config;
      var colors = themeColors(c.theme);
      var max = c.maxRpm;
      var ratio = Math.max(0, Math.min(1, rpm / max));
      var startAngle = 135;
      var sweep = 270;
      var angle = startAngle + ratio * sweep;

      var svg = document.getElementById('tacho-svg');
      if (!svg) return;

      var cx = 120, cy = 120, r = 90;
      var redStart = c.redlineRpm / max;
      var warnStart = c.warnRpm / max;

      function polar(a, rad) {
        var radian = (a - 90) * Math.PI / 180;
        return { x: cx + rad * Math.cos(radian), y: cy + rad * Math.sin(radian) };
      }

      function arcPath(fromRatio, toRatio, rad) {
        var a1 = startAngle + fromRatio * sweep;
        var a2 = startAngle + toRatio * sweep;
        var p1 = polar(a1, rad);
        var p2 = polar(a2, rad);
        var large = (a2 - a1) > 180 ? 1 : 0;
        return 'M' + p1.x + ' ' + p1.y + ' A' + rad + ' ' + rad + ' 0 ' + large + ' 1 ' + p2.x + ' ' + p2.y;
      }

      svg.innerHTML =
        '<defs><filter id="glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r + 12) + '" fill="none" stroke="' + colors.track + '" stroke-width="18" opacity="0.35"/>' +
        '<path d="' + arcPath(0, 1, r) + '" fill="none" stroke="' + colors.track + '" stroke-width="14" stroke-linecap="round"/>' +
        '<path d="' + arcPath(warnStart, redStart, r) + '" fill="none" stroke="' + colors.arc + '" stroke-width="14" stroke-linecap="round" opacity="0.85"/>' +
        '<path d="' + arcPath(redStart, 1, r) + '" fill="none" stroke="' + colors.red + '" stroke-width="14" stroke-linecap="round"/>' +
        this.buildTicks(cx, cy, r, max, colors.text) +
        '<g transform="rotate(' + angle + ' ' + cx + ' ' + cy + ')" filter="url(#glow)">' +
        '<line x1="' + cx + '" y1="' + cy + '" x2="' + cx + '" y2="' + (cy - r + 18) + '" stroke="' + colors.arc + '" stroke-width="3" stroke-linecap="round"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="' + colors.arc + '"/>' +
        '</g>';

      document.getElementById('tacho-rpm-value').textContent = Math.round(rpm);
      document.getElementById('tacho-rpm-value').style.color =
        rpm >= c.redlineRpm ? colors.red : (rpm >= c.warnRpm ? colors.arc : colors.text);
      document.getElementById('tacho-status').textContent = this.running ? 'Lectura activa' : 'Detenido';
      document.getElementById('tacho-status').dataset.state = this.running ? 'on' : 'off';
    },

    buildTicks: function (cx, cy, r, max, color) {
      var html = '';
      var startAngle = 135;
      var sweep = 270;
      for (var i = 0; i <= 8; i++) {
        var ratio = i / 8;
        var rpm = Math.round(ratio * max);
        var angle = startAngle + ratio * sweep;
        var rad = (angle - 90) * Math.PI / 180;
        var x1 = cx + (r - 8) * Math.cos(rad);
        var y1 = cy + (r - 8) * Math.sin(rad);
        var x2 = cx + (r + 4) * Math.cos(rad);
        var y2 = cy + (r + 4) * Math.sin(rad);
        var lx = cx + (r + 18) * Math.cos(rad);
        var ly = cy + (r + 18) * Math.sin(rad);
        html += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + color + '" stroke-width="1.5" opacity="0.5"/>';
        if (i % 2 === 0) {
          html += '<text x="' + lx + '" y="' + ly + '" fill="' + color + '" font-size="10" text-anchor="middle" dominant-baseline="middle" opacity="0.7">' + rpm + '</text>';
        }
      }
      return html;
    },

    start: function () {
      var elm = this.getElm && this.getElm();
      if (!elm || this.running) return;
      this.running = true;
      document.getElementById('btn-tacho-start').hidden = true;
      document.getElementById('btn-tacho-stop').hidden = false;
      var self = this;
      async function poll() {
        if (!self.running) return;
        var e = self.getElm && self.getElm();
        if (!e) { self.stop(); return; }
        try {
          var r = await e.readRPM();
          if (r != null) {
            self.currentRpm = Math.max(0, r + self.config.calibration);
            self.drawGauge(self.currentRpm);
          }
        } catch (err) {}
        self.timer = setTimeout(poll, 120);
      }
      poll();
    },

    stop: function () {
      this.running = false;
      clearTimeout(this.timer);
      document.getElementById('btn-tacho-start').hidden = false;
      document.getElementById('btn-tacho-stop').hidden = true;
      this.drawGauge(this.currentRpm);
    },

    readOdometer: async function () {
      var elm = this.getElm && this.getElm();
      if (!elm) return;
      var el = document.getElementById('odo-value');
      el.textContent = 'Leyendo…';
      document.getElementById('odo-source').textContent = '';
      try {
        var result = await elm.readOdometer();
        if (result) {
          el.textContent = result.km.toLocaleString('es') + ' km';
          document.getElementById('odo-input').value = Math.round(result.km);
          document.getElementById('odo-source').textContent = 'Fuente: ' + result.source;
          if (global.__tachoToast) global.__tachoToast('Odómetro leído', 'ok');
        } else {
          el.textContent = 'No disponible';
          if (global.__tachoToast) global.__tachoToast('Odómetro no soportado en este tablero', 'error');
        }
      } catch (e) {
        el.textContent = 'Error';
        if (global.__tachoToast) global.__tachoToast(e.message, 'error');
      }
    },

    writeOdometer: async function () {
      var elm = this.getElm && this.getElm();
      if (!elm) return;
      var km = parseFloat(document.getElementById('odo-input').value);
      if (isNaN(km) || km < 0) {
        if (global.__tachoToast) global.__tachoToast('Kilometraje inválido', 'error');
        return;
      }
      var did = document.getElementById('odo-did').value;
      var workshop = document.getElementById('workshop-mode').checked;
      var order = document.getElementById('workshop-order').value.trim();
      var logEl = document.getElementById('workshop-log');

      if (!confirm(
        'Modo taller autorizado\n\n' +
        'Se ejecutará Security Access UDS (0x27) + sesión extendida + escritura 2E.\n\n' +
        (order ? 'Orden: ' + order + '\n\n' : '') +
        '¿Escribir ' + km + ' km (DID ' + did + ')?'
      )) return;

      logEl.hidden = false;
      logEl.textContent = 'Desbloqueando ECU tablero…\n';

      try {
        var result = await elm.writeOdometer(km, did, { workshopUnlock: workshop });
        document.getElementById('odo-value').textContent = km.toLocaleString('es') + ' km';
        logEl.textContent = (result.log || []).join('\n');
        if (order) logEl.textContent += '\nOrden: ' + order;
        if (global.__tachoToast) global.__tachoToast('Odómetro programado — verifica tablero', 'ok');
        await this.readOdometer();
      } catch (e) {
        logEl.textContent += '\nERROR: ' + e.message;
        if (global.__tachoToast) global.__tachoToast(e.message, 'error');
      }
    }
  };

  global.TachometerModule = TachometerModule;
})(window);
