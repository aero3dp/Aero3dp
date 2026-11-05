/* Aero3dp – 3D-Designservice: Anfrage mit Fotos, Skizzen und Dateien */
(function () {
  'use strict';
  var form = document.getElementById('designForm');
  if (!form) return;
  var B = window.AeroBackend, C = window.AERO_CONFIG || {};
  var MAIL = C.email || 'info@aero3dp.de';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var TYPEN = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
    pdf: 'application/pdf', stl: 'model/stl', step: 'model/step', stp: 'model/step', '3mf': 'model/3mf', obj: 'model/obj' };
  var MAX_DATEIEN = 6, MAX_MB = 20;
  var dateien = [];   // { file, ext, url }
  var zone = $('#dateiZone'), input = $('#d-dateien'), liste = $('#dateiListe');
  var status = $('.form-status', form), btn = $('button[type="submit"]', form), balken = $('#designFortschritt');

  function mb(b) { return (b / 1048576).toFixed(b < 1048576 ? 2 : 1).replace('.', ',') + ' MB'; }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function meldung(text, art) { status.className = 'form-status ' + (art || 'fehler'); status.innerHTML = text; status.hidden = !text; }

  function hinzufuegen(files) {
    var abgelehnt = [];
    Array.prototype.forEach.call(files, function (f) {
      var ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!TYPEN[ext]) { abgelehnt.push(f.name + ' (Dateityp)'); return; }
      if (f.size > MAX_MB * 1048576) { abgelehnt.push(f.name + ' (größer als ' + MAX_MB + ' MB)'); return; }
      if (dateien.length >= MAX_DATEIEN) { abgelehnt.push(f.name + ' (höchstens ' + MAX_DATEIEN + ' Dateien)'); return; }
      if (dateien.some(function (d) { return d.file.name === f.name && d.file.size === f.size; })) return;
      dateien.push({ file: f, ext: ext, url: /^(jpg|jpeg|png|webp)$/.test(ext) ? URL.createObjectURL(f) : null });
    });
    zeichnen();
    meldung(abgelehnt.length ? 'Nicht übernommen: ' + esc(abgelehnt.join(', ')) + '.' : '');
  }
  function zeichnen() {
    liste.innerHTML = dateien.map(function (d, i) {
      var vorschau = d.url ? '<img src="' + d.url + '" alt="">' : '<span class="datei-typ">' + esc(d.ext.toUpperCase()) + '</span>';
      return '<li>' + vorschau + '<span class="datei-name">' + esc(d.file.name) + '<small>' + mb(d.file.size) + '</small></span>' +
        '<button type="button" class="korb-weg" data-i="' + i + '" aria-label="' + esc(d.file.name) + ' entfernen">Entfernen</button></li>';
    }).join('');
  }
  liste.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-i]'); if (!b) return;
    var d = dateien.splice(+b.getAttribute('data-i'), 1)[0];
    if (d && d.url) URL.revokeObjectURL(d.url);
    zeichnen(); input.focus();
  });
  input.addEventListener('change', function () { hinzufuegen(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach(function (t) { zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.add('drag'); }); });
  ['dragleave', 'drop'].forEach(function (t) { zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.remove('drag'); }); });
  zone.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) hinzufuegen(e.dataTransfer.files); });

  function markieren(id, text) {
    var el = document.getElementById(id), fid = id + '-fehler', f = document.getElementById(fid);
    if (text) {
      el.setAttribute('aria-invalid', 'true');
      if (!f) { f = document.createElement('small'); f.className = 'feld-fehler'; f.id = fid; (el.type === 'checkbox' ? el.parentNode : el).after(f); }
      f.textContent = text;
      if ((el.getAttribute('aria-describedby') || '').indexOf(fid) < 0) el.setAttribute('aria-describedby', ((el.getAttribute('aria-describedby') || '') + ' ' + fid).trim());
    } else { el.removeAttribute('aria-invalid'); if (f) f.remove(); }
  }
  function wert(id) { return document.getElementById(id).value.trim(); }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    meldung('');
    markieren('d-beschreibung', wert('d-beschreibung').length >= 10 ? '' : 'Beschreib das Teil bitte in ein, zwei Sätzen.');
    markieren('d-name', wert('d-name').length >= 2 ? '' : 'Bitte gib deinen Namen an.');
    markieren('d-email', /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(wert('d-email')) ? '' : 'Bitte gib eine gültige E-Mail-Adresse an.');
    markieren('d-rechte', $('#d-rechte').checked ? '' : 'Bitte bestätige das.');
    markieren('d-datenschutz', $('#d-datenschutz').checked ? '' : 'Ohne dein Einverständnis können wir die Anfrage nicht bearbeiten.');
    var erstes = form.querySelector('[aria-invalid="true"]');
    if (erstes) { erstes.focus(); return; }

    var leistung = form.querySelector('[name="leistung"]:checked').value;
    var artEl = $('#d-art'), artText = artEl.options[artEl.selectedIndex].text;
    var hochgeladen = [], fehlgeschlagen = 0, jahrMonat = new Date().toISOString().slice(0, 7).replace('-', '/');
    btn.disabled = true; btn.textContent = dateien.length ? 'Dateien werden hochgeladen …' : 'Wird gesendet …';
    balken.hidden = !dateien.length; $('i', balken).style.width = '0%';

    var kette = Promise.resolve();
    dateien.forEach(function (d, i) {
      kette = kette.then(function () {
        if (!B || !B.enabled) { fehlgeschlagen++; return; }
        var pfad = jahrMonat + '/' + uuid() + '.' + d.ext;
        return B.upload('designdateien', pfad, d.file, TYPEN[d.ext]).then(function () {
          hochgeladen.push({ pfad: pfad, name: d.file.name.slice(0, 120), groesse_mb: Math.round(d.file.size / 10485.76) / 100 });
        }).catch(function () { fehlgeschlagen++; }).then(function () { $('i', balken).style.width = ((i + 1) / dateien.length * 100) + '%'; });
      });
    });
    kette.then(function () {
      btn.textContent = 'Wird gesendet …';
      var details = { leistung: leistung, art: artEl.value, masse: wert('d-masse') || undefined, material: $('#d-material').value,
        menge: Math.max(1, Math.min(500, parseInt(wert('d-menge'), 10) || 1)), frist: wert('d-frist') || undefined,
        dateien: hochgeladen, dateien_fehlgeschlagen: fehlgeschlagen || undefined };
      var zeilen = ['Leistung: ' + (leistung === 'design' ? 'Nur Konstruktion (Datei)' : 'Konstruktion und Druck'), 'Art: ' + artText,
        'Maße: ' + (details.masse || '–'), 'Material: ' + details.material, 'Stückzahl: ' + details.menge, 'Frist: ' + (details.frist || '–'),
        'Dateien: ' + (hochgeladen.length ? hochgeladen.map(function (d) { return d.name; }).join(', ') + ' (im Admin-Bereich)' : 'keine') +
        (fehlgeschlagen ? ' – ' + fehlgeschlagen + ' Upload(s) fehlgeschlagen, bitte nachfordern' : '')];
      return window.AeroAnfrage({
        art: 'designservice', name: wert('d-name'), email: wert('d-email'), nachricht: wert('d-beschreibung'),
        honig: form.querySelector('[name="_gotcha"]').value, betreff: 'Designanfrage: ' + artText + ' – ' + wert('d-name'),
        zusammenfassung: zeilen.join('\n'), details: details
      });
    }).then(function () {
      if (window.AeroPapierflieger) AeroPapierflieger(btn);
      meldung('Danke! Deine Anfrage ist bei uns angekommen. Wir schauen sie uns an und melden uns mit Rückfragen oder einem festen Angebot per E-Mail.' +
        (fehlgeschlagen ? ' Ein Teil der Dateien ließ sich nicht hochladen – wir fragen sie bei dir nach.' : ''), 'ok');
      form.reset();
      dateien.forEach(function (d) { if (d.url) URL.revokeObjectURL(d.url); });
      dateien = []; zeichnen();
    }).catch(function (err) {
      meldung(/Zu viele/.test(err.message) ? esc(err.message) : 'Das hat nicht geklappt. Schreib uns bitte direkt an <a class="textlink" href="mailto:' + esc(MAIL) + '">' + esc(MAIL) + '</a>.');
    }).then(function () { btn.disabled = false; btn.textContent = 'Kostenloses Angebot anfragen'; balken.hidden = true; });
  });
})();
