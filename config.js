/* ═══════════════════════════════════════════════════════════════
   Aero3dp – zentrale Einstellungen
   Hier änderst du Preise, Zugangsdaten und Druckparameter.
   ═══════════════════════════════════════════════════════════════ */
window.AERO_CONFIG = {

  /* Supabase (Statistik, Anfragen, STL-Upload).
     Beide Werte findest du in Supabase unter Project Settings → API.
     Leer lassen = die Seite läuft trotzdem, nur ohne Statistik und Datei-Upload.
     Der "anon public" Key darf öffentlich sein – geschützt wird über die Zugriffsregeln. */
  supabaseUrl: 'https://xsclvhtalrdjzcxtqqew.supabase.co',
  supabaseAnonKey: 'sb_publishable_fTLvj9MCrhUAzAaKXaMBIg_zFpSvVg9',

  /* Benachrichtigung per E-Mail bei jeder Anfrage */
  formspree: 'https://formspree.io/f/xzdnbeyn',
  email: 'info@aero3dp.de',

  /* 3D-Druckservice: alle Preise in Euro, brutto. Bitte an deine Kalkulation anpassen. */
  druck: {
    bauraum: [256, 256, 256],      // mm, größter Drucker (Bambu Lab)
    grundgebuehr: 4.00,            // pro Auftrag (Slicen, Vorbereitung, Verpackung)
    maschinenstunde: 2.00,         // pro Druckstunde (Strom, Verschleiß, Abschreibung)
    mindestpreis: 8.00,            // pro Auftrag
    maxDateiMB: 50,
    linienbreite: 0.42,            // mm
    materialien: {
      'PLA':    { dichte: 1.24, euroProKg: 25, aufschlag: 2.5, info: 'Der Allrounder: formstabil, fein, viele Farben.' },
      'PETG':   { dichte: 1.27, euroProKg: 28, aufschlag: 2.5, info: 'Zäher und wärmebeständiger, gut für Funktionsteile.' },
      'LW-PLA': { dichte: 0.60, euroProKg: 55, aufschlag: 2.5, info: 'Aufgeschäumt und sehr leicht – ideal für Flugzeugteile.' }
      // dichte von LW-PLA = gedruckte (aufgeschäumte) Dichte, je nach Temperatur 0,5–0,8
    },
    qualitaet: {
      'fein':     { label: 'Fein',     schicht: 0.12, volumenstrom: 6  },
      'standard': { label: 'Standard', schicht: 0.20, volumenstrom: 10 },
      'schnell':  { label: 'Schnell',  schicht: 0.28, volumenstrom: 15 }
      // volumenstrom = durchschnittlich mm³/s inkl. langsamer Außenwände
    },
    sekundenProSchicht: 4,         // Zuschlag pro Schicht (Wege, Schichtwechsel)
    vorbereitungMinuten: 6         // Aufheizen, Kalibrieren
  }
};
