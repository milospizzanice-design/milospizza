-- ═══════════════════════════════════════════════════════════════
-- Migration Stocks × Pointage — Milo's Pizza / RestoGlobal
-- À exécuter une seule fois dans le SQL Editor du projet Supabase
-- (même projet que pointage.html / pointage-admin.html)
-- ═══════════════════════════════════════════════════════════════

-- 1) État courant des comptages, partagé entre tous les salariés
--    Une seule ligne par produit et par restaurant : le dernier
--    comptage fait foi, quel que soit qui l'a fait.
create table if not exists stock_etat (
  restaurant_id text not null,
  produit_id text not null,
  fournisseur_id text,
  valeur text not null,
  maj_par_nom text,
  maj_at timestamptz not null default now(),
  primary key (restaurant_id, produit_id)
);

-- 2) Suivi des envois de commande, par fournisseur et par jour.
--    'brouillon' = pas encore envoyée, 'envoyee' = déjà partie sur WhatsApp.
create table if not exists stock_envois (
  restaurant_id text not null,
  fournisseur_id text not null,
  date date not null,
  statut text not null default 'brouillon' check (statut in ('brouillon','envoyee')),
  envoyee_par_nom text,
  envoyee_at timestamptz,
  primary key (restaurant_id, fournisseur_id, date)
);

-- 3) Audit complet, append-only : qui a compté quoi, à quelle heure.
--    Jamais modifié ni supprimé, sert uniquement de journal.
create table if not exists stock_audit (
  id bigint generated always as identity primary key,
  restaurant_id text not null,
  produit_id text,
  fournisseur_id text,
  valeur text,
  employee_nom text,
  created_at timestamptz not null default now()
);
create index if not exists idx_stock_audit_lookup on stock_audit (restaurant_id, produit_id, created_at desc);
create index if not exists idx_stock_envois_lookup on stock_envois (restaurant_id, fournisseur_id, statut);

-- 4) Row Level Security : mêmes clés anon que pointage.html, donc mêmes
--    règles permissives que le reste du projet. Si vos autres tables
--    (employees, time_entries...) ont des policies différentes, adaptez
--    ces 3 lignes en conséquence AVANT de considérer ceci comme terminé.
alter table stock_etat enable row level security;
alter table stock_envois enable row level security;
alter table stock_audit enable row level security;

drop policy if exists "anon all stock_etat" on stock_etat;
create policy "anon all stock_etat" on stock_etat for all using (true) with check (true);

drop policy if exists "anon all stock_envois" on stock_envois;
create policy "anon all stock_envois" on stock_envois for all using (true) with check (true);

drop policy if exists "anon all stock_audit" on stock_audit;
create policy "anon all stock_audit" on stock_audit for all using (true) with check (true);

-- ═══════════════════════════════════════════════════════════════
-- Vérification rapide après exécution (à lancer manuellement) :
-- select * from stock_etat limit 5;
-- select * from stock_envois order by date desc limit 5;
-- select * from stock_audit order by created_at desc limit 5;
-- ═══════════════════════════════════════════════════════════════
