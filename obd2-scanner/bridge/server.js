#!/usr/bin/env node
/**
 * Puente local OBD2 — conecta MY327 / ELM327 (Bluetooth Classic o WiFi) al navegador vía WebSocket.
 *
 * Uso:
 *   npm install
 *   node bridge/server.js                    # BT Classic (empareja MY327 antes)
 *   node bridge/server.js --wifi             # WiFi ELM327 (192.168.0.10:35000)
 *   node bridge/server.js --port /dev/rfcomm0  # Puerto serial BT en Linux
 */
'use strict';

var WebSocket = require('ws');
var net = require('net');

var args = process.argv.slice(2);
var useWifi = args.indexOf('--wifi') >= 0;
var portIdx = args.indexOf('--port');
var serialPort = portIdx >= 0 ? args[portIdx + 1] : null;
var WS_PORT = 8765;
var WIFI_HOST = process.env.OBD_WIFI_HOST || '192.168.0.10';
var WIFI_PORT = parseInt(process.env.OBD_WIFI_PORT || '35000', 10);

var obdSocket = null;
var wss = new WebSocket.Server({ port: WS_PORT });

function log(msg) {
  console.log('[OBD2-Bridge] ' + msg);
}

function connectWifi() {
  return new Promise(function (resolve, reject) {
    var s = net.createConnection({ host: WIFI_HOST, port: WIFI_PORT }, function () {
      log('WiFi ELM327 conectado ' + WIFI_HOST + ':' + WIFI_PORT);
      resolve(s);
    });
    s.on('error', reject);
    setTimeout(function () { reject(new Error('Timeout WiFi OBD2')); }, 10000);
  });
}

function connectSerial() {
  var SerialPort = require('serialport').SerialPort;
  var path = serialPort || process.env.OBD_SERIAL || '/dev/rfcomm0';
  var sp = new SerialPort({ path: path, baudRate: 38400 });
  return sp.open().then(function () {
    log('Serial conectado ' + path);
    return sp;
  });
}

async function getTransport() {
  if (useWifi) return connectWifi();
  return connectSerial();
}

function pipeOBD(ws) {
  obdSocket.on('data', function (chunk) {
    if (ws.readyState === 1) ws.send(chunk.toString());
  });
  ws.on('message', function (msg) {
    if (obdSocket && obdSocket.writable) obdSocket.write(String(msg));
  });
  ws.on('close', function () {
    log('Cliente WebSocket desconectado');
  });
}

wss.on('connection', async function (ws) {
  log('Cliente WebSocket conectado');
  if (obdSocket) {
    pipeOBD(ws);
    return;
  }
  try {
    obdSocket = await getTransport();
    pipeOBD(ws);
  } catch (e) {
    log('Error OBD: ' + e.message);
    ws.send('ERROR: ' + e.message);
    ws.close();
  }
});

log('WebSocket en ws://localhost:' + WS_PORT);
log(useWifi
  ? 'Modo WiFi → ' + WIFI_HOST + ':' + WIFI_PORT
  : 'Modo Serial/BT → ' + (serialPort || '/dev/rfcomm0'));

process.on('SIGINT', function () {
  if (obdSocket) obdSocket.destroy();
  process.exit(0);
});
