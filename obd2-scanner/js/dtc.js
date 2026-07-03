/* DTC descriptions — subset común OBD-II */
window.DTC_DB = {
  P0100: 'Flujo de aire MAF — circuito',
  P0101: 'Flujo de aire MAF — rango/rendimiento',
  P0102: 'Flujo de aire MAF — señal baja',
  P0103: 'Flujo de aire MAF — señal alta',
  P0110: 'Sensor temp. admisión — circuito',
  P0113: 'Sensor temp. admisión — señal alta',
  P0115: 'Sensor temp. refrigerante — circuito',
  P0118: 'Sensor temp. refrigerante — señal alta',
  P0120: 'Sensor posición acelerador — circuito',
  P0130: 'Sensor O2 B1S1 — circuito',
  P0131: 'Sensor O2 B1S1 — señal baja',
  P0132: 'Sensor O2 B1S1 — señal alta',
  P0171: 'Mezcla pobre — banco 1',
  P0172: 'Mezcla rica — banco 1',
  P0174: 'Mezcla pobre — banco 2',
  P0175: 'Mezcla rica — banco 2',
  P0300: 'Fallo de encendido múltiple detectado',
  P0301: 'Fallo encendido cilindro 1',
  P0302: 'Fallo encendido cilindro 2',
  P0303: 'Fallo encendido cilindro 3',
  P0304: 'Fallo encendido cilindro 4',
  P0420: 'Eficiencia catalizador banco 1',
  P0430: 'Eficiencia catalizador banco 2',
  P0440: 'Sistema EVAP — fallo',
  P0442: 'Fuga EVAP pequeña detectada',
  P0455: 'Fuga EVAP grande detectada',
  P0500: 'Sensor velocidad vehículo',
  P0505: 'Válvula control ralentí',
  P0506: 'Ralentí por debajo de lo esperado',
  P0507: 'Ralentí por encima de lo esperado',
  P0562: 'Voltaje sistema bajo',
  P0563: 'Voltaje sistema alto',
  P0700: 'Transmisión — fallo general',
  P0715: 'Sensor RPM entrada transmisión',
  P0720: 'Sensor RPM salida transmisión',
  P0730: 'Relación de marchas incorrecta',
  P0741: 'Embrague convertidor TCC — circuito',
  C0035: 'Sensor velocidad rueda delantera izq.',
  C0040: 'Sensor velocidad rueda delantera der.',
  C0045: 'Sensor velocidad rueda trasera izq.',
  C0050: 'Sensor velocidad rueda trasera der.',
  C0200: 'Módulo ABS — fallo interno',
  B1000: 'Módulo carrocería — fallo ECU',
  B1342: 'ECM no programada / inmovilizador',
  B1600: 'Airbag — luz de advertencia',
  B1620: 'Airbag conductor — circuito',
  B1650: 'Airbag acompañante — circuito',
  U0100: 'Pérdida comunicación ECM/PCM',
  U0101: 'Pérdida comunicación TCM',
  U0121: 'Pérdida comunicación ABS',
  U0126: 'Pérdida comunicación sensor de ángulo',
  U0140: 'Pérdida comunicación BCM',
  U0151: 'Pérdida comunicación restraints/airbag',
  U0155: 'Pérdida comunicación tablero',
  U0164: 'Pérdida comunicación HVAC',
  U0401: 'Datos inválidos del ECM'
};

window.describeDTC = function (code) {
  var c = (code || '').toUpperCase().replace(/\s/g, '');
  return window.DTC_DB[c] || 'Código de diagnóstico — consulta manual del fabricante';
};

window.parseDTCResponse = function (hex) {
  var clean = hex.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  if (clean.length < 4) return [];
  var codes = [];
  var data = clean;
  ['43', '47', '4A'].forEach(function (pfx) {
    var i = data.indexOf(pfx);
    if (i >= 0) { data = data.slice(i + 2); return; }
  });
  if (data.indexOf('03') === 0 || data.indexOf('07') === 0) data = data.slice(2);
  var i = 0;
  while (i + 3 < data.length) {
    var b1 = parseInt(data.slice(i, i + 2), 16);
    var b2 = parseInt(data.slice(i + 2, i + 4), 16);
    i += 4;
    if (b1 === 0 && b2 === 0) continue;
    var type = ['P', 'C', 'B', 'U'][(b1 >> 6) & 3];
    var d1 = ((b1 >> 4) & 3).toString();
    var d2 = (b1 & 0x0F).toString(16).toUpperCase();
    var d3 = (b2 >> 4).toString(16).toUpperCase();
    var d4 = (b2 & 0x0F).toString(16).toUpperCase();
    codes.push(type + d1 + d2 + d3 + d4);
  }
  return codes;
};
