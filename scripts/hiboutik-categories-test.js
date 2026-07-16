// Test — liste des catégories Hiboutik, affiche le JSON brut, n'écrit rien.
const ACCOUNT = process.env.HIBOUTIK_ACCOUNT;
const LOGIN = process.env.HIBOUTIK_LOGIN;
const API_KEY = process.env.HIBOUTIK_API_KEY;

async function fetchCategories() {
  const url = `https://${ACCOUNT}.hiboutik.com/api/categories/`;
  const auth = Buffer.from(`${LOGIN}:${API_KEY}`).toString('base64');
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }
  });
  console.log(`--- Statut HTTP: ${res.status} ---`);
  console.log(await res.text());
}

fetchCategories();
