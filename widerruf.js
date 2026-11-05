/* Aero3dp – Online-Widerruf (§ 356a BGB): Daten angeben → „Widerruf bestätigen“ → Eingangsbestätigung */
(function () {
  'use strict';
  var form = document.getElementById('widerrufForm');
  if (!form) return;
  var B = window.AeroBackend, C = window.AERO_CONFIG || {};
  var MAIL = C.email || 'info@aero3dp.de';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fertig = $('#widerrufFertig'), status = $('.form-status', form), btn = $('button[type="submit"]', form);

  /* Bestellnummer aus dem Link der Bestellbestätigung übernehmen (?nr=A3D-2026-0001) */
  var nr = new URLSearchParams(location.search).get('nr');
  if (nr && /^[A-Za-z0-9-]{2,40}$/.test(nr)) $('#w-nummer').value = nr.toUpperCase();

  form.addEventListener('change', function (e) {
    if (e.target.name !== 'umfang') return;
    var teil = e.target.value === 'teil';
    $('#teilFeld').hidden = !teil;
    if (teil) $('#w-teil').focus();
  });

  function markieren(id, text) {
    var el = document.getElementById(id), fid = id + '-fehler', f = document.getElementById(fid);
    if (text) {
      el.setAttribute('aria-invalid', 'true');
      if (!f) { f = document.createElement('small'); f.className = 'feld-fehler'; f.id = fid; el.after(f); }
      f.textContent = text;
      if ((el.getAttribute('aria-describedby') || '').indexOf(fid) < 0) el.setAttribute('aria-describedby', ((el.getAttribute('aria-describedby') || '') + ' ' + fid).trim());
    } else { el.removeAttribute('aria-invalid'); if (f) f.remove(); }
    return !text;
  }
  function wert(id) { return document.getElementById(id).value.trim(); }

  function zeitstempel(iso) {
    var d = new Date(iso);
    var tag = d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
    var zeit = d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return tag + ' um ' + zeit + ' Uhr';
  }

  function bestaetigung(w) {
    form.hidden = true;
    fertig.innerHTML = '<p class="kicker">Eingang bestätigt</p><h3>Dein Widerruf ist bei uns eingegangen</h3>' +
      '<p class="eingang">Eingegangen am <b>' + esc(zeitstempel(w.eingegangen)) + '</b></p>' +
      '<dl class="widerruf-daten"><div><dt>Name</dt><dd>' + esc(w.name) + '</dd></div><div><dt>E-Mail</dt><dd>' + esc(w.email) + '</dd></div>' +
      '<div><dt>Bestellnummer</dt><dd>' + esc(w.bestellnummer) + '</dd></div><div><dt>Umfang</dt><dd>' + esc(w.umfang) + '</dd></div>' +
      (w.grund ? '<div><dt>Grund</dt><dd>' + esc(w.grund) + '</dd></div>' : '') + '</dl>' +
      '<p id="wMailStatus">Die Eingangsbestätigung mit diesen Angaben schicken wir gerade an <b>' + esc(w.email) + '</b>.</p>' +
      '<p class="widerruf-klein">Diese Bestätigung zeigt nur, dass deine Erklärung bei uns angekommen ist. Ob und in welchem Umfang der Widerruf wirksam ist, prüfen wir und melden uns dann bei dir.</p>' +
      '<button class="btn btn-ghost btn-small" type="button" id="wDrucken">Bestätigung drucken</button>';
    fertig.hidden = false;
    fertig.focus();
    $('#wDrucken').addEventListener('click', function () { window.print(); });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    status.hidden = true;
    var ok = [
      markieren('w-name', wert('w-name').length >= 2 ? '' : 'Bitte gib deinen Namen an.'),
      markieren('w-email', /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(wert('w-email')) ? '' : 'Bitte gib eine gültige E-Mail-Adresse an – dorthin schicken wir die Eingangsbestätigung.'),
      markieren('w-nummer', wert('w-nummer').length >= 2 ? '' : 'Bitte gib deine Bestellnummer an (oder das Datum des Angebots).')
    ];
    var teil = form.querySelector('[name="umfang"]:checked').value === 'teil';
    if (teil) ok.push(markieren('w-teil', wert('w-teil').length >= 2 ? '' : 'Bitte schreib kurz, welche Artikel du widerrufen möchtest.'));
    var erstes = form.querySelector('[aria-invalid="true"]');
    if (erstes) { erstes.focus(); return; }
    if (!ok.every(Boolean)) return;

    var daten = { name: wert('w-name'), email: wert('w-email'), bestellnummer: wert('w-nummer').toUpperCase(),
      umfang: teil ? 'Teilweise: ' + wert('w-teil') : null, grund: wert('w-grund') || null };
    if (form.querySelector('[name="_gotcha"]').value) return;   // Spam-Bot

    if (!B || !B.enabled) {
      status.className = 'form-status fehler';
      status.innerHTML = 'Das Online-Formular ist gerade nicht erreichbar. Bitte schick deinen Widerruf per E-Mail an <a class="textlink" href="mailto:' + esc(MAIL) + '?subject=' + encodeURIComponent('Widerruf ' + daten.bestellnummer) + '">' + esc(MAIL) + '</a>.';
      status.hidden = false; return;
    }
    btn.disabled = true; btn.textContent = 'Wird übermittelt …';
    B.rpc('widerruf_erklaeren', { daten: daten }).then(function (w) {
      bestaetigung(w);
      B.funktion('shop-mail', { art: 'widerruf', id: w.id, token: w.token }).then(function () {
        var el = $('#wMailStatus'); if (el) el.innerHTML = 'Die Eingangsbestätigung mit diesen Angaben ist unterwegs an <b>' + esc(w.email) + '</b>.';
      }).catch(function () {
        var el = $('#wMailStatus'); if (el) el.innerHTML = 'Die Eingangsbestätigung per E-Mail an <b>' + esc(w.email) + '</b> kommt in Kürze. Bitte druck dir diese Seite zur Sicherheit aus.';
      });
    }).catch(function (err) {
      status.className = 'form-status fehler';
      status.innerHTML = esc(err && err.status ? err.message : 'Die Verbindung ist abgebrochen.') +
        ' Du kannst deinen Widerruf auch per E-Mail an <a class="textlink" href="mailto:' + esc(MAIL) + '?subject=' + encodeURIComponent('Widerruf ' + daten.bestellnummer) + '">' + esc(MAIL) + '</a> schicken.';
      status.hidden = false;
    }).then(function () { btn.disabled = false; btn.textContent = 'Widerruf bestätigen'; });
  });
})();
