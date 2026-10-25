/* Aero3dp – Konfigurator */
(function () {
  'use strict';
  var P = window.PRODUKT;
  var svg = document.getElementById('blueprint');
  if (!P || !svg) return;
  var NS = 'http://www.w3.org/2000/svg';
  var reduziert = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  var farbe = function (id) { return P.farben.filter(function (f) { return f.id === id; })[0]; };
  var teilName = function (id) { return P.teile.filter(function (t) { return t.id === id; })[0].name; };

  var state = { farben: {}, material: 'PLA', antrieb: false, lack: false, teil: P.teile[0].id, plaFarben: null };
  var LW_FARBE = 'weiss';   // LW-PLA gibt es nur in Weiß
  function istLW() { return P.materialWahl && state.material === 'LW-PLA'; }
  P.teile.forEach(function (t) { state.farben[t.id] = P.presets[0].farben[t.id]; });

  /* ─── Zustand aus Link übernehmen (?f=SI.SI.RO.RO&m=LW&a=1) ─── */
  (function ausLink() {
    var p = new URLSearchParams(location.search);
    var f = p.get('f');
    if (f) f.split('.').forEach(function (kz, i) {
      var c = P.farben.filter(function (x) { return x.kz === kz; })[0];
      if (c && P.teile[i]) state.farben[P.teile[i].id] = c.id;
    });
    if (P.materialWahl && p.get('m') === 'LW') state.material = 'LW-PLA';
    if (p.get('a') === '1') state.antrieb = true;
    if (p.get('l') === '1') state.lack = true;
    if (istLW()) P.teile.forEach(function (t) { state.farben[t.id] = LW_FARBE; });
  })();
  function linkParameter() {
    var p = new URLSearchParams();
    p.set('f', P.teile.map(function (t) { return farbe(state.farben[t.id]).kz; }).join('.'));
    if (P.materialWahl) p.set('m', state.material === 'LW-PLA' ? 'LW' : 'PLA');
    if (state.antrieb) p.set('a', '1');
    if (state.lack) p.set('l', '1');
    return p.toString();
  }
  function linkMerken() { try { history.replaceState(null, '', location.pathname + '?' + linkParameter() + location.hash); } catch (e) { /* egal */ } }

  var genutzt = false;
  function nutzung() {
    if (genutzt) return;
    genutzt = true;
    if (window.AeroBackend) AeroBackend.track('konfigurator_genutzt', { produkt: P.code }, true);
  }

  /* ─── Blueprint: Druck-Animation ─── */
  var teilEls = function (id) { return $$('.bt[data-teil="' + id + '"]', svg); };
  var kopf = $('.druckkopf', svg), kopfLinie = $('line', kopf), defs = $('defs', svg);
  var laufend = {};
  var clipNr = 0;

  function bbox(els) {
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    els.forEach(function (el) { var b = el.getBBox(); x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.width); y2 = Math.max(y2, b.y + b.height); });
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  /* zuordnung: [{el, farbe}] – druckt die neuen Farben von unten nach oben ein */
  function drucken(schluessel, zuordnung, dauer, schichten) {
    Object.keys(laufend).forEach(function (k) {
      if (k === schluessel || k === 'alle' || schluessel === 'alle') laufend[k]();
    });
    var setzen = function () { zuordnung.forEach(function (z) { z.el.style.fill = z.farbe; }); };
    if (reduziert || !zuordnung.length) { setzen(); return; }
    var b = bbox(zuordnung.map(function (z) { return z.el; }));
    var id = 'druck-clip-' + (++clipNr);
    var clip = document.createElementNS(NS, 'clipPath'); clip.id = id;
    var rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', b.x - 4); rect.setAttribute('width', b.w + 8); rect.setAttribute('y', b.y + b.h); rect.setAttribute('height', 0);
    clip.appendChild(rect); defs.appendChild(clip);
    var kopien = zuordnung.map(function (z) {
      var k = z.el.cloneNode(false);
      k.removeAttribute('data-teil'); k.setAttribute('class', 'druck-kopie');
      k.style.fill = z.farbe; k.style.stroke = 'none'; k.style.pointerEvents = 'none';
      k.setAttribute('clip-path', 'url(#' + id + ')');
      z.el.parentNode.insertBefore(k, z.el.nextSibling);
      return k;
    });
    kopfLinie.setAttribute('x1', b.x - 10); kopfLinie.setAttribute('x2', b.x + b.w + 10);
    kopf.classList.add('an');
    var start = performance.now(), fertig = false, raf;
    function ende() {
      if (fertig) return; fertig = true; cancelAnimationFrame(raf);
      setzen(); kopien.forEach(function (k) { k.remove(); }); clip.remove(); kopf.classList.remove('an');
      delete laufend[schluessel];
    }
    laufend[schluessel] = ende;
    (function schritt(t) {
      var p = Math.min((t - start) / dauer, 1);
      var gestuft = Math.ceil(p * schichten) / schichten;
      var h = b.h * gestuft, y = b.y + b.h - h;
      rect.setAttribute('y', y); rect.setAttribute('height', h);
      kopfLinie.setAttribute('y1', y); kopfLinie.setAttribute('y2', y);
      if (p < 1) raf = requestAnimationFrame(schritt); else ende();
    })(start);
  }

  function teilFaerben(teil, mitDruck) {
    var hex = farbe(state.farben[teil]).hex;
    var z = teilEls(teil).map(function (el) { return { el: el, farbe: hex }; });
    if (mitDruck) drucken(teil, z, 650, 16); else z.forEach(function (x) { x.el.style.fill = x.farbe; });
  }

  /* Schichtlinien über alle Bauteile legen */
  var schichtGruppe = $('.schichtlinien', svg);
  $$('.bt', svg).forEach(function (el) {
    var k = el.cloneNode(false);
    k.removeAttribute('data-teil'); k.removeAttribute('class');
    k.setAttribute('fill', 'url(#bp-schicht)'); k.style.stroke = 'none';
    schichtGruppe.appendChild(k);
  });

  /* ─── Panel aufbauen ─── */
  var presetsEl = $('#presets'), tabsEl = $('#teilTabs'), swEl = $('#swatches'), legende = $('#legende');

  P.presets.forEach(function (pr, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'preset'; b.dataset.i = i;
    var punkte = P.teile.map(function (t) { return '<i style="--c:' + farbe(pr.farben[t.id]).hex + '"></i>'; }).join('');
    b.innerHTML = '<span class="punkte" aria-hidden="true">' + punkte + '</span>' + pr.name;
    b.addEventListener('click', function () {
      nutzung();
      if (istLW()) { lwHinweisZeigen(); return; }
      var zuordnung = [];
      P.teile.forEach(function (t) {
        if (state.farben[t.id] === pr.farben[t.id]) return;
        state.farben[t.id] = pr.farben[t.id];
        teilEls(t.id).forEach(function (el) { zuordnung.push({ el: el, farbe: farbe(pr.farben[t.id]).hex }); });
      });
      P.teile.forEach(function (t) { if (laufend[t.id]) laufend[t.id](); });
      drucken('alle', zuordnung, 900, 24);
      aktualisieren(true);
    });
    presetsEl.appendChild(b);
  });

  P.teile.forEach(function (t, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'teil-tab'; b.setAttribute('role', 'tab'); b.dataset.teil = t.id;
    b.id = 'teiltab-' + t.id; b.setAttribute('aria-controls', 'swatches');
    b.innerHTML = '<i aria-hidden="true"></i>' + t.name;
    b.addEventListener('click', function () { teilWaehlen(t.id); });
    b.addEventListener('keydown', function (e) {
      var n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!n) return; e.preventDefault();
      var nxt = P.teile[(i + n + P.teile.length) % P.teile.length].id;
      teilWaehlen(nxt); $('#teiltab-' + nxt).focus();
    });
    tabsEl.appendChild(b);
  });

  P.farben.forEach(function (f, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch'; b.setAttribute('role', 'radio'); b.dataset.farbe = f.id;
    b.innerHTML = '<i style="--c:' + f.hex + '" aria-hidden="true"></i>' + f.name;
    b.addEventListener('click', function () { farbeWaehlen(f.id); });
    b.addEventListener('keydown', function (e) {
      var n = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 0;
      if (!n) return; e.preventDefault();
      var nxt = P.farben[(i + n + P.farben.length) % P.farben.length].id;
      farbeWaehlen(nxt); $('.swatch[data-farbe="' + nxt + '"]', swEl).focus();
    });
    swEl.appendChild(b);
  });

  function teilWaehlen(id, vonBuehne) {
    state.teil = id;
    $$('.teil-tab', tabsEl).forEach(function (b) {
      var an = b.dataset.teil === id; b.setAttribute('aria-selected', an); b.tabIndex = an ? 0 : -1;
    });
    swEl.setAttribute('aria-labelledby', 'teiltab-' + id);
    $$('.bt', svg).forEach(function (el) { el.classList.toggle('aktiv', el.dataset.teil === id); });
    swatchesAktualisieren();
    if (vonBuehne && window.innerWidth <= 960) {
      var r = tabsEl.getBoundingClientRect(), buehneUnten = $('.konfig-buehne').getBoundingClientRect().bottom;
      if (r.top < buehneUnten || r.bottom > window.innerHeight) {
        window.scrollBy({ top: r.top - buehneUnten - 12, behavior: reduziert ? 'auto' : 'smooth' });
      }
    }
  }
  function farbeWaehlen(id) {
    nutzung();
    if (istLW() && id !== LW_FARBE) { lwHinweisZeigen(); return; }
    if (state.farben[state.teil] === id) return;
    state.farben[state.teil] = id;
    teilFaerben(state.teil, true);
    aktualisieren(true);
  }
  function swatchesAktualisieren() {
    $$('.swatch', swEl).forEach(function (b) {
      var an = b.dataset.farbe === state.farben[state.teil];
      b.setAttribute('aria-checked', an); b.tabIndex = an ? 0 : -1;
      if (istLW() && b.dataset.farbe !== LW_FARBE) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
    });
  }

  svg.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('.bt');
    if (el) { nutzung(); teilWaehlen(el.dataset.teil, true); }
  });

  /* Material */
  $$('.material').forEach(function (b) {
    b.addEventListener('click', function () { nutzung(); materialSetzen(b.dataset.material); });
  });
  /* Wechsel zu LW-PLA druckt alles in Weiß, zurück zu PLA stellt die vorherigen Farben wieder her */
  function materialSetzen(m) {
    if (m === state.material) return;
    state.material = m;
    var zuordnung = [], ziel = {};
    if (istLW()) { state.plaFarben = Object.assign({}, state.farben); P.teile.forEach(function (t) { ziel[t.id] = LW_FARBE; }); }
    else if (state.plaFarben) { ziel = state.plaFarben; state.plaFarben = null; }
    P.teile.forEach(function (t) {
      var f = ziel[t.id];
      if (!f || f === state.farben[t.id]) return;
      state.farben[t.id] = f;
      teilEls(t.id).forEach(function (el) { zuordnung.push({ el: el, farbe: farbe(f).hex }); });
    });
    P.teile.forEach(function (t) { if (laufend[t.id]) laufend[t.id](); });
    if (zuordnung.length) drucken('alle', zuordnung, 900, 24);
    aktualisieren(true);
  }
  var lwHinweis = $('#lwHinweis');
  function lwHinweisZeigen() {
    if (!lwHinweis) return;
    lwHinweis.classList.remove('wackeln'); void lwHinweis.offsetWidth; lwHinweis.classList.add('wackeln');
  }
  /* Antrieb */
  var antrieb = $('#antrieb'), antriebInhalt = $('#antriebInhalt');
  antrieb.addEventListener('change', function () { nutzung(); state.antrieb = antrieb.checked; aktualisieren(true); });

  /* Lackierung */
  var lack = $('#lackierung'), lackInhalt = $('#lackInhalt'), lackWunsch = $('#lackWunsch');
  lack.addEventListener('change', function () {
    nutzung(); state.lack = lack.checked; aktualisieren(true);
    if (state.lack) lackieren();
  });

  var lwLack = $('#lwLack');
  if (lwLack) lwLack.addEventListener('click', function () {
    if (!state.lack) { state.lack = true; aktualisieren(true); lackieren(); }
    $('#s-lack').scrollIntoView({ behavior: reduziert ? 'auto' : 'smooth', block: 'center' });
  });

  /* Lackier-Durchgang: eine Spritzpistole fährt einmal über das Modell */
  var lackGruppe = document.createElementNS(NS, 'g'), lackClip = document.createElementNS(NS, 'clipPath');
  lackClip.id = 'lack-clip'; defs.appendChild(lackClip);
  $$('.bt', svg).forEach(function (el) { var k = el.cloneNode(false); k.removeAttribute('data-teil'); k.removeAttribute('class'); lackClip.appendChild(k); });
  var grad = document.createElementNS(NS, 'linearGradient'); grad.id = 'lack-glanz';
  grad.setAttribute('x1', '0'); grad.setAttribute('x2', '1'); grad.setAttribute('y1', '0'); grad.setAttribute('y2', '0');
  [['0', 0], ['.42', .5], ['.5', .9], ['.58', .5], ['1', 0]].forEach(function (s) {
    var st = document.createElementNS(NS, 'stop'); st.setAttribute('offset', s[0]); st.setAttribute('stop-color', '#fff'); st.setAttribute('stop-opacity', s[1]); grad.appendChild(st);
  });
  defs.appendChild(grad);
  lackGruppe.setAttribute('class', 'lack-ebene'); lackGruppe.setAttribute('clip-path', 'url(#lack-clip)'); lackGruppe.setAttribute('aria-hidden', 'true');
  var glanz = document.createElementNS(NS, 'rect');
  glanz.setAttribute('y', '0'); glanz.setAttribute('height', '820'); glanz.setAttribute('width', '300'); glanz.setAttribute('x', '-340'); glanz.setAttribute('fill', 'url(#lack-glanz)');
  lackGruppe.appendChild(glanz);
  $('.flugzeug', svg).after(lackGruppe);
  var duese = document.createElementNS(NS, 'line');
  duese.setAttribute('class', 'lack-duese'); duese.setAttribute('aria-hidden', 'true');
  duese.setAttribute('y1', '70'); duese.setAttribute('y2', '750');
  lackGruppe.after(duese);
  var lackRaf;
  function lackieren() {
    if (reduziert) return;
    cancelAnimationFrame(lackRaf);
    var start = performance.now();
    svg.classList.add('spruehen');
    (function schritt(t) {
      var p = Math.min((t - start) / 1100, 1), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      var x = -340 + e * 1200;
      glanz.setAttribute('x', x); duese.setAttribute('x1', x + 150); duese.setAttribute('x2', x + 150);
      if (p < 1) lackRaf = requestAnimationFrame(schritt); else svg.classList.remove('spruehen');
    })(start);
  }

  /* Ansicht Draufsicht / Foto */
  $$('.ansicht [role="tab"]').forEach(function (t, i, alle) {
    t.addEventListener('click', function () {
      alle.forEach(function (x) {
        var an = x === t; x.setAttribute('aria-selected', an); x.tabIndex = an ? 0 : -1;
        document.getElementById(x.getAttribute('aria-controls')).hidden = !an;
      });
    });
  });

  /* ─── Preis, Code, Legende ─── */
  var summeEl = $('#summe'), aufstellung = $('#aufstellung'), codeEl = $('#konfigCode');
  var angezeigt = null, zusatz;
  function preise() {
    var zeilen = [['Bausatz ' + P.name, P.preis]], summe = P.preis, offen = false;
    if (P.materialWahl && state.material === 'LW-PLA') { zeilen.push(['LW-PLA-Aufpreis', P.lwAufpreis]); summe += P.lwAufpreis; }
    if (state.antrieb) {
      if (P.preisSet != null) { var d = Math.round((P.preisSet - P.preis) * 100) / 100; zeilen.push(['Antriebsset', d]); summe += d; }
      else { zeilen.push(['Antriebsset', null]); offen = true; }
    }
    if (state.lack) { zeilen.push(['Personalisierte Lackierung', null]); offen = true; }
    return { zeilen: zeilen, summe: Math.round(summe * 100) / 100, offen: offen };
  }
  function offenTeile() {
    var t = [];
    if (state.antrieb && P.preisSet == null) t.push('Antriebsset');
    if (state.lack) t.push('Lackierung');
    return t.join(' und ');
  }
  function code() {
    var kz = P.teile.map(function (t) { return farbe(state.farben[t.id]).kz; }).join('.');
    return [P.code, state.material === 'LW-PLA' ? 'LW' : 'PLA', kz, state.antrieb ? 'A' : '0'].join('-') + (state.lack ? '-L' : '');
  }
  function preisAnimieren(ziel) {
    if (angezeigt === null || reduziert) { angezeigt = ziel; summeEl.textContent = EUR.format(ziel); return; }
    var von = angezeigt, start = performance.now();
    angezeigt = ziel;
    summeEl.classList.remove('puls'); void summeEl.offsetWidth; summeEl.classList.add('puls');
    (function schritt(t) {
      var p = Math.min((t - start) / 450, 1), e = 1 - Math.pow(1 - p, 3);
      summeEl.textContent = EUR.format(von + (ziel - von) * e);
      if (p < 1) requestAnimationFrame(schritt);
    })(start);
  }
  function aktualisieren(gemerkt) {
    $$('.teil-tab', tabsEl).forEach(function (b) { $('i', b).style.setProperty('--c', farbe(state.farben[b.dataset.teil]).hex); });
    swatchesAktualisieren();
    $$('.preset', presetsEl).forEach(function (b) {
      var pr = P.presets[b.dataset.i];
      b.setAttribute('aria-pressed', P.teile.every(function (t) { return pr.farben[t.id] === state.farben[t.id]; }));
    });
    legende.innerHTML = P.teile.map(function (t) {
      var f = farbe(state.farben[t.id]);
      return '<li><i style="--c:' + f.hex + '" aria-hidden="true"></i>' + t.name + ' <b>' + f.name + '</b></li>';
    }).join('') + (P.materialWahl ? '<li>Material <b>' + state.material + '</b></li>' : '') + (state.lack ? '<li class="lack-chip">+ Lackierung <b>nach Wunsch</b></li>' : '');
    $$('.material').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.material === state.material); });
    antrieb.checked = state.antrieb;
    antriebInhalt.classList.toggle('offen', state.antrieb);
    if (lwHinweis) lwHinweis.hidden = !istLW();
    presetsEl.classList.toggle('gesperrt', istLW());
    lack.checked = state.lack;
    lackInhalt.classList.toggle('offen', state.lack);
    svg.classList.toggle('lackiert', state.lack);
    var pr = preise();
    aufstellung.innerHTML = pr.zeilen.map(function (z) {
      return '<div><dt>' + z[0] + '</dt><dd>' + (z[1] == null ? 'auf Anfrage' : EUR.format(z[1])) + '</dd></div>';
    }).join('');
    preisAnimieren(pr.summe);
    if (!zusatz) { zusatz = document.createElement('small'); zusatz.style.cssText = 'display:block;font-size:.8rem;color:var(--text-3);text-align:right;margin-top:.2rem'; summeEl.parentNode.after(zusatz); }
    var offen = offenTeile();
    zusatz.textContent = offen ? 'zzgl. ' + offen + ', Preis auf Anfrage' : '';
    codeEl.textContent = code();
    if (gemerkt) linkMerken();
  }

  /* ─── Teilen ─── */
  $('#teilen').addEventListener('click', function () {
    nutzung();
    var url = location.origin + location.pathname + '?' + linkParameter() + '#konfigurator';
    if (window.AeroBackend) AeroBackend.track('konfig_geteilt', { produkt: P.code });
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      navigator.share({ title: P.name + ' – meine Konfiguration', text: 'Schau dir meine ' + P.name + ' an (' + code() + ')', url: url }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () { AeroToast('Link kopiert – deine Konfiguration ist darin gespeichert.'); },
        function () { prompt('Link zu deiner Konfiguration:', url); });
    } else { prompt('Link zu deiner Konfiguration:', url); }
  });

  /* ─── Anfrage ─── */
  var form = $('#konfigForm'), oeffnen = $('#anfrageOeffnen');
  oeffnen.addEventListener('click', function () {
    nutzung();
    form.hidden = !form.hidden;
    oeffnen.setAttribute('aria-expanded', !form.hidden);
    if (!form.hidden) { $('input', form).focus({ preventScroll: true }); form.scrollIntoView({ behavior: reduziert ? 'auto' : 'smooth', block: 'nearest' }); }
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var d = new FormData(form), status = $('.form-status', form), btn = $('button[type="submit"]', form);
    var pr = preise(), c = code();
    var farbenText = {};
    P.teile.forEach(function (t) { farbenText[t.name] = farbe(state.farben[t.id]).name; });
    var zeilen = ['Modell: ' + P.name, 'Code: ' + c];
    P.teile.forEach(function (t) { zeilen.push(t.name + ': ' + farbenText[t.name]); });
    var wunsch = state.lack ? lackWunsch.value.trim() : '';
    zeilen.push('Material: ' + state.material, 'Antriebsset: ' + (state.antrieb ? 'ja' : 'nein'),
      'Personalisierte Lackierung: ' + (state.lack ? 'ja' + (wunsch ? ' – ' + wunsch : '') : 'nein'),
      'Preis: ' + EUR.format(pr.summe) + (pr.offen ? ' + ' + offenTeile() + ' auf Anfrage' : ''),
      'Link: ' + location.origin + location.pathname + '?' + linkParameter());
    btn.disabled = true; btn.textContent = 'Wird gesendet …'; status.hidden = true;
    AeroAnfrage({
      art: 'konfigurator', name: d.get('name').trim(), email: d.get('email').trim(), nachricht: d.get('nachricht').trim(),
      honig: d.get('_gotcha'), betreff: 'Konfiguration ' + P.name + ': ' + c, zusammenfassung: zeilen.join('\n'),
      details: { produkt: P.name, code: c, farben: farbenText, material: state.material, antrieb: state.antrieb, lackierung: state.lack, lack_wunsch: wunsch || undefined, preis: pr.summe, preis_offen: pr.offen }
    }).then(function () {
      AeroPapierflieger(btn);
      status.className = 'form-status ok';
      status.textContent = 'Danke! Deine Konfiguration ' + c + ' ist bei uns angekommen. Wir melden uns per E-Mail bei dir.';
      form.reset(); lackWunsch.value = '';
    }).catch(function (err) {
      status.className = 'form-status fehler';
      status.textContent = /Zu viele/.test(err.message) ? err.message : 'Das hat nicht geklappt. Schreib uns bitte an info@aero3dp.de und nenne den Code ' + c + '.';
    }).then(function () { status.hidden = false; btn.disabled = false; btn.textContent = 'Konfiguration anfragen'; });
  });

  /* Lieferzeit aus dem Werkstatt-Status */
  if (window.AeroBackend && AeroBackend.enabled) {
    AeroBackend.werkstatt().then(function (w) { if (w && w.lieferzeit) $('#lieferzeit').textContent = 'Lieferzeit aktuell: ' + w.lieferzeit + '.'; });
  }

  /* ─── Start: Umriss zeichnen, dann alles einmal drucken ─── */
  aktualisieren(false);
  teilWaehlen(state.teil);
  var alle = $$('.bt', svg);
  if (reduziert) {
    P.teile.forEach(function (t) { teilFaerben(t.id, false); });
  } else {
    alle.forEach(function (el) { el.style.fill = 'transparent'; try { el.style.setProperty('--len', Math.ceil(el.getTotalLength())); } catch (e) { el.style.setProperty('--len', 2000); } });
    var io = new IntersectionObserver(function (e) {
      if (!e[0].isIntersecting) return;
      io.disconnect();
      svg.classList.add('zeichnet');
      setTimeout(function () {
        svg.classList.remove('zeichnet');
        var z = [];
        alle.forEach(function (el) { z.push({ el: el, farbe: farbe(state.farben[el.dataset.teil]).hex }); });
        drucken('alle', z, 1500, 40);
      }, 1000);
    }, { threshold: .3 });
    io.observe(svg);
  }
})();
