/* Módulos ECU — headers CAN ISO 15765 (ELM327 AT SH) */
window.OBD_MODULES = [
  { id: 'engine', name: 'Motor / ECM', short: 'ECM', icon: '⚙️', header: '7E0', rx: '7E8', clearMode: '04' },
  { id: 'transmission', name: 'Transmisión / TCM', short: 'TCM', icon: '⚡', header: '7E1', rx: '7E9', clearMode: '04' },
  { id: 'abs', name: 'ABS / Frenos', short: 'ABS', icon: '🛑', header: '7B0', rx: '7B8', clearMode: '04' },
  { id: 'airbag', name: 'Airbag / SRS', short: 'SRS', icon: '🛡️', header: '7C0', rx: '7C8', clearMode: '04' },
  { id: 'body', name: 'Carrocería / BCM', short: 'BCM', icon: '🚗', header: '726', rx: '72E', clearMode: '04' },
  { id: 'hvac', name: 'Clima / HVAC', short: 'HVAC', icon: '❄️', header: '733', rx: '73B', clearMode: '04' },
  { id: 'tpms', name: 'TPMS / Presión', short: 'TPMS', icon: '⭕', header: '7D0', rx: '7D8', clearMode: '04' },
  { id: 'steering', name: 'Dirección / EPS', short: 'EPS', icon: '🎯', header: '730', rx: '738', clearMode: '04' },
  { id: 'cluster', name: 'Tablero / IC', short: 'IC', icon: '📊', header: '720', rx: '728', clearMode: '04' },
  { id: 'gateway', name: 'Gateway / Red CAN', short: 'GW', icon: '🔗', header: '710', rx: '718', clearMode: '04' },
  { id: 'immobilizer', name: 'Inmovilizador / SKIM', short: 'SKIM', icon: '🔐', header: '7A0', rx: '7A8', clearMode: '04' },
  { id: 'hybrid', name: 'Híbrido / Batería', short: 'BMS', icon: '🔋', header: '7E2', rx: '7EA', clearMode: '04' },
  { id: 'parking', name: 'Asist. estacionamiento', short: 'PAM', icon: '📷', header: '7B6', rx: '7BE', clearMode: '04' },
  { id: 'radio', name: 'Multimedia / Radio', short: 'RADIO', icon: '📻', header: '7F0', rx: '7F8', clearMode: '04' }
];

window.OBD_MODULE_MAP = {};
window.OBD_MODULES.forEach(function (m) { window.OBD_MODULE_MAP[m.id] = m; });

window.DTC_MODES = {
  stored: { cmd: '03', label: 'Almacenados', prefix: '43' },
  pending: { cmd: '07', label: 'Pendientes', prefix: '47' },
  permanent: { cmd: '0A', label: 'Permanentes', prefix: '4A' }
};
