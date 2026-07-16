// Test — liste des produits Hiboutik, affiche le JSON brut, n'écrit rien.
const ACCOUNT = process.env.HIBOUTIK_ACCOUNT;
const LOGIN = process.env.HIBOUTIK_LOGIN;
const API_KEY = process.env.HIBOUTIK_API_KEY;

async function fetchProducts(page = 1) {
  const url = `https://${ACCOUNT}.hiboutik.com/api/products/?p=${page}`;
  const auth = Buffer.from(`${LOGIN}:${API_KEY}`).toString('base64');
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }
  });
  console.log(`--- Statut HTTP: ${res.status} (page ${page}) ---`);
  console.log('Headers link:', res.headers.get('link'));
  console.log('Headers content-range:', res.headers.get('content-range'));
  const text = await res.text();
  console.log(text);
}

(async () => {
  await fetchProducts(1);
})();
