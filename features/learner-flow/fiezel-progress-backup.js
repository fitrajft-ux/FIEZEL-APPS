/**
 * FIEZEL Progress Backup — export & import progres tanpa sandi (backup manual), pratinjau
 * sebelum restore, penjelasan data yang tersimpan, dan tombol hapus semua data.
 * Tidak ada network I/O: berkas JSON dibuat dan dibaca di perangkat pengguna sendiri.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FiezelProgressBackup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* m025-265 · sapuan kebocoran Thai: naskah di berkas ini dulu literal Indonesia,
     jadi murid yang memilih th tetap membacanya dalam bahasa Indonesia. t() fail-soft:
     kalau copy-map belum termuat, fallback id-lah yang tampil. */
  function t(k, fb) { try { var I = (typeof self !== 'undefined' ? self : this).FiezelI18n; return I && I.t ? I.t(k) : fb; } catch (_) { return fb; } }

  var SCHEMA = 'fiezel-progress-export-v1';
  var PREFIX = 'fiezel';

  var GROUPS = [
    { id: 'core', test: function (k) { return /^fiezel-state/.test(k) || k === 'fiezel-legacy-state-owner'; }, label: 'Progres belajar utama', desc: 'Riwayat jawaban, level aktif, streak, sesi, dan preferensi belajar.' },
    { id: 'learner', test: function (k) { return /^fiezel-learner-/.test(k); }, label: 'Alur belajar (diagnostic, rencana, lesson)', desc: 'Tujuan belajar, hasil 5 soal diagnostic, rencana hari ini, dan lesson yang selesai.' },
    { id: 'tutor', test: function (k) { return /^fiezel-tutor-center/.test(k); }, label: 'Tutor Action Center', desc: t('backup.grup-tutor-desc', 'Kelas, daftar murid (nama depan), pola kesalahan, dan sesi review yang dikirim.') },
    { id: 'brain', test: function (k) { return /^fiezel-(bkt|confusion|misconception|retention|brain|item-calibration|olm|srl|sl-v1|daily|continuity|evidence|policy|social)/.test(k); }, label: 'Buku besar adaptif', desc: 'Estimasi penguasaan per skill, pola miskonsepsi, dan jadwal review.' },
    { id: 'prefs', test: function () { return true; }, label: t('backup.grup-prefs-label', 'Pengaturan perangkat'), desc: 'Bahasa, suara, pengingat, dan penanda onboarding.' }
  ];

  function keys(storage) {
    var out = [];
    for (var i = 0; i < storage.length; i++) {
      var k = storage.key(i);
      if (k && k.indexOf(PREFIX) === 0) out.push(k);
    }
    return out.sort();
  }

  function groupOf(key) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].test(key)) return GROUPS[i];
    return GROUPS[GROUPS.length - 1];
  }

  function collect(storage, meta) {
    var m = meta || {}, data = {};
    keys(storage).forEach(function (k) { data[k] = storage.getItem(k); });
    return { schema: SCHEMA, createdAt: new Date(m.now || Date.now()).toISOString(), appVersion: String(m.appVersion || ''), keyCount: Object.keys(data).length, data: data };
  }

  function bytes(str) { return str == null ? 0 : String(str).length; }

  /** Penjelasan isi: kelompok data, jumlah kunci, ukuran — untuk dibaca sebelum export/restore. */
  function describe(payload) {
    var data = (payload && payload.data) || {}, rows = {};
    Object.keys(data).forEach(function (k) {
      var gr = groupOf(k);
      rows[gr.id] = rows[gr.id] || { id: gr.id, label: gr.label, desc: gr.desc, keys: 0, bytes: 0 };
      rows[gr.id].keys += 1; rows[gr.id].bytes += bytes(data[k]);
    });
    return GROUPS.map(function (g) { return rows[g.id]; }).filter(Boolean);
  }

  /** Pratinjau restore: tidak mengubah apa pun, hanya menjelaskan apa yang akan terjadi. */
  function preview(payload, storage) {
    if (!payload || payload.schema !== SCHEMA || !payload.data || typeof payload.data !== 'object') return { ok: false, reason: 'Berkas bukan backup progres FIEZEL (schema tidak dikenal).' };
    var incoming = Object.keys(payload.data), current = keys(storage);
    var added = [], replaced = [], same = [], keptLocal = [];
    incoming.forEach(function (k) {
      var cur = storage.getItem(k);
      if (cur == null) added.push(k); else if (cur === payload.data[k]) same.push(k); else replaced.push(k);
    });
    current.forEach(function (k) { if (incoming.indexOf(k) === -1) keptLocal.push(k); });
    return { ok: true, createdAt: payload.createdAt || '', appVersion: payload.appVersion || '', added: added, replaced: replaced, same: same, keptLocal: keptLocal, groups: describe(payload) };
  }

  /** Menimpa kunci yang ada di berkas; kunci lokal yang tidak ada di berkas dibiarkan. */
  function restore(payload, storage) {
    var p = preview(payload, storage);
    if (!p.ok) return p;
    Object.keys(payload.data).forEach(function (k) { storage.setItem(k, String(payload.data[k])); });
    return { ok: true, written: p.added.length + p.replaced.length };
  }

  function wipeAll(storage) {
    var list = keys(storage);
    list.forEach(function (k) { storage.removeItem(k); });
    return { ok: true, removed: list.length };
  }

  function filename(now) { return 'fiezel-progres-' + new Date(now || Date.now()).toISOString().slice(0, 10) + '.json'; }

  function fmtBytes(n) { return n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB'; }

  return { SCHEMA: SCHEMA, keys: keys, collect: collect, describe: describe, preview: preview, restore: restore, wipeAll: wipeAll, filename: filename, fmtBytes: fmtBytes, groupOf: groupOf };
});
