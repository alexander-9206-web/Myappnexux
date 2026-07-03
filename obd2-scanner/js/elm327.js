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
