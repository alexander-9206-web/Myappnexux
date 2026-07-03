(function (global) {
  'use strict';

  /* UDS Security Access (ISO 14229) — flujo estándar taller autorizado */

  function hexClean(raw) {
    return raw.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  }

  function parseSeed(raw, requestSub) {
    var hex = hexClean(raw);
    var sub = pad2(requestSub);
    var markers = ['67' + sub, '670' + requestSub];
    for (var i = 0; i < markers.length; i++) {
      var idx = hex.indexOf(markers[i]);
      if (idx >= 0) {
        var data = hex.slice(idx + markers[i].length);
        var seed = [];
        for (var j = 0; j + 1 < data.length && seed.length < 8; j += 2) {
          seed.push(parseInt(data.slice(j, j + 2), 16));
        }
        if (seed.length) return seed;
      }
    }
    if (/NO DATA|ERROR|7F27/i.test(hex)) return null;
    return null;
  }

  function isUnlocked(raw, responseSub) {
    var hex = hexClean(raw);
    var sub = pad2(responseSub);
    return hex.indexOf('67' + sub) >= 0 && hex.indexOf('7F27') < 0;
  }

  function pad2(n) {
    var s = n.toString(16).toUpperCase();
    return s.length < 2 ? '0' + s : s;
  }

  function bytesToHex(bytes) {
    return bytes.map(function (b) { return pad2(b & 0xFF); }).join('');
  }

  function rotLeft8(v, n) {
    n = n & 7;
    return ((v << n) | (v >> (8 - n))) & 0xFF;
  }

  function keyCandidates(seed) {
    var list = [];
    function add(name, bytes) {
      list.push({ name: name, key: bytes.slice(0, Math.max(seed.length, 2)) });
    }

    add('xor_ff', seed.map(function (b) { return (b ^ 0xFF) & 0xFF; }));
    add('xor_aa', seed.map(function (b) { return (b ^ 0xAA) & 0xFF; }));
    add('add_47', seed.map(function (b) { return (b + 0x47) & 0xFF; }));
    add('sub_17', seed.map(function (b) { return (b - 0x17) & 0xFF; }));
    add('rot1_xor', seed.map(function (b) { return (rotLeft8(b, 1) ^ 0x55) & 0xFF; }));

    if (seed.length >= 2) {
      var s0 = seed[0], s1 = seed[1];
      add('vag_v1', [((s0 + 0x33) ^ 0x55) & 0xFF, ((s1 + 0x33) ^ 0x55) & 0xFF]);
      add('vag_v2', [(s0 ^ 0xC3) & 0xFF, (s1 ^ 0xC3) & 0xFF]);
      add('psa_v1', [((s0 * 2) + 0x12) & 0xFF, ((s1 * 2) + 0x12) & 0xFF]);
      add('gm_v1', [rotLeft8(s0, 3) ^ 0x91, rotLeft8(s1, 3) ^ 0x91]);
      add('bmw_v1', [((s0 << 1) | (s0 >> 7)) ^ 0xA5, ((s1 << 1) | (s1 >> 7)) ^ 0xA5]);
      add('ford_v1', [(s0 + s1 + 0x27) & 0xFF, (s0 ^ s1 ^ 0x4B) & 0xFF]);
    }

    if (seed.length === 4) {
      add('quad_xor', [
        (seed[0] ^ seed[2] ^ 0x12) & 0xFF,
        (seed[1] ^ seed[3] ^ 0x34) & 0xFF,
        (seed[0] + seed[1]) & 0xFF,
        (seed[2] + seed[3]) & 0xFF
      ]);
    }

    if (seed.length === 1) {
      add('single_vag', [((seed[0] + 0x33) ^ 0x55) & 0xFF]);
    }

    return list;
  }

  global.UDSSecurity = {
    parseSeed: parseSeed,
    isUnlocked: isUnlocked,
    keyCandidates: keyCandidates,
    bytesToHex: bytesToHex,
    DEFAULT_LEVELS: [1, 3, 5, 7, 11, 17, 19]
  };
})(window);
