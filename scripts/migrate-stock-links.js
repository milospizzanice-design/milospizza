// Migration : réaligne ingredient_stock_link et ingredient_composition depuis l'ancien catalogue (table 'produits')
// vers le catalogue maître (master_produits), par correspondance de nom. Ne touche jamais un lien sans correspondance trouvée.
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
async function sbPatch(table, matchQuery, body) {
  const res = await fetch(`${SURL}/rest/v1/${table}?${matchQuery}`, {
    method: 'PATCH',
    headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${table}: HTTP ${res.status} - ${await res.text()}`);
}

(async () => {
  const [oldProduits, masterProduits, links, compositions] = await Promise.all([
    sb('produits?select=code,nom,restaurant_id'),
    sb('master_produits?select=code,nom'),
    sb('ingredient_stock_link?select=id,restaurant_id,ingredient_code,stock_produit_code'),
    sb('ingredient_composition?select=restaurant_id,ingredient_code,stock_produit_code,quantite,unite')
  ]);

  const oldNameByKey = {};
  oldProduits.forEach(p => { oldNameByKey[p.restaurant_id + '|' + p.code] = p.nom; });

  const masterCodeByName = {};
  const ambiguous = new Set();
  masterProduits.forEach(p => {
    const key = normalize(p.nom);
    if (masterCodeByName[key] && masterCodeByName[key] !== p.code) ambiguous.add(key);
    masterCodeByName[key] = p.code;
  });

  let linksMigrated = 0, linksSkipped = [];
  for (const row of links) {
    const oldName = oldNameByKey[row.restaurant_id + '|' + row.stock_produit_code];
    if (!oldName) { linksSkipped.push(`lien ingrédient ${row.ingredient_code} (${row.restaurant_id}) — ancien produit stock introuvable`); continue; }
    const key = normalize(oldName);
    if (ambiguous.has(key) || !masterCodeByName[key]) { linksSkipped.push(`lien ingrédient ${row.ingredient_code} (${row.restaurant_id}) — "${oldName}" non trouvé/ambigu dans le catalogue maître`); continue; }
    const newCode = masterCodeByName[key];
    if (newCode !== row.stock_produit_code) {
      await sbPatch('ingredient_stock_link', `id=eq.${row.id}`, { stock_produit_code: newCode });
      linksMigrated++;
    }
  }

  let compoMigrated = 0, compoSkipped = [];
  for (const row of compositions) {
    const oldName = oldNameByKey[row.restaurant_id + '|' + row.stock_produit_code];
    if (!oldName) { compoSkipped.push(`composition ${row.ingredient_code} (${row.restaurant_id}) — ancien produit stock introuvable`); continue; }
    const key = normalize(oldName);
    if (ambiguous.has(key) || !masterCodeByName[key]) { compoSkipped.push(`composition ${row.ingredient_code} (${row.restaurant_id}) — "${oldName}" non trouvé/ambigu dans le catalogue maître`); continue; }
    const newCode = masterCodeByName[key];
    if (newCode !== row.stock_produit_code) {
      // Pas de colonne id : on identifie la ligne par sa clé composée (restaurant_id + ingredient_code + ancien stock_produit_code)
      const match = `restaurant_id=eq.${encodeURIComponent(row.restaurant_id)}&ingredient_code=eq.${encodeURIComponent(row.ingredient_code)}&stock_produit_code=eq.${encodeURIComponent(row.stock_produit_code)}`;
      await sbPatch('ingredient_composition', match, { stock_produit_code: newCode });
      compoMigrated++;
    }
  }

  console.log(`\n=== Résumé ===`);
  console.log(`Liens stock : ${linksMigrated} migrés, ${linksSkipped.length} à vérifier :`);
  linksSkipped.forEach(s => console.log(' - ' + s));
  console.log(`Compositions : ${compoMigrated} migrées, ${compoSkipped.length} à vérifier :`);
  compoSkipped.forEach(s => console.log(' - ' + s));
})().catch(e => { console.error(e); process.exit(1); });
