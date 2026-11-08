# Rob1Coach — consignes pour Claude

Application web de suivi de coureurs par leur coach. Voir README.md,
docs/PLAN.md (feuille de route) et docs/ARCHITECTURE.md. Textes de
l'interface, commentaires et messages de commit en français.

## Avant de pousser

- `npm run check` : lint, types, tests unitaires et tests de sécurité de la base, build.

## Règles

- Base de données :
  - toute évolution passe par un **nouveau** fichier `supabase/migrations/AAAAMMJJHHMMSS_nom.sql` ; ne jamais modifier une migration déjà fusionnée ;
  - migrations et fonctions (`supabase/functions/`) sont appliquées automatiquement à la fusion dans `main` (`.github/workflows/deploiement-supabase.yml`) : ne rien demander de coller dans le SQL Editor. Un réglage qui ne peut pas être automatisé (secret, tâche planifiée) est signalé dans la pull request et dans `docs/DEPLOIEMENT.md` ;
  - chaque nouvelle table a la RLS activée, des droits `GRANT` limités, et des tests dans `tests/db/` (qui lit, qui écrit, qui est refusé) ;
  - mettre à jour `src/lib/database.types.ts` dans le même changement.
- Les calculs (zones, allures, charge…) vont dans `src/domain/`, sans dépendance à React ni à Supabase, avec des tests.
- Chaque changement passe par une pull request vers `main`.
- Une fonctionnalité visible pour le coach ou l'athlète augmente `version` dans `package.json` (0.x.0 ; 0.x.y pour une correction) et ajoute la section `## [0.x.y] - AAAA-MM-JJ` en tête de `CHANGELOG.md`, en français.
