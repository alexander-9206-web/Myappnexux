(function (global) {
  'use strict';

  function createSerialTransport() {
    var port = null;
    var reader = null;
    var writer = null;
    var onDataCb = null;
    var readLoop = null;

    return {
      name: 'USB Serial',
      open: async function () {
        if (!('serial' in navigator)) throw new Error('Web Serial no disponible. Usa Chrome/Edge.');
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 38400 });
        writer = port.writable.getWriter();
        var dec = new TextDecoder();
        reader = port.readable.getReader();
        readLoop = (async function () {
          try {
            while (true) {
              var r = await reader.read();
              if (r.done) break;
              if (onDataCb) onDataCb(dec.decode(r.value));
            }
          } catch (e) { /* closed */ }
        })();
      },
      close: async function () {
        try { if (reader) await reader.cancel(); } catch (e) {}
        try { if (writer) { writer.releaseLock(); await port.close(); } } catch (e) {}
        port = reader = writer = null;
      },
      write: async function (text) {
        if (!writer) throw new Error('Puerto cerrado');
        var enc = new TextEncoder();
        await writer.write(enc.encode(text));
      },
      onData: function (cb) { onDataCb = cb; }
    };
  }

  /* BLE ELM327 — servicio Nordic UART o genérico FFE0/FFE1 */
  function createBleTransport() {
    var device = null;
    var characteristic = null;
    var onDataCb = null;
    var SERVICE_UUIDS = [
      '0000ffe0-0000-1000-8000-00805f9b34fb',
      '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
    ];
    var CHAR_UUIDS = [
      '0000ffe1-0000-1000-8000-00805f9b34fb',
      '6e400003-b5a3-f393-e0a9-e50e24dcca9e'
    ];
    var WRITE_UUIDS = [
      '0000ffe1-0000-1000-8000-00805f9b34fb',
      '6e400002-b5a3-f393-e0a9-e50e24dcca9e'
    ];

    return {
      name: 'Bluetooth BLE',
      open: async function () {
        if (!navigator.bluetooth) throw new Error('Web Bluetooth no disponible en este navegador.');
        device = await navigator.bluetooth.requestDevice({
          filters: SERVICE_UUIDS.map(function (u) { return { services: [u] }; }),
          optionalServices: SERVICE_UUIDS
        });
        var server = await device.gatt.connect();
        var svc = null;
        for (var i = 0; i < SERVICE_UUIDS.length; i++) {
          try { svc = await server.getPrimaryService(SERVICE_UUIDS[i]); break; } catch (e) {}
        }
        if (!svc) throw new Error('Servicio BLE OBD2 no encontrado');
        var readChar = null;
        var writeChar = null;
        for (var j = 0; j < CHAR_UUIDS.length; j++) {
          try { readChar = await svc.getCharacteristic(CHAR_UUIDS[j]); break; } catch (e) {}
        }
        for (var k = 0; k < WRITE_UUIDS.length; k++) {
          try { writeChar = await svc.getCharacteristic(WRITE_UUIDS[k]); break; } catch (e) {}
        }
        if (!readChar || !writeChar) throw new Error('Características BLE no encontradas');
        characteristic = writeChar;
        await readChar.startNotifications();
        readChar.addEventListener('characteristicvaluechanged', function (ev) {
          if (onDataCb) onDataCb(new TextDecoder().decode(ev.target.value));
        });
      },
      close: async function () {
        try { if (device && device.gatt.connected) device.gatt.disconnect(); } catch (e) {}
        device = characteristic = null;
      },
      write: async function (text) {
        if (!characteristic) throw new Error('BLE desconectado');
        var enc = new TextEncoder();
        await characteristic.writeValue(enc.encode(text));
      },
      onData: function (cb) { onDataCb = cb; }
    };
  }

  function createWebSocketTransport(url) {
    var ws = null;
    var onDataCb = null;

    return {
      name: 'Puente MY327',
      open: async function () {
        ws = await new Promise(function (resolve, reject) {
          var s = new WebSocket(url);
          s.onopen = function () { resolve(s); };
          s.onerror = function () { reject(new Error('No se pudo conectar al puente ' + url)); };
          setTimeout(function () { reject(new Error('Timeout conectando al puente')); }, 8000);
        });
        ws.onmessage = function (ev) {
          if (onDataCb) onDataCb(String(ev.data));
        };
        ws.onclose = function () { ws = null; };
      },
      close: async function () {
        if (ws) { ws.close(); ws = null; }
      },
      write: async function (text) {
        if (!ws || ws.readyState !== 1) throw new Error('Puente desconectado');
        ws.send(text);
      },
      onData: function (cb) { onDataCb = cb; }
    };
  }

  global.OBDConnectors = {
    serial: createSerialTransport,
    ble: createBleTransport,
    websocket: createWebSocketTransport
  };
})(window);
