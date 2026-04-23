const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase }         = require('firebase-admin/database');
const { getMessaging }        = require('firebase-admin/messaging');

// ── Init Firebase Admin ───────────────────────────────────────────────────────
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({
  credential:  cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});
const db        = getDatabase();
const messaging = getMessaging();

// ── Default resolutions (stessa lista del client) ─────────────────────────────
const DEFAULT_RESOLUTIONS = [
  { id:'r01', emoji:'💕', text:'Scopare una volta a settimana',               frequency:'weekly',    target:1 },
  { id:'r02', emoji:'📵', text:'Giornata senza telefono quando siamo a casa', frequency:'monthly',   target:2 },
  { id:'r03', emoji:'🎲', text:'Provare qualcosa di nuovo insieme',           frequency:'bimonthly', target:1 },
  { id:'r04', emoji:'🌄', text:'Gita fuori porta insieme',                    frequency:'monthly',   target:1 },
  { id:'r05', emoji:'💬', text:'Parlarci di come stiamo e come sta andando',  frequency:'monthly',   target:1 },
  { id:'r06', emoji:'🍽️',  text:'Cena fuori in coppia',                       frequency:'monthly',   target:1 },
  { id:'r07', emoji:'🌙', text:'Dirci cosa ci è piaciuto e cosa no',          frequency:'daily',     target:1 },
  { id:'r08', emoji:'📺', text:'Una sera senza TV né telefono',               frequency:'weekly',    target:1 },
  { id:'r09', emoji:'🎬', text:'Andare al cinema',                            frequency:'quarterly', target:1 },
  { id:'r10', emoji:'💼', text:'Aggiornarci su lavoro in profondità',         frequency:'biweekly',  target:1 },
];

const DEFAULT_MINS = [1440, 180, 60];
const WINDOW_MS    = 35 * 60 * 1000; // ±35 minuti

// ── Period helpers ────────────────────────────────────────────────────────────
function monday(d) {
  const dt = new Date(d), day = dt.getDay();
  dt.setDate(dt.getDate() - (day === 0 ? 6 : day - 1));
  dt.setHours(0, 0, 0, 0); return dt;
}
const BW_REF = new Date('2026-01-05');

function getPeriodKey(freq, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if (freq === 'daily')     return `d-${y}-${m}-${d}`;
  if (freq === 'weekly')    { const mo = monday(now); return `w-${mo.getFullYear()}-${mo.getMonth()}-${mo.getDate()}`; }
  if (freq === 'biweekly')  return `bw-${Math.floor(Math.floor((now - BW_REF) / 604800000) / 2)}`;
  if (freq === 'monthly')   return `m-${y}-${m}`;
  if (freq === 'bimonthly') return `bm-${y}-${Math.floor(m / 2)}`;
  if (freq === 'quarterly') return `q-${y}-${Math.floor(m / 3)}`;
}

function getPeriodEnd(freq, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if (freq === 'daily')     { const e = new Date(y, m, d + 1); e.setHours(0, 0, 0, 0); return e; }
  if (freq === 'weekly')    return new Date(monday(now).getTime() + 7 * 86400000);
  if (freq === 'biweekly')  { const w = Math.floor((now - BW_REF) / 604800000); return new Date(BW_REF.getTime() + (Math.floor(w / 2) + 1) * 2 * 604800000); }
  if (freq === 'monthly')   return new Date(y, m + 1, 1);
  if (freq === 'bimonthly') return new Date(y, (Math.floor(m / 2) + 1) * 2, 1);
  if (freq === 'quarterly') return new Date(y, (Math.floor(m / 3) + 1) * 3, 1);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const now = new Date();
  console.log(`▶ Esecuzione: ${now.toISOString()}`);

  const [propSnap, customSnap, tokensSnap, prefsSnap, sentSnap] = await Promise.all([
    db.ref('propositi').get(),
    db.ref('custom_resolutions').get(),
    db.ref('fcm_tokens').get(),
    db.ref('notif_prefs').get(),
    db.ref('notif_sent').get(),
  ]);

  const propData   = propSnap.exists()   ? propSnap.val()                             : {};
  const customData = customSnap.exists() ? Object.values(customSnap.val())            : [];
  const tokensRaw  = tokensSnap.exists() ? Object.values(tokensSnap.val())            : [];
  const prefsData  = prefsSnap.exists()  ? prefsSnap.val()                            : {};
  const sentData   = sentSnap.exists()   ? sentSnap.val()                             : {};

  const tokens = tokensRaw.map(t => t.token).filter(Boolean);
  if (tokens.length === 0) { console.log('Nessun token FCM salvato.'); return; }
  console.log(`Token trovati: ${tokens.length}`);

  const allRes = [...DEFAULT_RESOLUTIONS, ...customData];
  let sent = 0;

  for (const res of allRes) {
    const periodKey = getPeriodKey(res.frequency, now);
    const periodEnd = getPeriodEnd(res.frequency, now);
    const count     = propData[res.id]?.[periodKey] || 0;
    if (count >= res.target) continue; // già completato

    const resPrefs = Array.isArray(prefsData[res.id]) ? prefsData[res.id] : DEFAULT_MINS;

    for (const mins of resPrefs) {
      const fireAt = periodEnd.getTime() - mins * 60000;
      if (Math.abs(Date.now() - fireAt) > WINDOW_MS) continue; // non è questa ora

      // Chiave univoca per evitare doppio invio
      const sentKey = `${res.id}_${mins}_${periodKey}`.replace(/[.#$[\]]/g, '_');
      if (sentData[sentKey]) { console.log(`  Già inviato: ${sentKey}`); continue; }

      // Costruisci testo notifica
      const h = Math.floor(mins / 60), m = mins % 60;
      let title, body;
      if (mins >= 2880)      { title = `${res.emoji} Mancano 2 giorni!`;                         body = `Ricordati: "${res.text}" — avete ancora tempo 💕`; }
      else if (mins >= 1440) { title = `${res.emoji} Domani scade!`;                              body = `"${res.text}" — avete ancora oggi per farlo 💕`; }
      else if (mins >= 60)   { title = `${res.emoji} Mancano ${h}h${m ? ` e ${m}m` : ''}!`;     body = `"${res.text}" — sbrigatevi, il tempo stringe ⏳`; }
      else                   { title = `${res.emoji} Ultimi ${mins} minuti!`;                     body = `"${res.text}" — adesso o mai più! 🚨`; }

      try {
        const response = await messaging.sendEachForMulticast({
          tokens,
          notification: { title, body },
          webpush: {
            notification: {
              icon:              'https://lucamaraschio.github.io/propositi-coppia/icon-192.png',
              badge:             'https://lucamaraschio.github.io/propositi-coppia/icon-192.png',
              vibrate:           [300, 150, 300],
              requireInteraction: true,
            },
            fcmOptions: {
              link: 'https://lucamaraschio.github.io/propositi-coppia/',
            },
          },
        });

        await db.ref(`notif_sent/${sentKey}`).set(Date.now());
        sent++;
        console.log(`  ✓ Inviata: ${title}`);

        // Rimuovi token non validi
        const invalidTokenKeys = [];
        response.responses.forEach((resp, i) => {
          if (!resp.success) {
            const code = resp.error?.code;
            if (code === 'messaging/registration-token-not-registered' ||
                code === 'messaging/invalid-registration-token') {
              invalidTokenKeys.push(tokensRaw[i]?.key);
            }
          }
        });
        for (const key of invalidTokenKeys.filter(Boolean)) {
          await db.ref(`fcm_tokens/${key}`).remove();
          console.log(`  ✗ Token rimosso (non valido)`);
        }
      } catch (e) {
        console.error(`  Errore FCM per ${res.id}:`, e.message);
      }
    }
  }

  // Pulizia notif_sent vecchie (> 30 giorni)
  const cutoff = Date.now() - 30 * 86400000;
  for (const [key, ts] of Object.entries(sentData)) {
    if (ts < cutoff) await db.ref(`notif_sent/${key}`).remove();
  }

  console.log(`✅ Fine. Notifiche inviate: ${sent}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
