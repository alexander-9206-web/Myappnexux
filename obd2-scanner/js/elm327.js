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
