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

## Modèle de données

| Table / vue | Rôle |
|---|---|
| `profiles` | Un profil par compte : nom, e-mail, rôle (`coach` ou `athlete`) |
| `coach_athletes` | Lien coach ↔ athlète, statut `active` / `archived` |
| `invitations` | Liens d'invitation : jeton aléatoire de 244 bits, usage unique, valable 14 jours |
| `athlete_profiles` | Fiche athlète : objectifs, blessures, disponibilités, physiologie, zones (JSON) |
| `athlete_metrics_history` | Historique de la physiologie et des zones (à chaque modification) |
| `coach_private_notes` | Notes du coach sur un athlète |
| `coach_links` (vue) | Liens avec les noms des deux parties, filtrés par la RLS |
| `workouts` (0.2.0) | Séances planifiées : athlète, coach, date, ordre dans la journée, type, titre, consignes, étapes (JSON) |
| `workout_templates` (0.2.0) | Bibliothèque de séances types, propre à chaque coach |
| `races` (0.2.0) | Courses et objectifs de l'athlète : date, distance, D+, priorité A/B/C |
| `workout_feedback` (0.3.0) | Retour de séance (un par séance) : faite ou non, durée, distance, D+, RPE, douleurs (JSON), « vu par le coach » |
| `workout_comments` (0.3.0) | Commentaires d'une séance, lus ou non par l'autre partie |
| `messages` (0.3.0) | Messagerie coach ↔ athlète, lus ou non |
| `workout_activity` (vue, 0.3.0) | Par séance : retour, nombre de commentaires et de non-lus (calendrier, liste « À voir ») |
| `conversations` (vue, 0.3.0) | Par lien coach ↔ athlète : dernier message, nombre de non-lus |
| `email_outbox` (0.3.0) | File d'attente des e-mails, inaccessible depuis le site |
| `garmin_activities` (0.4.0) | Activités importées depuis Garmin : identifiant Garmin, séance rattachée, durée, distance, D+, FC moyenne et max |

Zones (`athlete_profiles.zones`) : tableau de 7 zones au plus, chacune de la forme
`{ zone, name, hr_min, hr_max, pace_slow, pace_fast }`. FC en bpm, allures en
**secondes par km** (`pace_fast` est la plus rapide, donc la plus petite valeur).
La base vérifie ce format (`zones_are_valid`), l'application aussi (`validateZones`).

Étapes d'une séance (`workouts.steps`, `workout_templates.steps`) : tableau de 40 éléments au plus, chacun
étant une étape ou un bloc répété (un seul niveau, comme sur une montre Garmin) :

```
étape : { type: 'step', kind, duration, target, note }
  kind     : warmup | active | recovery | rest | cooldown
  duration : { type: 'time', seconds } | { type: 'distance', meters } | { type: 'open' }
  target   : { type: 'none' } | { type: 'zone', zone } | { type: 'pace', fast, slow } | { type: 'hr', min, max }
bloc  : { type: 'repeat', count, steps: [étape, …] }
```

Une cible en **zone** n'enregistre que le numéro : la FC et l'allure sont lues dans les zones de l'athlète au
moment de l'affichage. Une même séance type donne donc les bonnes valeurs à chaque athlète, et suit ses zones
quand le coach les met à jour. La base vérifie ce format (`workout_steps_are_valid`), l'application aussi
(`validateWorkoutItems`). Durées, distances totales et export `.FIT` sont calculés dans `src/domain/`.

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
| Séances de ses athlètes / les siennes | lit, crée, modifie, supprime | lit seulement | — |
| Séances des autres athlètes | **jamais** | **jamais** | — |
| Séances types (bibliothèque) | les siennes : tout | **jamais** | — |
| Courses et objectifs | lit, crée, modifie, supprime | lit, crée, modifie, supprime | — |
| Retour de séance | lit, marque « vu » | lit, crée, modifie, supprime le sien | — |
| Commentaires d'une séance | lit, écrit, supprime les siens | lit, écrit, supprime les siens | — |
| Messages | sa conversation avec chaque athlète | sa conversation avec son coach | — |
| File d'attente des e-mails | **jamais** | **jamais** | — |
| Activités Garmin | lit | importe, lit, supprime les siennes | — |

Ces règles sont vérifiées automatiquement par `tests/db/socle.test.ts`, `tests/db/planification.test.ts` et
`tests/db/echanges.test.ts` et `tests/db/garmin.test.ts`. Un message ou un commentaire ne se modifie pas ; « lu » et « vu par le coach » ne
s'écrivent qu'au travers de `mark_conversation_read` et `mark_workout_seen`.

Une séance ne change jamais d'athlète : la copier vers un autre athlète crée une nouvelle séance.

## Export `.FIT`

En attendant l'accès aux API Garmin (0.4.0), chaque séance de course peut être téléchargée au format FIT
(`src/domain/fit.ts`), puis copiée par câble USB dans le dossier `GARMIN/NewFiles` de la montre.

- L'encodeur est écrit à la main d'après la description publique du protocole : aucune bibliothèque Garmin n'est livrée dans le site.
- Les tests relisent chaque fichier produit avec le SDK officiel de Garmin (`@garmin/fitsdk`, en dépendance de développement seulement).
- Une cible en zone devient, au choix, une plage d'**allure** (par défaut) ou une plage de **FC** en bpm, tirées des zones de l'athlète.

## Échanges et temps réel (0.3.0)

- Douleurs (`workout_feedback.pain`) : tableau de 6 éléments au plus, `{ location, side, intensity }`, intensité de 1
  à 10. La base vérifie ce format (`pain_is_valid`), l'application aussi (`src/domain/feedback.ts`).
- Quand l'athlète modifie son retour, la mention « vu par le coach » s'efface.
- Les tables `messages`, `workout_comments` et `workout_feedback` sont publiées dans Supabase Realtime : le site
  reçoit les nouveautés aussitôt (`useRealtimeExchanges`), chacun ne recevant que ce que la RLS l'autorise à lire.
- Tant que la migration de la 0.3.0 n'est pas appliquée, le site masque ces nouveautés au lieu d'afficher une erreur.

## Import Garmin (0.4.0, compte de test)

Le niveau « Personal » de Garmin ne donne accès qu'aux données de la personne qui a créé la clé, en lecture seule.
Il ne sert donc qu'à un compte de test, en attendant le niveau Starter (voir `docs/PLAN.md`).

```
Site (athlète connecté) ──► fonction Supabase garmin-import ──► API personnelle Garmin
   │                         · vérifie que le compte est celui de GARMIN_ATHLETE_EMAIL
   │                         · échange la clé contre un jeton de 24 h, lit les activités
   │                         · ne renvoie que les champs utiles (supabase/functions/garmin-import/garmin.ts)
   └─► rattache chaque activité à la séance du même jour (src/domain/garmin.ts),
       puis l'enregistre dans garmin_activities en son nom (RLS)
```

- La clé Garmin n'est connue que de la fonction (secret Supabase) ; le jeton d'accès n'est jamais stocké.
- Rattachement : même jour (heure locale de la montre), sport compatible (une sortie course ou trail va sur une séance
  de course ou de trail, le vélo sur « autre sport »), une activité par séance, dans l'ordre de la journée. Un
  rattachement déjà enregistré n'est pas changé par un nouvel import.
- Le retour de séance est pré-rempli avec la durée, la distance et le D+ mesurés par la montre.
- Avec le niveau Starter, Garmin enverra lui-même les activités au site : la lecture chez Garmin sera à refaire, mais
  pas la table, le rattachement ni l'affichage.

## E-mails

Il n'y a toujours pas de serveur : tout se passe dans Supabase.

1. Des déclencheurs ajoutent une ligne dans `email_outbox` à chaque retour, commentaire ou message (pour le
   destinataire, s'il n'a pas désactivé les e-mails). Chaque soir, `enqueue_tomorrow_workouts()` y ajoute la séance
   du lendemain de chaque athlète actif.
2. Toutes les 10 minutes, `send_email_outbox()` (tâche `pg_cron`) regroupe les lignes en attente par destinataire
   (`prepare_email_digests`), écarte ce qui a déjà été lu sur le site, et envoie un seul e-mail par personne par
   l'API de Brevo (extension `pg_net`). La clé de Brevo est chiffrée dans Supabase Vault.
3. Les e-mails ne contiennent que des liens (`/seance/<id>`, `/messages`), jamais de données de santé ni le texte
   des messages.

L'activation (extensions, secrets, tâches planifiées) est dans `supabase/emails.sql`, à exécuter une fois.

## Sauvegardes

Une tâche GitHub Actions (`.github/workflows/sauvegarde.yml`) exporte chaque nuit les données (`pg_dump`, données
seulement), les chiffre en AES-256 avec une phrase secrète et les garde 30 jours. Restauration : voir
`docs/DEPLOIEMENT.md`.

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
