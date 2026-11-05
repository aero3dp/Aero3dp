/* Aero3dp – Admin: Bestellungen, Widerrufe, Shop-Einstellungen, Rechnung, Packliste */
(function () {
  'use strict';
  var A = null, PACK = window.AERO_PACK || { artikel: {}, hersteller: [] };
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  var euro = function (n) { return EUR.format(Number(n) || 0); };
  var D = { bestellungen: [], widerrufe: [], einst: null, rabatt: [], fehler: null };
  var filter = { status: 'offen', suche: '' }, aufgeklappt = {};
  var STATUS = { offen: 'Wartet auf Zahlung', bezahlt: 'Bezahlt – drucken', in_fertigung: 'In Fertigung', versendet: 'Versendet', abgeschlossen: 'Abgeschlossen', storniert: 'Storniert', widerrufen: 'Widerrufen' };
  var W_STATUS = [['neu', 'Neu'], ['in_bearbeitung', 'In Bearbeitung'], ['erledigt', 'Erledigt'], ['abgelehnt', 'Abgelehnt']];
  var DIENSTE = ['DHL', 'DPD', 'Hermes', 'GLS', 'Deutsche Post', 'Abholung'];
  var TRACKING = {
    DHL: function (n) { return 'https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=' + encodeURIComponent(n); },
    DPD: function (n) { return 'https://tracking.dpd.de/status/de_DE/parcel/' + encodeURIComponent(n); },
    Hermes: function (n) { return 'https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation#' + encodeURIComponent(n); },
    GLS: function (n) { return 'https://gls-group.com/DE/de/paketverfolgung?match=' + encodeURIComponent(n); }
  };
  var GRENZE_VORJAHR = 25000, GRENZE_JAHR = 100000;

  function start() { if (A) return; A = window.AeroAdmin; laden(); }
  document.addEventListener('aero:admin-start', start);
  /* admin.js kann schon gestartet sein, bevor diese Datei geladen ist (Demo, gespeicherte Sitzung) */
  setTimeout(function () { if (window.AeroAdmin && window.AeroAdmin.gestartet) start(); }, 0);

  /* ═══ Hilfen ═══ */
  function datum(iso, mitZeit) {
    if (!iso) return '–';
    var d = new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso);
    var t = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return mitZeit ? t + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr' : t;
  }
  function plusTage(iso, n) { var d = new Date(iso); d.setDate(d.getDate() + n); return d; }
  function plusWerktage(iso, n) {
    var d = new Date(iso), z = 0;
    while (z < n) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) z++; }
    return d;
  }
  function lieferTage() {
    var t = ($('#w-liefer') && $('#w-liefer').value) || '6 Werktage';
    var zahlen = (t.match(/\d+/g) || ['6']).map(Number);
    return Math.max.apply(null, zahlen);
  }
  function ibanSchoen(i) { return String(i || '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim(); }
  function ibanGueltig(iban) {
    var s = String(iban || '').replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(s)) return false;
    var r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, function (c) { return (c.charCodeAt(0) - 55).toString(); });
    var rest = 0; for (var i = 0; i < r.length; i += 7) rest = parseInt(String(rest) + r.slice(i, i + 7), 10) % 97;
    return rest === 1;
  }
  function adresse(a, name) {
    if (!a) return '';
    return [esc(a.name || name || ''), esc(a.strasse), a.zusatz ? esc(a.zusatz) : '', esc(a.plz) + ' ' + esc(a.ort)].filter(Boolean).join('<br>');
  }
  function vorname(n) { return String(n || '').trim().split(/\s+/)[0]; }
  function api(pfad, opt) { return A.api(pfad, opt); }
  function rueckgabe() { return { 'Content-Type': 'application/json', Prefer: 'return=representation' }; }

  /* ═══ Laden ═══ */
  function laden() {
    if (A.istDemo()) {
      D.bestellungen = DEMO.bestellungen(); D.widerrufe = DEMO.widerrufe(); D.einst = DEMO.einst; D.rabatt = DEMO.rabatt.slice();
      allesZeichnen(); return;
    }
    Promise.all([
      api('/rest/v1/bestellungen?select=*&order=erstellt.desc&limit=1000').then(function (r) { D.bestellungen = r || []; }),
      api('/rest/v1/widerrufe?select=*&order=erstellt.desc&limit=500').then(function (r) { D.widerrufe = r || []; }),
      api('/rest/v1/shop_einstellungen?id=eq.1&select=*').then(function (r) { D.einst = (r && r[0]) || null; }),
      api('/rest/v1/rabattcodes?select=*&order=code').then(function (r) { D.rabatt = r || []; })
    ]).then(allesZeichnen).catch(function (e) {
      D.fehler = e.message;
      $('#bestellListe').innerHTML = '<p class="leer">Die Shop-Daten konnten nicht geladen werden (' + esc(e.message) + '). Ist die Datei <code>supabase-shop.sql</code> eingespielt?</p>';
    });
  }
  function allesZeichnen() { zeichneBestellungen(); zeichneWiderrufe(); zeichneEinstellungen(); zeichneRabatt(); zaehler(); uebersichtHinweis(); }

  function zaehler() {
    var arbeit = D.bestellungen.filter(function (b) { return b.status === 'bezahlt' || b.status === 'in_fertigung' || (b.status === 'offen' && ueberfaellig(b)); }).length;
    var z = $('#bestellZaehler'); z.hidden = !arbeit; z.textContent = arbeit;
    var w = D.widerrufe.filter(function (x) { return x.status === 'neu'; }).length;
    var zw = $('#widerrufZaehler'); zw.hidden = !w; zw.textContent = w;
  }
  function frist() { return (D.einst && D.einst.zahlungsfrist_tage) || 7; }
  function faellig(b) { return plusTage(b.erstellt, frist()); }
  function ueberfaellig(b) { return b.status === 'offen' && new Date() > faellig(b); }
  function versandBis(b) { return b.bezahlt_am ? plusWerktage(b.bezahlt_am, lieferTage()) : null; }

  /* ═══ Hinweis auf der Übersicht ═══ */
  function uebersichtHinweis() {
    var el = $('#shopHinweis'), e = D.einst;
    if (!e) { el.hidden = true; return; }
    var fehlt = [];
    if (!e.mail_bereit) fehlt.push('Testmail');
    if (!e.iban || !e.kontoinhaber) fehlt.push('Bankverbindung');
    var zuTun = D.bestellungen.filter(function (b) { return b.status === 'bezahlt' || b.status === 'in_fertigung'; }).length;
    var w = D.widerrufe.filter(function (x) { return x.status === 'neu'; }).length;
    var teile = [];
    if (!e.shop_aktiv) teile.push('<b>Dein Shop ist geschlossen.</b> ' + (fehlt.length ? 'Es fehlt noch: ' + fehlt.join(' und ') + '.' : 'Alles ist bereit – du kannst ihn öffnen.') + ' <button type="button" class="textknopf" data-gehe="t-einstellungen">Zu den Einstellungen</button>');
    if (zuTun) teile.push('<b>' + zuTun + ' bezahlte Bestellung' + (zuTun === 1 ? '' : 'en') + '</b> warten auf Druck und Versand. <button type="button" class="textknopf" data-gehe="t-bestellungen">Ansehen</button>');
    if (w) teile.push('<b>' + w + ' neuer Widerruf' + (w === 1 ? '' : 'e') + '.</b> <button type="button" class="textknopf" data-gehe="t-widerrufe">Ansehen</button>');
    el.innerHTML = teile.map(function (t) { return '<p>' + t + '</p>'; }).join('');
    el.hidden = !teile.length;
  }
  document.addEventListener('click', function (e) { var b = e.target.closest('[data-gehe]'); if (b) A.tab(b.getAttribute('data-gehe')); });

  /* ═══ Bestellungen ═══ */
  function umsatz(jahr) {
    return D.bestellungen.filter(function (b) {
      return b.bezahlt_am && new Date(b.bezahlt_am).getFullYear() === jahr && ['bezahlt', 'in_fertigung', 'versendet', 'abgeschlossen'].indexOf(b.status) >= 0;
    }).reduce(function (s, b) { return s + Number(b.gesamt); }, 0);
  }
  function kacheln() {
    var offen = D.bestellungen.filter(function (b) { return b.status === 'offen'; });
    var summeOffen = offen.reduce(function (s, b) { return s + Number(b.gesamt); }, 0);
    var drucken = D.bestellungen.filter(function (b) { return b.status === 'bezahlt'; }).length;
    var fertigung = D.bestellungen.filter(function (b) { return b.status === 'in_fertigung'; }).length;
    var jahr = new Date().getFullYear(), u = umsatz(jahr), uv = umsatz(jahr - 1);
    var anteil = Math.min(100, u / GRENZE_VORJAHR * 100), warn = u >= GRENZE_VORJAHR * 0.8;
    $('#bestellKacheln').innerHTML =
      '<dl class="kachel' + (offen.some(ueberfaellig) ? ' akzent' : '') + '"><dt>Warten auf Zahlung</dt><dd>' + offen.length + '</dd><dd class="delta">' + euro(summeOffen) + (offen.some(ueberfaellig) ? ' · ' + offen.filter(ueberfaellig).length + ' überfällig' : '') + '</dd></dl>' +
      '<dl class="kachel' + (drucken ? ' akzent' : '') + '"><dt>Bezahlt – drucken</dt><dd>' + drucken + '</dd><dd class="delta">' + (drucken ? 'Lieferzeit läuft' : 'nichts zu tun') + '</dd></dl>' +
      '<dl class="kachel"><dt>In Fertigung</dt><dd>' + fertigung + '</dd><dd class="delta">bereit zum Verpacken und Versenden</dd></dl>' +
      '<div class="kachel ku' + (warn ? ' warn' : '') + '"><dl><dt>Umsatz ' + jahr + ' (Shop)</dt><dd>' + euro(u) + '</dd></dl>' +
      '<div class="ku-spur" role="img" aria-label="' + Math.round(anteil) + ' Prozent der Kleinunternehmergrenze von 25.000 Euro"><i style="width:' + anteil.toFixed(1) + '%"></i></div>' +
      '<p class="delta">' + Math.round(anteil) + ' % von 25.000 € · Vorjahr ' + euro(uv) + '. <a class="textlink" href="#rat-buchhaltung" data-ratgeber="rat-buchhaltung">Was heißt das?</a></p></div>';
  }
  function filterKnoepfe() {
    var f = [['offen', 'Zu erledigen'], ['alle', 'Alle'], ['offen_zahlung', 'Wartet auf Zahlung'], ['bezahlt', 'Bezahlt'], ['in_fertigung', 'In Fertigung'], ['versendet', 'Versendet'], ['abgeschlossen', 'Abgeschlossen'], ['storniert', 'Storniert'], ['widerrufen', 'Widerrufen']];
    $('#filterBestellung').innerHTML = f.map(function (x) { return '<button type="button" data-f="' + x[0] + '" aria-pressed="' + (filter.status === x[0]) + '">' + x[1] + '</button>'; }).join('');
  }
  $('#filterBestellung').addEventListener('click', function (e) { var b = e.target.closest('button[data-f]'); if (b) { filter.status = b.dataset.f; zeichneBestellungen(); } });
  $('#bestellSuche').addEventListener('input', function () { filter.suche = this.value.trim().toLowerCase(); zeichneBestellungen(); });

  function passt(b) {
    var s = filter.status, ok;
    if (s === 'offen') ok = ['offen', 'bezahlt', 'in_fertigung'].indexOf(b.status) >= 0;
    else if (s === 'alle') ok = true;
    else if (s === 'offen_zahlung') ok = b.status === 'offen';
    else ok = b.status === s;
    if (ok && filter.suche) ok = (b.nummer + ' ' + b.name + ' ' + b.email).toLowerCase().indexOf(filter.suche) >= 0;
    return ok;
  }

  function naechsterSchritt(b) {
    var mailCheck = '<label class="feld-check mail-check"><input type="checkbox" data-mail checked> <span>Kundin / Kunden per E-Mail informieren</span></label>' +
      '<textarea class="mail-notiz" data-notiz placeholder="Persönliche Nachricht für die E-Mail (optional)" aria-label="Persönliche Nachricht für die E-Mail"></textarea>';
    if (b.status === 'offen') {
      var ue = ueberfaellig(b);
      return '<div class="schritt-box' + (ue ? ' warn' : '') + '"><h4>' + (ue ? 'Zahlung überfällig' : 'Warten auf die Überweisung') + '</h4>' +
        '<p>' + (ue ? 'Die Frist ist am ' + datum(faellig(b)) + ' abgelaufen. Schau noch einmal im Online-Banking nach – sonst schick eine freundliche Erinnerung mit neuer Frist von ' + frist() + ' Tagen.'
          : 'Fällig bis ' + datum(faellig(b)) + '. Such im Online-Banking nach dem Verwendungszweck <b>' + esc(b.nummer) + '</b> und dem Betrag <b>' + euro(b.gesamt) + '</b>. Ist das Geld da, bestätige die Zahlung.') + '</p>' + mailCheck +
        '<div class="knopf-zeile"><button class="btn btn-small" type="button" data-a="bezahlt">Zahlung eingegangen</button>' +
        '<button class="btn btn-ghost btn-small" type="button" data-a="erinnerung">Zahlungserinnerung senden</button>' +
        '<button class="btn btn-ghost btn-small gefahr" type="button" data-a="storno">Stornieren</button></div></div>';
    }
    if (b.status === 'bezahlt') {
      return '<div class="schritt-box"><h4>Jetzt drucken</h4><p>Bezahlt am ' + datum(b.bezahlt_am) + '. Bei ' + lieferTage() + ' Werktagen Lieferzeit sollte das Paket bis spätestens <b>' + datum(versandBis(b)) + '</b> bei der Kundin sein – plane den Versand also ein, zwei Tage vorher. Druck die Packliste und leg los.</p>' +
        '<div class="knopf-zeile"><button class="btn btn-small" type="button" data-a="fertigung">Fertigung starten</button><button class="btn btn-ghost btn-small" type="button" data-a="packliste">Packliste &amp; Etiketten</button></div></div>';
    }
    if (b.status === 'in_fertigung') {
      return '<div class="schritt-box"><h4>Prüfen, verpacken, versenden</h4><p>Qualitätskontrolle, verpacken, Beilagen rein: Rechnung, Sicherheitshinweise, Etikett mit Herstellerangaben. <a class="textlink" href="#rat-beilagen" data-ratgeber="rat-beilagen">Checkliste</a>. Dann Paketmarke kaufen und die Sendungsnummer hier eintragen.</p>' +
        '<div class="versand-felder"><div class="feld"><label>Versand mit</label><select data-dienst>' + DIENSTE.map(function (d) { return '<option' + (d === (b.versanddienst || 'DHL') ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select></div>' +
        '<div class="feld"><label>Sendungsnummer</label><input data-sendung maxlength="60" value="' + esc(b.sendungsnummer || '') + '" placeholder="z. B. 00340434…"></div></div>' + mailCheck +
        '<div class="knopf-zeile"><button class="btn btn-small" type="button" data-a="versendet">Als versendet markieren</button><button class="btn btn-ghost btn-small" type="button" data-a="packliste">Packliste &amp; Etiketten</button><button class="btn btn-ghost btn-small" type="button" data-a="rechnung">Rechnung</button></div></div>';
    }
    if (b.status === 'versendet') {
      var link = b.sendungsnummer && TRACKING[b.versanddienst || 'DHL'] ? TRACKING[b.versanddienst || 'DHL'](b.sendungsnummer) : '';
      return '<div class="schritt-box"><h4>Unterwegs</h4><p>Versendet am ' + datum(b.versendet_am) + (b.sendungsnummer ? ' mit ' + esc(b.versanddienst || 'DHL') + ', Sendung ' + (link ? '<a class="textlink" href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(b.sendungsnummer) + '</a>' : esc(b.sendungsnummer)) : '') + '. Ist das Paket zugestellt und alles in Ordnung, schließ die Bestellung ab. Ab Zustellung läuft die 14-tägige Widerrufsfrist.</p>' +
        '<div class="knopf-zeile"><button class="btn btn-small" type="button" data-a="abschliessen">Abschließen</button></div></div>';
    }
    if ((b.status === 'storniert' || b.status === 'widerrufen') && b.bezahlt_am) {
      return '<div class="schritt-box"><h4>Erstattung</h4><p>Diese Bestellung war bezahlt. Überweise den Betrag spätestens 14 Tage nach Storno oder Widerruf zurück (beim Widerruf darfst du warten, bis die Ware zurück ist) und sag der Kundin Bescheid.</p>' +
        '<textarea class="mail-notiz" data-notiz placeholder="Persönliche Nachricht, z. B. erstatteter Betrag (optional)" aria-label="Persönliche Nachricht"></textarea>' +
        '<div class="knopf-zeile"><button class="btn btn-small" type="button" data-a="erstattung">Mail „Erstattung“ senden</button></div></div>';
    }
    return '';
  }

  function bestellungHtml(b) {
    var auf = !!aufgeklappt[b.id];
    var warn = [];
    if (ueberfaellig(b)) warn.push('<span class="marke warn">überfällig</span>');
    if (!b.mail_bestaetigung) warn.push('<span class="marke warn">Bestätigung nicht gesendet</span>');
    if (b.status === 'bezahlt' && versandBis(b) && new Date() > plusTage(versandBis(b), -2)) warn.push('<span class="marke warn">Versand knapp</span>');
    var kopf = '<button type="button" class="bestellung-kopf" data-toggle aria-expanded="' + auf + '">' +
      '<span class="b-nummer">' + esc(b.nummer) + '</span><span class="b-name">' + esc(b.name) + '</span>' +
      '<time datetime="' + esc(b.erstellt) + '">' + datum(b.erstellt, true) + '</time>' +
      '<span class="b-summe">' + euro(b.gesamt) + '</span><span class="status-chip s-' + b.status + '">' + STATUS[b.status] + '</span>' + warn.join('') + '</button>';
    if (!auf) return '<article class="bestellung s-' + b.status + '" data-id="' + esc(b.id) + '">' + kopf + '</article>';
    var pos = (b.positionen || []).map(function (p) {
      return '<tr><td><b>' + p.menge + ' × ' + esc(p.name) + '</b>' + (p.beschreibung ? '<br><small>' + esc(p.beschreibung) + '</small>' : '') + (p.konfig ? '<br><code>' + esc(p.konfig) + '</code>' : '') + '</td><td class="z">' + euro(p.einzelpreis) + '</td><td class="z">' + euro(p.summe) + '</td></tr>';
    }).join('');
    var summen = '<tr class="s"><td colspan="2">Zwischensumme</td><td class="z">' + euro(b.warenwert) + '</td></tr>' +
      (Number(b.rabatt) > 0 ? '<tr class="s"><td colspan="2">Rabatt ' + esc(b.rabatt_code || '') + '</td><td class="z">−' + euro(b.rabatt) + '</td></tr>' : '') +
      '<tr class="s"><td colspan="2">Versand</td><td class="z">' + (Number(b.versand) ? euro(b.versand) : 'kostenlos') + '</td></tr>' +
      '<tr class="s g"><td colspan="2">Gesamt</td><td class="z">' + euro(b.gesamt) + '</td></tr>';
    var verlauf = [['Bestellt', datum(b.erstellt, true)], ['Bestätigung', b.mail_bestaetigung ? datum(b.mail_bestaetigung, true) : '<span class="warn-text">nicht gesendet</span>'],
      ['Bezahlt', b.bezahlt_am ? datum(b.bezahlt_am, true) : '–'], ['Versendet', b.versendet_am ? datum(b.versendet_am, true) : '–'],
      ['Rechnung', b.rechnungsnummer ? esc(b.rechnungsnummer) + ' vom ' + datum(b.rechnungsdatum) : '–'], ['AGB-Stand', esc(b.rechtstexte_stand || '–')]];
    var statusOpts = Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (k === b.status ? ' selected' : '') + '>' + STATUS[k] + '</option>'; }).join('');
    var wid = D.widerrufe.filter(function (w) { return w.bestellung_id === b.id; });
    return '<article class="bestellung offen-detail s-' + b.status + '" data-id="' + esc(b.id) + '">' + kopf +
      '<div class="bestellung-body">' + naechsterSchritt(b) +
      (wid.length ? '<p class="hinweis-widerruf">Zu dieser Bestellung gibt es einen Widerruf vom ' + datum(wid[0].erstellt, true) + '. <button type="button" class="textknopf" data-gehe="t-widerrufe">Ansehen</button></p>' : '') +
      '<div class="bestellung-raster"><div><table class="pos-tabelle"><thead><tr><th>Artikel</th><th class="z">Einzeln</th><th class="z">Summe</th></tr></thead><tbody>' + pos + summen + '</tbody></table></div>' +
      '<div class="kunde"><h4>Kunde</h4><p>' + esc(b.name) + '<br><a class="textlink" href="mailto:' + esc(b.email) + '?subject=' + encodeURIComponent('Deine Bestellung ' + b.nummer) + '">' + esc(b.email) + '</a>' + (b.telefon ? '<br>' + esc(b.telefon) : '') + '</p>' +
      '<h4>Rechnungsadresse</h4><p>' + adresse(b.adresse, b.name) + '</p><h4>Lieferadresse</h4><p>' + (b.lieferadresse ? adresse(b.lieferadresse) : 'wie Rechnungsadresse') + '</p>' +
      (b.kommentar ? '<h4>Anmerkung</h4><p class="anmerkung">' + esc(b.kommentar) + '</p>' : '') + '</div>' +
      '<div class="verlauf"><h4>Verlauf</h4><dl>' + verlauf.map(function (v) { return '<dt>' + v[0] + '</dt><dd>' + v[1] + '</dd>'; }).join('') + '</dl></div></div>' +
      '<div class="bestellung-aktionen"><button class="btn btn-ghost btn-small" type="button" data-a="rechnung">Rechnung</button>' +
      '<button class="btn btn-ghost btn-small" type="button" data-a="packliste">Packliste &amp; Etiketten</button>' +
      '<button class="btn btn-ghost btn-small" type="button" data-a="bestaetigung">Bestätigung ' + (b.mail_bestaetigung ? 'erneut ' : '') + 'senden</button>' +
      '<label class="status-wahl"><span>Status von Hand</span><select data-status>' + statusOpts + '</select></label></div>' +
      '<div class="notiz-zeile"><textarea data-bnotiz placeholder="Interne Notiz (sieht nur du)" aria-label="Interne Notiz">' + esc(b.notiz || '') + '</textarea><button class="btn btn-ghost btn-small" type="button" data-a="notiz">Notiz speichern</button>' +
      (!b.rechnungsnummer && (b.status === 'storniert' || b.status === 'offen') ? '<button class="btn btn-ghost btn-small gefahr" type="button" data-a="loeschen">Löschen</button>' : '') + '</div>' +
      '</div></article>';
  }

  function zeichneBestellungen() {
    kacheln(); filterKnoepfe();
    var liste = D.bestellungen.filter(passt);
    var el = $('#bestellListe');
    if (!D.bestellungen.length) { el.innerHTML = '<p class="leer">Noch keine Bestellungen. Sobald der Shop geöffnet ist, landen sie hier.</p>'; return; }
    el.innerHTML = liste.length ? liste.map(bestellungHtml).join('') : '<p class="leer">Keine Bestellungen mit diesem Filter.' + (filter.status === 'offen' ? ' Alles erledigt.' : '') + '</p>';
  }
  function finde(id) { return D.bestellungen.filter(function (b) { return b.id === id; })[0]; }

  function aktualisieren(b, felder) {
    if (A.istDemo()) {
      Object.assign(b, felder);
      if (felder.status === 'bezahlt' && !b.bezahlt_am) b.bezahlt_am = new Date().toISOString();
      if (felder.status === 'versendet' && !b.versendet_am) b.versendet_am = new Date().toISOString();
      return Promise.resolve(b);
    }
    return api('/rest/v1/bestellungen?id=eq.' + encodeURIComponent(b.id), { method: 'PATCH', headers: rueckgabe(), body: JSON.stringify(felder) })
      .then(function (r) { if (r && r[0]) Object.assign(b, r[0]); else Object.assign(b, felder); return b; });
  }
  function mail(b, vorlage, notiz) {
    if (A.istDemo()) { A.hinweis('Demo: Die Mail „' + vorlage + '“ würde jetzt an ' + b.email + ' gehen.'); return Promise.resolve(); }
    return A.funktion('shop-mail', { art: 'status', id: b.id, vorlage: vorlage, notiz: notiz || '' }).then(function () { A.hinweis('E-Mail an ' + b.email + ' gesendet'); });
  }

  $('#bestellListe').addEventListener('click', function (e) {
    var art = e.target.closest('.bestellung'); if (!art) return;
    var b = finde(art.getAttribute('data-id')); if (!b) return;
    if (e.target.closest('[data-toggle]')) { aufgeklappt[b.id] = !aufgeklappt[b.id]; zeichneBestellungen(); return; }
    var k = e.target.closest('button[data-a]'); if (!k) return;
    var a = k.getAttribute('data-a');
    var mitMail = art.querySelector('[data-mail]') ? art.querySelector('[data-mail]').checked : false;
    var notiz = art.querySelector('[data-notiz]') ? art.querySelector('[data-notiz]').value.trim() : '';
    var fertig = function (text) { if (text) A.hinweis(text); zeichneBestellungen(); zaehler(); uebersichtHinweis(); };
    var los = function (p) { k.disabled = true; return p.catch(A.fehlerToast).then(function () { k.disabled = false; }); };

    if (a === 'bezahlt') los(aktualisieren(b, { status: 'bezahlt' }).then(function () { return mitMail ? mail(b, 'zahlung', notiz) : null; }).then(function () { fertig('Als bezahlt markiert'); }));
    else if (a === 'erinnerung') {
      if (!confirm('Zahlungserinnerung an ' + b.email + ' senden? Die neue Frist ist ' + frist() + ' Tage ab heute.')) return;
      los(mail(b, 'erinnerung', notiz).then(function () { return aktualisieren(b, { notiz: ((b.notiz ? b.notiz + '\n' : '') + 'Zahlungserinnerung gesendet am ' + datum(new Date())).slice(0, 4000) }); }).then(function () { fertig(); }));
    }
    else if (a === 'storno') {
      if (!confirm('Bestellung ' + b.nummer + ' wirklich stornieren?')) return;
      los(aktualisieren(b, { status: 'storniert' }).then(function () { return mitMail ? mail(b, 'storno', notiz) : null; }).then(function () { fertig('Storniert'); }));
    }
    else if (a === 'fertigung') los(aktualisieren(b, { status: 'in_fertigung' }).then(function () { fertig('In Fertigung'); }));
    else if (a === 'versendet') {
      var dienst = art.querySelector('[data-dienst]').value, nr = art.querySelector('[data-sendung]').value.trim();
      if (!nr && dienst !== 'Abholung' && !confirm('Ohne Sendungsnummer als versendet markieren?')) return;
      los(aktualisieren(b, { status: 'versendet', versanddienst: dienst, sendungsnummer: nr || null }).then(function () { return mitMail ? mail(b, 'versand', notiz) : null; }).then(function () { fertig('Als versendet markiert'); }));
    }
    else if (a === 'abschliessen') los(aktualisieren(b, { status: 'abgeschlossen' }).then(function () { fertig('Abgeschlossen'); }));
    else if (a === 'erstattung') los(mail(b, 'erstattung', notiz).then(function () { fertig(); }));
    else if (a === 'bestaetigung') {
      if (!confirm('Bestellbestätigung (mit Bankverbindung, AGB und Widerrufsbelehrung) an ' + b.email + ' senden?')) return;
      los((A.istDemo() ? Promise.resolve() : A.funktion('shop-mail', { art: 'bestellung', id: b.id })).then(function () {
        if (!b.mail_bestaetigung) b.mail_bestaetigung = new Date().toISOString();
        fertig(A.istDemo() ? 'Demo: Bestätigung würde jetzt gesendet' : 'Bestätigung gesendet');
      }));
    }
    else if (a === 'notiz') los(aktualisieren(b, { notiz: art.querySelector('[data-bnotiz]').value.trim() || null }).then(function () { A.hinweis('Notiz gespeichert'); }));
    else if (a === 'rechnung') rechnung(b);
    else if (a === 'packliste') druckFenster('Packliste ' + b.nummer, packlisteHtml(b));
    else if (a === 'loeschen') {
      if (!confirm('Bestellung ' + b.nummer + ' endgültig löschen? Das geht nur ohne Rechnung – bezahlte Bestellungen bitte aufbewahren.')) return;
      los((A.istDemo() ? Promise.resolve() : api('/rest/v1/bestellungen?id=eq.' + encodeURIComponent(b.id), { method: 'DELETE', headers: A.json() })).then(function () {
        D.bestellungen = D.bestellungen.filter(function (x) { return x.id !== b.id; }); fertig('Gelöscht');
      }));
    }
  });
  $('#bestellListe').addEventListener('change', function (e) {
    if (!e.target.matches('[data-status]')) return;
    var b = finde(e.target.closest('.bestellung').getAttribute('data-id')), neu = e.target.value;
    if (!confirm('Status von ' + b.nummer + ' auf „' + STATUS[neu] + '“ setzen? (ohne E-Mail)')) { e.target.value = b.status; return; }
    aktualisieren(b, { status: neu }).then(function () { A.hinweis('Status gespeichert'); zeichneBestellungen(); zaehler(); uebersichtHinweis(); }).catch(A.fehlerToast);
  });

  /* ═══ Drucken: Rechnung, Packliste, Etiketten ═══ */
  var DRUCK_CSS = '@page{size:A4;margin:16mm 16mm 18mm}*{box-sizing:border-box}body{font:10.5pt/1.45 Arial,Helvetica,sans-serif;color:#111;margin:0}' +
    'h1{font-size:20pt;margin:0 0 4mm;letter-spacing:-.3px}h2{font-size:12pt;margin:7mm 0 2mm}h3{font-size:10.5pt;margin:4mm 0 1mm}' +
    '.absenderzeile{font-size:7.5pt;color:#555;border-bottom:.3mm solid #999;padding-bottom:1mm;margin-bottom:3mm;display:inline-block}' +
    '.kopf{display:flex;justify-content:space-between;gap:10mm;margin:8mm 0 10mm}.logo{height:12mm}.marke{display:flex;justify-content:space-between;align-items:flex-start}' +
    '.meta td{padding:.6mm 0 .6mm 6mm}.meta td:first-child{color:#555;padding-left:0}table{border-collapse:collapse;width:100%}' +
    '.pos th{text-align:left;font-size:9pt;color:#555;border-bottom:.4mm solid #111;padding:2mm 1.5mm}.pos td{padding:2.2mm 1.5mm;border-bottom:.2mm solid #ccc;vertical-align:top}' +
    '.pos .z{text-align:right;white-space:nowrap}.pos small{color:#555}.summen{width:auto;margin-left:auto;margin-top:3mm}.summen td{padding:1mm 0 1mm 10mm;text-align:right}' +
    '.summen tr.g td{font-weight:bold;font-size:12pt;border-top:.4mm solid #111;padding-top:2mm}.hinweis{margin-top:7mm}.fuss{position:fixed;bottom:0;left:0;right:0;font-size:7.5pt;color:#555;border-top:.2mm solid #999;padding-top:2mm}' +
    '.check{list-style:none;padding:0;margin:0}.check li{padding:1.3mm 0 1.3mm 7mm;position:relative}.check li::before{content:"";position:absolute;left:0;top:1.6mm;width:3.6mm;height:3.6mm;border:.35mm solid #111}' +
    '.position{border:.3mm solid #999;border-radius:2mm;padding:3mm 4mm;margin:3mm 0;break-inside:avoid}.position code{font:bold 10pt monospace}.zeile{display:flex;gap:8mm}.zeile>div{flex:1}' +
    '.linie{display:inline-block;border-bottom:.3mm solid #111;min-width:45mm}.etiketten{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-top:4mm}' +
    '.etikett{border:.3mm dashed #777;padding:4mm;font-size:8.5pt;line-height:1.4;break-inside:avoid}.etikett b{font-size:10pt}.etikett .warn{margin-top:2mm;font-weight:bold}.neue-seite{break-before:page}' +
    '@media screen{body{max-width:190mm;margin:10mm auto;padding:0 8mm}.fuss{position:static;margin-top:12mm}}';
  function druckFenster(titel, inhalt) {
    var w = window.open('', '_blank');
    if (!w) { A.hinweis('Bitte erlaube Pop-ups für diese Seite, damit das Drucken klappt.'); return; }
    w.document.write('<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>' + esc(titel) + '</title><style>' + DRUCK_CSS + '</style></head><body>' + inhalt +
      '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},350)})<\/script></body></html>');
    w.document.close();
  }
  var H = function () { return PACK.hersteller || []; };
  function rechnungHtml(b, r) {
    var e = D.einst || {}, bank = r.bank || {};
    var lieferdatum = b.versendet_am ? datum(b.versendet_am) : 'entspricht dem Rechnungsdatum';
    var pos = (b.positionen || []).map(function (p, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + p.menge + '</td><td><b>' + esc(p.name) + '</b>' + (p.beschreibung ? '<br><small>' + esc(p.beschreibung) + '</small>' : '') + (p.konfig ? '<br><small>Konfiguration ' + esc(p.konfig) + '</small>' : '') + '</td><td class="z">' + euro(p.einzelpreis) + '</td><td class="z">' + euro(p.summe) + '</td></tr>';
    }).join('');
    var bezahlt = b.bezahlt_am ? '<p>Betrag am ' + datum(b.bezahlt_am) + ' per Überweisung dankend erhalten.</p>'
      : '<p>Bitte überweise den Betrag bis ' + datum(faellig(b)) + ' auf das Konto ' + esc(bank.kontoinhaber || '') + ', IBAN ' + esc(ibanSchoen(bank.iban)) + (bank.bic ? ', BIC ' + esc(bank.bic) : '') + ', Verwendungszweck ' + esc(b.nummer) + '.</p>';
    return '<div class="marke"><div><span class="absenderzeile">' + esc(H().join(' · ')) + '</span><div>' + adresse(b.adresse, b.name) + '<br>Deutschland</div></div>' +
      '<img class="logo" src="' + location.origin + '/bilder/logo.png" alt="Aero3dp"></div>' +
      '<div class="kopf"><div></div><table class="meta"><tr><td>Rechnungsnummer</td><td><b>' + esc(r.rechnungsnummer) + '</b></td></tr><tr><td>Rechnungsdatum</td><td>' + datum(r.rechnungsdatum) + '</td></tr>' +
      '<tr><td>Bestellnummer</td><td>' + esc(b.nummer) + '</td></tr><tr><td>Bestelldatum</td><td>' + datum(b.erstellt) + '</td></tr><tr><td>Lieferdatum</td><td>' + lieferdatum + '</td></tr></table></div>' +
      '<h1>Rechnung</h1><p>Hallo ' + esc(vorname(b.name)) + ', vielen Dank für deine Bestellung. Wir berechnen dir:</p>' +
      '<table class="pos"><thead><tr><th>Pos.</th><th>Menge</th><th>Bezeichnung</th><th class="z">Einzelpreis</th><th class="z">Gesamt</th></tr></thead><tbody>' + pos + '</tbody></table>' +
      '<table class="summen"><tr><td>Zwischensumme</td><td>' + euro(b.warenwert) + '</td></tr>' + (Number(b.rabatt) > 0 ? '<tr><td>Rabatt ' + esc(b.rabatt_code || '') + '</td><td>−' + euro(b.rabatt) + '</td></tr>' : '') +
      '<tr><td>Versand</td><td>' + (Number(b.versand) ? euro(b.versand) : '0,00 €') + '</td></tr><tr class="g"><td>Rechnungsbetrag</td><td>' + euro(b.gesamt) + '</td></tr></table>' +
      '<div class="hinweis"><p><b>Steuerfreie Leistung: Kleinunternehmer nach § 19 Abs. 1 UStG. Es wird keine Umsatzsteuer berechnet.</b></p>' + bezahlt + '</div>' +
      (b.lieferadresse ? '<p>Lieferadresse: ' + adresse(b.lieferadresse).replace(/<br>/g, ', ') + '</p>' : '') +
      '<div class="fuss">' + esc(H().join(' · ')) + ' · ' + esc(PACK.mail || '') + ' · aero3dp.de<br>' +
      (r.steuernummer ? 'Steuernummer: ' + esc(r.steuernummer) : '<b>Steuernummer fehlt!</b>') + (r.widnr ? ' · Wirtschafts-ID: ' + esc(r.widnr) : '') +
      (bank.iban ? ' · Bank: ' + esc(bank.bank || '') + ' · IBAN ' + esc(ibanSchoen(bank.iban)) : '') + '</div>';
  }
  function rechnung(b) {
    var e = D.einst || {};
    if (!A.istDemo() && !e.steuernummer && !confirm('Du hast noch keine Steuernummer eingetragen – sie gehört auf jede Rechnung. Trotzdem jetzt eine Rechnungsnummer vergeben?')) { A.tab('t-einstellungen'); return; }
    var p = A.istDemo()
      ? Promise.resolve({ rechnungsnummer: b.rechnungsnummer || 'R-' + new Date().getFullYear() + '-0004', rechnungsdatum: b.rechnungsdatum || new Date().toISOString().slice(0, 10), steuernummer: '123/4567/8901', widnr: null, bank: { kontoinhaber: e.kontoinhaber, iban: e.iban, bic: e.bic, bank: e.bank } })
      : api('/rest/v1/rpc/rechnung_vergeben', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: b.id }) });
    p.then(function (r) {
      b.rechnungsnummer = r.rechnungsnummer; b.rechnungsdatum = r.rechnungsdatum;
      druckFenster('Rechnung ' + r.rechnungsnummer, rechnungHtml(b, r));
      zeichneBestellungen();
    }).catch(A.fehlerToast);
  }
  function packlisteHtml(b) {
    var liefer = b.lieferadresse || b.adresse;
    var elektro = (b.positionen || []).some(function (p) { return p.antrieb || (PACK.artikel[p.code] || {}).elektro; });
    var positionen = (b.positionen || []).map(function (p) {
      var info = PACK.artikel[p.code] || { inhalt: [], antrieb: [] };
      var inhalt = (info.inhalt || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
      var antrieb = p.antrieb ? (info.antrieb || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') : '';
      return '<div class="position"><h3>' + p.menge + ' × ' + esc(p.name) + (p.konfig ? ' · <code>' + esc(p.konfig) + '</code>' : '') + '</h3>' +
        (p.beschreibung ? '<p>' + esc(p.beschreibung) + '</p>' : '') +
        '<div class="zeile"><div><b>Inhalt</b><ul class="check">' + inhalt + '</ul></div>' + (antrieb ? '<div><b>Antriebsset</b><ul class="check">' + antrieb + '</ul></div>' : '') + '</div></div>';
    }).join('');
    var etiketten = [];
    (b.positionen || []).forEach(function (p) {
      for (var i = 0; i < p.menge; i++) {
        var info = PACK.artikel[p.code] || {};
        etiketten.push('<div class="etikett"><b>' + esc(p.name) + '</b><br>Artikel: ' + esc(p.code) + (p.konfig ? '<br>Konfiguration: ' + esc(p.konfig) : '') + '<br>Bestellung: ' + esc(b.nummer) +
          '<br><br>Hersteller: ' + esc(H().join(', ')) + '<br>' + esc(PACK.mail || '') + '<div class="warn">' + esc(info.warnung || 'Kein Spielzeug.') + '</div></div>');
      }
    });
    return '<h1>Packliste ' + esc(b.nummer) + '</h1><p>Bestellt am ' + datum(b.erstellt) + ' · ' + esc(b.name) + ' · ' + euro(b.gesamt) + (b.bezahlt_am ? ' · bezahlt am ' + datum(b.bezahlt_am) : ' · <b>noch nicht bezahlt</b>') + '</p>' +
      '<div class="zeile"><div><h2>Lieferadresse</h2><p>' + adresse(liefer, b.name) + '<br>Deutschland</p></div><div><h2>Versand</h2><p>Versand bis spätestens: <b>' + (versandBis(b) ? datum(plusTage(versandBis(b), -1)) : '–') + '</b><br>Sendungsnummer: <span class="linie"></span><br>Gewicht: <span class="linie"></span></p></div></div>' +
      (b.kommentar ? '<p><b>Anmerkung der Kundin:</b> ' + esc(b.kommentar) + '</p>' : '') +
      '<h2>Positionen</h2>' + positionen +
      '<h2>Beilagen</h2><ul class="check"><li>Rechnung oder Lieferschein</li><li>Sicherheitshinweise auf Deutsch (Seite „Produktsicherheit“ oder Bauanleitung)</li><li>Etikett mit Herstellerangaben auf dem Karton bzw. Beutel (Seite 2)</li>' +
      (elektro ? '<li>Entsorgungshinweis Elektrogeräte (durchgestrichene Mülltonne) und Herstellerunterlagen zum Antriebsset</li>' : '') + '<li>Optional: Danke-Karte</li></ul>' +
      '<h2>Vor dem Zukleben</h2><ul class="check"><li>Alle Teile gezählt und auf Risse geprüft</li><li>Farben passen zum Konfigurations-Code</li><li>Kleinteile in beschrifteten Beuteln, Holme fixiert</li><li>Schütteltest: nichts klappert</li><li>Keine Akkus im Paket</li></ul>' +
      '<div class="neue-seite"><h1>Etiketten</h1><p>Ausschneiden und auf den Karton bzw. die Beutel kleben.</p><div class="etiketten">' + etiketten.join('') + '</div></div>';
  }

  /* ═══ Widerrufe ═══ */
  function zeichneWiderrufe() {
    var el = $('#widerrufListe');
    if (!D.widerrufe.length) { el.innerHTML = '<p class="leer">Noch keine Widerrufe.</p>'; return; }
    el.innerHTML = D.widerrufe.map(function (w) {
      var b = w.bestellung_id ? finde(w.bestellung_id) : null;
      var offen = w.status === 'neu' || w.status === 'in_bearbeitung';
      var bis = plusTage(w.erstellt, 14), knapp = offen && new Date() > plusTage(bis, -3);
      var opts = W_STATUS.map(function (s) { return '<option value="' + s[0] + '"' + (w.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('');
      return '<article class="anfrage widerruf-eintrag' + (w.status === 'neu' ? ' neu' : '') + '" data-wid="' + esc(w.id) + '">' +
        '<header class="anfrage-kopf"><span class="art">Widerruf</span><h3>' + esc(w.bestellnummer) + ' · ' + esc(w.name) + '</h3>' +
        '<time datetime="' + esc(w.erstellt) + '">' + datum(w.erstellt, true) + '</time>' +
        '<label class="vh" for="ws-' + esc(w.id) + '">Status</label><select id="ws-' + esc(w.id) + '" data-wstatus>' + opts + '</select></header>' +
        '<div class="anfrage-body"><div>' +
        (offen ? '<p class="frist' + (knapp ? ' warn-text' : '') + '">Erstattung spätestens bis <b>' + datum(bis) + '</b> überweisen (du darfst warten, bis die Ware zurück ist).</p>' : '') +
        '<p>' + (w.mail_bestaetigung ? 'Eingangsbestätigung gesendet: ' + datum(w.mail_bestaetigung, true) : '<span class="warn-text">Eingangsbestätigung noch nicht gesendet!</span>') + '</p>' +
        (b ? '<p>Zugehörige Bestellung: <button type="button" class="textknopf" data-zeige="' + esc(b.id) + '">' + esc(b.nummer) + ' (' + STATUS[b.status] + ', ' + euro(b.gesamt) + ')</button></p>'
          : '<p class="warn-text">Keine Bestellung mit dieser Nummer und E-Mail gefunden – bitte persönlich klären.</p>') + '</div>' +
        '<dl class="details-tabelle"><dt>E-Mail</dt><dd><a class="textlink" href="mailto:' + esc(w.email) + '?subject=' + encodeURIComponent('Dein Widerruf ' + w.bestellnummer) + '">' + esc(w.email) + '</a></dd>' +
        '<dt>Umfang</dt><dd>' + esc(w.umfang || 'Gesamte Bestellung') + '</dd><dt>Grund</dt><dd>' + esc(w.grund || 'nicht angegeben') + '</dd></dl></div>' +
        '<div class="anfrage-aktionen"><textarea data-wnotiz placeholder="Interne Notiz" aria-label="Interne Notiz">' + esc(w.notiz || '') + '</textarea>' +
        '<button class="btn btn-ghost btn-small" type="button" data-wa="notiz">Notiz speichern</button>' +
        '<button class="btn btn-ghost btn-small" type="button" data-wa="mail">Eingangsbestätigung ' + (w.mail_bestaetigung ? 'erneut ' : '') + 'senden</button></div></article>';
    }).join('');
  }
  function wFinde(id) { return D.widerrufe.filter(function (w) { return w.id === id; })[0]; }
  function wAktualisieren(w, felder) {
    if (A.istDemo()) { Object.assign(w, felder); return Promise.resolve(); }
    return api('/rest/v1/widerrufe?id=eq.' + encodeURIComponent(w.id), { method: 'PATCH', headers: A.json(), body: JSON.stringify(felder) }).then(function () { Object.assign(w, felder); });
  }
  $('#widerrufListe').addEventListener('change', function (e) {
    if (!e.target.matches('[data-wstatus]')) return;
    var w = wFinde(e.target.closest('[data-wid]').getAttribute('data-wid'));
    wAktualisieren(w, { status: e.target.value }).then(function () { A.hinweis('Status gespeichert'); zeichneWiderrufe(); zaehler(); uebersichtHinweis(); }).catch(A.fehlerToast);
  });
  $('#widerrufListe').addEventListener('click', function (e) {
    var z = e.target.closest('[data-zeige]');
    if (z) { var id = z.getAttribute('data-zeige'); filter.status = 'alle'; filter.suche = ''; $('#bestellSuche').value = ''; aufgeklappt[id] = true; A.tab('t-bestellungen'); zeichneBestellungen();
      var el = $('.bestellung[data-id="' + id + '"]'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    var k = e.target.closest('button[data-wa]'); if (!k) return;
    var w = wFinde(k.closest('[data-wid]').getAttribute('data-wid'));
    if (k.dataset.wa === 'notiz') wAktualisieren(w, { notiz: k.closest('[data-wid]').querySelector('[data-wnotiz]').value.trim() || null }).then(function () { A.hinweis('Notiz gespeichert'); }).catch(A.fehlerToast);
    else if (k.dataset.wa === 'mail') {
      if (!confirm('Eingangsbestätigung an ' + w.email + ' senden?')) return;
      k.disabled = true;
      (A.istDemo() ? Promise.resolve() : A.funktion('shop-mail', { art: 'widerruf', id: w.id })).then(function () {
        if (!w.mail_bestaetigung) w.mail_bestaetigung = new Date().toISOString();
        A.hinweis(A.istDemo() ? 'Demo: würde jetzt gesendet' : 'Eingangsbestätigung gesendet'); zeichneWiderrufe();
      }).catch(A.fehlerToast).then(function () { k.disabled = false; });
    }
  });

  /* ═══ Einstellungen: Shop ═══ */
  var F = { inhaber: 'kontoinhaber', bank: 'bank', iban: 'iban', bic: 'bic', steuernr: 'steuernummer', widnr: 'widnr', versand: 'versand_pauschale', frei: 'versandfrei_ab', frist: 'zahlungsfrist_tage', absender: 'absender_mail', benachrichtigung: 'benachrichtigung_mail' };
  function zeichneEinstellungen() {
    var e = D.einst;
    if (!e) { $('#shopCheck').innerHTML = '<li class="nein">Shop-Tabellen nicht gefunden. Bitte <code>supabase-shop.sql</code> einspielen.</li>'; return; }
    Object.keys(F).forEach(function (k) {
      var v = e[F[k]]; $('#s-' + k).value = v == null ? '' : (k === 'iban' ? ibanSchoen(v) : v);
    });
    var bank = !!(e.iban && e.kontoinhaber), bereit = e.mail_bereit && bank;
    $('#shopCheck').innerHTML =
      '<li class="' + (e.mail_bereit ? 'ja' : 'nein') + '"><b>Mailversand</b> ' + (e.mail_bereit ? 'getestet' : '– Brevo einrichten, Schlüssel in Supabase hinterlegen, dann „Testmail senden“') + '</li>' +
      '<li class="' + (bank ? 'ja' : 'nein') + '"><b>Bankverbindung</b> ' + (bank ? 'eingetragen' : '– Kontoinhaber und IBAN eintragen') + '</li>' +
      '<li class="' + (e.steuernummer ? 'ja' : 'offen') + '"><b>Steuernummer</b> ' + (e.steuernummer ? 'eingetragen' : '– für Rechnungen nötig') + '</li>' +
      '<li class="offen"><b>Pflichten vor dem ersten Versand</b> – Verpackungsregister LUCID, Haftpflicht. <a class="textlink" href="#rat-pflichten" data-ratgeber="rat-pflichten">Checkliste</a></li>';
    var st = $('#shopStatus');
    st.textContent = e.shop_aktiv ? 'Geöffnet' : 'Geschlossen';
    st.className = 'shop-status ' + (e.shop_aktiv ? 'an' : 'aus');
    var t = $('#shopAktiv'); t.checked = !!e.shop_aktiv; t.disabled = !bereit && !e.shop_aktiv;
  }
  $('#shopAktiv').addEventListener('change', function () {
    var an = this.checked, box = this;
    if (an && !confirm('Shop jetzt öffnen? Ab sofort können Kundinnen und Kunden verbindlich bestellen.')) { box.checked = false; return; }
    var p = A.istDemo() ? Promise.resolve([Object.assign(D.einst, { shop_aktiv: an })])
      : api('/rest/v1/shop_einstellungen?id=eq.1', { method: 'PATCH', headers: rueckgabe(), body: JSON.stringify({ shop_aktiv: an }) });
    p.then(function (r) {
      if (r && r[0]) D.einst = r[0];
      if (an && !D.einst.shop_aktiv) A.hinweis('Noch nicht möglich: Testmail und Bankverbindung fehlen.');
      else A.hinweis(an ? 'Der Shop ist geöffnet' : 'Der Shop ist geschlossen');
      zeichneEinstellungen(); uebersichtHinweis();
    }).catch(function (err) { box.checked = !an; A.fehlerToast(err); });
  });
  function formStatus(text, ok) { var s = $('#shopFormStatus'); s.className = 'form-status ' + (ok ? 'ok' : 'fehler'); s.innerHTML = text; s.hidden = !text; }
  $('#shopForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var w = function (k) { return $('#s-' + k).value.trim(); };
    var iban = w('iban').replace(/\s+/g, '').toUpperCase(), bic = w('bic').replace(/\s+/g, '').toUpperCase();
    if (iban && !ibanGueltig(iban)) { formStatus('Die IBAN stimmt nicht – bitte noch einmal prüfen.'); $('#s-iban').focus(); return; }
    if (bic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic)) { formStatus('Der BIC hat 8 oder 11 Zeichen.'); $('#s-bic').focus(); return; }
    var mailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!mailRe.test(w('absender')) || !mailRe.test(w('benachrichtigung'))) { formStatus('Bitte gültige E-Mail-Adressen eintragen.'); return; }
    var felder = { kontoinhaber: w('inhaber') || null, bank: w('bank') || null, iban: iban || null, bic: bic || null, steuernummer: w('steuernr') || null, widnr: w('widnr') || null,
      versand_pauschale: Number(w('versand') || 0), versandfrei_ab: w('frei') === '' ? null : Number(w('frei')), zahlungsfrist_tage: parseInt(w('frist'), 10) || 7,
      absender_mail: w('absender'), benachrichtigung_mail: w('benachrichtigung') };
    if (D.einst && felder.absender_mail !== D.einst.absender_mail) felder.mail_bereit = false;   // neuer Absender → neu testen
    var p = A.istDemo() ? Promise.resolve([Object.assign(D.einst, felder)])
      : api('/rest/v1/shop_einstellungen?id=eq.1', { method: 'PATCH', headers: rueckgabe(), body: JSON.stringify(felder) });
    p.then(function (r) {
      if (r && r[0]) D.einst = r[0];
      formStatus(A.istDemo() ? 'Demo: nicht gespeichert.' : 'Gespeichert.' + (felder.mail_bereit === false ? ' Weil sich der Absender geändert hat, schick bitte noch einmal eine Testmail.' : ''), true);
      zeichneEinstellungen(); uebersichtHinweis();
    }).catch(function (err) { formStatus(esc(err.message)); });
  });
  $('#testmail').addEventListener('click', function () {
    var k = this; k.disabled = true; k.textContent = 'Wird gesendet …'; formStatus('');
    (A.istDemo() ? Promise.resolve({ an: D.einst.benachrichtigung_mail }) : A.funktion('shop-mail', { art: 'test' })).then(function (r) {
      D.einst.mail_bereit = true;
      formStatus('Testmail an ' + esc(r.an || D.einst.benachrichtigung_mail) + ' gesendet. Schau in dein Postfach (und in den Spam-Ordner). Der Mailversand ist damit freigeschaltet.', true);
      zeichneEinstellungen(); uebersichtHinweis();
    }).catch(function (err) {
      var m = err.message || '', tipp = '';
      if (/BREVO_API_KEY/.test(m)) tipp = 'Der Brevo-Schlüssel fehlt. Trag ihn in Supabase unter Edge Functions → Secrets als <code>BREVO_API_KEY</code> ein.';
      else if (/401|unauthori[sz]ed|key not found/i.test(m)) tipp = 'Brevo lehnt den Schlüssel ab. Prüf, ob du den API-Schlüssel (nicht den SMTP-Schlüssel) kopiert hast, und ob in Brevo unter „Security → Authorised IPs“ die IP-Sperre aktiv ist – dann bitte deaktivieren.';
      else if (/sender|absender|not valid|not verified/i.test(m)) tipp = 'Der Absender ist in Brevo noch nicht bestätigt. Bestätige die Adresse oder authentifiziere deine Domain unter „Senders, Domains &amp; Dedicated IPs“.';
      else if (/noch nicht eingerichtet|404/.test(m)) tipp = 'Die Mail-Funktion ist in Supabase noch nicht veröffentlicht.';
      formStatus('Die Testmail hat nicht geklappt: ' + esc(m) + (tipp ? '<br>' + tipp : ''));
    }).then(function () { k.disabled = false; k.textContent = 'Testmail senden'; });
  });

  /* ═══ Rabattcodes ═══ */
  function zeichneRabatt() {
    var el = $('#rabattListe');
    if (!D.rabatt.length) { el.innerHTML = '<p class="leer">Keine Rabattcodes.</p>'; return; }
    el.innerHTML = '<table class="rabatt-tabelle"><thead><tr><th>Code</th><th>Rabatt</th><th>Gültig bis</th><th>Aktiv</th></tr></thead><tbody>' + D.rabatt.map(function (r) {
      return '<tr><td><code>' + esc(r.code) + '</code>' + (r.beschreibung ? '<br><small>' + esc(r.beschreibung) + '</small>' : '') + '</td><td>' + String(r.prozent).replace('.', ',') + ' %</td><td>' + (r.gueltig_bis ? datum(r.gueltig_bis) : 'unbegrenzt') + '</td>' +
        '<td><input type="checkbox" data-code="' + esc(r.code) + '"' + (r.aktiv ? ' checked' : '') + ' aria-label="' + esc(r.code) + ' aktiv"></td></tr>';
    }).join('') + '</tbody></table>';
  }
  $('#rabattListe').addEventListener('change', function (e) {
    var c = e.target.getAttribute('data-code'); if (!c) return;
    var r = D.rabatt.filter(function (x) { return x.code === c; })[0], an = e.target.checked;
    (A.istDemo() ? Promise.resolve() : api('/rest/v1/rabattcodes?code=eq.' + encodeURIComponent(c), { method: 'PATCH', headers: A.json(), body: JSON.stringify({ aktiv: an }) }))
      .then(function () { r.aktiv = an; A.hinweis(c + (an ? ' aktiviert' : ' deaktiviert')); }).catch(function (err) { e.target.checked = !an; A.fehlerToast(err); });
  });
  $('#rabattNeu').addEventListener('submit', function (e) {
    e.preventDefault();
    var code = $('#rn-code').value.trim().toUpperCase().replace(/\s+/g, ''), pr = Number($('#rn-prozent').value), bis = $('#rn-bis').value || null;
    if (!/^[A-Z0-9-]{2,40}$/.test(code)) { A.hinweis('Code: 2–40 Zeichen, nur Buchstaben, Ziffern und Bindestrich'); return; }
    if (!(pr > 0 && pr <= 50)) { A.hinweis('Rabatt zwischen 1 und 50 Prozent'); return; }
    var neu = { code: code, prozent: pr, gueltig_bis: bis, aktiv: true };
    (A.istDemo() ? Promise.resolve() : api('/rest/v1/rabattcodes', { method: 'POST', headers: A.json(), body: JSON.stringify(neu) }))
      .then(function () { D.rabatt.push(neu); D.rabatt.sort(function (a, b) { return a.code < b.code ? -1 : 1; }); zeichneRabatt(); e.target.reset(); A.hinweis('Code ' + code + ' angelegt'); })
      .catch(A.fehlerToast);
  });

  /* ═══ Demo-Daten (erfunden) ═══ */
  var DEMO = (function () {
    var h = 36e5, jetzt = Date.now();
    var iso = function (std) { return new Date(jetzt - std * h).toISOString(); };
    var adr = function (s, p, o) { return { strasse: s, plz: p, ort: o, land: 'DE' }; };
    var fj4 = function (mat, set, f, code) { return { code: 'FJ4', art: 'bausatz', name: 'FJ-4 Fury Bausatz', beschreibung: f + ' · ' + mat + (set ? ' · mit Antriebsset' : ' · ohne Antriebsset'), konfig: code, material: mat, antrieb: set, menge: 1, einzelpreis: (set ? 124.9 : 55.9) + (mat === 'LW-PLA' ? 10 : 0), summe: (set ? 124.9 : 55.9) + (mat === 'LW-PLA' ? 10 : 0) }; };
    var flz = function (n, set) { var e = set ? 66.9 : 19.9; return { code: 'FLZ', art: 'bausatz', name: 'FPV Flitzer Bausatz', beschreibung: 'Flügel: Orange, Winglets: Schwarz, Rumpf: Orange · PLA · ' + (set ? 'mit' : 'ohne') + ' Antriebsset', konfig: 'FLZ-PLA-OR.SW.OR-' + (set ? 'A' : '0'), material: 'PLA', antrieb: set, menge: n, einzelpreis: e, summe: Math.round(e * n * 100) / 100 }; };
    var ant = { code: 'ANT-2212', art: 'zubehoer', name: 'Brushless-Antriebsset 2212', beschreibung: null, menge: 1, einzelpreis: 24.9, summe: 24.9 };
    function bestellungen() {
      return [
        { id: 'b12', nummer: 'A3D-2026-0012', erstellt: iso(2), status: 'offen', name: 'Beispiel: Lena Meyer', email: 'lena@example.com', adresse: adr('Rosenweg 4', '41460', 'Neuss'), positionen: [fj4('LW-PLA', true, 'Rumpf: Weiß, Tragflächen: Weiß, Leitwerk: Weiß', 'FJ4-LW-WE.WE.WE-A')], warenwert: 134.9, rabatt: 0, versand: 0, gesamt: 134.9, mail_bestaetigung: iso(2), rechtstexte_stand: '2026-11-04' },
        { id: 'b11', nummer: 'A3D-2026-0011', erstellt: iso(9 * 24), status: 'offen', name: 'Beispiel: Tim Schulz', email: 'tim@example.com', adresse: adr('Am Markt 12', '41352', 'Korschenbroich'), positionen: [flz(1, false)], warenwert: 19.9, rabatt: 0, versand: 6.9, gesamt: 26.8, mail_bestaetigung: iso(9 * 24), rechtstexte_stand: '2026-11-04' },
        { id: 'b10', nummer: 'A3D-2026-0010', erstellt: iso(30), status: 'bezahlt', bezahlt_am: iso(20), name: 'Beispiel: Jonas Krämer', email: 'jonas@example.com', telefon: '0151 2345678', adresse: adr('Feldstraße 7', '41564', 'Kaarst'), positionen: [{ code: '33X', art: 'bausatz', name: 'Aero-33X Bausatz', beschreibung: 'Rumpf: Weiß, Tragflächen: Weiß, Leitwerk: Aero-Rot · PLA · mit Antriebsset', konfig: '33X-PLA-WE.WE.RO-A', material: 'PLA', antrieb: true, menge: 1, einzelpreis: 114.9, summe: 114.9 }, ant], warenwert: 139.8, rabatt: 13.98, rabatt_code: 'FMSV-MITGLIED', versand: 0, gesamt: 125.82, kommentar: 'Bitte wenn möglich vor dem Flugtag am Samstag.', mail_bestaetigung: iso(30), rechtstexte_stand: '2026-11-04' },
        { id: 'b9', nummer: 'A3D-2026-0009', erstellt: iso(80), status: 'in_fertigung', bezahlt_am: iso(60), name: 'Beispiel: Sara Becker', email: 'sara@example.com', adresse: adr('Lindenallee 3', '40210', 'Düsseldorf'), lieferadresse: { name: 'Modellflugverein Beispiel', strasse: 'Am Flugplatz 1', plz: '41352', ort: 'Korschenbroich', land: 'DE' }, positionen: [fj4('PLA', false, 'Rumpf: Silber, Tragflächen: Silber, Leitwerk: Aero-Rot', 'FJ4-PLA-SI.SI.RO-0')], warenwert: 55.9, rabatt: 0, versand: 6.9, gesamt: 62.8, mail_bestaetigung: iso(80), rechtstexte_stand: '2026-11-04' },
        { id: 'b8', nummer: 'A3D-2026-0008', erstellt: iso(150), status: 'versendet', bezahlt_am: iso(140), versendet_am: iso(40), versanddienst: 'DHL', sendungsnummer: '00340434161094042557', rechnungsnummer: 'R-2026-0003', rechnungsdatum: iso(40).slice(0, 10), name: 'Beispiel: Ali Rahimi', email: 'ali@example.com', adresse: adr('Bergstraße 22', '47798', 'Krefeld'), positionen: [flz(1, true)], warenwert: 66.9, rabatt: 0, versand: 6.9, gesamt: 73.8, mail_bestaetigung: iso(150), rechtstexte_stand: '2026-11-04' },
        { id: 'b7', nummer: 'A3D-2026-0007', erstellt: iso(400), status: 'abgeschlossen', bezahlt_am: iso(390), versendet_am: iso(300), versanddienst: 'DHL', sendungsnummer: '00340434161094040000', rechnungsnummer: 'R-2026-0002', rechnungsdatum: iso(300).slice(0, 10), name: 'Beispiel: Mia Wolf', email: 'mia@example.com', adresse: adr('Kirchplatz 1', '41460', 'Neuss'), positionen: [flz(2, false)], warenwert: 39.8, rabatt: 0, versand: 6.9, gesamt: 46.7, mail_bestaetigung: iso(400), rechtstexte_stand: '2026-11-04' },
        { id: 'b6', nummer: 'A3D-2026-0006', erstellt: iso(600), status: 'widerrufen', bezahlt_am: iso(590), versendet_am: iso(500), rechnungsnummer: 'R-2026-0001', rechnungsdatum: iso(500).slice(0, 10), name: 'Beispiel: Paul Neumann', email: 'paul@example.com', adresse: adr('Hafenstraße 9', '41460', 'Neuss'), positionen: [ant], warenwert: 24.9, rabatt: 0, versand: 6.9, gesamt: 31.8, mail_bestaetigung: iso(600), rechtstexte_stand: '2026-11-04' }
      ];
    }
    function widerrufe() {
      return [
        { id: 'w2', erstellt: iso(5), name: 'Beispiel: Mia Wolf', email: 'mia@example.com', bestellnummer: 'A3D-2026-0007', umfang: 'Teilweise: einer der beiden Flitzer', grund: null, bestellung_id: 'b7', mail_bestaetigung: iso(5), status: 'neu' },
        { id: 'w1', erstellt: iso(450), name: 'Beispiel: Paul Neumann', email: 'paul@example.com', bestellnummer: 'A3D-2026-0006', umfang: null, grund: 'Passt doch nicht in mein Modell.', bestellung_id: 'b6', mail_bestaetigung: iso(450), status: 'erledigt', notiz: 'Ware zurück, 31,80 € erstattet.' }
      ];
    }
    return {
      bestellungen: bestellungen, widerrufe: widerrufe,
      einst: { shop_aktiv: true, mail_bereit: true, versand_pauschale: 6.9, versandfrei_ab: 100, zahlungsfrist_tage: 7, kontoinhaber: 'Beispiel Inhaber', iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', bank: 'Beispielbank', steuernummer: null, widnr: null, absender_mail: 'info@aero3dp.de', benachrichtigung_mail: 'info@aero3dp.de' },
      rabatt: [{ code: 'FMSV', prozent: 10, aktiv: true, beschreibung: 'Kurzform für Mitglieder FMSV Kleinenbroich' }, { code: 'FMSV-MITGLIED', prozent: 10, aktiv: true, beschreibung: 'Mitglieder FMSV Kleinenbroich (Mitgliedschaft prüfen)' }]
    };
  })();
})();
