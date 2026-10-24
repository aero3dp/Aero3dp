/* Aero3dp – kleiner Supabase-Client + cookieloses Tracking.
   Speichert nichts im Browser und erhebt keine IP-Adressen. */
(function () {
  'use strict';
  var C = window.AERO_CONFIG || {};
  var base = (String(C.supabaseUrl || '').trim().match(/^https?:\/\/[^\/\s]+/) || [''])[0];  // nur Herkunft, z. B. versehentlich angehängtes /rest/v1/ ignorieren
  var key = String(C.supabaseAnonKey || '').trim();
  var enabled = !!(base && key);

  // Neue Supabase-Schlüssel (sb_publishable_…) gehören nur in den apikey-Header,
  // alte anon-Schlüssel (JWT) zusätzlich in Authorization.
  var neuerSchluessel = /^sb_publishable_/.test(key);
  function headers(extra) {
    var h = { apikey: key };
    if (!neuerSchluessel) h.Authorization = 'Bearer ' + key;
    for (var k in extra) h[k] = extra[k];
    return h;
  }
  function fehlertext(res) {
    return res.text().then(function (t) {
      try { var j = JSON.parse(t); return j.message || j.error || t; } catch (e) { return t || ('HTTP ' + res.status); }
    });
  }
  function insert(table, row, opts) {
    if (!enabled) return Promise.resolve(false);
    return fetch(base + '/rest/v1/' + table, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(row),
      keepalive: !!(opts && opts.keepalive)
    }).then(function (res) {
      if (!res.ok) return fehlertext(res).then(function (t) { throw new Error(t); });
      return true;
    });
  }
  function select(pathAndQuery) {
    if (!enabled) return Promise.resolve(null);
    return fetch(base + '/rest/v1/' + pathAndQuery, { headers: headers({}) }).then(function (res) {
      if (!res.ok) return fehlertext(res).then(function (t) { throw new Error(t); });
      return res.json();
    });
  }
  function upload(bucket, path, file, contentType) {
    if (!enabled) return Promise.reject(new Error('Kein Backend eingerichtet'));
    return fetch(base + '/storage/v1/object/' + bucket + '/' + path, {
      method: 'POST',
      headers: headers({ 'Content-Type': contentType || 'application/octet-stream', 'x-upsert': 'false', 'cache-control': '3600' }),
      body: file
    }).then(function (res) {
      if (!res.ok) return fehlertext(res).then(function (t) { throw new Error(t); });
      return true;
    });
  }

  /* ─── Tracking ─── */
  function trackingAus() {
    try { if (localStorage.getItem('aero3dp-kein-tracking') === '1') return true; } catch (e) { /* ignorieren */ }
    return navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true || navigator.webdriver === true ||
      /\/admin(\.html)?$/.test(location.pathname);
  }
  function pfad() {
    var p = location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    return (p || '/').slice(0, 200);
  }
  function eigenerHost(h) { return h.replace(/^www\./, '') === location.hostname.replace(/^www\./, ''); }
  function quelle() {
    var params = new URLSearchParams(location.search);
    var markiert = params.get('quelle') || params.get('utm_source');
    if (markiert) return markiert.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 60) || null;
    if (!document.referrer) return null;
    try {
      var h = new URL(document.referrer).hostname;
      return eigenerHost(h) ? null : h.replace(/^www\./, '').slice(0, 120);
    } catch (e) { return null; }
  }
  function neuerBesuch() {
    if (!document.referrer) return true;
    try { return !eigenerHost(new URL(document.referrer).hostname); } catch (e) { return true; }
  }
  function geraet() {
    var w = window.innerWidth, grob = window.matchMedia('(pointer: coarse)').matches;
    if (grob && w < 768) return 'mobil';
    if (grob && w < 1200) return 'tablet';
    return w < 768 ? 'mobil' : 'desktop';
  }
  var gesendet = {};
  function track(name, daten, einmal) {
    if (!enabled || trackingAus()) return;
    if (einmal) { if (gesendet[name]) return; gesendet[name] = true; }
    insert('ereignisse', { name: name, pfad: pfad(), daten: daten || null }, { keepalive: true }).catch(function () {});
  }
  function seitenaufruf() {
    if (!enabled || trackingAus()) return;
    insert('seitenaufrufe', {
      pfad: pfad(), quelle: quelle(), geraet: geraet(), neuer_besuch: neuerBesuch()
    }).catch(function () {});
  }
  function werkstatt() {
    return select('werkstatt?id=eq.1&select=status_text,lieferzeit,sichtbar,aktualisiert').then(function (rows) {
      var r = rows && rows[0];
      return r && r.sichtbar ? r : null;
    }).catch(function () { return null; });
  }

  window.AeroBackend = {
    enabled: enabled, insert: insert, select: select, upload: upload,
    track: track, werkstatt: werkstatt, pfad: pfad, headers: headers
  };

  if (document.readyState === 'complete') setTimeout(seitenaufruf, 300);
  else window.addEventListener('load', function () { setTimeout(seitenaufruf, 300); });
})();
