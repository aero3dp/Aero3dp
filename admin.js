/* Aero3dp – Admin-Dashboard */
(function () {
  'use strict';
  var C = window.AERO_CONFIG || {};
  var BASE = (String(C.supabaseUrl || '').trim().match(/^https?:\/\/[^\/\s]+/) || [''])[0], KEY = String(C.supabaseAnonKey || '').trim();  // nur https://xyz.supabase.co, Pfade/Doppelungen ignorieren
  var eingerichtet = !!(BASE && KEY);
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var ZAHL = new Intl.NumberFormat('de-DE'), EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var SK = 'aero3dp-admin';
  var demo = false, sitzung = null, anfragenDaten = [], statistikDaten = null;
  var filter = { status: 'offen', art: 'alle' };

  var SEITEN = { '/': 'Startseite', '/fj4-fury': 'FJ-4 Fury', '/aero-33x': 'Aero-33X', '/fpv-flitzer': 'FPV Flitzer', '/druckservice': '3D-Druckservice',
    '/impressum': 'Impressum', '/agbs': 'AGB', '/datenschutz': 'Datenschutz', '/404': 'Nicht gefunden (404)' };
  var STATUS = [['neu', 'Neu'], ['in_bearbeitung', 'In Bearbeitung'], ['angebot_gesendet', 'Angebot gesendet'], ['erledigt', 'Erledigt'], ['archiviert', 'Archiviert']];
  var ARTEN = { konfigurator: 'Konfigurator', druckservice: '3D-Druck', kontakt: 'Kontakt' };

  /* ═══ Anmeldung ═══ */
  function speichern(s) { sitzung = s; try { s ? sessionStorage.setItem(SK, JSON.stringify(s)) : sessionStorage.removeItem(SK); } catch (e) { /* egal */ } }
  function auth(grant, body) {
    return fetch(BASE + '/auth/v1/token?grant_type=' + grant, {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error_description || j.msg || j.message || 'Anmeldung fehlgeschlagen');
        return { token: j.access_token, refresh: j.refresh_token, ablauf: Date.now() + (j.expires_in || 3600) * 1000, email: j.user && j.user.email };
      });
    });
  }
  function token() {
    if (!sitzung) return Promise.reject(new Error('Nicht angemeldet'));
    if (Date.now() < sitzung.ablauf - 60000) return Promise.resolve(sitzung.token);
    return auth('refresh_token', { refresh_token: sitzung.refresh }).then(function (s) { speichern(s); return s.token; });
  }
  function api(pfad, opt) {
    opt = opt || {};
    return token().then(function (t) {
      var h = { apikey: KEY, Authorization: 'Bearer ' + t };
      for (var k in (opt.headers || {})) h[k] = opt.headers[k];
      return fetch(BASE + pfad, { method: opt.method || 'GET', headers: h, body: opt.body });
    }).then(function (r) {
      if (r.status === 401) { abmelden(); throw new Error('Sitzung abgelaufen, bitte neu anmelden.'); }
      if (!r.ok) return r.text().then(function (t) { var m = t; try { m = JSON.parse(t).message || t; } catch (e) {} throw new Error(m || 'HTTP ' + r.status); });
      return (r.headers.get('content-type') || '').indexOf('json') >= 0 ? r.json() : null;
    });
  }
  var json = function (o) { return { 'Content-Type': 'application/json', Prefer: 'return=minimal' }; };

  function zeigeLogin() {
    $('#app').hidden = true; $('#login').hidden = false;
    $('#nichtEingerichtet').hidden = eingerichtet;
    $$('#loginForm .feld, #loginForm button[type="submit"]').forEach(function (e) { e.hidden = !eingerichtet; });
  }
  function abmelden() {
    if (sitzung && !demo) fetch(BASE + '/auth/v1/logout', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + sitzung.token } }).catch(function () {});
    speichern(null);
    if (demo) { location.hash = ''; location.reload(); return; }
    zeigeLogin();
  }
  $('#abmelden').addEventListener('click', abmelden);

  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var fehler = $('#loginFehler'), btn = $('#loginForm button[type="submit"]');
    fehler.hidden = true; btn.disabled = true; btn.textContent = 'Anmelden …';
    auth('password', { email: $('#l-email').value.trim(), password: $('#l-pw').value }).then(function (s) {
      speichern(s);
      return api('/rest/v1/admins?select=user_id');
    }).then(function (rows) {
      if (!rows || !rows.length) { speichern(null); throw new Error('Dein Benutzer ist noch nicht als Admin freigeschaltet. Führe den letzten Schritt aus der Checkliste aus.'); }
      starten();
    }).catch(function (err) {
      fehler.textContent = /Invalid login/i.test(err.message) ? 'E-Mail oder Passwort stimmt nicht.' : err.message;
      fehler.hidden = false;
    }).then(function () { btn.disabled = false; btn.textContent = 'Anmelden'; });
  });

  /* ═══ Daten (echt oder Demo) ═══ */
  function ladeStatistik(tage) {
    if (demo) return Promise.resolve(DEMO.statistik(tage));
    return api('/rest/v1/rpc/statistik', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tage: tage }) });
  }
  function ladeAnfragen() {
    if (demo) return Promise.resolve(DEMO.anfragen.slice());
    return api('/rest/v1/anfragen?select=*&order=erstellt.desc&limit=300');
  }
  function aendereAnfrage(id, felder) {
    if (demo) { var a = anfragenDaten.filter(function (x) { return x.id === id; })[0]; for (var k in felder) a[k] = felder[k]; return Promise.resolve(); }
    return api('/rest/v1/anfragen?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: json(), body: JSON.stringify(felder) });
  }
  function loescheAnfrage(a) {
    if (demo) { anfragenDaten = anfragenDaten.filter(function (x) { return x.id !== a.id; }); return Promise.resolve(); }
    var datei = a.datei_pfad ? api('/storage/v1/object/druckdateien/' + a.datei_pfad, { method: 'DELETE' }).catch(function () {}) : Promise.resolve();
    return datei.then(function () { return api('/rest/v1/anfragen?id=eq.' + encodeURIComponent(a.id), { method: 'DELETE', headers: json() }); });
  }
  function dateiLink(pfad, name) {
    return api('/storage/v1/object/sign/druckdateien/' + pfad, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 600 }) })
      .then(function (j) { var u = j.signedURL || j.signedUrl; return BASE + '/storage/v1' + u + (u.indexOf('?') >= 0 ? '&' : '?') + 'download=' + encodeURIComponent(name || 'datei.stl'); });
  }

  /* ═══ Tabs ═══ */
  $$('.admin-tabs [role="tab"]').forEach(function (t, i, alle) {
    t.addEventListener('click', function () { tabWaehlen(t); });
    t.addEventListener('keydown', function (e) {
      var n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (n) { e.preventDefault(); var z = alle[(i + n + alle.length) % alle.length]; tabWaehlen(z); z.focus(); }
    });
  });
  function tabWaehlen(t) {
    $$('.admin-tabs [role="tab"]').forEach(function (x) {
      var an = x === t; x.setAttribute('aria-selected', an); x.tabIndex = an ? 0 : -1;
      $('#' + x.getAttribute('aria-controls')).hidden = !an;
    });
    if (t.id === 't-uebersicht' && statistikDaten) zeichneChart();
  }

  /* ═══ Übersicht ═══ */
  function tageListe(n) {
    var out = [], d = new Date();
    d.setHours(12, 0, 0, 0);
    for (var i = n - 1; i >= 0; i--) {
      var x = new Date(d); x.setDate(d.getDate() - i);
      out.push(x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'));
    }
    return out;
  }
  function kurzDatum(iso) { var p = iso.split('-'); return +p[2] + '.' + +p[1] + '.'; }
  function langDatum(iso) { return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' }); }

  var zeitraum = $('#zeitraum');
  zeitraum.addEventListener('change', ladeUebersicht);

  function ladeUebersicht() {
    var tage = +zeitraum.value;
    return ladeStatistik(tage).then(function (s) {
      statistikDaten = { s: s, tage: tage };
      kacheln(s, tage);
      zeichneChart();
      balkenListe($('#seiten'), (s.seiten || []).map(function (x) { return [SEITEN[x.pfad] || x.pfad, x.n]; }), 'Aufrufe');
      balkenListe($('#quellen'), (s.quellen || []).map(function (x) { return [x.quelle === 'direkt' ? 'Direkt / unbekannt' : x.quelle, x.n]; }), 'Besuche');
      var g = s.geraete || {}, gs = (g.mobil || 0) + (g.tablet || 0) + (g.desktop || 0) + (g.unbekannt || 0);
      balkenListe($('#geraete'), [['Handy', g.mobil || 0], ['Computer', g.desktop || 0], ['Tablet', g.tablet || 0]].filter(function (x) { return gs; }), 'Besuche', true);
      var f = s.funnel || {};
      trichter($('#funnelModelle'), [['Produktseite angesehen', f.produkt_aufrufe], ['Konfigurator genutzt', f.konfiguriert], ['Anfrage gesendet', f.produkt_anfragen]]);
      trichter($('#funnelDruck'), [['Druckservice angesehen', f.druck_aufrufe], ['STL-Datei geladen', f.stl_geladen], ['Anfrage gesendet', f.druck_anfragen]]);
      offenAnzeigen(s.offen);
    }).catch(fehlerToast);
  }
  function kacheln(s, tage) {
    var zr = tage === 365 ? 'letzte 12 Monate' : 'letzte ' + tage + ' Tage';
    var proBesuch = s.besuche ? (s.aufrufe / s.besuche).toFixed(1).replace('.', ',') : '–';
    var k = [
      ['Aufrufe', ZAHL.format(s.aufrufe), zr, false],
      ['Besuche', ZAHL.format(s.besuche), proBesuch + ' Seiten pro Besuch', false],
      ['Anfragen', ZAHL.format(s.anfragen), zr, false],
      ['Offene Anfragen', ZAHL.format(s.offen), s.offen ? 'neu oder in Bearbeitung' : 'alles erledigt', s.offen > 0],
    ];
    $('#kacheln').innerHTML = k.map(function (x) {
      return '<dl class="kachel' + (x[3] ? ' akzent' : '') + '"><dt>' + x[0] + '</dt><dd>' + x[1] + '</dd><dd class="delta">' + x[2] + '</dd></dl>';
    }).join('');
  }
  function offenAnzeigen(n) {
    var z = $('#offenZaehler');
    z.hidden = !n; z.textContent = n;
  }

  function balkenListe(el, zeilen, einheit, prozent) {
    zeilen = zeilen.filter(function (z) { return z[1] > 0 || prozent; });
    if (!zeilen.length) { el.innerHTML = '<p class="leer">Noch keine Daten in diesem Zeitraum.</p>'; return; }
    var max = Math.max.apply(null, zeilen.map(function (z) { return z[1]; })) || 1;
    var summe = zeilen.reduce(function (a, z) { return a + z[1]; }, 0) || 1;
    el.innerHTML = zeilen.map(function (z) {
      var p = prozent ? ' <small>' + Math.round(z[1] / summe * 100) + ' %</small>' : '';
      return '<div class="balken-zeile" title="' + esc(z[0]) + ': ' + ZAHL.format(z[1]) + ' ' + einheit + '"><div class="balken-kopf"><span>' + esc(z[0]) + '</span><b>' + ZAHL.format(z[1]) + p + '</b></div>' +
        '<div class="balken-spur"><div class="balken-wert" style="width:' + (z[1] / max * 100) + '%"></div></div></div>';
    }).join('');
  }
  function trichter(el, stufen) {
    var erst = stufen[0][1] || 0;
    if (!erst) { el.innerHTML = '<p class="leer">Noch keine Daten in diesem Zeitraum.</p>'; return; }
    el.innerHTML = stufen.map(function (z, i) {
      var v = z[1] || 0, p = Math.round(v / erst * 1000) / 10;
      var info = i ? ' <small>' + String(p).replace('.', ',') + ' %</small>' : '';
      return '<div class="balken-zeile" title="' + esc(z[0]) + ': ' + ZAHL.format(v) + '"><div class="balken-kopf"><span>' + esc(z[0]) + '</span><b>' + ZAHL.format(v) + info + '</b></div>' +
        '<div class="balken-spur"><div class="balken-wert" style="width:' + (v / erst * 100) + '%"></div></div></div>';
    }).join('');
  }

  /* Liniendiagramm mit Fadenkreuz */
  function rundMax(v) {
    if (v <= 4) return 4;
    var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function zeichneChart() {
    if (!statistikDaten) return;
    var el = $('#chartTage'), s = statistikDaten.s, tage = tageListe(statistikDaten.tage);
    var map = {}; (s.pro_tag || []).forEach(function (d) { map[d.tag] = d; });
    var a = tage.map(function (t) { return map[t] ? map[t].aufrufe : 0; });
    var b = tage.map(function (t) { return map[t] ? map[t].besuche : 0; });
    $('#tabelleTage').innerHTML = '<table><thead><tr><th>Tag</th><th>Aufrufe</th><th>Besuche</th></tr></thead><tbody>' +
      tage.slice().reverse().map(function (t, i) { var j = tage.length - 1 - i; return '<tr><td>' + langDatum(t) + '</td><td>' + ZAHL.format(a[j]) + '</td><td>' + ZAHL.format(b[j]) + '</td></tr>'; }).join('') + '</tbody></table>';
    var w = el.clientWidth, h = el.clientHeight;
    if (!w) return;
    var P = { l: 44, r: 14, t: 10, b: 28 }, iw = w - P.l - P.r, ih = h - P.t - P.b, n = tage.length;
    var max = rundMax(Math.max.apply(null, a.concat(b)));
    var X = function (i) { return P.l + (n === 1 ? iw / 2 : i * iw / (n - 1)); };
    var Y = function (v) { return P.t + ih - v / max * ih; };
    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Aufrufe und Besuche pro Tag, Details in der Tabelle darunter">';
    svg += '<g class="gitter">';
    for (var k = 0; k <= 4; k++) { var yv = max / 4 * k; svg += '<line x1="' + P.l + '" x2="' + (w - P.r) + '" y1="' + Y(yv) + '" y2="' + Y(yv) + '"/>'; }
    svg += '</g><g class="achse">';
    for (k = 0; k <= 4; k++) { var v = max / 4 * k; svg += '<text x="' + (P.l - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + (v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0).replace('.', ',') + ' Tsd.' : ZAHL.format(Math.round(v * 10) / 10)) + '</text>'; }
    var schritt = Math.max(1, Math.ceil(n / 7));
    for (var i = 0; i < n; i += schritt) svg += '<text x="' + X(i) + '" y="' + (h - 8) + '" text-anchor="' + (i === 0 ? 'start' : 'middle') + '">' + kurzDatum(tage[i]) + '</text>';
    svg += '</g>';
    var pfad = function (werte) { return werte.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join(''); };
    svg += '<path class="flaeche" fill="var(--s1)" d="' + pfad(a) + 'L' + X(n - 1) + ' ' + Y(0) + 'L' + X(0) + ' ' + Y(0) + 'Z"/>';
    svg += '<path class="linie" stroke="var(--s2)" d="' + pfad(b) + '"/><path class="linie" stroke="var(--s1)" d="' + pfad(a) + '"/>';
    svg += '<circle class="punkt" r="4" fill="var(--s1)" cx="' + X(n - 1) + '" cy="' + Y(a[n - 1]) + '"/>';
    svg += '<g class="hover" visibility="hidden"><line class="fadenkreuz" y1="' + P.t + '" y2="' + (P.t + ih) + '"/><circle class="punkt p1" r="4.5" fill="var(--s1)"/><circle class="punkt p2" r="4.5" fill="var(--s2)"/></g>';
    svg += '<rect class="fang" x="' + P.l + '" y="0" width="' + iw + '" height="' + h + '" fill="transparent"/></svg>';
    if (!a.some(Boolean) && !b.some(Boolean)) svg = svg.replace('</svg>', '<text class="leer-text" x="' + (w / 2) + '" y="' + (h / 2) + '" text-anchor="middle">Noch keine Aufrufe in diesem Zeitraum</text></svg>');
    el.innerHTML = svg;
    var hov = $('.hover', el), tip = $('#tooltip');
    function zeige(e) {
      var r = el.getBoundingClientRect(), px = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      var i = Math.max(0, Math.min(n - 1, Math.round((px - P.l) / iw * (n - 1))));
      hov.setAttribute('visibility', 'visible');
      $('.fadenkreuz', hov).setAttribute('x1', X(i)); $('.fadenkreuz', hov).setAttribute('x2', X(i));
      $('.p1', hov).setAttribute('cx', X(i)); $('.p1', hov).setAttribute('cy', Y(a[i]));
      $('.p2', hov).setAttribute('cx', X(i)); $('.p2', hov).setAttribute('cy', Y(b[i]));
      tip.innerHTML = '<b>' + langDatum(tage[i]) + '</b><span><span><i style="background:var(--s1)"></i>Aufrufe</span><em>' + ZAHL.format(a[i]) + '</em></span><span><span><i style="background:var(--s2)"></i>Besuche</span><em>' + ZAHL.format(b[i]) + '</em></span>';
      tip.hidden = false;
      var tx = r.left + X(i) + 14, ty = r.top + P.t + 10;
      if (tx + tip.offsetWidth > window.innerWidth - 8) tx = r.left + X(i) - tip.offsetWidth - 14;
      tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
    }
    function weg() { hov.setAttribute('visibility', 'hidden'); tip.hidden = true; }
    var fang = $('.fang', el);
    fang.addEventListener('pointermove', zeige); fang.addEventListener('pointerdown', zeige);
    fang.addEventListener('pointerleave', weg);
  }
  new ResizeObserver(function () { if (!$('#v-uebersicht').hidden) zeichneChart(); }).observe($('#chartTage'));

  /* ═══ Anfragen ═══ */
  function filterBauen() {
    var st = [['offen', 'Offen'], ['alle', 'Alle']].concat(STATUS);
    $('#filterStatus').innerHTML = st.map(function (s) { return '<button type="button" data-status="' + s[0] + '" aria-pressed="' + (filter.status === s[0]) + '">' + s[1] + '</button>'; }).join('');
    var ar = [['alle', 'Alle Arten']].concat(Object.keys(ARTEN).map(function (k) { return [k, ARTEN[k]]; }));
    $('#filterArt').innerHTML = ar.map(function (s) { return '<button type="button" data-art="' + s[0] + '" aria-pressed="' + (filter.art === s[0]) + '">' + s[1] + '</button>'; }).join('');
  }
  $('#filterStatus').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { filter.status = b.dataset.status; filterBauen(); anfragenZeigen(); } });
  $('#filterArt').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { filter.art = b.dataset.art; filterBauen(); anfragenZeigen(); } });

  function detailsListe(a) {
    var d = a.details || {}, z = [];
    if (a.art === 'konfigurator') {
      z.push(['Modell', d.produkt], ['Code', d.code]);
      if (d.farben) Object.keys(d.farben).forEach(function (k) { z.push([k, d.farben[k]]); });
      z.push(['Material', d.material], ['Antriebsset', d.antrieb ? 'ja' : 'nein']);
      if (d.lackierung) z.push(['Lackierung', d.lack_wunsch ? 'ja: ' + d.lack_wunsch : 'ja, Wunsch per Nachricht']);
      z.push(['Preis', d.preis != null ? EUR.format(d.preis) + (d.preis_offen ? ' + ' + (d.lackierung ? 'Lackierung' : 'Set') + ' auf Anfrage' : '') : '–']);
    } else if (a.art === 'druckservice') {
      z.push(['Datei', d.datei + (d.groesse_mb ? ' (' + String(d.groesse_mb).replace('.', ',') + ' MB)' : '')],
        ['Maße', (d.masse_mm || []).map(function (v) { return String(v).replace('.', ','); }).join(' × ') + ' mm'], ['Volumen', String(d.volumen_cm3).replace('.', ',') + ' cm³'],
        ['Material', d.material + ', ' + ({ fein: 'Fein', standard: 'Standard', schnell: 'Schnell' }[d.qualitaet] || d.qualitaet) + ', ' + d.fuellung + ' % Füllung, ' + d.waende + ' Wände'], ['Stückzahl', d.anzahl],
        ['Wunschfarbe', d.farbe || '–'], ['Schätzung', d.schaetzung_eur != null ? EUR.format(d.schaetzung_eur) : '–'],
        ['Gewicht / Zeit', String(d.gewicht_g).replace('.', ',') + ' g, ' + Math.floor(d.druckzeit_min / 60) + ' h ' + d.druckzeit_min % 60 + ' min'],
        ['Bauraum', d.passt ? 'passt' : 'zu groß'], ['Hülle', d.offene_kanten ? d.offene_kanten + ' offene Kanten' : 'geschlossen']);
    } else if (d.thema) z.push(['Thema', d.thema]);
    return '<dl class="details-tabelle">' + z.map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1] == null ? '–' : x[1]) + '</dd>'; }).join('') + '</dl>';
  }
  function anfragenZeigen() {
    var liste = anfragenDaten.filter(function (a) {
      var s = filter.status === 'alle' || (filter.status === 'offen' ? (a.status === 'neu' || a.status === 'in_bearbeitung') : a.status === filter.status);
      return s && (filter.art === 'alle' || a.art === filter.art);
    });
    var el = $('#anfragenListe');
    if (!liste.length) { el.innerHTML = '<p class="leer">Keine Anfragen mit diesem Filter.' + (filter.status === 'offen' ? ' Alles erledigt.' : '') + '</p>'; return; }
    el.innerHTML = liste.map(function (a) {
      var d = new Date(a.erstellt);
      var betreff = encodeURIComponent('Deine Anfrage bei Aero3dp' + (a.details && a.details.code ? ' (' + a.details.code + ')' : ''));
      var opts = STATUS.map(function (s) { return '<option value="' + s[0] + '"' + (a.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('');
      return '<article class="anfrage' + (a.status === 'neu' ? ' neu' : '') + '" data-id="' + esc(a.id) + '">' +
        '<header class="anfrage-kopf"><span class="art">' + esc(ARTEN[a.art] || a.art) + '</span><h3>' + esc(a.name) + '</h3>' +
        '<time datetime="' + esc(a.erstellt) + '">' + d.toLocaleDateString('de-DE') + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + '</time>' +
        '<label class="vh" for="st-' + esc(a.id) + '">Status</label><select id="st-' + esc(a.id) + '" data-aktion="status">' + opts + '</select></header>' +
        '<div class="anfrage-body"><div><a class="anfrage-mail textlink" href="mailto:' + esc(a.email) + '?subject=' + betreff + '">' + esc(a.email) + '</a>' +
        (a.nachricht ? '<p style="margin-top:.6rem">' + esc(a.nachricht) + '</p>' : '<p style="margin-top:.6rem;color:var(--text-3)">Keine Nachricht.</p>') + '</div>' + detailsListe(a) + '</div>' +
        '<div class="anfrage-aktionen"><textarea data-aktion="notiz" placeholder="Interne Notiz" aria-label="Interne Notiz">' + esc(a.notiz || '') + '</textarea>' +
        '<button class="btn btn-ghost btn-small" type="button" data-aktion="notiz-speichern">Notiz speichern</button>' +
        (a.datei_pfad ? '<button class="btn btn-small" type="button" data-aktion="datei">STL herunterladen</button>' : '') +
        '<button class="btn btn-ghost btn-small loeschen" type="button" data-aktion="loeschen">Löschen</button></div></article>';
    }).join('');
  }
  $('#anfragenListe').addEventListener('change', function (e) {
    if (e.target.dataset.aktion !== 'status') return;
    var id = e.target.closest('.anfrage').dataset.id, wert = e.target.value;
    aendereAnfrage(id, { status: wert }).then(function () {
      anfragenDaten.forEach(function (a) { if (a.id === id) a.status = wert; });
      offenAnzeigen(anfragenDaten.filter(function (a) { return a.status === 'neu' || a.status === 'in_bearbeitung'; }).length);
      hinweis('Status gespeichert');
      anfragenZeigen();
    }).catch(fehlerToast);
  });
  $('#anfragenListe').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-aktion]'); if (!b) return;
    var karte = b.closest('.anfrage'), id = karte.dataset.id;
    var a = anfragenDaten.filter(function (x) { return x.id === id; })[0];
    if (b.dataset.aktion === 'notiz-speichern') {
      var text = $('textarea', karte).value.trim();
      aendereAnfrage(id, { notiz: text || null }).then(function () { a.notiz = text; hinweis('Notiz gespeichert'); }).catch(fehlerToast);
    } else if (b.dataset.aktion === 'datei') {
      if (demo) return hinweis('In der Demo gibt es keine echten Dateien.');
      b.disabled = true;
      dateiLink(a.datei_pfad, (a.details && a.details.datei) || 'druckdatei.stl').then(function (u) { location.href = u; }).catch(fehlerToast).then(function () { b.disabled = false; });
    } else if (b.dataset.aktion === 'loeschen') {
      if (!confirm('Anfrage von ' + a.name + (a.datei_pfad ? ' samt STL-Datei' : '') + ' endgültig löschen?')) return;
      loescheAnfrage(a).then(function () {
        anfragenDaten = anfragenDaten.filter(function (x) { return x.id !== id; });
        hinweis('Anfrage gelöscht'); anfragenZeigen();
      }).catch(fehlerToast);
    }
  });
  function beliebteKonfigs() {
    var zaehl = {};
    anfragenDaten.forEach(function (a) {
      if (a.art !== 'konfigurator' || !a.details || !a.details.farben) return;
      var f = a.details.farben, k = a.details.produkt + ': ' + Object.keys(f).map(function (t) { return f[t]; }).join(' / ');
      zaehl[k] = (zaehl[k] || 0) + 1;
    });
    var z = Object.keys(zaehl).map(function (k) { return [k, zaehl[k]]; }).sort(function (x, y) { return y[1] - x[1]; }).slice(0, 6);
    balkenListe($('#konfigs'), z, 'Anfragen');
  }

  /* ═══ Werkstatt ═══ */
  var wf = $('#werkstattForm');
  function vorschau() {
    var s = $('#w-status').value.trim(), l = $('#w-liefer').value.trim(), p = $('#werkstattVorschau');
    var teile = [];
    if (s) teile.push('<span>Gerade in der Werkstatt: <strong>' + esc(s) + '</strong></span>');
    if (l) teile.push('<span>Lieferzeit aktuell: <strong>' + esc(l) + '</strong></span>');
    p.innerHTML = teile.length ? '<span class="live" aria-hidden="true"></span>' + teile.join('<span aria-hidden="true">/</span>') : '<span>Noch nichts eingetragen.</span>';
    p.style.opacity = $('#w-sichtbar').checked ? 1 : .45;
  }
  ['#w-status', '#w-liefer', '#w-sichtbar'].forEach(function (s) { $(s).addEventListener('input', vorschau); $(s).addEventListener('change', vorschau); });
  function ladeWerkstatt() {
    var p = demo ? Promise.resolve([DEMO.werkstatt]) : api('/rest/v1/werkstatt?id=eq.1&select=*');
    return p.then(function (r) {
      var w = r && r[0] || {};
      $('#w-status').value = w.status_text || ''; $('#w-liefer').value = w.lieferzeit || ''; $('#w-sichtbar').checked = !!w.sichtbar;
      vorschau();
    }).catch(fehlerToast);
  }
  wf.addEventListener('submit', function (e) {
    e.preventDefault();
    var felder = { status_text: $('#w-status').value.trim() || null, lieferzeit: $('#w-liefer').value.trim() || null, sichtbar: $('#w-sichtbar').checked };
    var p = demo ? Promise.resolve() : api('/rest/v1/werkstatt?id=eq.1', { method: 'PATCH', headers: json(), body: JSON.stringify(felder) });
    p.then(function () { hinweis(demo ? 'Demo: nicht gespeichert' : 'Werkstatt-Status gespeichert'); }).catch(fehlerToast);
  });

  /* ═══ Einstellungen ═══ */
  var eigene = $('#eigeneAusblenden');
  try { eigene.checked = localStorage.getItem('aero3dp-kein-tracking') === '1'; } catch (e) {}
  eigene.addEventListener('change', function () {
    try { eigene.checked ? localStorage.setItem('aero3dp-kein-tracking', '1') : localStorage.removeItem('aero3dp-kein-tracking'); } catch (e) {}
    hinweis(eigene.checked ? 'Deine Aufrufe auf diesem Gerät zählen nicht mehr mit' : 'Deine Aufrufe zählen wieder mit');
  });
  $('#aufraeumen').addEventListener('click', function () {
    if (!confirm('Alle Aufrufe und Ereignisse löschen, die älter als 12 Monate sind?')) return;
    var grenze = new Date(Date.now() - 365 * 864e5).toISOString(), st = $('#aufraeumenStatus');
    var p = demo ? Promise.resolve() : Promise.all([
      api('/rest/v1/seitenaufrufe?erstellt=lt.' + encodeURIComponent(grenze), { method: 'DELETE', headers: json() }),
      api('/rest/v1/ereignisse?erstellt=lt.' + encodeURIComponent(grenze), { method: 'DELETE', headers: json() })]);
    p.then(function () { st.className = 'form-status ok'; st.textContent = 'Erledigt: Alles vor dem ' + new Date(grenze).toLocaleDateString('de-DE') + ' ist gelöscht.'; st.hidden = false; }).catch(fehlerToast);
  });

  function hinweis(t) { if (window.AeroToast) AeroToast(t); }
  function fehlerToast(err) { hinweis('Fehler: ' + (err && err.message ? err.message : err)); }

  /* ═══ Start ═══ */
  function starten() {
    $('#login').hidden = true; $('#app').hidden = false;
    $('#demoBanner').hidden = !demo;
    filterBauen();
    ladeUebersicht();
    ladeAnfragen().then(function (r) { anfragenDaten = r || []; anfragenZeigen(); beliebteKonfigs(); }).catch(fehlerToast);
    ladeWerkstatt();
  }

  function init() {
    demo = location.hash === '#demo';
    if (demo) { starten(); return; }
    try { sitzung = JSON.parse(sessionStorage.getItem(SK)); } catch (e) { sitzung = null; }
    if (eingerichtet && sitzung) starten(); else zeigeLogin();
  }
  window.addEventListener('hashchange', function () { location.reload(); });

  /* ═══ Demo-Daten (deutlich als Beispiel markiert) ═══ */
  var DEMO = (function () {
    var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    var alleTage = tageListe(365), proTag = alleTage.map(function (t, i) {
      var wt = new Date(t + 'T12:00:00').getDay(), basis = 14 + i * 0.09 + (wt === 0 || wt === 6 ? 9 : 0);
      var auf = Math.max(0, Math.round(basis * (0.7 + rnd() * 0.6))); return { tag: t, aufrufe: auf, besuche: Math.round(auf * (0.5 + rnd() * 0.15)) };
    });
    function statistik(tage) {
      var pt = proTag.slice(-tage), auf = 0, bes = 0;
      pt.forEach(function (d) { auf += d.aufrufe; bes += d.besuche; });
      var teil = function (f) { return Math.round(auf * f); };
      return {
        aufrufe: auf, besuche: bes, pro_tag: pt, anfragen: Math.max(2, Math.round(tage / 4)), offen: 3,
        seiten: [{ pfad: '/', n: teil(.41) }, { pfad: '/fj4-fury', n: teil(.17) }, { pfad: '/druckservice', n: teil(.14) }, { pfad: '/aero-33x', n: teil(.12) }, { pfad: '/fpv-flitzer', n: teil(.1) }, { pfad: '/datenschutz', n: teil(.02) }],
        quellen: [{ quelle: 'direkt', n: Math.round(bes * .38) }, { quelle: 'instagram.com', n: Math.round(bes * .27) }, { quelle: 'google.com', n: Math.round(bes * .2) }, { quelle: 'messe', n: Math.round(bes * .09) }, { quelle: 'rc-network.de', n: Math.round(bes * .06) }],
        geraete: { mobil: Math.round(bes * .64), desktop: Math.round(bes * .31), tablet: Math.round(bes * .05) },
        funnel: { produkt_aufrufe: teil(.39), konfiguriert: Math.round(teil(.39) * .34), produkt_anfragen: Math.max(1, Math.round(tage / 7)), druck_aufrufe: teil(.14), stl_geladen: Math.round(teil(.14) * .28), druck_anfragen: Math.max(1, Math.round(tage / 12)) },
      };
    }
    var jetzt = Date.now(), h = 36e5;
    var anfragen = [
      { id: 'd1', erstellt: new Date(jetzt - 3 * h).toISOString(), art: 'konfigurator', name: 'Beispiel: Lena M.', email: 'lena@example.com', status: 'neu', nachricht: 'Kann ich die Fury auch in Neuss abholen?', details: { produkt: 'FJ-4 Fury', code: 'FJ4-LW-BL.BL.GE-A-L', farben: { Rumpf: 'Blau', Tragflächen: 'Blau', Leitwerk: 'Gelb' }, material: 'LW-PLA', antrieb: true, lackierung: true, lack_wunsch: 'Blue-Angels-Look mit gelben Streifen', preis: 134.9, preis_offen: true } },
      { id: 'd2', erstellt: new Date(jetzt - 20 * h).toISOString(), art: 'druckservice', name: 'Beispiel: Jonas K.', email: 'jonas@example.com', status: 'neu', nachricht: 'Halterung für meinen Empfänger, gern bis Freitag.', datei_pfad: '2026/10/00000000-0000-4000-8000-000000000000.stl', details: { datei: 'empfaenger-halter.stl', groesse_mb: 1.2, masse_mm: [42, 28, 15.5], volumen_cm3: 6.4, material: 'PETG', qualitaet: 'standard', fuellung: 30, waende: 3, anzahl: 2, farbe: 'Schwarz', schaetzung_eur: 9.6, gewicht_g: 9.8, druckzeit_min: 74, passt: true, offene_kanten: 0 } },
      { id: 'd3', erstellt: new Date(jetzt - 50 * h).toISOString(), art: 'kontakt', name: 'Beispiel: Modellflugverein', email: 'verein@example.com', status: 'in_bearbeitung', nachricht: '[Kooperation] Hättet ihr Lust, beim Flugtag einen Stand zu machen?', details: { thema: 'Kooperation' } },
      { id: 'd4', erstellt: new Date(jetzt - 80 * h).toISOString(), art: 'konfigurator', name: 'Beispiel: Tim S.', email: 'tim@example.com', status: 'angebot_gesendet', nachricht: '', details: { produkt: 'FPV Flitzer', code: 'FLZ-PLA-GE.SW.GE-A', farben: { Flügel: 'Gelb', Winglets: 'Schwarz', Rumpf: 'Gelb' }, material: 'PLA', antrieb: true, preis: 66.9 } },
      { id: 'd5', erstellt: new Date(jetzt - 130 * h).toISOString(), art: 'konfigurator', name: 'Beispiel: Sara B.', email: 'sara@example.com', status: 'erledigt', nachricht: 'Danke für die schnelle Antwort!', details: { produkt: 'FJ-4 Fury', code: 'FJ4-LW-BL.BL.GE-0', farben: { Rumpf: 'Blau', Tragflächen: 'Blau', Leitwerk: 'Gelb' }, material: 'LW-PLA', antrieb: false, preis: 65.9 } },
      { id: 'd6', erstellt: new Date(jetzt - 190 * h).toISOString(), art: 'konfigurator', name: 'Beispiel: Ali R.', email: 'ali@example.com', status: 'erledigt', nachricht: '', details: { produkt: 'Aero-33X', code: '33X-PLA-WE.WE.RO-A', farben: { Rumpf: 'Weiß', Tragflächen: 'Weiß', Leitwerk: 'Aero-Rot' }, material: 'PLA', antrieb: true, preis: 114.9 } },
    ];
    return { statistik: statistik, anfragen: anfragen, werkstatt: { status_text: 'FJ-4 Fury in Blau-Gelb', lieferzeit: '5–7 Werktage', sichtbar: true } };
  })();

  init();
})();
