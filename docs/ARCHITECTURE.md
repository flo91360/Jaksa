# Architecture de Rob1Coach

## Vue d'ensemble

```
Navigateur (téléphone / ordinateur)
  └─ Application React (PWA, fichiers statiques hébergés sur Cloudflare)
       └─ supabase-js ──HTTPS──► Supabase (région UE)
                                   ├─ Auth : comptes, mots de passe, sessions
                                   ├─ API REST (PostgREST) générée depuis la base
                                   └─ PostgreSQL : tables + règles RLS
```

Il n'y a pas de serveur applicatif à maintenir. Toute la sécurité est dans la base :
chaque requête est faite au nom de l'utilisateur connecté, et les règles RLS
(*row level security*) décident ligne par ligne de ce qu'il peut lire ou modifier.

## Arborescence

| Dossier | Contenu |
|---|---|
| `src/domain/` | Logique métier pure et testée : zones FC, allures, conversion des formulaires |
| `src/api/` | Accès aux données (hooks React Query autour de supabase-js) |
| `src/auth/` | Session, garde des routes par rôle |
| `src/components/` | Composants d'interface (formulaires, éditeur de zones…) |
| `src/pages/` | Écrans : `coach/`, `athlete/`, connexion, invitation, compte |
| `src/lib/` | Client Supabase, types de la base, messages d'erreur, formats |
| `supabase/migrations/` | Schéma de la base, versionné (un fichier par évolution) |
| `tests/db/` | Tests des règles de sécurité sur un vrai PostgreSQL (PGlite) |
| `docs/` | Plan, architecture, mise en ligne |

## Modèle de données (0.1.0)

| Table / vue | Rôle |
|---|---|
| `profiles` | Un profil par compte : nom, e-mail, rôle (`coach` ou `athlete`) |
| `coach_athletes` | Lien coach ↔ athlète, statut `active` / `archived` |
| `invitations` | Liens d'invitation : jeton aléatoire de 244 bits, usage unique, valable 14 jours |
| `athlete_profiles` | Fiche athlète : objectifs, blessures, disponibilités, physiologie, zones (JSON) |
| `athlete_metrics_history` | Historique de la physiologie et des zones (à chaque modification) |
| `coach_private_notes` | Notes du coach sur un athlète |
| `coach_links` (vue) | Liens avec les noms des deux parties, filtrés par la RLS |

Zones (`athlete_profiles.zones`) : tableau de 7 zones au plus, chacune de la forme
`{ zone, name, hr_min, hr_max, pace_slow, pace_fast }`. FC en bpm, allures en
**secondes par km** (`pace_fast` est la plus rapide, donc la plus petite valeur).
La base vérifie ce format (`zones_are_valid`), l'application aussi (`validateZones`).

## Qui voit quoi

| Donnée | Coach | Athlète | Visiteur |
|---|---|---|---|
| Son propre profil | lit, modifie son nom | lit, modifie son nom | — |
| Profils de ses athlètes / de son coach | lit | lit (son coach seulement) | — |
| Autres athlètes du même coach | — | **jamais** | — |
| Fiche athlète : infos | lit, modifie | lit, modifie | — |
| Fiche athlète : physiologie et zones | lit, modifie | lit seulement | — |
| Notes privées | lit, modifie | **jamais** | — |
| Invitations | crée, lit, annule les siennes | — | aperçu par jeton |
| Rôle (`coach` / `athlete`) | ne peut pas le changer | ne peut pas le changer | — |

Ces règles sont vérifiées automatiquement par `tests/db/socle.test.ts`.

## Invitation d'un athlète

1. Le coach crée une invitation, la base génère le jeton, puis il envoie le lien `/invitation/<jeton>`.
2. L'athlète ouvre le lien. La page affiche le nom du coach grâce à `get_invitation`, accessible sans compte.
3. Il crée son compte. Le jeton part dans les métadonnées de l'inscription, et le déclencheur `handle_new_user` le rattache aussitôt au coach, même si l'e-mail reste à confirmer.
4. S'il a déjà un compte, il se connecte et `accept_invitation` fait le rattachement.

## Conventions

- Interface, commentaires et messages de commit en français.
- Base de données : une migration par évolution, jamais de modification d'une migration fusionnée. Chaque nouvelle table a :
  - la RLS activée ;
  - des droits `GRANT` limités au strict nécessaire ;
  - des tests dans `tests/db/`.
- `src/lib/database.types.ts` est écrit à la main sur le modèle de `supabase gen types`. Il faut le mettre à jour avec chaque migration.
- Les tests de base utilisent PGlite, un PostgreSQL complet qui tourne dans Node, ainsi qu'une cale (`tests/db/supabase-shim.sql`) qui reproduit les rôles, le schéma `auth` et les droits par défaut de Supabase.
