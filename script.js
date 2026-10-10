/* Aero3dp – gemeinsames Verhalten aller Seiten */
(function () {
  'use strict';
  document.documentElement.classList.remove('no-js');
  var reduziert = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mitMaus = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ─── Navigation ─── */
  var nav = $('#nav');
  var burger = $('#burger'), links = $('#navLinks');
  function menu(auf) {
    if (!burger) return;
    burger.setAttribute('aria-expanded', auf ? 'true' : 'false');
    burger.setAttribute('aria-label', auf ? 'Menü schließen' : 'Menü öffnen');
    links.classList.toggle('open', auf);
  }
  if (burger) {
    burger.addEventListener('click', function () { menu(burger.getAttribute('aria-expanded') !== 'true'); });
    $$('a', links).forEach(function (a) { a.addEventListener('click', function () { menu(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') menu(false); });
  }

  /* ─── Scroll: Nav, Höhenmesser, nach oben, Parallax ─── */
  var alti = $('#altimeterFill'), hoch = $('#backToTop');
  var parallax = reduziert ? [] : $$('[data-parallax]');
  var tick = false;
  function aufScroll() {
    var y = window.scrollY, h = document.documentElement;
    if (nav) nav.classList.toggle('scrolled', y > 20);
    if (alti) { var max = h.scrollHeight - h.clientHeight; alti.style.width = (max > 0 ? y / max * 100 : 0) + '%'; }
    if (hoch) hoch.classList.toggle('visible', y > 700);
    var vh = window.innerHeight;
    parallax.forEach(function (el) {
      var r = el.getBoundingClientRect();
      el.style.setProperty('--py', (((r.top + r.height / 2) - vh / 2) * -parseFloat(el.dataset.parallax)).toFixed(1) + 'px');
    });
    tick = false;
  }
  window.addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(aufScroll); } }, { passive: true });
  aufScroll();
  if (hoch) hoch.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduziert ? 'auto' : 'smooth' }); });

  /* ─── Einblenden, Zähler, Balken ─── */
  var io = new IntersectionObserver(function (eintraege) {
    eintraege.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target;
      if (el.classList.contains('reveal')) el.classList.add('on');
      if (el.dataset.zaehler) zaehlen(el);
      if (el.classList.contains('fill')) fuellen(el);
      io.unobserve(el);
    });
  }, { threshold: 0.15 });
  $$('.reveal, [data-zaehler], .meter .fill').forEach(function (el) { io.observe(el); });

  function zaehlen(el) {
    var ziel = parseFloat(el.dataset.zaehler), start = performance.now(), dauer = 1200;
    if (reduziert) { el.textContent = ziel; return; }
    (function schritt(t) {
      var p = Math.min((t - start) / dauer, 1);
      el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * ziel);
      if (p < 1) requestAnimationFrame(schritt);
    })(start);
  }
  function fuellen(el) {
    var w = parseFloat(el.dataset.wert) || 0;
    el.style.width = w + '%';
    if (el.classList.contains('schwierigkeit')) {
      var hue = 125 - w * 1.2; // grün → gelb → rot
      el.style.background = 'hsl(' + hue + ', 62%, 46%)';
    }
  }
  window.AeroFuellen = fuellen;

  /* ─── Tabs (Flugmodelle / Zubehör) ─── */
  $$('[role="tablist"]').forEach(function (liste) {
    var tabs = $$('[role="tab"]', liste);
    function waehle(tab, fokus) {
      tabs.forEach(function (t) {
        var an = t === tab;
        t.setAttribute('aria-selected', an ? 'true' : 'false');
        t.tabIndex = an ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !an;
        if (an && panel) $$('.meter .fill', panel).forEach(fuellen);
      });
      if (fokus) tab.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { waehle(t); });
      t.addEventListener('keydown', function (e) {
        var n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (n) { e.preventDefault(); waehle(tabs[(i + n + tabs.length) % tabs.length], true); }
      });
    });
  });

  /* ─── Magnetische Buttons (nur große Aktionen, nur mit Maus) ─── */
  if (mitMaus && !reduziert) {
    $$('.magnet').forEach(function (b) {
      b.addEventListener('mousemove', function (e) {
        var r = b.getBoundingClientRect();
        b.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * .2) + 'px,' + ((e.clientY - r.top - r.height / 2) * .3) + 'px)';
      });
      b.addEventListener('mouseleave', function () { b.style.transform = ''; });
    });
  }

  /* ─── Kleinigkeiten ─── */
  var titel = document.title;
  document.addEventListener('visibilitychange', function () { document.title = document.hidden ? 'Komm zurück! ✈' : titel; });
  $$('[data-jahr]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
  if (window.console && console.log) {
    console.log('%cAero3dp%c – gedruckt in Neuss, geflogen auf dem Platz.', 'color:#ec4a44;font:800 20px Lexend,sans-serif', 'color:#999;font:12px sans-serif');
    console.log('%cDu schaust dir den Code an? Schreib uns: info@aero3dp.de', 'color:#ddd;font:12px sans-serif');
  }

  /* ─── Toast ─── */
  var toastEl;
  function toast(text) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = text;
    toastEl.classList.add('zeigen');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { toastEl.classList.remove('zeigen'); }, 2600);
  }
  window.AeroToast = toast;

  /* ─── Papierflieger nach erfolgreichem Absenden ─── */
  function papierflieger(ursprung) {
    if (reduziert) return;
    var r = ursprung ? ursprung.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    var x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    for (var i = 0; i < 16; i++) {
      (function () {
        var el = document.createElement('div');
        el.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M2 12 22 3 14 12 22 21Z" fill="#cc1212"/></svg>';
        el.style.cssText = 'position:fixed;left:' + x0 + 'px;top:' + y0 + 'px;z-index:9999;pointer-events:none;';
        var w = (Math.random() - .5) * 2.4, d = 220 + Math.random() * 320, dauer = 900 + Math.random() * 700;
        el.style.transition = 'transform ' + dauer + 'ms cubic-bezier(.15,.6,.4,1), opacity ' + dauer + 'ms ease-in';
        document.body.appendChild(el);
        requestAnimationFrame(function () { requestAnimationFrame(function () {
          el.style.transform = 'translate(' + Math.sin(w) * d + 'px,' + (-Math.abs(Math.cos(w)) * d - 80) + 'px) rotate(' + (Math.random() - .5) * 360 + 'deg)';
          el.style.opacity = '0';
        }); });
        setTimeout(function () { el.remove(); }, dauer + 100);
      })();
    }
  }
  window.AeroPapierflieger = papierflieger;

  /* ─── Anfragen versenden: Supabase (falls eingerichtet) + E-Mail via Formspree ─── */
  function anfrageSenden(a) {
    var C = window.AERO_CONFIG || {}, B = window.AeroBackend;
    var ergebnis = { db: false, mail: false, fehler: null };
    var dbVersuch = (B && B.enabled) ? B.insert('anfragen', {
      art: a.art, name: a.name, email: a.email, nachricht: a.nachricht || null,
      details: a.details || null, datei_pfad: a.dateiPfad || null
    }).then(function () { ergebnis.db = true; }).catch(function (e) { ergebnis.fehler = e.message; }) : Promise.resolve();
    return dbVersuch.then(function () {
      if (ergebnis.fehler && /Zu viele/.test(ergebnis.fehler)) throw new Error(ergebnis.fehler);
      var felder = { name: a.name, email: a.email, _subject: a.betreff, nachricht: a.nachricht || '', _gotcha: a.honig || '' };
      if (a.zusammenfassung) felder.zusammenfassung = a.zusammenfassung;
      if (a.dateiPfad) felder.datei = ergebnis.db ? 'Liegt im Admin-Bereich: ' + a.dateiPfad : 'Upload fehlgeschlagen – bitte Datei anfordern';
      return fetch(C.formspree, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(felder)
      }).then(function (res) { ergebnis.mail = res.ok; }).catch(function () {});
    }).then(function () {
      if (!ergebnis.db && !ergebnis.mail) throw new Error(ergebnis.fehler || 'Netzwerkfehler');
      if (B) B.track('anfrage_gesendet', { art: a.art });
      return ergebnis;
    });
  }
  window.AeroAnfrage = anfrageSenden;

  /* ─── Kontaktformular (Startseite) ─── */
  var kf = $('#kontaktForm');
  if (kf) {
    var p = new URLSearchParams(location.search);
    if (p.get('produkt')) {
      var thema = $('#thema', kf); if (thema) thema.value = 'Produktanfrage';
      var n = $('#nachricht', kf); if (n && !n.value) n.value = 'Ich interessiere mich für: ' + p.get('produkt') + '\n\n';
    }
    kf.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = $('.form-status', kf), btn = $('button[type="submit"]', kf);
      var d = new FormData(kf);
      btn.disabled = true; btn.textContent = 'Wird gesendet …'; status.hidden = true;
      anfrageSenden({
        art: 'kontakt', name: d.get('name').trim(), email: d.get('email').trim(),
        nachricht: '[' + d.get('thema') + '] ' + d.get('nachricht').trim(), honig: d.get('_gotcha'),
        betreff: 'Kontakt: ' + d.get('thema') + ' – ' + d.get('name').trim(), details: { thema: d.get('thema') }
      }).then(function () {
        papierflieger(btn);
        status.className = 'form-status ok'; status.textContent = 'Danke! Deine Nachricht ist abgeflogen. Wir melden uns per E-Mail bei dir.';
        kf.reset();
      }).catch(function (err) {
        status.className = 'form-status fehler';
        status.textContent = /Zu viele/.test(err.message) ? err.message : 'Das hat nicht geklappt. Schreib uns bitte direkt an info@aero3dp.de.';
      }).then(function () { status.hidden = false; btn.disabled = false; btn.textContent = 'Nachricht senden'; });
    });
  }

  /* ─── Werkstatt-Status ─── */
  var pill = $('[data-werkstatt]');
  if (pill && window.AeroBackend && AeroBackend.enabled) {
    AeroBackend.werkstatt().then(function (w) {
      if (!w || (!w.status_text && !w.lieferzeit)) return;
      var teile = [];
      if (w.status_text) teile.push('<span>Gerade in der Werkstatt: <strong></strong></span>');
      if (w.lieferzeit) teile.push('<span>Lieferzeit aktuell: <strong></strong></span>');
      pill.innerHTML = '<span class="live" aria-hidden="true"></span>' + teile.join('<span aria-hidden="true">/</span>');
      var strongs = $$('strong', pill), i = 0;
      if (w.status_text) strongs[i++].textContent = w.status_text;
      if (w.lieferzeit) strongs[i].textContent = w.lieferzeit;
      pill.hidden = false;
      document.dispatchEvent(new CustomEvent('aero:werkstatt', { detail: w }));
    });
  }

  /* ─── Druckbühne im Hero: Modell entsteht Schicht für Schicht ─── */
  var buehne = $('#druckbuehne');
  if (buehne) {
    var objekt = $('.druck-objekt', buehne), duese = $('.druck-duese', buehne), zaehler = $('[data-schicht]', buehne);
    var schichten = parseInt(buehne.dataset.schichten, 10) || 240, laeuft = false;
    function setze(anteil) { // anteil 0..1 gedruckt
      var gestuft = Math.floor(anteil * schichten) / schichten;
      objekt.style.setProperty('--rest', ((1 - gestuft) * 100).toFixed(2) + '%');
      duese.style.setProperty('--rest-zahl', (1 - gestuft).toFixed(4));
      if (zaehler) zaehler.textContent = Math.round(gestuft * schichten);
    }
    function drucken() {
      if (laeuft) return;
      laeuft = true;
      buehne.classList.remove('fertig');
      if (reduziert) { setze(1); buehne.classList.add('fertig'); laeuft = false; return; }
      buehne.classList.add('druckt');
      var start = performance.now(), dauer = 3400;
      (function schritt(t) {
        var p = Math.min((t - start) / dauer, 1);
        setze(p);
        duese.style.setProperty('--x', (50 + Math.sin(t / 70) * 40).toFixed(1) + '%');
        if (p < 1) return requestAnimationFrame(schritt);
        buehne.classList.remove('druckt'); buehne.classList.add('fertig'); laeuft = false;
      })(start);
    }
    setze(0);
    var bio = new IntersectionObserver(function (e) { if (e[0].isIntersecting) { drucken(); bio.disconnect(); } }, { threshold: .35 });
    bio.observe(buehne);
    buehne.addEventListener('click', drucken);
    buehne.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drucken(); } });
  }
})();
