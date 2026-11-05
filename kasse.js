/* Aero3dp – Kasse: Adresse → Prüfen → Zahlungspflichtig bestellen → Überweisung mit GiroCode
   Alle Preise kommen aus der Datenbank (bestellung_vorschau / bestellung_aufgeben). */
(function () {
  'use strict';
  var S = window.AeroShop, B = window.AeroBackend, C = window.AERO_CONFIG || {};
  var wurzel = document.getElementById('kasse');
  if (!S || !wurzel) return;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  var euro = function (n) { return EUR.format(Number(n) || 0); };
  var reduziert = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var STAND = wurzel.getAttribute('data-stand') || '';
  var MAIL = C.email || 'info@aero3dp.de';

  var form = $('#kasseForm'), aside = $('#kasseUebersicht'), zustand = $('#kasseZustand'), fertig = $('#kasseFertig');
  var schrittAdresse = $('#schrittAdresse'), schrittPruefen = $('#schrittPruefen');
  var vorschau = null, rabattcode = '', laeuft = false, schritt = 'adresse';

  if (B) B.track('kasse_geoeffnet', null, true);

  /* ─── Hilfen ─── */
  function positionen() {
    return S.lesen().map(function (p) {
      var o = { code: p.code, menge: p.menge };
      if (p.farben) { o.material = p.material || 'PLA'; o.antrieb = !!p.antrieb; o.farben = p.farben; }
      return o;
    });
  }
  function wert(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function datumDe(iso) { var t = String(iso || '').slice(0, 10).split('-'); return t.length === 3 ? t[2] + '.' + t[1] + '.' + t[0] : ''; }
  function ibanSchoen(i) { return String(i || '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim(); }
  function schritteAnzeigen(name) {
    $$('#kasseSchritte li').forEach(function (li) {
      var an = li.getAttribute('data-schritt') === name;
      if (an) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      li.classList.toggle('erledigt', ['adresse', 'pruefen', 'fertig'].indexOf(li.getAttribute('data-schritt')) < ['adresse', 'pruefen', 'fertig'].indexOf(name));
    });
  }
  function nachOben(el) {
    var y = (el || wurzel).getBoundingClientRect().top + window.scrollY - 90;
    if (window.scrollY > y) window.scrollTo({ top: Math.max(0, y), behavior: reduziert ? 'auto' : 'smooth' });
  }

  /* ─── Zustände ohne Formular ─── */
  function zustandZeigen(html) {
    form.hidden = true; aside.hidden = true; fertig.hidden = true;
    zustand.innerHTML = html; zustand.hidden = false;
    $('#kasseSchritte').hidden = true;
  }
  function leer() {
    zustandZeigen('<div class="kasse-leer"><h2>Dein Warenkorb ist leer.</h2><p>Stell dir eines unserer Modelle in deinen Farben zusammen oder schau beim Zubehör vorbei.</p>' +
      '<div class="hero-btns"><a class="btn" href="index.html#produkte">Modelle ansehen</a><a class="btn btn-ghost" href="druckservice.html">Eigene Datei drucken lassen</a></div></div>');
  }
  function pausiert() {
    var pos = S.lesen();
    if (!pos.length) { leer(); return; }
    var s = S.summen(pos);
    var liste = pos.map(function (p) {
      return '<li><b>' + p.menge + ' × ' + esc(S.name(p)) + '</b>' + (p.farben ? '<span>' + esc(S.farbText(p)) + ' · ' + esc(S.ausstattung(p)) + '</span>' : '') + '</li>';
    }).join('');
    zustandZeigen('<div class="kasse-pause"><h2>Der Online-Shop ist gerade geschlossen.</h2>' +
      '<p>Du kannst deinen Warenkorb als unverbindliche Anfrage schicken. Wir melden uns per E-Mail mit allen Details – bestellt ist damit noch nichts.</p>' +
      '<ul class="pause-liste">' + liste + '</ul><p class="pause-summe">Warenwert laut Shop: <b>' + euro(s.warenwert) + '</b>, zzgl. Versand</p>' +
      '<form class="formular" id="pauseForm"><div class="feld-reihe">' +
      '<div class="feld"><label for="p-name">Name</label><input id="p-name" autocomplete="name" required maxlength="120"></div>' +
      '<div class="feld"><label for="p-email">E-Mail</label><input id="p-email" type="email" autocomplete="email" required maxlength="200"></div></div>' +
      '<div class="feld"><label for="p-nachricht">Nachricht <span class="optional">(optional)</span></label><textarea id="p-nachricht" maxlength="2000"></textarea></div>' +
      '<div class="honig" aria-hidden="true"><label>Nicht ausfüllen <input name="_gotcha" tabindex="-1" autocomplete="off"></label></div>' +
      '<label class="feld-check"><input type="checkbox" required> <span>Ich bin einverstanden, dass meine Angaben zur Bearbeitung der Anfrage verarbeitet werden (<a class="textlink" href="datenschutz.html">Datenschutz</a>).</span></label>' +
      '<p class="form-status" role="status" hidden></p><button class="btn" type="submit">Warenkorb anfragen</button></form></div>');
    var pf = $('#pauseForm');
    pf.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('button[type="submit"]', pf), st = $('.form-status', pf);
      var zeilen = pos.map(function (p) { return p.menge + ' × ' + S.name(p) + (p.farben ? ' (' + S.konfigCode(p) + ': ' + S.farbText(p) + ', ' + S.ausstattung(p) + ')' : ''); });
      btn.disabled = true; btn.textContent = 'Wird gesendet …'; st.hidden = true;
      window.AeroAnfrage({
        art: 'konfigurator', name: wert('p-name'), email: wert('p-email'), nachricht: wert('p-nachricht'), honig: pf.querySelector('[name="_gotcha"]').value,
        betreff: 'Warenkorb-Anfrage von ' + wert('p-name'), zusammenfassung: zeilen.join('\n') + '\nWarenwert: ' + euro(s.warenwert),
        details: { quelle: 'kasse', warenkorb: zeilen, preis: s.warenwert }
      }).then(function () {
        if (window.AeroPapierflieger) AeroPapierflieger(btn);
        st.className = 'form-status ok'; st.textContent = 'Danke! Deine Anfrage ist bei uns angekommen. Wir melden uns per E-Mail.';
        pf.reset();
      }).catch(function (err) {
        st.className = 'form-status fehler';
        st.textContent = /Zu viele/.test(err.message) ? err.message : 'Das hat nicht geklappt. Schreib uns bitte an ' + MAIL + '.';
      }).then(function () { st.hidden = false; btn.disabled = false; btn.textContent = 'Warenkorb anfragen'; });
    });
  }

  /* ─── Übersicht (rechte Spalte) ─── */
  function laden(an) { aside.classList.toggle('laedt', an); }
  function neuRechnen() {
    var pos = positionen();
    if (!pos.length) { leer(); return Promise.resolve(); }
    laden(true);
    return B.rpc('bestellung_vorschau', { daten: { positionen: pos, rabattcode: rabattcode || null } }).then(function (v) {
      vorschau = v;
      zeichneUebersicht();
      if (schritt === 'pruefen') zeichnePruefung();
    }).catch(function (e) {
      if (e.hint === 'rabattcode') {
        rabattMeldung(e.message, true); rabattcode = ''; $('#r-code').value = '';
        return neuRechnen();
      }
      if (e.hint === 'artikel') {
        var m = /\(([A-Z0-9-]+)\)/.exec(e.message || '');
        if (m) {
          S.lesen().forEach(function (p) { if (p.code === m[1]) S.entfernen(S.schluessel(p)); });
          if (window.AeroToast) AeroToast('Ein Artikel ist gerade nicht bestellbar und wurde entfernt.');
          return neuRechnen();
        }
      }
      allgemeinerFehler(e.message);
    }).then(function () { laden(false); });
  }
  function allgemeinerFehler(text) {
    var el = schritt === 'pruefen' ? $('#bestellFehler') : $('#adresseFehler');
    el.textContent = text || 'Die Preise konnten gerade nicht geladen werden. Bitte lade die Seite neu.';
    el.hidden = false;
  }
  function summenHtml(v, gross) {
    var z = '<div><dt>Zwischensumme</dt><dd>' + euro(v.warenwert) + '</dd></div>';
    if (Number(v.rabatt) > 0) z += '<div class="rabatt-zeile-summe"><dt>Rabatt ' + esc(v.rabatt_code) + ' (' + String(v.rabatt_prozent).replace('.', ',') + ' %)</dt><dd>−' + euro(v.rabatt) + '</dd></div>';
    z += '<div><dt>Versand (DHL, Deutschland)</dt><dd>' + (Number(v.versand) > 0 ? euro(v.versand) : 'kostenlos') + '</dd></div>';
    z += '<div class="gesamt' + (gross ? ' gross' : '') + '"><dt>Gesamtbetrag</dt><dd>' + euro(v.gesamt) + '</dd></div>';
    return z;
  }
  function zeichneUebersicht() {
    var v = vorschau, lokal = S.lesen(), bearbeitbar = schritt === 'adresse';
    $('#kassePositionen').innerHTML = v.positionen.map(function (p, i) {
      var k = lokal[i] ? S.schluessel(lokal[i]) : '';
      var farben = lokal[i] && lokal[i].farben ? '<span class="pos-farben" aria-hidden="true">' + lokal[i].farben.map(function (f) {
        var c = (window.AERO_KATALOG.farben || {})[f]; return '<i style="--c:' + (c ? c.hex : '#888') + '"></i>';
      }).join('') + '</span>' : '';
      var menge = bearbeitbar && k
        ? '<div class="korb-menge" role="group" aria-label="Menge ' + esc(p.name) + '"><button type="button" data-aktion="minus" data-k="' + esc(k) + '" aria-label="Eins weniger"' + (p.menge <= 1 ? ' disabled' : '') + '>−</button><output>' + p.menge + '</output><button type="button" data-aktion="plus" data-k="' + esc(k) + '" aria-label="Eins mehr"' + (p.menge >= 10 ? ' disabled' : '') + '>+</button></div>' +
          '<button type="button" class="korb-weg" data-aktion="weg" data-k="' + esc(k) + '">Entfernen</button>'
        : '<span class="pos-menge">' + p.menge + ' Stück</span>';
      return '<li>' + farben + '<div class="pos-text"><b>' + esc(p.name) + '</b>' + (p.beschreibung ? '<span>' + esc(p.beschreibung) + '</span>' : '') +
        '<div class="pos-zeile">' + menge + '</div></div><b class="pos-preis">' + euro(p.summe) + '</b></li>';
    }).join('');
    $('#kasseSummen').innerHTML = summenHtml(v);
    var frei = v.versandfrei_ab != null && Number(v.versand) > 0 ? Number(v.versandfrei_ab) - Number(v.warenwert) : 0;
    var hinweis = $('#versandHinweis');
    if (!hinweis) { hinweis = document.createElement('p'); hinweis.id = 'versandHinweis'; hinweis.className = 'versand-hinweis'; $('#kasseSummen').after(hinweis); }
    hinweis.hidden = !(frei > 0);
    if (frei > 0) hinweis.innerHTML = 'Noch <b>' + euro(frei) + '</b> bis zum kostenlosen Versand.';
    $('#uebersichtSumme').textContent = euro(v.gesamt);
  }
  $('#kassePositionen').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-aktion]'); if (!b || laeuft) return;
    var k = b.getAttribute('data-k'), p = S.lesen().filter(function (x) { return S.schluessel(x) === k; })[0];
    if (!p) return;
    if (b.dataset.aktion === 'plus') S.mengeSetzen(k, p.menge + 1);
    else if (b.dataset.aktion === 'minus') S.mengeSetzen(k, p.menge - 1);
    else S.entfernen(k);
    neuRechnen();
  });

  /* Übersicht auf dem Handy ein- und ausklappen */
  var schalter = $('#uebersichtSchalter'), inhalt = $('#uebersichtInhalt');
  var schmal = window.matchMedia('(max-width: 960px)');
  function klappen(auf) { schalter.setAttribute('aria-expanded', auf); inhalt.hidden = !auf; }
  schalter.addEventListener('click', function () { klappen(schalter.getAttribute('aria-expanded') !== 'true'); });
  function breiteAnpassen() { klappen(!schmal.matches); }
  if (schmal.addEventListener) schmal.addEventListener('change', breiteAnpassen);
  breiteAnpassen();

  /* Rabattcode */
  function rabattMeldung(text, fehler) {
    var st = $('#rabattStatus'); st.textContent = text; st.className = 'rabatt-status' + (fehler ? ' fehler' : ' ok'); st.hidden = !text;
  }
  $('#rabattForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var code = wert('r-code').toUpperCase();
    rabattcode = code; rabattMeldung('', false);
    neuRechnen().then(function () {
      if (code && rabattcode && vorschau && vorschau.rabatt_code) rabattMeldung('Code ' + vorschau.rabatt_code + ' eingelöst: ' + String(vorschau.rabatt_prozent).replace('.', ',') + ' % Rabatt auf den Warenwert.', false);
      else if (!code) rabattMeldung('', false);
    });
  });

  /* ─── Schritt 1: Adresse prüfen ─── */
  function markieren(id, text) {
    var el = document.getElementById(id), fid = id + '-fehler', f = document.getElementById(fid);
    if (text) {
      el.setAttribute('aria-invalid', 'true');
      if (!f) { f = document.createElement('small'); f.className = 'feld-fehler'; f.id = fid; el.after(f); }
      f.textContent = text;
      var d = (el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
      if (d.indexOf(fid) < 0) { d.push(fid); el.setAttribute('aria-describedby', d.join(' ')); }
    } else {
      el.removeAttribute('aria-invalid');
      if (f) f.remove();
    }
    return !text;
  }
  /* Regeln je Feld: liefert die Fehlermeldung oder '' */
  var REGELN = {
    'k-email': function (v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? '' : 'Bitte gib eine gültige E-Mail-Adresse an.'; },
    'k-telefon': function (v) { return !v || /^[0-9 +()\/.-]{4,40}$/.test(v) ? '' : 'Bitte nur Ziffern, Leerzeichen und + ( ) / . -'; },
    'k-name': function (v) { return v.length >= 2 ? '' : 'Bitte gib deinen vollständigen Namen an.'; },
    'k-strasse': function (v) { return v.length >= 3 ? '' : 'Bitte gib Straße und Hausnummer an.'; },
    'k-plz': function (v) { return /^[0-9]{5}$/.test(v) ? '' : 'Die Postleitzahl hat 5 Ziffern.'; },
    'k-ort': function (v) { return v.length >= 2 ? '' : 'Bitte gib den Ort an.'; },
    'l-name': function (v) { return v.length >= 2 ? '' : 'Bitte gib den Namen für die Lieferadresse an.'; },
    'l-strasse': function (v) { return v.length >= 3 ? '' : 'Bitte gib Straße und Hausnummer an.'; },
    'l-plz': function (v) { return /^[0-9]{5}$/.test(v) ? '' : 'Die Postleitzahl hat 5 Ziffern.'; },
    'l-ort': function (v) { return v.length >= 2 ? '' : 'Bitte gib den Ort an.'; }
  };
  function aktiveFelder() {
    return Object.keys(REGELN).filter(function (id) { return id.charAt(0) === 'k' || $('#k-anders').checked; });
  }
  function pruefeAdresse() {
    var gut = aktiveFelder().map(function (id) { return markieren(id, REGELN[id](wert(id))); }).every(Boolean);
    if (!gut) { var erstes = $('[aria-invalid="true"]', form); if (erstes) erstes.focus(); }
    return gut;
  }
  /* Beim Verlassen nur das eine Feld neu prüfen – der Fokus bleibt, wo er ist */
  Object.keys(REGELN).forEach(function (id) {
    document.getElementById(id).addEventListener('blur', function () {
      if (this.getAttribute('aria-invalid') === 'true') markieren(id, REGELN[id](wert(id)));
    });
  });
  $('#k-anders').addEventListener('change', function () {
    var auf = this.checked; $('#lieferFeld').hidden = !auf;
    if (auf) $('#l-name').focus();
    else ['l-name', 'l-strasse', 'l-plz', 'l-ort'].forEach(function (id) { markieren(id, ''); });
  });

  function kunde() {
    return { name: wert('k-name'), email: wert('k-email'), telefon: wert('k-telefon'), strasse: wert('k-strasse'), zusatz: wert('k-zusatz'), plz: wert('k-plz'), ort: wert('k-ort'), land: 'DE' };
  }
  function lieferadresse() {
    return $('#k-anders').checked ? { name: wert('l-name'), strasse: wert('l-strasse'), zusatz: wert('l-zusatz'), plz: wert('l-plz'), ort: wert('l-ort'), land: 'DE' } : null;
  }
  function adresseHtml(a, name) {
    return [esc(a.name || name), esc(a.strasse), a.zusatz ? esc(a.zusatz) : '', esc(a.plz) + ' ' + esc(a.ort), 'Deutschland'].filter(Boolean).join('<br>');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    $('#adresseFehler').hidden = true;
    if (!pruefeAdresse() || !vorschau) return;
    zeigeSchritt('pruefen', true);
  });

  function zeigeSchritt(name, neu) {
    schritt = name;
    schrittAdresse.hidden = name !== 'adresse';
    schrittPruefen.hidden = name !== 'pruefen';
    schritteAnzeigen(name);
    zeichneUebersicht();
    if (name === 'pruefen') {
      zeichnePruefung();
      $('#bestellFehler').hidden = true;
      if (neu) try { history.pushState({ kasse: 'pruefen' }, '', '#pruefen'); } catch (e) { /* egal */ }
      nachOben(); schrittPruefen.focus({ preventScroll: true });
    } else {
      nachOben(); $('#k-email').focus({ preventScroll: true });
    }
  }
  window.addEventListener('popstate', function () {
    if (!fertig.hidden) return;
    if (schritt === 'pruefen' && location.hash !== '#pruefen') zeigeSchritt('adresse');
  });
  $('#zurueckAdresse').addEventListener('click', function () { try { history.back(); } catch (e) { /* egal */ } if (schritt === 'pruefen') zeigeSchritt('adresse'); });

  /* ─── Schritt 2: Prüfen (alles, was vor dem Bestellknopf stehen muss) ─── */
  function zeichnePruefung() {
    var k = kunde(), l = lieferadresse(), v = vorschau;
    var lz = S.lieferzeit(), st = S.status() || {};
    var frist = st.zahlungsfrist_tage || (window.AERO_KATALOG || {}).frist || 7;
    $('#pruefAngaben').innerHTML =
      '<div class="pruef-block"><h3>Rechnungsadresse</h3><p>' + adresseHtml(k, k.name) + '</p><button type="button" class="textknopf" data-aendern>Ändern</button></div>' +
      '<div class="pruef-block"><h3>Lieferadresse</h3><p>' + (l ? adresseHtml(l) : 'wie Rechnungsadresse') + '</p><button type="button" class="textknopf" data-aendern>Ändern</button></div>' +
      '<div class="pruef-block"><h3>Kontakt</h3><p>' + esc(k.email) + (k.telefon ? '<br>' + esc(k.telefon) : '') + '</p><button type="button" class="textknopf" data-aendern>Ändern</button></div>' +
      '<div class="pruef-block"><h3>Zahlung</h3><p><b>Vorkasse per Überweisung.</b> Die Bankverbindung siehst du direkt nach der Bestellung und bekommst sie per E-Mail. Bitte überweise innerhalb von ' + esc(frist) + ' Tagen.</p></div>' +
      '<div class="pruef-block breit"><h3>Versand</h3><p>Mit DHL, nur innerhalb Deutschlands. Lieferzeit: <b>' + esc(lz) + '</b> nach Zahlungseingang.</p></div>' +
      (wert('k-kommentar') ? '<div class="pruef-block breit"><h3>Deine Anmerkung</h3><p>' + esc(wert('k-kommentar')) + '</p><button type="button" class="textknopf" data-aendern>Ändern</button></div>' : '');
    $('#pruefBestellung').innerHTML = '<h3>Deine Bestellung</h3><ul class="pruef-positionen">' + v.positionen.map(function (p) {
      return '<li><div><b>' + p.menge + ' × ' + esc(p.name) + '</b>' + (p.beschreibung ? '<span>' + esc(p.beschreibung) + '</span>' : '') +
        (p.konfig ? '<span class="pos-code">Konfigurations-Code ' + esc(p.konfig) + '</span>' : '') + '</div><b>' + euro(p.summe) + '</b></li>';
    }).join('') + '</ul><dl class="kasse-summen pruef-summen">' + summenHtml(v, true) + '</dl>' +
      '<p class="pruef-klein">Endpreise inklusive Versand. Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</p>';
  }
  $('#pruefAngaben').addEventListener('click', function (e) { if (e.target.closest('[data-aendern]')) { try { history.back(); } catch (x) { /* egal */ } if (schritt === 'pruefen') zeigeSchritt('adresse'); } });

  /* ─── Bestellen ─── */
  var bestellknopf = $('#bestellen');
  function bestellFehler(text) { var el = $('#bestellFehler'); el.innerHTML = text; el.hidden = false; el.scrollIntoView({ behavior: reduziert ? 'auto' : 'smooth', block: 'center' }); }
  bestellknopf.addEventListener('click', function () {
    if (laeuft || !vorschau) return;
    $('#bestellFehler').hidden = true;
    var agb = $('#k-agb');
    if (!agb.checked) { bestellFehler('Bitte bestätige zuerst, dass du die AGB gelesen hast.'); agb.focus(); return; }
    laeuft = true; bestellknopf.disabled = true; bestellknopf.textContent = 'Bestellung wird gesendet …';
    var k = kunde();
    var daten = { kunde: k, lieferadresse: lieferadresse(), positionen: positionen(), rabattcode: rabattcode || null,
      kommentar: wert('k-kommentar') || null, agb: true, rechtstexte_stand: STAND };
    var fertigGeworden = false;
    B.rpc('bestellung_aufgeben', { daten: daten, erwartet: Number(vorschau.gesamt) }).then(function (r) {
      fertigGeworden = true;
      S.leeren();
      erfolg(r, k);
      B.funktion('shop-mail', { art: 'bestellung', id: r.id, token: r.token })
        .then(function () { mailStatus(true, r); })
        .catch(function () { mailStatus(false, r); sicherung(r); });
    }).catch(function (e) {
      if (e.hint === 'preis_geaendert') {
        neuRechnen().then(function () { bestellFehler('Die Preise haben sich gerade geändert. Bitte prüfe den neuen Gesamtbetrag und bestell dann noch einmal.'); });
      } else if (e.hint === 'shop_inaktiv') {
        pausiert();
      } else if (e.status) {
        bestellFehler(esc(e.message));
      } else {
        bestellFehler('Die Verbindung ist abgebrochen. Bitte prüf deine Internetverbindung und versuch es noch einmal. Kommt gleich doch eine Bestellbestätigung per E-Mail, ist deine Bestellung angekommen – dann bitte nicht noch einmal bestellen.');
      }
    }).then(function () {
      laeuft = false;
      if (!fertigGeworden) { bestellknopf.disabled = false; bestellknopf.textContent = 'Zahlungspflichtig bestellen'; }
    });
  });

  /* Falls die Bestätigungsmail nicht rausging: kurze Info an uns (ohne Kundendaten) */
  function sicherung(r) {
    if (!C.formspree) return;
    fetch(C.formspree, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ _subject: 'Bestellung ' + r.nummer + ': Bestätigungsmail fehlgeschlagen', nachricht: 'Neue Bestellung ' + r.nummer + ' über ' + euro(r.gesamt) + '. Die automatische Bestätigung an die Kundin oder den Kunden konnte nicht gesendet werden. Bitte im Admin-Bereich unter Bestellungen „Bestätigung erneut senden“ wählen.' })
    }).catch(function () {});
  }
  function mailStatus(ok, r) {
    var el = $('#mailStatus'); if (!el) return;
    el.innerHTML = ok
      ? 'Die Bestätigung mit allen Details ist unterwegs an <b>' + esc(r.email) + '</b>.'
      : 'Die Bestätigung per E-Mail an <b>' + esc(r.email) + '</b> kommt in Kürze. Alle Angaben zur Überweisung siehst du auch hier – am besten druckst du dir die Seite aus.';
  }

  /* ─── Erfolg: Überweisungsdaten + GiroCode ─── */
  function erfolg(r, k) {
    form.hidden = true; aside.hidden = true; zustand.hidden = true;
    schritteAnzeigen('fertig');
    $('#kasseTitel').textContent = 'Bestellung eingegangen';
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* egal */ }
    var b = r.bank || {}, faellig = datumDe(r.faellig_am), vorname = (k.name || '').split(/\s+/)[0];
    var kopie = function (wertText, label) { return '<button type="button" class="kopieren" data-kopie="' + esc(wertText) + '" aria-label="' + esc(label) + ' kopieren">Kopieren</button>'; };
    var bankDa = !!b.iban;
    fertig.innerHTML =
      '<div class="fertig-kopf"><p class="kicker">Bestellung ' + esc(r.nummer) + '</p>' +
      '<h2 id="fertig-titel">Danke, ' + esc(vorname) + '! Jetzt fehlt nur noch deine Überweisung.</h2>' +
      '<p>Deine Bestellung ist bei uns eingegangen. <span id="mailStatus">Die Bestätigung mit allen Details schicken wir gerade an <b>' + esc(r.email) + '</b>.</span></p></div>' +
      (bankDa ? '<div class="fertig-zahlung"><dl class="ueberweisung">' +
        '<div><dt>Betrag</dt><dd><b class="betrag">' + euro(r.gesamt) + '</b>' + kopie(Number(r.gesamt).toFixed(2).replace('.', ','), 'Betrag') + '</dd></div>' +
        '<div><dt>Kontoinhaber</dt><dd>' + esc(b.kontoinhaber) + kopie(b.kontoinhaber, 'Kontoinhaber') + '</dd></div>' +
        '<div><dt>IBAN</dt><dd><span class="iban">' + esc(ibanSchoen(b.iban)) + '</span>' + kopie(b.iban, 'IBAN') + '</dd></div>' +
        (b.bic ? '<div><dt>BIC</dt><dd>' + esc(b.bic) + '</dd></div>' : '') +
        (b.bank ? '<div><dt>Bank</dt><dd>' + esc(b.bank) + '</dd></div>' : '') +
        '<div><dt>Verwendungszweck</dt><dd><b>' + esc(r.nummer) + '</b>' + kopie(r.nummer, 'Verwendungszweck') + '</dd></div>' +
        '<div><dt>Bitte überweisen bis</dt><dd>' + esc(faellig) + '</dd></div></dl>' +
        '<figure class="girocode"><div class="girocode-bild" id="girocode" role="img" aria-label="GiroCode mit allen Überweisungsdaten"></div>' +
        '<figcaption>GiroCode: Mit deiner Banking-App scannen – Empfänger, Betrag und Verwendungszweck sind schon ausgefüllt.</figcaption></figure></div>'
        : '<p class="hinweis-box">Die Bankverbindung schicken wir dir mit der Bestätigung per E-Mail.</p>') +
      '<ol class="fertig-ablauf">' +
      '<li><b>Du überweist</b><span>' + euro(r.gesamt) + ' bis zum ' + esc(faellig) + ', Verwendungszweck ' + esc(r.nummer) + '.</span></li>' +
      '<li><b>Wir drucken</b><span>Sobald das Geld da ist. Lieferzeit: ' + esc(r.lieferzeit || S.lieferzeit()) + ' nach Zahlungseingang.</span></li>' +
      '<li><b>DHL bringt dein Paket</b><span>Die Sendungsnummer bekommst du per E-Mail.</span></li></ol>' +
      '<p class="fertig-klein">Keine E-Mail bekommen? Schau im Spam-Ordner nach oder schreib uns an <a class="textlink" href="mailto:' + esc(MAIL) + '?subject=' + encodeURIComponent('Bestellung ' + r.nummer) + '">' + esc(MAIL) + '</a> – mit deiner Bestellnummer.</p>' +
      '<div class="hero-btns"><button class="btn btn-ghost" type="button" id="drucken">Seite drucken</button><a class="btn btn-ghost" href="index.html">Zur Startseite</a></div>';
    fertig.hidden = false;
    nachOben(fertig);
    fertig.focus({ preventScroll: true });
    $('#drucken').addEventListener('click', function () { window.print(); });
    fertig.addEventListener('click', function (e) {
      var b2 = e.target.closest('.kopieren'); if (!b2) return;
      var t = b2.getAttribute('data-kopie');
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () {
        b2.textContent = 'Kopiert'; b2.classList.add('ok');
        setTimeout(function () { b2.textContent = 'Kopieren'; b2.classList.remove('ok'); }, 1800);
      }, function () { if (window.AeroToast) AeroToast(t); });
    });
    if (bankDa) giroCode(b, r);
    if (window.AeroPapierflieger) setTimeout(function () { AeroPapierflieger($('#fertig-titel')); }, 250);
  }

  /* GiroCode nach EPC069-12 (Version 002, UTF-8) */
  function giroCode(b, r) {
    var ziel = $('#girocode');
    var nutzlast = ['BCD', '002', '1', 'SCT', b.bic || '', String(b.kontoinhaber || '').slice(0, 70), String(b.iban).replace(/\s+/g, ''),
      'EUR' + Number(r.gesamt).toFixed(2), '', '', ('Bestellung ' + r.nummer).slice(0, 140)].join('\n');
    function malen() {
      try {
        window.qrcode.stringToBytes = function (s) { return Array.prototype.slice.call(new TextEncoder().encode(s)); };
        var q = window.qrcode(0, 'M'); q.addData(nutzlast); q.make();
        var n = q.getModuleCount(), rand = 4, w = n + rand * 2, pfad = '';
        for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (q.isDark(y, x)) pfad += 'M' + (x + rand) + ' ' + (y + rand) + 'h1v1h-1z';
        ziel.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + w + '" shape-rendering="crispEdges" aria-hidden="true"><rect width="' + w + '" height="' + w + '" fill="#fff"/><path d="' + pfad + '" fill="#000"/></svg>';
      } catch (e) { ziel.closest('.girocode').hidden = true; }
    }
    if (window.qrcode) { malen(); return; }
    var sk = document.createElement('script');
    sk.src = 'qrcode.min.js?v=1'; sk.onload = malen; sk.onerror = function () { ziel.closest('.girocode').hidden = true; };
    document.head.appendChild(sk);
  }

  /* ─── Start ─── */
  function start() {
    if (!S.lesen().length) { leer(); return; }
    S.bereit(function (aktiv) {
      if (!aktiv) { pausiert(); return; }
      form.hidden = false; aside.hidden = false;
      neuRechnen();
    });
  }
  if (location.hash === '#pruefen') try { history.replaceState(null, '', location.pathname); } catch (e) { /* egal */ }
  start();
})();
