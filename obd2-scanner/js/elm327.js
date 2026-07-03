(function (global) {
  'use strict';

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function Elm327(transport) {
    this.transport = transport;
    this.buffer = '';
    this.prompt = '>';
    this.protocol = null;
    this.adapterInfo = null;
  }

  Elm327.prototype._onData = function (chunk) {
    this.buffer += chunk;
  };

  Elm327.prototype.connect = async function () {
    var self = this;
    this.buffer = '';
    this.transport.onData(function (d) { self._onData(d); });
    await this.transport.open();
    await sleep(300);
    return this.init();
  };

  Elm327.prototype.disconnect = async function () {
    this.protocol = null;
    await this.transport.close();
  };

  Elm327.prototype._waitPrompt = function (timeoutMs) {
    var self = this;
    timeoutMs = timeoutMs || 3000;
    return new Promise(function (resolve, reject) {
      var t0 = Date.now();
      (function poll() {
        var idx = self.buffer.indexOf(self.prompt);
        if (idx >= 0) {
          var raw = self.buffer.slice(0, idx).trim();
          self.buffer = self.buffer.slice(idx + 1);
          resolve(raw);
          return;
        }
        if (Date.now() - t0 > timeoutMs) {
          reject(new Error('Timeout ELM327'));
          return;
        }
        setTimeout(poll, 30);
      })();
    });
  };

  Elm327.prototype.send = async function (cmd, timeoutMs) {
    this.buffer = '';
    await this.transport.write(cmd + '\r');
    var resp = await this._waitPrompt(timeoutMs || 3000);
    return resp.replace(/\r/g, '\n').replace(/\n+/g, '\n').trim();
  };

  Elm327.prototype.init = async function () {
    var log = [];
    var steps = [
      ['ATZ', 5000],
      ['ATE0', 2000],
      ['ATL0', 2000],
      ['ATS0', 2000],
      ['ATH0', 2000],
      ['ATSP0', 2000]
    ];
    for (var i = 0; i < steps.length; i++) {
      var cmd = steps[i][0];
      var to = steps[i][1];
      try {
        var r = await this.send(cmd, to);
        log.push(cmd + ' → ' + (r || '(ok)').split('\n')[0]);
      } catch (e) {
        log.push(cmd + ' → ERROR: ' + e.message);
      }
      await sleep(120);
    }
    try {
      this.adapterInfo = await this.send('ATI', 2000);
      log.push('ATI → ' + this.adapterInfo.split('\n')[0]);
    } catch (e) { /* optional */ }
    try {
      var dp = await this.send('ATDPN', 3000);
      this.protocol = dp.split('\n').pop();
      log.push('Protocolo: ' + this.protocol);
    } catch (e) { /* optional */ }
    return log;
  };

  Elm327.prototype.readPID = async function (pid) {
    var cmd = '01' + pid.toUpperCase();
    var resp = await this.send(cmd, 4000);
    return parsePIDResponse(resp, pid);
  };

  Elm327.prototype.readDTCs = async function () {
    var resp = await this.send('03', 8000);
    return parseDTCResponse(resp);
  };

  Elm327.prototype.clearDTCs = async function () {
    return this.send('04', 5000);
  };

  Elm327.prototype.readVIN = async function () {
    var resp = await this.send('0902', 10000);
    return parseVIN(resp);
  };

  Elm327.prototype.setHeader = async function (header) {
    await this.send('AT SH ' + header, 2000);
  };

  Elm327.prototype.resetHeader = async function () {
    await this.send('AT AR', 2000);
  };

  Elm327.prototype.readModuleDTCs = async function (mod, modeKey) {
    modeKey = modeKey || 'stored';
    var mode = global.DTC_MODES[modeKey];
    if (!mode) throw new Error('Modo DTC inválido');
    await this.setHeader(mod.header);
    var resp = await this.send(mode.cmd, 8000);
    var codes = parseDTCResponse(resp);
    await this.resetHeader();
    return codes;
  };

  Elm327.prototype.clearModuleDTCs = async function (mod) {
    await this.setHeader(mod.header);
    var resp = await this.send(mod.clearMode || '04', 5000);
    await this.resetHeader();
    return resp;
  };

  Elm327.prototype.scanAllModules = async function (onProgress) {
    var results = [];
    for (var i = 0; i < global.OBD_MODULES.length; i++) {
      var mod = global.OBD_MODULES[i];
      if (onProgress) onProgress(mod, i + 1, global.OBD_MODULES.length);
      var entry = { module: mod, stored: [], pending: [], permanent: [], error: null };
      try {
        entry.stored = await this.readModuleDTCs(mod, 'stored');
        await sleep(80);
        entry.pending = await this.readModuleDTCs(mod, 'pending');
        await sleep(80);
        try {
          entry.permanent = await this.readModuleDTCs(mod, 'permanent');
        } catch (e) { /* no todos soportan 0A */ }
      } catch (e) {
        entry.error = e.message;
      }
      results.push(entry);
      await sleep(100);
    }
    return results;
  };

  Elm327.prototype.readModuleInfo = async function (mod) {
    await this.setHeader(mod.header);
    var info = { module: mod, pids: {} };
    var sample = ['0C', '0D', '05'];
    for (var i = 0; i < sample.length; i++) {
      try {
        var r = await this.readPID(sample[i]);
        if (r) info.pids[sample[i]] = r.value;
      } catch (e) { /* skip */ }
    }
    await this.resetHeader();
    return info;
  };

  Elm327.prototype.readRPM = async function () {
    var r = await this.readPID('0C');
    return r ? r.value : null;
  };

  Elm327.prototype.readOdometer = async function () {
    var attempts = [
      { fn: readOdometerPID.bind(null, this), source: 'PID 01A6 (OBD)' },
      { fn: readOdometerUDS.bind(null, this, '720', 'F190'), source: 'UDS F190 (Tablero IC)' },
      { fn: readOdometerUDS.bind(null, this, '720', 'DD01'), source: 'UDS DD01 (Tablero)' },
      { fn: readOdometerUDS.bind(null, this, '720', 'B012'), source: 'UDS B012 (Tablero)' },
      { fn: readOdometerUDS.bind(null, this, '7E0', 'F190'), source: 'UDS F190 (ECM)' }
    ];
    for (var i = 0; i < attempts.length; i++) {
      try {
        var km = await attempts[i].fn();
        if (km != null && km >= 0) return { km: km, source: attempts[i].source };
      } catch (e) { /* next */ }
    }
    return null;
  };

  Elm327.prototype.writeOdometer = async function (km, did, options) {
    options = options || {};
    did = (did || 'F190').toUpperCase().replace(/[^0-9A-F]/g, '');
    var header = options.header || '720';
    var bytes = encodeOdometerKm(Math.round(km));
    var log = [];

    await this.setHeader(header);

    try {
      await this.send('1003', 4000);
      log.push('Sesión diagnóstico extendida (10 03)');

      if (options.workshopUnlock !== false) {
        var unlock = await this.securityAccessUnlock(header, options.levels);
        log.push('Security Access OK — ' + unlock.method + ' · nivel ' + unlock.level);
      }

      await this.send('3E00', 2000);
      var resp = await this.send('2E' + did + bytes, 12000);
      log.push('Write 2E' + did + ' → ' + (resp.split('\n')[0] || 'OK'));

      if (/NO DATA|ERROR|7F2E/i.test(resp)) {
        throw new Error('ECU rechazó escritura: ' + resp.split('\n')[0]);
      }

      var verify = await this.send('22' + did, 6000);
      log.push('Verificación 22' + did + ' OK');

      await this.send('1001', 2000);
      return { resp: resp, verify: verify, log: log };
    } finally {
      await this.resetHeader();
    }
  };

  Elm327.prototype.securityAccessUnlock = async function (header, levels) {
    levels = levels || global.UDSSecurity.DEFAULT_LEVELS;
    var lastErr = 'Sin respuesta del ECU';

    for (var li = 0; li < levels.length; li++) {
      var level = levels[li];
      var reqSub = level * 2 - 1;
      var resSub = level * 2;

      try {
        await this.send('1003', 3000);
        var seedResp = await this.send('27' + padHex(reqSub), 6000);
        var seed = global.UDSSecurity.parseSeed(seedResp, reqSub);

        if (!seed) {
          lastErr = 'Nivel ' + level + ': seed no recibido';
          continue;
        }

        var candidates = global.UDSSecurity.keyCandidates(seed);
        for (var ci = 0; ci < candidates.length; ci++) {
          var cand = candidates[ci];
          var keyHex = global.UDSSecurity.bytesToHex(cand.key);
          var keyResp = await this.send('27' + padHex(resSub) + keyHex, 6000);
          if (global.UDSSecurity.isUnlocked(keyResp, resSub)) {
            return { level: level, method: cand.name, seed: seed };
          }
          await sleep(60);
        }
        lastErr = 'Nivel ' + level + ': ningún algoritmo coincidió';
      } catch (e) {
        lastErr = e.message;
      }
      await sleep(100);
    }

    throw new Error('Security Access UDS falló — ' + lastErr);
  };

  Elm327.prototype.clearModuleDTCsProtected = async function (mod) {
    await this.setHeader(mod.header);
    try {
      await this.send('1003', 3000);
      try {
        await this.securityAccessUnlock(mod.header, [1, 3, 5]);
      } catch (e) { /* algunos módulos no requieren unlock para 04 */ }
      var resp = await this.send(mod.clearMode || '04', 5000);
      await this.send('1001', 2000);
      return resp;
    } finally {
      await this.resetHeader();
    }
  };

  function readOdometerPID(elm) {
    return elm.readPID('A6').then(function (r) {
      if (!r || r.raw.length < 3) return null;
      var b = r.raw;
      return ((b[0] * 65536) + (b[1] * 256) + b[2]) / 10;
    });
  }

  async function readOdometerUDS(elm, header, did) {
    await elm.setHeader(header);
    var resp = await elm.send('22' + did, 6000);
    await elm.resetHeader();
    return parseOdometerUDS(resp, did);
  }

  function parseOdometerUDS(raw, did) {
    var hex = raw.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    var marker = '62' + did.toUpperCase();
    var idx = hex.indexOf(marker);
    if (idx < 0) return null;
    var data = hex.slice(idx + marker.length);
    if (data.length < 6) return null;
    var b0 = parseInt(data.slice(0, 2), 16);
    var b1 = parseInt(data.slice(2, 4), 16);
    var b2 = parseInt(data.slice(4, 6), 16);
    if (did.toUpperCase() === 'F190' || did.toUpperCase() === 'DD01') {
      return (b0 * 65536 + b1 * 256 + b2) / 10;
    }
    return b0 * 65536 + b1 * 256 + b2;
  }

  function encodeOdometerKm(km) {
    var tenths = Math.round(km * 10);
    var b0 = (tenths >> 16) & 0xFF;
    var b1 = (tenths >> 8) & 0xFF;
    var b2 = tenths & 0xFF;
    return padHex(b0) + padHex(b1) + padHex(b2);
  }

  function padHex(n) {
    var s = n.toString(16).toUpperCase();
    return s.length < 2 ? '0' + s : s;
  }

  function parsePIDResponse(raw, pid) {
    var hex = raw.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    var marker = '41' + pid.toUpperCase();
    var idx = hex.indexOf(marker);
    if (idx < 0) return null;
    var data = hex.slice(idx + marker.length);
    var bytes = [];
    for (var i = 0; i + 1 < data.length && bytes.length < 4; i += 2) {
      bytes.push(parseInt(data.slice(i, i + 2), 16));
    }
    if (!bytes.length) return null;
    var def = global.OBD_PID_MAP[pid.toUpperCase()];
    if (!def) return { raw: bytes, value: bytes[0] };
    return { raw: bytes, value: def.fmt(bytes) };
  }

  function parseVIN(raw) {
    var hex = raw.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    var idx = hex.indexOf('4902');
    if (idx < 0) return null;
    var data = hex.slice(idx + 6);
    var vin = '';
    for (var i = 0; i + 1 < data.length && vin.length < 17; i += 2) {
      var c = parseInt(data.slice(i, i + 2), 16);
      if (c >= 32 && c <= 126) vin += String.fromCharCode(c);
    }
    return vin.length >= 11 ? vin : null;
  }

  global.Elm327 = Elm327;
})(window);
