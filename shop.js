/* Aero3dp – Warenkorb, Shop-Status und Lieferzeit (alle Seiten)
   Der Warenkorb liegt nur im lokalen Speicher dieses Browsers, bis bestellt wird.
   Preise hier dienen nur der Anzeige – verbindlich rechnet die Datenbank in der Kasse. */
(function () {
  'use strict';
  var K = window.AERO_KATALOG || { artikel: {}, farben: {} };
  var B = window.AeroBackend;
  var SPEICHER = 'aero3dp-warenkorb';
  var MAX_MENGE = 10, MAX_POSITIONEN = 20;
  var EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var reduziert = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ═══ Daten ═══ */
  function artikel(code) { return K.artikel[code]; }
  function gueltig(p) {
    var a = p && artikel(p.code);
    if (!a || !(p.menge >= 1 && p.menge <= MAX_MENGE)) return false;
    if (a.art !== 'bausatz') return true;
    if (!Array.isArray(p.farben) || p.farben.length !== a.teile.length) return false;
    if (!p.farben.every(function (f) { return K.farben[f]; })) return false;
    if (p.material === 'LW-PLA' && (a.lwAufpreis == null || p.farben.some(function (f) { return f !== 'weiss'; }))) return false;
    return !(p.antrieb && a.preisSet == null);
  }
  function lesen() {
    try {
      var d = JSON.parse(localStorage.getItem(SPEICHER) || 'null');
      return d && Array.isArray(d.positionen) ? d.positionen.filter(gueltig) : [];
    } catch (e) { return []; }
  }
  function schreiben(pos) {
    try {
      if (pos.length) localStorage.setItem(SPEICHER, JSON.stringify({ v: 1, positionen: pos }));
      else localStorage.removeItem(SPEICHER);
    } catch (e) { /* privater Modus: Warenkorb lebt nur auf dieser Seite */ speicherErsatz = pos; }
    zeichnen();
    document.dispatchEvent(new CustomEvent('aero:warenkorb', { detail: { positionen: pos } }));
  }
  var speicherErsatz = null;
  function alle() { var p = lesen(); return p.length || !speicherErsatz ? p : speicherErsatz.filter(gueltig); }

  function schluessel(p) { return [p.code, p.material || '', p.antrieb ? 1 : 0, (p.farben || []).join('.')].join('|'); }
  function einzelpreis(p) {
    var a = artikel(p.code); if (!a) return 0;
    if (a.art !== 'bausatz') return a.preis;
    return Math.round(((p.antrieb ? a.preisSet : a.preis) + (p.material === 'LW-PLA' ? (a.lwAufpreis || 0) : 0)) * 100) / 100;
  }
  function kuerzel(p) { return (p.farben || []).map(function (f) { return K.farben[f] ? K.farben[f].kz : '?'; }); }
  function konfigCode(p) {
    var a = artikel(p.code); if (!a || a.art !== 'bausatz') return '';
    return [p.code, p.material === 'LW-PLA' ? 'LW' : 'PLA', kuerzel(p).join('.'), p.antrieb ? 'A' : '0'].join('-');
  }
  function name(p) { var a = artikel(p.code); return a ? a.name + (a.art === 'bausatz' ? ' Bausatz' : '') : p.code; }
  function farbText(p) {
    var a = artikel(p.code); if (!a || a.art !== 'bausatz') return '';
    return a.teile.map(function (t, i) { return t.name + ': ' + (K.farben[p.farben[i]] || {}).name; }).join(', ');
  }
  function ausstattung(p) {
    var a = artikel(p.code); if (!a || a.art !== 'bausatz') return '';
    return (p.material || 'PLA') + ' · ' + (p.antrieb ? 'mit Antriebsset' : 'ohne Antriebsset');
  }
  function link(p) {
    var a = artikel(p.code); if (!a) return 'index.html';
    if (a.art !== 'bausatz') return a.url;
    return a.url + '?f=' + kuerzel(p).join('.') + '&m=' + (p.material === 'LW-PLA' ? 'LW' : 'PLA') + (p.antrieb ? '&a=1' : '') + '#konfigurator';
  }

  function hinzufuegen(neu) {
    var p = { code: neu.code, menge: Math.max(1, Math.min(MAX_MENGE, neu.menge || 1)) };
    var a = artikel(p.code);
    if (!a) throw new Error('Unbekannter Artikel');
    if (a.art === 'bausatz') { p.material = neu.material === 'LW-PLA' ? 'LW-PLA' : 'PLA'; p.antrieb = !!neu.antrieb; p.farben = neu.farben.slice(); }
    if (!gueltig(p)) throw new Error('Diese Auswahl ist nicht bestellbar.');
    var pos = alle(), k = schluessel(p), da = pos.filter(function (x) { return schluessel(x) === k; })[0];
    if (da) da.menge = Math.min(MAX_MENGE, da.menge + p.menge);
    else { if (pos.length >= MAX_POSITIONEN) throw new Error('Dein Warenkorb ist voll.'); pos.push(p); }
    schreiben(pos);
    if (B) B.track('in_warenkorb', { produkt: p.code });
    return k;
  }
  function mengeSetzen(k, n) {
    var pos = alle();
    pos.forEach(function (x) { if (schluessel(x) === k) x.menge = Math.max(1, Math.min(MAX_MENGE, n)); });
    schreiben(pos);
  }
  function entfernen(k) { schreiben(alle().filter(function (x) { return schluessel(x) !== k; })); }
  function leeren() { speicherErsatz = null; schreiben([]); }
  function anzahl() { return alle().reduce(function (s, p) { return s + p.menge; }, 0); }

  /* Versand nach Shop-Einstellungen (Fallback: Katalog) */
  function versandRegeln() {
    var s = shopStatus || {};
    return {
      pauschale: s.versand_pauschale != null ? Number(s.versand_pauschale) : K.versand,
      freiAb: s.versandfrei_ab !== undefined ? (s.versandfrei_ab == null ? null : Number(s.versandfrei_ab)) : K.versandfreiAb
    };
  }
  function summen(pos) {
    pos = pos || alle();
    var w = Math.round(pos.reduce(function (s, p) { return s + einzelpreis(p) * p.menge; }, 0) * 100) / 100;
    var v = versandRegeln(), frei = v.freiAb != null && w >= v.freiAb;
    var versand = pos.length ? (frei ? 0 : v.pauschale) : 0;
    return { warenwert: w, versand: versand, gesamt: Math.round((w + versand) * 100) / 100, fehlt: v.freiAb != null && !frei ? Math.round((v.freiAb - w) * 100) / 100 : 0, freiAb: v.freiAb };
  }
  function lieferzeit() { return (shopStatus && shopStatus.lieferzeit) || K.lieferzeit; }

  /* ═══ Shop-Status laden ═══ */
  var shopStatus = null, geladen = false, wartende = [];
  function bereit(fn) { if (geladen) fn(!!(shopStatus && shopStatus.aktiv), shopStatus); else wartende.push(fn); }
  (B && B.status ? B.status() : Promise.resolve(null)).then(function (s) {
    shopStatus = s; geladen = true;
    var aktiv = !!(s && s.aktiv);
    document.documentElement.classList.toggle('shop-aktiv', aktiv);
    liveWerte();
    zeichnen();
    wartende.splice(0).forEach(function (fn) { try { fn(aktiv, s); } catch (e) { console.error(e); } });
    document.dispatchEvent(new CustomEvent('aero:shop', { detail: { aktiv: aktiv, status: s } }));
  });

  function liveWerte() {
    var s = shopStatus;
    $$('[data-lieferzeit]').forEach(function (el) { el.textContent = lieferzeit(); });
    if (!s) return;
    var v = versandRegeln();
    $$('[data-live="versand"]').forEach(function (el) { el.textContent = EUR.format(v.pauschale); });
    $$('[data-live="frei"]').forEach(function (el) { el.textContent = v.freiAb != null ? EUR.format(v.freiAb) : '–'; });
    $$('[data-live="frist"]').forEach(function (el) { el.textContent = s.zahlungsfrist_tage + ' Tagen'; });
    /* Werkstatt-Pille: Lieferzeit immer, „Gerade in der Werkstatt“ nur wenn freigegeben */
    var pill = $('[data-werkstatt]');
    if (pill && s.status_text && !$('[data-werkstatt-text]', pill)) {
      var t = document.createElement('span');
      t.setAttribute('data-werkstatt-text', '');
      t.innerHTML = 'Gerade in der Werkstatt: <strong></strong>';
      $('strong', t).textContent = s.status_text;
      var trenner = document.createElement('span'); trenner.setAttribute('aria-hidden', 'true'); trenner.textContent = '/';
      var live = $('.live', pill);
      pill.insertBefore(trenner, live ? live.nextSibling : pill.firstChild);
      pill.insertBefore(t, trenner);
    }
  }

  /* ═══ Warenkorb-Knopf & Schublade ═══ */
  var knopf = $('#korbKnopf'), korb = null, letzterFokus = null, hervorheben = null;

  function zeichnen() {
    var aktiv = !!(shopStatus && shopStatus.aktiv), n = anzahl();
    if (knopf) {
      knopf.hidden = !aktiv && !n;
      var z = $('.korb-zahl', knopf);
      z.hidden = !n; z.textContent = n > 99 ? '99+' : n;
      knopf.setAttribute('aria-label', n ? 'Warenkorb öffnen, ' + n + (n === 1 ? ' Artikel' : ' Artikel') : 'Warenkorb öffnen, leer');
    }
    if (korb && !korb.hidden) korbInhalt();
  }

  function korbBauen() {
    korb = document.createElement('div');
    korb.className = 'korb'; korb.id = 'korb'; korb.hidden = true;
    korb.innerHTML = '<div class="korb-schleier" data-korb-zu></div>' +
      '<aside class="korb-panel" role="dialog" aria-modal="true" aria-labelledby="korbTitel" tabindex="-1">' +
      '<header class="korb-kopf"><h2 id="korbTitel">Warenkorb</h2>' +
      '<button type="button" class="korb-zu" data-korb-zu aria-label="Warenkorb schließen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>' +
      '<div class="korb-body"></div></aside>';
    document.body.appendChild(korb);
    korb.addEventListener('click', function (e) {
      if (e.target.closest('[data-korb-zu]')) { schliessen(); return; }
      var b = e.target.closest('button[data-aktion]'); if (!b) return;
      var k = b.closest('[data-k]').getAttribute('data-k');
      var p = alle().filter(function (x) { return schluessel(x) === k; })[0]; if (!p) return;
      if (b.dataset.aktion === 'plus') mengeSetzen(k, p.menge + 1);
      else if (b.dataset.aktion === 'minus') { if (p.menge > 1) mengeSetzen(k, p.menge - 1); }
      else if (b.dataset.aktion === 'weg') { entfernen(k); toast(name(p) + ' entfernt'); }
      var gleich = korb.querySelector('[data-k="' + cssEsc(k) + '"] button[data-aktion="' + b.dataset.aktion + '"]');
      (gleich || $('.korb-panel', korb)).focus();
    });
    korb.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); schliessen(); return; }
      if (e.key !== 'Tab') return;
      var f = $$('a[href], button:not([disabled]), input, [tabindex="0"]', $('.korb-panel', korb)).filter(function (el) { return el.offsetParent !== null; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
  }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'); }

  function zeile(p) {
    var a = artikel(p.code), k = schluessel(p), ep = einzelpreis(p);
    var vorschau = a.art === 'bausatz'
      ? '<span class="korb-farben" aria-hidden="true">' + p.farben.map(function (f) { return '<i style="--c:' + K.farben[f].hex + '"></i>'; }).join('') + '</span>'
      : '<span class="korb-farben korb-teil" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/></svg></span>';
    return '<li class="korb-pos' + (hervorheben === k ? ' neu' : '') + '" data-k="' + esc(k) + '">' + vorschau +
      '<div class="korb-info"><a href="' + esc(link(p)) + '">' + esc(name(p)) + '</a>' +
      (a.art === 'bausatz' ? '<span>' + esc(farbText(p)) + '</span><span>' + esc(ausstattung(p)) + '</span>' : '<span>' + EUR.format(ep) + ' je Stück</span>') +
      '<div class="korb-zeile2"><div class="korb-menge" role="group" aria-label="Menge ' + esc(name(p)) + '">' +
      '<button type="button" data-aktion="minus" aria-label="Eins weniger"' + (p.menge <= 1 ? ' disabled' : '') + '>−</button>' +
      '<output aria-live="polite">' + p.menge + '</output>' +
      '<button type="button" data-aktion="plus" aria-label="Eins mehr"' + (p.menge >= MAX_MENGE ? ' disabled' : '') + '>+</button></div>' +
      '<button type="button" class="korb-weg" data-aktion="weg">Entfernen</button></div></div>' +
      '<b class="korb-preis">' + EUR.format(ep * p.menge) + '</b></li>';
  }

  function korbInhalt() {
    var body = $('.korb-body', korb), pos = alle();
    var aktiv = !!(shopStatus && shopStatus.aktiv);
    if (!pos.length) {
      body.innerHTML = '<div class="korb-leer"><p><b>Dein Warenkorb ist leer.</b></p><p>Stell dir ein Modell in deinen Farben zusammen – es landet dann hier.</p>' +
        '<a class="btn btn-ghost" href="index.html#produkte">Modelle ansehen</a></div>';
      return;
    }
    var s = summen(pos), v = versandRegeln();
    var fortschritt = '';
    if (v.freiAb != null) {
      var pr = Math.min(100, s.warenwert / v.freiAb * 100);
      fortschritt = '<div class="korb-frei"><p>' + (s.fehlt > 0 ? 'Noch <b>' + EUR.format(s.fehlt) + '</b> bis zum kostenlosen Versand.' : '<b>Kostenloser Versand</b> – dein Warenkorb liegt über ' + EUR.format(v.freiAb) + '.') + '</p>' +
        '<div class="korb-frei-spur" aria-hidden="true"><i style="width:' + pr.toFixed(1) + '%"></i></div></div>';
    }
    body.innerHTML = '<ul class="korb-liste">' + pos.map(zeile).join('') + '</ul>' +
      '<div class="korb-fuss">' + fortschritt +
      '<dl class="korb-summen"><div><dt>Zwischensumme</dt><dd>' + EUR.format(s.warenwert) + '</dd></div>' +
      '<div><dt>Versand (DHL, Deutschland)</dt><dd>' + (s.versand ? EUR.format(s.versand) : 'kostenlos') + '</dd></div>' +
      '<div class="korb-gesamt"><dt>Gesamt</dt><dd>' + EUR.format(s.gesamt) + '</dd></div></dl>' +
      (aktiv ? '<a class="btn btn-block" href="kasse.html">Zur Kasse</a>' : '<a class="btn btn-block" href="kasse.html">Warenkorb ansehen</a><p class="korb-pause">Der Shop ist gerade geschlossen. In der Kasse kannst du den Warenkorb als Anfrage senden.</p>') +
      '<p class="korb-info-klein">Endpreise, gemäß § 19 UStG ohne Umsatzsteuer. Lieferung nur innerhalb Deutschlands. ' +
      'Zahlung per Vorkasse (Überweisung). Lieferzeit: ' + esc(lieferzeit()) + ' nach Zahlungseingang.</p></div>';
  }

  function oeffnen(neuK) {
    if (!korb) korbBauen();
    hervorheben = neuK || null;
    korbInhalt();
    letzterFokus = document.activeElement;
    korb.hidden = false;
    document.documentElement.classList.add('korb-offen');
    requestAnimationFrame(function () { korb.classList.add('auf'); });
    $('.korb-zu', korb).focus({ preventScroll: true });
    if (knopf) knopf.setAttribute('aria-expanded', 'true');
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && korb && !korb.hidden && !korb.contains(document.activeElement)) schliessen();
  });
  function schliessen() {
    if (!korb || korb.hidden) return;
    korb.classList.remove('auf');
    document.documentElement.classList.remove('korb-offen');
    if (knopf) knopf.setAttribute('aria-expanded', 'false');
    setTimeout(function () { korb.hidden = true; hervorheben = null; }, reduziert ? 0 : 260);
    if (letzterFokus && letzterFokus.focus) letzterFokus.focus({ preventScroll: true });
  }
  if (knopf) knopf.addEventListener('click', function () { oeffnen(); });

  function toast(t) { if (window.AeroToast) AeroToast(t); }

  /* Zubehör „In den Warenkorb“ (Startseite) */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-in-warenkorb]'); if (!b) return;
    e.preventDefault();
    try { var k = hinzufuegen({ code: b.getAttribute('data-in-warenkorb'), menge: 1 }); oeffnen(k); }
    catch (err) { toast(err.message); }
  });
  bereit(function (aktiv) {
    $$('[data-in-warenkorb]').forEach(function (b) { b.hidden = !aktiv; });
    $$('[data-anfrage-link]').forEach(function (a) { a.hidden = aktiv; });
  });

  /* Andere Tabs halten den Zähler aktuell */
  window.addEventListener('storage', function (e) { if (e.key === SPEICHER) zeichnen(); });

  zeichnen();
  liveWerte();

  window.AeroShop = {
    lesen: alle, hinzufuegen: hinzufuegen, mengeSetzen: mengeSetzen, entfernen: entfernen, leeren: leeren,
    summen: summen, einzelpreis: einzelpreis, schluessel: schluessel, name: name, farbText: farbText,
    ausstattung: ausstattung, konfigCode: konfigCode, link: link, lieferzeit: lieferzeit,
    oeffnen: oeffnen, schliessen: schliessen, bereit: bereit, status: function () { return shopStatus; }
  };
})();
