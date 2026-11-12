# Mise en ligne de Rob1Coach

Il faut deux comptes gratuits :

- **Supabase** pour la base de données et les comptes ;
- **Cloudflare** pour héberger le site.

Compter environ une heure la première fois.

## 1. Créer le projet Supabase

1. Créer un compte sur [supabase.com](https://supabase.com), puis **New project** :
   - nom : `rob1coach` ;
   - région : **Europe** (Paris ou Francfort). Ce sont des données de santé, elles restent dans l'UE.
   - mot de passe de la base : fort, à conserver dans un gestionnaire de mots de passe.
2. Créer les tables et les règles de sécurité : rien à coller à la main, c'est une tâche GitHub qui s'en charge.
   Faire tout de suite sa mise en place (étape 4, 10 minutes), avant l'étape 2 qui a besoin des tables.
3. Dans **Authentication** → **Sign In / Providers** → **Email** :
   - garder le fournisseur e-mail activé ;
   - **Confirm email** : le plus simple au départ est de le **désactiver**, car les athlètes arrivent par un lien personnel. S'il reste activé, l'envoi d'e-mails de l'étape 5 est obligatoire.
   - imposer au moins 8 caractères pour les mots de passe.
4. Dans **Authentication** → **URL Configuration** :
   - **Site URL** : l'adresse du site (étape 3) ;
   - **Redirect URLs** : ajouter `https://<adresse-du-site>/**` et, pour le développement, `http://localhost:5173/**`.
5. Configurer l'envoi d'e-mails, nécessaire pour « mot de passe oublié » et la confirmation d'adresse.
   L'envoi intégré à Supabase est très limité et réservé aux essais. Il faut un service SMTP, par exemple
   [Brevo](https://www.brevo.com) (français, offre gratuite) :
   - créer une clé SMTP dans Brevo ;
   - la renseigner dans **Authentication** → **Emails** → **SMTP Settings** (serveur `smtp-relay.brevo.com`, port 587) ;
   - les modèles d'e-mails peuvent être traduits en français dans le même menu.
6. Noter l'**URL du projet** et la **clé publishable** (`sb_publishable_…`, ou l'ancienne clé `anon`), dans
   **Project Settings** → **API Keys**. Cette clé est publique : la sécurité repose sur les règles RLS de la base.
   La clé **secret** / **service_role** ne doit jamais aller dans le site.

## 2. Créer le compte du coach

Le site ne permet pas de devenir coach tout seul : c'est voulu.

1. **Authentication** → **Users** → **Add user** → **Create new user** : saisir l'e-mail et le mot de passe du coach, et cocher **Auto Confirm User**.
2. Dans **SQL Editor**, en adaptant l'e-mail et le nom :

   ```sql
   update public.profiles
   set role = 'coach', full_name = 'Prénom Nom'
   where email = 'coach@exemple.fr';
   ```

3. Se connecter sur le site : la page **Mes athlètes** s'affiche. Le bouton **Inviter un athlète** crée un lien à envoyer à chaque coureur.

## 3. Mettre le site en ligne sur Cloudflare

1. Créer un compte sur [cloudflare.com](https://dash.cloudflare.com), puis **Workers & Pages** → **Create** → importer le dépôt GitHub `Rob1Coach`.
2. Réglages de build :
   - commande de build : `npm run build` ;
   - commande de déploiement : `npx wrangler deploy` (elle lit [`wrangler.jsonc`](../wrangler.jsonc)).
3. Variables de build :
   - `VITE_SUPABASE_URL` : l'URL du projet Supabase ;
   - `VITE_SUPABASE_PUBLISHABLE_KEY` : la clé publishable.
4. Chaque fusion dans `main` redéploie le site automatiquement. Il est possible d'ajouter un nom de domaine dans les réglages du projet Cloudflare.
5. Reporter l'adresse finale dans Supabase (étape 1.4).

Si le site affiche « Configuration incomplète », les deux variables de build manquent.

## 4. Mises à jour automatiques de la base et des fonctions

### À quoi servent les fichiers `.sql`

Le site (le code) et la base de données vivent à deux endroits différents. Cloudflare reconstruit le site tout seul à
chaque fusion, mais la base, chez Supabase, ne change que si on lui dit quoi faire. Chaque fichier de
`supabase/migrations/` est une **migration** : une liste d'instructions qui fait évoluer la structure de la base
(nouvelles tables comme les séances ou les messages, nouvelles colonnes, règles de qui a le droit de lire quoi). Elles
s'appliquent dans l'ordre de leur numéro, **une seule fois chacune**. Supabase note celles qu'il a déjà reçues.

La tâche GitHub [`.github/workflows/deploiement-supabase.yml`](../.github/workflows/deploiement-supabase.yml) fait ce
travail à chaque fusion dans `main` qui touche `supabase/` :

- elle applique les **nouvelles** migrations, et seulement celles-là (`supabase db push`) ;
- elle déploie les **fonctions Supabase** de `supabase/functions/` (aujourd'hui `garmin-import`).

Elle tourne en même temps que la mise en ligne du site par Cloudflare et finit en général avant elle (moins d'une
minute). Si elle échoue, GitHub envoie un e-mail et rien n'est appliqué à moitié : chaque migration passe en entier ou
pas du tout.

Les migrations collées à la main avant la mise en place (0.1.0 à 0.4.0) ne sont pas rejouées : au premier passage, la
tâche voit que leurs tables existent déjà et les note comme appliquées dans l'historique de Supabase.

### Mise en place (10 minutes, une seule fois)

Il faut deux secrets dans GitHub. Un secret est une valeur que GitHub garde chiffrée et ne réaffiche jamais, même à
toi : on ne le colle nulle part ailleurs (ni dans un e-mail, ni dans une discussion, ni dans un fichier du dépôt).

**Secret 1 : `SUPABASE_DB_URL`, l'accès à la base.** Si la sauvegarde quotidienne (étape 5) est déjà en place, il
existe déjà : passer au secret 2. Sinon :

1. Ouvrir le projet sur [supabase.com/dashboard](https://supabase.com/dashboard), bouton **Connect** en haut de la
   page → onglet **Connection String** → méthode **Session pooler**, et copier la chaîne qui ressemble à
   `postgresql://postgres.abcdefghij:[YOUR-PASSWORD]@aws-0-eu-west-3.pooler.supabase.com:5432/postgres`.
2. La coller dans un éditeur de texte (Bloc-notes, TextEdit) et remplacer `[YOUR-PASSWORD]`, **crochets compris**,
   par le mot de passe de la base choisi à la création du projet.
   - Mot de passe oublié : **Project Settings** → **Database** → **Reset database password**. Choisir un mot de passe
     long **sans caractères spéciaux** (lettres et chiffres seulement, sinon il faut les encoder dans la chaîne).
     Penser ensuite à mettre à jour ce secret si la sauvegarde l'utilisait déjà.
3. Sur GitHub, ouvrir [**Settings** → **Secrets and variables** → **Actions** → **New repository secret**](https://github.com/flo91360/rob1coach/settings/secrets/actions/new) :
   - **Name** : `SUPABASE_DB_URL` ;
   - **Secret** : la chaîne complète ;
   - **Add secret**. Effacer ensuite la chaîne de l'éditeur de texte sans l'enregistrer.

**Secret 2 : `SUPABASE_ACCESS_TOKEN`, le droit de déployer les fonctions.**

1. Sur Supabase, cliquer sur l'avatar en haut à droite → **Account preferences** → **Access Tokens**
   ([lien direct](https://supabase.com/dashboard/account/tokens)) → **Generate new token**.
2. Nom : `github-rob1coach`. Choisir une durée sans expiration, ou la plus longue proposée (il faudra alors
   recommencer ces étapes à l'échéance), puis **Generate token**.
3. Le jeton (`sbp_…`) ne s'affiche qu'**une fois** : cliquer sur l'icône de copie, puis de nouveau
   [**New repository secret**](https://github.com/flo91360/rob1coach/settings/secrets/actions/new) :
   - **Name** : `SUPABASE_ACCESS_TOKEN` ;
   - **Secret** : coller le jeton ;
   - **Add secret**.

La ref du projet n'est pas un troisième secret : la tâche la lit dans `SUPABASE_DB_URL` (c'est la partie
`abcdefghij` après `postgres.`).

**Premier essai.** Sur GitHub, onglet **Actions** → **Déploiement Supabase** → **Run workflow** → **Run workflow**.
Après une minute, la ligne doit passer au vert. En cliquant dessus, le journal indique les migrations notées comme
déjà appliquées, celles qui ont été appliquées, puis la fonction déployée. Un second lancement doit afficher
« Remote database is up to date ».

Tant qu'un secret manque, la tâche ne fait rien et l'indique par un avertissement jaune (sans échec).

### Pour vérifier l'état de la base

**Database** → **Migrations** dans le tableau de bord de Supabase liste les migrations appliquées. Elles doivent
correspondre aux fichiers de `supabase/migrations/` :

| Version | Fichier |
|---|---|
| 0.1.0 | `20261108120000_socle.sql` |
| 0.2.0 | `20261109090000_planification.sql` |
| 0.3.0 | `20261110090000_echanges.sql` |
| 0.4.0 | `20261111090000_garmin.sql` |

### Ce qui reste à faire à la main

La tâche ne touche qu'à la structure de la base et au code des fonctions. Restent manuels, **une seule fois** chacun,
parce qu'il s'agit de réglages ou de secrets qui n'ont pas leur place dans le dépôt :

- la création du projet Supabase et ses réglages d'authentification (étape 1) ;
- la création du compte coach (étape 2) ;
- la mise en route des e-mails avec `supabase/emails.sql` (étape 7) : ce fichier contient la clé Brevo une fois
  rempli, il ne peut donc pas être une migration ;
- les secrets de la fonction Garmin (étape 8.2) et le renouvellement de la clé Garmin quand elle expire ;
- les deux secrets GitHub ci-dessus.

Une future version qui demande un nouveau réglage de ce type le dira dans sa pull request et dans `CHANGELOG.md`.

## 5. Sauvegarde quotidienne

L'offre gratuite de Supabase ne sauvegarde pas la base. Le dépôt contient une tâche GitHub
([`.github/workflows/sauvegarde.yml`](../.github/workflows/sauvegarde.yml)) qui, chaque nuit :

- exporte les données (comptes, profils, fiches, séances, courses…) ;
- les **chiffre** avec une phrase secrète (ce sont des données de santé) ;
- les conserve **30 jours** dans GitHub, onglet **Actions** → **Sauvegarde de la base** → artefacts.

Tant que les deux secrets ci-dessous manquent, la tâche s'arrête avec un simple avertissement.

### Mise en place (10 minutes)

1. Créer le secret `SUPABASE_DB_URL` comme à l'étape 4 (secret 1), s'il n'existe pas déjà. Le « Session pooler » est
   nécessaire : GitHub ne sait pas joindre la connexion directe.
2. Choisir une **phrase secrète** longue (5 ou 6 mots) et la ranger dans le gestionnaire de mots de passe. Sans elle,
   les sauvegardes sont illisibles, y compris pour nous.
3. Sur GitHub : **Settings** → **Secrets and variables** → **Actions** → **New repository secret** :
   - `BACKUP_PASSPHRASE` : la phrase secrète.
4. **Actions** → **Sauvegarde de la base** → **Run workflow** pour un premier essai : un fichier
   `rob1coach-AAAA-MM-JJ.tar.gz.gpg` doit apparaître dans les artefacts.

L'offre gratuite de GitHub (2 000 minutes par mois pour un dépôt privé) suffit largement : la tâche prend une à deux minutes.

### Restauration

À faire depuis un ordinateur avec `gpg` et `psql` (PostgreSQL 17), dans un projet Supabase **neuf** :

1. Télécharger l'artefact voulu depuis GitHub, puis le déchiffrer :

   ```bash
   gpg --decrypt rob1coach-AAAA-MM-JJ.tar.gz.gpg | tar -xzf -   # demande la phrase secrète
   ```

2. Créer la structure : mettre la chaîne Session pooler du nouveau projet dans le secret `SUPABASE_DB_URL` et lancer
   **Actions** → **Déploiement Supabase** → **Run workflow** (étape 4), qui applique toutes les migrations.
3. Recharger les comptes puis les données, déclencheurs suspendus (sinon chaque compte recréerait un profil vide) :

   ```bash
   psql "<chaîne Session pooler du nouveau projet>" --single-transaction -v ON_ERROR_STOP=1 \
     -c 'set session_replication_role = replica' -f auth.sql -f public.sql
   ```

4. Reporter la nouvelle URL et la nouvelle clé dans Cloudflare (étape 3.3).

Les mots de passe des comptes sont conservés : coach et athlètes se reconnectent comme avant.

## 6. Développer en local

```bash
npm install
cp .env.example .env.local   # puis y mettre l'URL et la clé du projet Supabase
npm run dev                  # http://localhost:5173
```

Pour ne pas toucher aux vraies données, utiliser un second projet Supabase gratuit.

Vérifications avant de pousser :

```bash
npm run check   # lint, types, tests (dont les règles de sécurité de la base), build
```

## 7. E-mails automatiques (0.3.0)

Une fois la migration `20261110090000_echanges.sql` appliquée (automatique, étape 4), le site enregistre les e-mails à envoyer (séance du
lendemain, nouveaux retours, commentaires et messages). Pour qu'ils partent vraiment, il faut les activer une fois
(15 minutes) :

1. Dans [Brevo](https://www.brevo.com) :
   - **Senders, Domains & Dedicated IPs** → **Senders** : ajouter et valider l'adresse d'expédition (par exemple
     celle du coach) ;
   - **SMTP & API** → onglet **API Keys** → **Generate a new API key** : copier la clé (`xkeysib-…`). Ce n'est pas
     la même que la clé SMTP de l'étape 1.5.
2. Ouvrir [`supabase/emails.sql`](../supabase/emails.sql), copier tout son contenu dans le **SQL Editor** de Supabase
   (**New query**), puis remplacer les trois valeurs entre crochets :
   - `[CLE_API_BREVO]` : la clé copiée ;
   - `[ADRESSE_EXPEDITEUR]` : l'adresse validée dans Brevo ;
   - `[ADRESSE_DU_SITE]` : l'adresse du site, sans « / » final (ex. `https://rob1coach.fr`).
3. **Run**. La requête ne doit être exécutée qu'**une fois**. Ne pas enregistrer la requête remplie (elle contient la clé).
4. Pour vérifier le lendemain : **Integrations** → **Cron** → les deux tâches `rob1coach-…` et leurs dernières exécutions.

Chacun peut couper les e-mails dans **Mon compte**. Les e-mails déjà lus sur le site ne sont pas envoyés, et ceux
de plus de 24 heures sont abandonnés.

## 8. Import Garmin, compte de test (0.4.0)

Pour l'instant, une seule personne importe ses activités Garmin, avec sa clé d'API **personnelle** (niveau
« Personal » de Garmin : lecture seule, ses propres données). Le site ne voit jamais la clé : elle reste dans
Supabase, et une fonction Supabase (`garmin-import`) s'en sert pour lire les activités chez Garmin.
Compter 15 minutes.

1. **Créer la clé Garmin** : se connecter sur [connect.garmin.com](https://connect.garmin.com), ouvrir
   [la page de la clé d'API personnelle](https://connect.garmin.com/app/settings/personalApiToken), accepter les
   conditions, choisir une durée (30 jours à 1 an) et cliquer sur **Create**. La clé ne s'affiche qu'**une fois** :
   la copier tout de suite dans le gestionnaire de mots de passe, et ne la coller nulle part ailleurs (ni dans un
   e-mail, ni dans une discussion). Il n'y a rien d'autre à générer : la fonction échange elle-même la clé contre un
   jeton d'accès de 24 h à chaque import.
2. **Ranger la clé dans Supabase** : **Edge Functions** → **Secrets** → ajouter deux secrets :
   - `GARMIN_PERSONAL_API_KEY` : la clé Garmin ;
   - `GARMIN_ATHLETE_EMAIL` : l'adresse e-mail du compte **athlète** Rob1Coach qui recevra ces activités. La
     fonction refuse tout autre compte, coach compris.
3. **Déployer les fonctions** `garmin-import` (import à la demande) et `garmin-sync` (import automatique toutes les
   15 minutes, avec sa tâche `pg_cron` `rob1coach-garmin-import`) : c'est automatique (étape 4). Pour la redéployer sans attendre une
   fusion : **Actions** → **Déploiement Supabase** → **Run workflow**.
4. **Essayer** : se connecter sur le site avec le compte athlète choisi, **Mon compte** → **Montre Garmin (essai)**
   → **Importer mes activités Garmin**. Les activités des 14 derniers jours apparaissent ensuite sous la séance prévue
   le même jour, et dans la carte **Ta montre** de l'accueil, qui relance l'import toute seule à l'ouverture (au plus
   toutes les 30 minutes).

Ensuite, l'import se fait tout seul toutes les 15 minutes : une sortie synchronisée avec Garmin Connect apparaît sur
le site au plus tard un quart d'heure après, pour l'athlète comme pour le coach. Pour vérifier : **Integrations** →
**Cron** → `rob1coach-garmin-import`, ou dans le SQL Editor
`select * from public.garmin_sync_runs order by ran_at desc limit 10;`.

**Détail des activités (0.5.0)** : à chaque passage, la fonction lit aussi le fichier `.FIT` de deux activités
récentes (courbes, tours), sans aucun réglage de plus. Pour vérifier : la colonne `details` de `garmin_sync_runs`, ou
`select status, error, count(*) from public.garmin_activity_details group by 1, 2;`. Depuis la 0.5.1, chaque échec
garde sa raison (`error` sur l'activité, `detail_error` dans `garmin_sync_runs`) : « HTTP 403 » ou « HTTP 404 »
veulent dire que Garmin ne sert pas le fichier à l'adresse attendue (`/download-service/files/activity/{id}`) ; la
page de la séance affiche alors seulement les chiffres du résumé, avec la raison.

Garmin prévient par e-mail une semaine avant l'expiration de la clé. Pour la renouveler : créer une nouvelle clé
(étape 1) et remplacer `GARMIN_PERSONAL_API_KEY` (étape 2). Pour tout arrêter : supprimer la clé dans Garmin Connect,
ce qui coupe aussitôt l'accès.

Si l'import affiche « L'import Garmin n'est pas disponible », la fonction n'est pas déployée ; « pas encore ouvert
pour ton compte », l'adresse de `GARMIN_ATHLETE_EMAIL` ne correspond pas au compte connecté.

## 9. Fusion automatique des pull requests

Chaque pull request ouverte par le propriétaire du dépôt (y compris celles que Claude ouvre) est fusionnée par GitHub
dès que la CI est verte, sans attendre personne : c'est la tâche
[`.github/workflows/fusion-auto.yml`](../.github/workflows/fusion-auto.yml). Les migrations et les fonctions
partent ensuite comme d'habitude (étape 4). Compter 10 minutes, une seule fois.

1. **Autoriser la fusion automatique** : sur GitHub, dépôt → **Settings** → **General** → section **Pull Requests** →
   cocher **Allow auto-merge** (et, au passage, **Automatically delete head branches**).
2. **Dire à GitHub ce qu'est « la CI est verte »** : **Settings** → **Rules** → **Rulesets** → **New ruleset** →
   **New branch ruleset** :
   - nom : `main` ; **Enforcement status** : **Active** ;
   - **Target branches** → **Add target** → **Include default branch** ;
   - cocher **Require status checks to pass**, puis **Add checks** → `Lint, types, tests, build` ;
   - ne pas cocher « Require a pull request before merging » avec des relectures obligatoires (personne ne
     relirait) ; laisser le reste décoché, puis **Create**.

   Seul ce contrôle compte : l'aperçu Cloudflare (« Workers Builds ») n'empêche pas la fusion.
3. **Créer le jeton** : [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
   (jeton « fine-grained ») :
   - nom : `rob1coach-fusion-auto` ; expiration : 1 an (GitHub prévient avant) ;
   - **Repository access** → **Only select repositories** → `Rob1Coach` ;
   - **Permissions** → **Contents** : *Read and write* ; **Pull requests** : *Read and write* ;
   - **Generate token**, et copier le jeton (affiché une seule fois).

   Le jeton doit être à ton nom : une fusion faite par le jeton interne de GitHub Actions ne déclencherait pas le
   déploiement Supabase.
4. **Le ranger en secret** : dépôt → **Settings** → **Secrets and variables** → **Actions** → **New repository
   secret** → nom `FUSION_AUTO_TOKEN`, valeur : le jeton.

Pour vérifier : une nouvelle pull request affiche « Auto-merge enabled » quelques secondes après son ouverture. Pour
garder une PR ouverte (à relire avant), cliquer sur **Disable auto-merge** sur sa page. Si la tâche échoue avec
« Secret FUSION_AUTO_TOKEN absent » ou une erreur de droits, le jeton manque ou a expiré (étape 3).

L'aperçu Cloudflare des branches (« Workers Builds » rouge sur les PR) peut être coupé dans Cloudflare :
**Workers & Pages** → `rob1coach` → **Settings** → **Build** → **Branch control** → décocher **Builds for
non-production branches**. Le site en production, construit à chaque fusion dans `main`, n'est pas concerné.

## 10. Pages légales et suivi des erreurs (0.7.0)

Rien à installer : la migration `20261117090000_comptes_rgpd.sql` est appliquée par la tâche de l'étape 4.

**Coordonnées de l'éditeur.** Tant qu'elles ne sont pas renseignées, les pages `/mentions-legales` et
`/confidentialite` indiquent que le site est en phase pilote. Pour les publier, ajouter ces variables de build dans
Cloudflare (au même endroit que `VITE_SUPABASE_URL`, étape 3), puis relancer un déploiement :

| Variable | Exemple |
|---|---|
| `VITE_CONTACT_EMAIL` | `contact@rob1coach.fr` |
| `VITE_PUBLISHER_NAME` | nom de la structure (ou prénom et nom de l'entrepreneur) |
| `VITE_PUBLISHER_LEGAL_FORM` | `micro-entreprise` |
| `VITE_PUBLISHER_ADDRESS` | adresse du siège |
| `VITE_PUBLISHER_SIRET` | numéro SIRET |
| `VITE_PUBLISHER_DIRECTOR` | responsable de la publication |

**Modifier les conditions ou la politique de confidentialité** : changer le texte dans
`src/pages/public/LegalPages.tsx` et la date `TERMS_VERSION` de `src/lib/site.ts`. Chaque personne devra alors
redonner son accord à sa prochaine visite.

**Lire les erreurs du site** : tableau de bord Supabase → **Table Editor** → `client_errors` (les plus récentes en
tête en triant sur `occurred_at`). Chaque ligne donne la page, la version du site, le message et le navigateur. La
table se vide toute seule au bout de 30 jours.

**En-têtes de sécurité** : ils sont dans `public/_headers`. Si un jour le site doit charger quelque chose d'un autre
domaine (police, carte, outil de paiement), il faut l'y autoriser, sinon le navigateur le bloquera.

