// Test de connexion à l'API Hiboutik — affiche le JSON brut, n'écrit rien nulle part.
const ACCOUNT = process.env.HIBOUTIK_ACCOUNT;
const LOGIN = process.env.HIBOUTIK_LOGIN;
const API_KEY = process.env.HIBOUTIK_API_KEY;

const STORES = { port: 2, dabray: 1 };

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return { y: d.getFullYear(), m: d.getMonth() + 1, day: d.getDate() };
}

async function fetchDay(storeId, y, m, day) {
  const url = `https://${ACCOUNT}.hiboutik.com/api/products_sold/${storeId}/${y}/${m}/${day}/`;
  const auth = Buffer.from(`${LOGIN}:${API_KEY}`).toString('base64');
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }
  });
  console.log(`--- Statut HTTP: ${res.status} pour store ${storeId} ---`);
  const text = await res.text();
  console.log(text);
  return res;
}

(async () => {
  const { y, m, day } = yesterday();
  console.log(`Test pour le ${day}/${m}/${y}`);
  for (const [nom, storeId] of Object.entries(STORES)) {
    console.log(`\n=== ${nom.toUpperCase()} (store_id=${storeId}) ===`);
    await fetchDay(storeId, y, m, day);
  }
})();
