/* OBD-II Mode 01 PIDs — SAE J1979 */
window.OBD_PIDS = [
  { pid: '0C', name: 'RPM', unit: 'rpm', fmt: function (b) { return ((b[0] * 256 + b[1]) / 4); }, max: 8000 },
  { pid: '0D', name: 'Velocidad', unit: 'km/h', fmt: function (b) { return b[0]; }, max: 260 },
  { pid: '05', name: 'Temp. motor', unit: '°C', fmt: function (b) { return b[0] - 40; }, max: 130 },
  { pid: '0F', name: 'Temp. admisión', unit: '°C', fmt: function (b) { return b[0] - 40; }, max: 80 },
  { pid: '11', name: 'Acelerador', unit: '%', fmt: function (b) { return (b[0] * 100 / 255); }, max: 100 },
  { pid: '04', name: 'Carga motor', unit: '%', fmt: function (b) { return (b[0] * 100 / 255); }, max: 100 },
  { pid: '10', name: 'Flujo MAF', unit: 'g/s', fmt: function (b) { return ((b[0] * 256 + b[1]) / 100); }, max: 300 },
  { pid: '42', name: 'Voltaje', unit: 'V', fmt: function (b) { return ((b[0] * 256 + b[1]) / 1000); }, max: 16 },
  { pid: '2F', name: 'Combustible', unit: '%', fmt: function (b) { return (b[0] * 100 / 255); }, max: 100 },
  { pid: '06', name: 'Mezcla STFT', unit: '%', fmt: function (b) { return ((b[0] - 128) * 100 / 128); }, max: 25, signed: true },
  { pid: '07', name: 'Mezcla LTFT', unit: '%', fmt: function (b) { return ((b[0] - 128) * 100 / 128); }, max: 25, signed: true }
];

window.OBD_PID_MAP = {};
window.OBD_PIDS.forEach(function (p) { window.OBD_PID_MAP[p.pid] = p; });
