(function () {
  const cfg = window.PRODUCT;
  if (!cfg) return;

  const img = document.getElementById('configImg');
  const swatches = document.querySelectorAll('.color-swatch');
  const materialOptions = document.querySelectorAll('.material-option');
  const antriebToggle = document.getElementById('antriebToggle');
  const summaryEl = document.getElementById('configSummary');
  const priceEl = document.getElementById('configPrice');
  const ctaEl = document.getElementById('configCta');

  const state = {
    color: cfg.colors[0].name,
    colorHue: cfg.colors[0].hue || 0,
    colorGray: !!cfg.colors[0].gray,
    material: 'PLA',
    antrieb: false
  };

  function applyImageFilter() {
    if (!img) return;
    if (state.colorGray) {
      img.style.filter = 'grayscale(1) brightness(.92) contrast(1.05)';
    } else {
      img.style.filter = `hue-rotate(${state.colorHue}deg) saturate(1.05)`;
    }
  }

  function fmtPrice(n) {
    return n.toFixed(2).replace('.', ',') + ' €';
  }

  function updateSummary() {
    const parts = [`Farbe: <strong>${state.color}</strong>`];
    if (cfg.materialSelectable) parts.push(`Material: <strong>${state.material}</strong>`);
    parts.push(`Antriebsset: <strong>${state.antrieb ? 'Ja, bitte dazu' : 'Nein, nur der Bausatz'}</strong>`);
    if (summaryEl) summaryEl.innerHTML = parts.join('<br>');

    if (priceEl) {
      const lwSurcharge = (cfg.materialSelectable && state.material === 'LW-PLA') ? 10 : 0;
      const relevantPrice = state.antrieb ? cfg.bundlePrice : cfg.basePrice;
      const notes = [];
      notes.push(state.antrieb ? 'inkl. Antriebsset' : 'ohne Antrieb — Set optional dazu wählbar');
      if (lwSurcharge) notes.push(`inkl. LW-PLA-Aufpreis (+${lwSurcharge} €)`);

      if (typeof relevantPrice === 'number') {
        priceEl.innerHTML = fmtPrice(relevantPrice + lwSurcharge) + `<small>${notes.join(' · ')}</small>`;
      } else {
        priceEl.innerHTML = 'Auf Anfrage' + `<small>${notes.join(' · ')}</small>`;
      }
    }

    if (ctaEl) {
      const params = new URLSearchParams();
      params.set('produkt', cfg.productName);
      params.set('farbe', state.color);
      if (cfg.materialSelectable) params.set('material', state.material);
      params.set('antrieb', state.antrieb ? 'ja' : 'nein');
      ctaEl.href = 'index.html?' + params.toString() + '#kontakt';
    }
  }

  swatches.forEach((sw, i) => {
    sw.addEventListener('click', () => {
      swatches.forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      const c = cfg.colors[i];
      state.color = c.name;
      state.colorHue = c.hue || 0;
      state.colorGray = !!c.gray;
      applyImageFilter();
      updateSummary();
    });
  });

  materialOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      materialOptions.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      const input = opt.querySelector('input');
      if (input) { input.checked = true; state.material = input.value; }
      updateSummary();
    });
  });

  if (antriebToggle) {
    antriebToggle.addEventListener('change', () => {
      state.antrieb = antriebToggle.checked;
      updateSummary();
    });
  }

  applyImageFilter();
  updateSummary();
})();
