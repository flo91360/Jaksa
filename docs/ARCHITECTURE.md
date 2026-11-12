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
| `profiles` | Un profil par compte : nom, e-mail, rôle (`coach` ou `athlete`), accord donné (`terms_version`, `terms_accepted_at`) |
| `coach_athletes` | Lien coach ↔ athlète, statut `active` / `archived` |
| `coach_subscriptions` (0.8.0) | Offre de chaque coach (`decouverte`, `solo`, `pro`, `club`, `fondateur`) : fixe le nombre d'athlètes actifs |
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
| `garmin_sync_runs` (0.4.1) | Journal de l'import automatique : heure, résultat, nombre d'activités (un mois) |
| `garmin_activity_details` (0.5.0) | Détail d'une activité, lu dans son fichier `.FIT` : séries de FC, vitesse, altitude, cadence, puissance et tracé GPS (1 800 points au plus), tours, chiffres de la montre |
| `client_errors` (0.7.0) | Journal des erreurs du site (message, page, version, navigateur), gardé 30 jours ; aucun droit depuis le site |
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
| Rôle (`coach` / `athlete`) | ne peut pas le changer | ne peut pas le changer | choisi à l'inscription |
| Son offre | lit, ne la change pas | — | — |
| Séances de ses athlètes / les siennes | lit, crée, modifie, supprime | lit seulement | — |
| Séances des autres athlètes | **jamais** | **jamais** | — |
| Séances types (bibliothèque) | les siennes : tout | **jamais** | — |
| Courses et objectifs | lit, crée, modifie, supprime | lit, crée, modifie, supprime | — |
| Retour de séance | lit, marque « vu » | lit, crée, modifie, supprime le sien | — |
| Commentaires d'une séance | lit, écrit, supprime les siens | lit, écrit, supprime les siens | — |
| Messages | sa conversation avec chaque athlète | sa conversation avec son coach | — |
| File d'attente des e-mails | **jamais** | **jamais** | — |
| Activités Garmin | lit | importe, lit, supprime les siennes | — |
| Détail des activités (.FIT) | lit | lit (seule la fonction `garmin-sync` écrit) | — |
| Lien coach ↔ athlète | archive, réactive | **quitte son coach** (`leave_coach`) | — |
| Son compte | exporte, supprime (`delete_my_account`) | exporte, supprime | — |
| Journal des erreurs du site | **jamais** | **jamais** | — |

Ces règles sont vérifiées automatiquement par `tests/db/socle.test.ts`, `tests/db/planification.test.ts`,
`tests/db/echanges.test.ts`, `tests/db/garmin.test.ts`, `tests/db/comptes.test.ts` et `tests/db/offres.test.ts`. Un message ou un commentaire ne se modifie pas ; « lu » et « vu par le coach » ne
s'écrivent qu'au travers de `mark_conversation_read` et `mark_workout_seen`.

Une séance ne change jamais d'athlète : la copier vers un autre athlète crée une nouvelle séance.

## Pages publiques, accord et données personnelles (0.7.0)

- `/` affiche la présentation du site à un visiteur et renvoie une personne connectée vers son espace
  (`HomeOrLanding`). `/confidentialite`, `/conditions` et `/mentions-legales` sont visibles sans compte
  (`src/pages/public/`). Les coordonnées de l'éditeur viennent de `src/lib/site.ts` (variables `VITE_PUBLISHER_*`).
- **Accord** : la case cochée à l'inscription part dans les métadonnées (`terms_version`) et le déclencheur
  `handle_new_user` la note sur le profil. Un compte sans accord pour la version en cours (`TERMS_VERSION`) voit
  `ConsentGate` à la place des pages, sauf « Compte » ; `accept_terms` enregistre l'accord. Changer `TERMS_VERSION`
  redemande l'accord à tout le monde.
- **Export** (`src/api/account.ts`) : le site lit, avec les droits de la personne, tout ce qui lui appartient et en
  fait un fichier JSON. Aucune fonction privilégiée : l'export ne peut rien contenir qu'elle ne voie déjà.
- **Quitter son coach** : `leave_coach` supprime le lien et les notes privées. Toutes les règles RLS passant par
  `coach_athletes`, le coach perd aussitôt tout accès ; l'athlète garde ses données.
- **Suppression du compte** : `delete_my_account` supprime la ligne de `auth.users`, et les clés étrangères
  `ON DELETE CASCADE` emportent le reste. Pour un coach, les séances qu'il a planifiées partent avec lui.

## Coachs et offres (0.8.0)

- **Inscription d'un coach** (`/inscription`) : le formulaire envoie `account_type = 'coach'` dans les métadonnées ;
  `handle_new_user` crée le profil avec le rôle coach et une ligne `coach_subscriptions` (offre `decouverte`). Un
  compte existant ne change jamais de rôle depuis le site.
- **Offres** : `src/domain/plans.ts` (noms, limites, prix affichés) et `plan_athlete_limit` dans la base disent la
  même chose, ce que vérifie `tests/db/offres.test.ts`.
- **Limite** : le déclencheur `coach_athletes_check_limit` refuse (erreur `RC007`) tout athlète qui deviendrait
  actif au-delà de la limite, que ce soit par une invitation ou par une réactivation. `get_invitation` renvoie
  `full` pour prévenir l'athlète avant l'inscription.
- L'offre ne s'écrit pas depuis le site : `set_coach_plan` (SQL Editor) aujourd'hui, le paiement en ligne demain.

## Sécurité du navigateur et suivi des erreurs (0.7.0)

- `public/_headers` (lu par Cloudflare) pose une politique `Content-Security-Policy` stricte : scripts du site
  seulement, connexions vers Supabase seulement, affichage dans une autre page interdit. Conséquence : pas de
  script écrit dans `index.html` (le thème est appliqué par `public/theme-init.js`), et tout nouveau service
  externe doit y être ajouté.
- `ErrorBoundary` remplace la page blanche par un écran d'erreur. Cette erreur, comme celles qui échappent à React,
  est envoyée à `report_client_error` (`src/lib/errorReporting.ts`) : 5 par visite, 20 par personne et par heure,
  seulement pour une personne connectée. La table `client_errors` se lit dans le tableau de bord Supabase.

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

- **Import automatique (0.4.1)** : toutes les 15 minutes, une tâche `pg_cron` appelle la fonction `garmin-sync`, qui
  fait le même travail sans session d'utilisateur (rôle service) et note chaque passage dans `garmin_sync_runs`. Elle
  est déployée sans vérification de jeton (`supabase/config.toml`) : elle ne renvoie que des compteurs, n'écrit que
  dans le compte de `GARMIN_ATHLETE_EMAIL` et n'interroge Garmin qu'une fois toutes les 5 minutes au plus. La tâche
  `pg_cron` est installée par le déploiement automatique, qui connaît l'adresse du projet.
- Le niveau « Personal » ne prévient pas quand une montre se synchronise : il faut aller chercher. Le niveau Starter
  enverra une notification à chaque activité, ce qui remplacera la tâche planifiée.
- La conversion et le rattachement (`supabase/functions/_shared/garmin-match.ts`) sont partagés par le site et la
  fonction, et testés dans `src/domain/garmin.test.ts`.
- La clé Garmin n'est connue que de la fonction (secret Supabase) ; le jeton d'accès n'est jamais stocké.
- Rattachement : même jour (heure locale de la montre), sinon séance de la veille encore libre (séance faite avec un
  jour de retard ; jamais celle du lendemain), sport compatible (une sortie course ou trail va sur une séance
  de course ou de trail, le vélo sur « autre sport »), une activité par séance, dans l'ordre de la journée. Un
  rattachement déjà enregistré n'est pas changé par un nouvel import.
- Les activités sans séance (sorties libres) apparaissent dans le planning du coach, le jour où elles ont été faites.

### Détail d'une activité (0.5.0)

- À chaque passage, `garmin-sync` télécharge aussi le fichier d'origine (archive ZIP contenant le `.FIT`) de deux
  activités récentes au plus qui n'ont pas encore de détail : `GET /download-service/files/activity/{id}`, avec le
  même jeton. Le `.FIT` est lu par le SDK officiel de Garmin (`npm:@garmin/fitsdk`, dans la fonction seulement),
  puis réduit par `supabase/functions/_shared/garmin-detail.ts` : 1 800 points au plus par série (moyenne par tranche
  de temps), les tours et les chiffres d'ensemble de la montre. Résultat : environ 100 Ko de JSON par heure de sortie.
- Deux fichiers par passage, parce que le décodage consomme du temps de calcul (limité à 2 s par appel sur l'offre
  gratuite). Un fichier absent ou illisible est noté (`no_file`, `unreadable`) et redemandé au plus toutes les 6 h.
- Le site (`src/domain/activityDetail.ts`) en tire les courbes (FC sur fond de zones, allure lissée sur 20 s,
  altitude, cadence, puissance : un graphique par mesure, sur le même axe du temps), le temps passé dans chaque zone
  de FC de la fiche de l'athlète, les tours, et la comparaison étape par étape avec la séance prévue quand la montre
  l'a suivie (autant de tours que d'étapes).
- Un clic du coach sur une séance faite (retour ou activité de la montre, ⌚) ouvre sa page détaillée ; une séance à
  venir ouvre toujours l'éditeur. Un clic sur une sortie libre ouvre `/activite/:id`.
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
