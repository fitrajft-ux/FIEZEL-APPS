/**
 * FIEZEL — fiezel-inbox.js · KOTAK MASUK MURID (tugas dari guru + kabar lain).
 *
 * Pola berkas: fiezel-social-notify.js — mandiri, tanpa import, gagal DIAM.
 * Sumber kabar tugas: GET /api/learner/class-assignments (polling berkala, bukan push).
 * Tugas yang tiba langsung disimpan ke antrean Today Plan (FiezelTeacherStore.
 * acceptAssignmentPayload) supaya satu ketuk di notifikasi = sesi terbuka.
 */
(function (root) {
  'use strict';

  /* m025-265 · sapuan kebocoran Thai: naskah di berkas ini dulu literal Indonesia,
     jadi murid yang memilih th tetap membacanya dalam bahasa Indonesia. t() fail-soft:
     kalau copy-map belum termuat, fallback id-lah yang tampil. */
  function t(k, fb) { try { var I = (typeof self !== 'undefined' ? self : this).FiezelI18n; return I && I.t ? I.t(k) : fb; } catch (_) { return fb; } }

  var KEY = 'fiezel-inbox-v1';
  var MAX = 60;
  var RETENTION_MS = 30 * 86400000;
  var PATH = '/api/learner/class-assignments';
  var MIN_GAP_MS = 20000;
  var lastPollAt = 0, busy = false;

  function storage() { try { return root.localStorage || null; } catch (_) { return null; } }
  function load() {
    try { var raw = JSON.parse(storage().getItem(KEY)); if (raw && Array.isArray(raw.items)) { raw.cursor = raw.cursor || {}; return raw; } } catch (_) {}
    return { items: [], cursor: {} };
  }
  function save(d) { try { storage().setItem(KEY, JSON.stringify(d)); return true; } catch (_) { return false; } }
  function prune(list, now) {
    var t = now || Date.now();
    return list.filter(function (e) { return e && e.id && t - Number(e.at || 0) <= RETENTION_MS; })
      .sort(function (a, b) { return Number(b.at || 0) - Number(a.at || 0); }).slice(0, MAX);
  }

  function items() { return prune(load().items); }
  function unread() { return items().filter(function (e) { return !e.read; }).length; }
  function get(id) { return items().filter(function (e) { return e.id === id; })[0] || null; }
  function markRead(id) { var d = load(); d.items.forEach(function (e) { if (e.id === id) e.read = true; }); return save(d); }
  function markAllRead() { var d = load(); d.items.forEach(function (e) { e.read = true; }); return save(d); }
  function remove(id) { var d = load(); d.items = d.items.filter(function (e) { return e.id !== id; }); return save(d); }
  function clear() { return save({ items: [], cursor: load().cursor }); }
  /** Tambah/segarkan satu kabar. Kabar lama dengan id sama dan `at` lebih baru dibangunkan lagi (belum dibaca). */
  function add(entry) {
    if (!entry || !entry.id) return null;
    var d = load(), cur = d.items.filter(function (e) { return e.id === entry.id; })[0];
    if (cur) { if (Number(entry.at || 0) > Number(cur.at || 0)) { Object.assign(cur, entry, { read: false }); save(d); return cur; } return null; }
    var e = Object.assign({ at: Date.now(), read: false }, entry);
    d.items.unshift(e); d.items = prune(d.items); save(d);
    return e;
  }

  function classCode() { try { return String(JSON.parse(storage().getItem('fiezel-onboarding-v1') || '{}').classCode || ''); } catch (_) { return ''; } }
  function learnerName() {
    var n = '';
    try { if (typeof root.learnerName === 'function') n = String(root.learnerName() || ''); } catch (_) {}
    if (!n || /^(sobat|murid|teman)$/i.test(n)) { try { n = String(JSON.parse(storage().getItem('fiezel-onboarding-v1') || '{}').name || ''); } catch (_) {} }
    return n.trim().split(/\s+/)[0] || '';
  }
  function account() { var A = root.FiezelAccount; return A && typeof A.api === 'function' ? A : null; }
  function isTeacher() { try { return !!(root.FiezelAccount && root.FiezelAccount.isTeacher && root.FiezelAccount.isTeacher()); } catch (_) { return false; } }

  /**
   * Tarik tugas baru dari server. Mengembalikan Promise<{ added: [] } | null>.
   * Diam bila: offline, tanpa kode kelas, tanpa nama, akun guru, atau terlalu sering.
   */
  function poll(force) {
    var A = account(), cls = classCode(), name = learnerName();
    if (!A || !cls || !name || isTeacher()) return Promise.resolve(null);
    try { if (root.navigator && root.navigator.onLine === false) return Promise.resolve(null); } catch (_) {}
    if (busy || (!force && Date.now() - lastPollAt < MIN_GAP_MS)) return Promise.resolve(null);
    busy = true;
    var d = load(), since = Number(d.cursor[cls] || 0);
    return A.api(PATH + '?cls=' + encodeURIComponent(cls) + '&name=' + encodeURIComponent(name) + '&since=' + since).then(function (r) {
      lastPollAt = Date.now();
      if (!r.ok || !r.data) return null;
      var TS = root.FiezelTeacherStore, added = [];
      (r.data.assignments || []).forEach(function (row) {
        var a = row && row.assignment; if (!a || !a.id) return;
        if (TS && TS.acceptAssignmentPayload) { try { TS.acceptAssignmentPayload(a); } catch (_) {} }
        var e = add({ id: 'ta-' + a.id, kind: 'teacher_assignment', at: Number(row.at) || Date.now(), aid: a.id, title: a.title, from: a.from, mode: a.mode, count: (a.itemIds || []).length, minutes: a.minutes, deadline: a.deadline || null, assignment: a });
        if (e) added.push(e);
      });
      var fresh = load(); fresh.cursor[cls] = Number(r.data.cursor) || since; save(fresh);
      return { added: added };
    }).catch(function () { return null; }).then(function (res) { busy = false; return res; });
  }

  function text(e) {
    if (!e) return '';
    if (e.kind === 'teacher_assignment') return (e.mode === 'ujian' ? t('notif.ujian-mini-label', 'Ujian mini') : t('notif.tugas-baru-label', 'Tugas')) + ' baru dari ' + (e.from || 'guru') + ': “' + (e.title || 'Tugas') + '”';
    return e.text || '';
  }

  root.FiezelInbox = Object.freeze({
    KEY: KEY, PATH: PATH,
    items: items, unread: unread, get: get, add: add, markRead: markRead, markAllRead: markAllRead, remove: remove, clear: clear,
    poll: poll, text: text, classCode: classCode, learnerName: learnerName
  });
})(typeof self !== 'undefined' ? self : this);
