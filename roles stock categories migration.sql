-- ═══════════════════════════════════════════════════════════════
-- Migration Rôles -> Catégories stocks — Milo's Pizza / RestoGlobal
-- À exécuter une fois, après la migration précédente (stock_etat / stock_envois / stock_audit)
-- ═══════════════════════════════════════════════════════════════

alter table roles add column if not exists stock_categories jsonb not null default '[]'::jsonb;

-- Catégories disponibles (identiques Port & Dabray à ce jour) :
--   boissons-emporter, boissons-place, epicerie, fromages, charcuterie, glaces, hygiene
--
-- Exemple pour retrouver l'ancien découpage par PIN, à ajuster dans l'admin (onglet Rôles) :
--   update roles set stock_categories='["boissons-emporter","boissons-place","glaces"]'::jsonb where nom='Responsable Bar';
--   update roles set stock_categories='["epicerie","fromages","charcuterie"]'::jsonb where nom='Chef de Cuisine';
--   update roles set stock_categories='["charcuterie","fromages","epicerie","hygiene"]'::jsonb where nom='Équipe Cuisine';
--
-- ═══════════════════════════════════════════════════════════════
-- Vérification :
-- select id, nom, stock_categories from roles order by nom;
-- ═══════════════════════════════════════════════════════════════
