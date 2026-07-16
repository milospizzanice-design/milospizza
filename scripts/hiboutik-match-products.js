// Rapproche les produits Hiboutik du catalogue produits_vendus par nom. N'écrase jamais un mapping confirmed=true existant.
const ACCOUNT = process.env.HIBOUTIK_ACCOUNT;
const LOGIN = process.env.HIBOUTIK_LOGIN;
const API_KEY = process.env.HIBOUTIK_API_KEY;
const SURL = 'https://kkfccfipmxnsiohjxfdy.supabase.co';
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrZmNjZmlwbXhuc2lvaGp4ZmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNjgwNjcsImV4cCI6MjA5Njg0NDA2N30.cMp5VhkkzSN6i04fJD1B6zVuDfMOHo8GfD91_Q6Rk-U';

function normalize(s) {
  return (s || '')
    .toString()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasNextPage(linkHeader, currentPage) {
  if (!linkHeader) return false;
  const nextMatch = linkHeader.split(',').find(part => part.includes('rel="next"'));
  if (!nextMatch) return false;
  const pMatch = nextMatch.match(/[?&]p=(\d+)/);
  return pMatch && parseInt(pMatch[1], 10) !== currentPage;
}

async function fetchAllPages(pathBuilder) {
  const auth = Buffer.from(`${LOGIN}:${API_KEY}`).toString('base64');
  let page = 1, all = [];
  while (true) {
    const url = pathBuilder(page);
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Hiboutik ${url}: HTTP ${res.status}`);
    const items = await res.json();
    all = all.concat(items);
    if (hasNextPage(res.headers.get('link'), page)) page++; else break;
  }
  return all;
}

const fetchAllHiboutikProducts = () =>
  fetchAllPages(page => `https://${ACCOUNT}.hiboutik.com/api/products/?p=${page}`);

const fetchAllHiboutikCategories = () =>
  fetchAllPages(page => `https://${ACCOUNT}.hiboutik.com/api/categories/?p=${page}`);

async function fetchProduitsVendus() {
  const url = `${SURL}/rest/v1/produits_vendus?select=code,nom&restaurant_id=eq.global&actif=eq.true`;
  const res = await fetch(url, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } });
  if (!res.ok) throw new Error(`Supabase produits_vendus: HTTP ${res.status}`);
  return res.json();
}

async function fetchExistingMapping() {
  const url = `${SURL}/rest/v1/hiboutik_mapping?select=hiboutik_product_id,confirmed`;
  const res = await fetch(url, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } });
  if (!res.ok) throw new Error(`Supabase hiboutik_mapping: HTTP ${res.status}`);
  return res.json();
}

async function upsertMapping(rows) {
  if (!rows.length) return;
  const url = `${SURL}/rest/v1/hiboutik_mapping?on_conflict=hiboutik_product_id`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SKEY, Authorization: `Bearer ${SKEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) throw new Error(`Supabase upsert: HTTP ${res.status} - ${await res.text()}`);
}

(async () => {
  const [hbProducts, hbCategories, pv, existing] = await Promise.all([
    fetchAllHiboutikProducts(), fetchAllHiboutikCategories(), fetchProduitsVendus(), fetchExistingMapping()
  ]);
  const alreadyConfirmed = new Set(existing.filter(e => e.confirmed).map(e => e.hiboutik_product_id));
  const categoryNameById = {};
  hbCategories.forEach(c => { categoryNameById[c.category_id] = c.category_name; });

  const byName = {};
  for (const p of pv) {
    const key = normalize(p.nom);
    if (!key) continue;
    (byName[key] = byName[key] || []).push(p.code);
  }

  const rows = [];
  const nonMatches = [];
  let matched = 0, skipped = 0;

  for (const hp of hbProducts) {
    if (hp.product_arch) continue;
    if (alreadyConfirmed.has(hp.product_id)) { skipped++; continue; }

    const categorieNom = categoryNameById[hp.product_category] || null;
    const key = normalize(hp.product_model);
    const candidates = byName[key] || [];
    if (candidates.length === 1) {
      rows.push({ hiboutik_product_id: hp.product_id, hiboutik_nom: hp.product_model, hiboutik_categorie_id: hp.product_category, hiboutik_categorie: categorieNom, produit_vendu_code: candidates[0], confirmed: true });
      matched++;
    } else {
      rows.push({ hiboutik_product_id: hp.product_id, hiboutik_nom: hp.product_model, hiboutik_categorie_id: hp.product_category, hiboutik_categorie: categorieNom, produit_vendu_code: null, confirmed: false });
      nonMatches.push(hp.product_model + (candidates.length > 1 ? '  (ambigu)' : '') + (categorieNom ? '  ['+categorieNom+']' : ''));
    }
  }

  await upsertMapping(rows);

  console.log(`\n=== Résumé ===`);
  console.log(`${matched} produits mappés automatiquement.`);
  console.log(`${skipped} déjà confirmés manuellement (non touchés).`);
  console.log(`${nonMatches.length} à vérifier manuellement :`);
  nonMatches.forEach(n => console.log(' - ' + n));
})().catch(e => { console.error(e); process.exit(1); });
