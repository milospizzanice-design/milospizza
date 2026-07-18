// Migration : copie les prix de revient (produits.prix_unitaire/prix_kilo/prix_litre/poids_net_g)
// vers master_produits_couts, en les rattachant aux codes du catalogue maître par correspondance de nom.
const SURL = 'https://kkfccfipmxnsiohjxfdy.supabase.co';
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrZmNjZmlwbXhuc2lvaGp4ZmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNjgwNjcsImV4cCI6MjA5Njg0NDA2N30.cMp5VhkkzSN6i04fJD1B6zVuDfMOHo8GfD91_Q6Rk-U';

function normalize(s) {
  return (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function sb(path) {
  const res = await fetch(`${SURL}/rest/v1/${path}`, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } });
  if (!res.ok) throw new Error(`Supabase ${path}: HTTP ${res.status} - ${await res.text()}`);
  return res.json();
}
async function sbUpsert(table, rows, onConflict) {
  if (!rows.length) return;
  const res = await fetch(`${SURL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(rows)
  });
  if (!res.ok) throw new Error(`Supabase upsert ${table}: HTTP ${res.status} - ${await res.text()}`);
}

(async () => {
  const [oldProduits, masterProduits] = await Promise.all([
    sb('produits?select=code,nom,restaurant_id,mode_prix,prix_unitaire,prix_kilo,prix_litre,poids_net_g'),
    sb('master_produits?select=code,nom')
  ]);

  const masterCodeByName = {};
  const ambiguous = new Set();
  masterProduits.forEach(p => {
    const key = normalize(p.nom);
    if (masterCodeByName[key] && masterCodeByName[key] !== p.code) ambiguous.add(key);
    masterCodeByName[key] = p.code;
  });

  const rows = [];
  const skipped = [];
  for (const p of oldProduits) {
    const hasPrice = p.prix_unitaire != null || p.prix_kilo != null || p.prix_litre != null || p.poids_net_g != null;
    if (!hasPrice) continue; // rien à migrer pour cette ligne
    const key = normalize(p.nom);
    if (ambiguous.has(key) || !masterCodeByName[key]) { skipped.push(`${p.nom} (${p.restaurant_id}) — non trouvé/ambigu dans le catalogue maître`); continue; }
    rows.push({
      restaurant_id: p.restaurant_id, produit_code: masterCodeByName[key],
      mode_prix: p.mode_prix, prix_unitaire: p.prix_unitaire, prix_kilo: p.prix_kilo,
      prix_litre: p.prix_litre, poids_net_g: p.poids_net_g
    });
  }

  await sbUpsert('master_produits_couts', rows, 'restaurant_id,produit_code');

  console.log(`\n=== Résumé ===`);
  console.log(`${rows.length} lignes de prix migrées.`);
  console.log(`${skipped.length} à vérifier manuellement :`);
  skipped.forEach(s => console.log(' - ' + s));
})().catch(e => { console.error(e); process.exit(1); });
