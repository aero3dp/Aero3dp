// Sticky Nav
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 30);
  }, { passive: true });

  // Magnetische Buttons
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.btn-red, .btn-ghost, .nav-links .cta-link').forEach(btn => {
      btn.addEventListener('mousemove', e => {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        btn.style.transform = `translate(${x * 0.25}px, ${y * 0.35}px)`;
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = 'translate(0,0)'; });
    });
  }

  // Zurück-nach-oben Button
  const backToTop = document.getElementById('backToTop');
  window.addEventListener('scroll', () => {
    backToTop.classList.toggle('visible', window.scrollY > 600);
  }, { passive: true });
  backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  // Höhenmesser Scroll-Leiste
  const altiFill = document.getElementById('altimeterFill');
  function updateAltimeter() {
    const h = document.documentElement;
    const scrolled = h.scrollTop;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? (scrolled / max) * 100 : 0;
    altiFill.style.width = pct + '%';
  }
  window.addEventListener('scroll', updateAltimeter, { passive: true });
  updateAltimeter();

  // Parallax-Scrolling-Effekte
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const parallaxEls = document.querySelectorAll('[data-parallax]');
    let parallaxTicking = false;
    function updateParallax() {
      const vh = window.innerHeight;
      parallaxEls.forEach(el => {
        const factor = parseFloat(el.dataset.parallax);
        const rect = el.getBoundingClientRect();
        const centerOffset = (rect.top + rect.height / 2) - vh / 2;
        const py = centerOffset * factor * -1;
        el.style.setProperty('--py', py.toFixed(1) + 'px');
      });
      parallaxTicking = false;
    }
    window.addEventListener('scroll', () => {
      if (!parallaxTicking) {
        requestAnimationFrame(updateParallax);
        parallaxTicking = true;
      }
    }, { passive: true });
    updateParallax();
  }

  // Tab-Titel-Wechsel beim Wegklicken
  const originalTitle = document.title;
  document.addEventListener('visibilitychange', () => {
    document.title = document.hidden ? 'Komm zurück! ✈️' : originalTitle;
  });

  // Konsolen-Ostereier für Entwickler
  console.log(
    '%c✈ AERO3DP %c– gebaut von Schülern, gedruckt auf Bambu Lab.',
    'color:#b30b0b;font-size:20px;font-weight:900;font-family:sans-serif;',
    'color:#888;font-size:12px;font-family:sans-serif;'
  );
  console.log(
    '%cSuchst du nach Bugs oder nach einem Job? Schreib uns: info@aero3dp.de 😉',
    'color:#f0f0f0;font-size:12px;font-family:sans-serif;'
  );

  // Mobile Menu
  function toggleNav() {
    document.getElementById('navLinks').classList.toggle('open');
  }
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.addEventListener('click', () => document.getElementById('navLinks').classList.remove('open'));
  });

  // Category Tabs
  function switchCat(id, btn) {
    document.querySelectorAll('.cat-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('cat-' + id).classList.add('active');
    btn.classList.add('active');
  }

  // Scroll immer nach oben beim Laden
  if (history.scrollRestoration) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  // Count-Up Animation für Stats
  const countEls = document.querySelectorAll('.count-up');
  const countObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseInt(el.dataset.target, 10);
      const duration = 1200;
      const start = performance.now();
      function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(eased * target);
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
      countObs.unobserve(el);
    });
  }, { threshold: 0.4 });
  countEls.forEach(el => countObs.observe(el));

  // Schwierigkeitsgrad- & Geschwindigkeits-Balken (füllen sich beim Reinscrollen)
  const meterEls = document.querySelectorAll('.pmeter-fill');
  const meterObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseInt(el.dataset.target, 10);
      el.style.width = target + '%';
      if (el.classList.contains('diff-fill')) {
        // Grün (leicht) bis Rot (schwierig), über Gelb/Orange in der Mitte
        const hue = 120 - (target / 100) * 120;
        el.style.background = `hsl(${hue}, 70%, 45%)`;
        el.style.boxShadow = `0 0 6px hsla(${hue}, 70%, 45%, .55)`;
      }
      meterObs.unobserve(el);
    });
  }, { threshold: 0.3 });
  meterEls.forEach(el => meterObs.observe(el));

  // 3D Tilt-Effekt auf Produktkarten (nur Desktop / Maus-Geräte)
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.pcard').forEach(card => {
      card.addEventListener('mousemove', e => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(900px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg) translateZ(0)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(900px) rotateY(0) rotateX(0)';
      });
    });
  }

  // Konfetti-Papierflieger
  function launchPaperPlanes() {
    const planeSVG = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M2 12 L22 3 L14 12 L22 21 Z" fill="#b30b0b"/></svg>';
    const count = 18;
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.innerHTML = planeSVG;
      el.style.position = 'fixed';
      el.style.left = (45 + Math.random() * 10) + 'vw';
      el.style.top = '55vh';
      el.style.zIndex = '9999';
      el.style.pointerEvents = 'none';
      el.style.opacity = '1';
      const angle = (Math.random() - 0.5) * 140;
      const dist = 250 + Math.random() * 300;
      const dx = Math.sin(angle * Math.PI / 180) * dist;
      const dy = -Math.abs(Math.cos(angle * Math.PI / 180) * dist) - 100;
      const rot = (Math.random() - 0.5) * 360;
      const dur = 900 + Math.random() * 700;
      el.style.transition = `transform ${dur}ms cubic-bezier(.15,.6,.4,1), opacity ${dur}ms ease-in`;
      document.body.appendChild(el);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
          el.style.opacity = '0';
        });
      });
      setTimeout(() => el.remove(), dur + 100);
    }
  }

  // Kontaktformular per AJAX (Formspree) mit Erfolgs-Animation
  const contactForm = document.getElementById('contactForm');
  const formStatus = document.getElementById('formStatus');
  const formBtn = document.getElementById('formSubmitBtn');

  // Konfigurator-Auswahl aus der URL übernehmen (kommt von den Produktseiten)
  if (contactForm) {
    const params = new URLSearchParams(window.location.search);
    const produkt = params.get('produkt');
    if (produkt) {
      const betreffSelect = document.getElementById('betreff');
      const nachrichtField = document.getElementById('nachricht');
      const produktToOption = {
        'FJ-4 Fury': 'fj4-fury',
        'Aero-33X': 'aero-33x',
        'FPV Flitzer': 'fpv-flitzer'
      };
      if (betreffSelect && produktToOption[produkt]) {
        betreffSelect.value = produktToOption[produkt];
      }
      if (nachrichtField) {
        const farbe = params.get('farbe');
        const material = params.get('material');
        const antrieb = params.get('antrieb') === 'ja';
        let lines = [`Ich interessiere mich für: ${produkt}`];
        if (farbe) lines.push(`Farbe: ${farbe}`);
        if (material) lines.push(`Material: ${material}`);
        lines.push(`Mit Antriebsset: ${antrieb ? 'Ja' : 'Nein'}`);
        nachrichtField.value = lines.join('\n') + '\n\n';
      }
    }
  }

  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      formBtn.disabled = true;
      formBtn.textContent = 'Wird gesendet…';
      formStatus.style.display = 'none';
      try {
        const res = await fetch(contactForm.action, {
          method: 'POST',
          body: new FormData(contactForm),
          headers: { 'Accept': 'application/json' }
        });
        let data = null;
        try { data = await res.json(); } catch (parseErr) { /* keine JSON-Antwort */ }

        if (res.ok) {
          launchPaperPlanes();
          formStatus.style.display = 'block';
          formStatus.style.color = '#8fce8f';
          formStatus.textContent = 'Danke! Deine Nachricht ist abgeflogen — wir melden uns bald. ✈️';
          contactForm.reset();
        } else {
          const detail = data && data.errors
            ? data.errors.map(x => x.message).join(', ')
            : (data && data.error) || `Status ${res.status}`;
          console.error('Formspree-Fehler:', detail, data);
          formStatus.style.display = 'block';
          formStatus.style.color = '#e08a8a';
          formStatus.textContent = 'Ups, das hat nicht geklappt (' + detail + '). Schreib uns direkt an info@aero3dp.de';
        }
      } catch (err) {
        console.error('Netzwerkfehler beim Formular-Versand:', err);
        formStatus.style.display = 'block';
        formStatus.style.color = '#e08a8a';
        formStatus.textContent = 'Ups, das hat nicht geklappt (Netzwerkfehler). Schreib uns direkt an info@aero3dp.de';
      }
      formBtn.disabled = false;
      formBtn.textContent = 'Nachricht senden →';
    });
  }

  // Scroll Reveal
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('on'); obs.unobserve(e.target); } });
  }, { threshold: 0.08 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
