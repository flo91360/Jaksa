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
2. Créer les tables et les règles de sécurité. Dans **SQL Editor** → **New query**, coller le contenu de chaque
   fichier de [`supabase/migrations/`](../supabase/migrations/), **dans l'ordre**, et faire **Run** à chaque fois :
   - `20261108120000_socle.sql` (0.1.0) ;
   - `20261109090000_planification.sql` (0.2.0 : séances, séances types, courses) ;
   - `20261110090000_echanges.sql` (0.3.0 : retours de séance, commentaires, messagerie, e-mails) ;
   - `20261111090000_garmin.sql` (0.4.0 : activités importées depuis Garmin).
   - Avec la ligne de commande, c'est équivalent : `npx supabase link --project-ref <ref>` puis `npx supabase db push`.
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

## 4. Mettre à jour la base de données

Chaque évolution de la base est un nouveau fichier dans `supabase/migrations/`, numéroté par date. Pour l'appliquer :

- coller le **nouveau** fichier dans le SQL Editor ;
- ou lancer `npx supabase db push`.

Il faut appliquer les fichiers dans l'ordre, une seule fois chacun, et ne jamais modifier une migration déjà appliquée.

| Version | Fichier à appliquer |
|---|---|
| 0.1.0 | `20261108120000_socle.sql` |
| 0.2.0 | `20261109090000_planification.sql` |
| 0.3.0 | `20261110090000_echanges.sql` |
| 0.4.0 | `20261111090000_garmin.sql` |

Pour passer de 0.1.0 à 0.2.0, il suffit donc de coller `20261109090000_planification.sql` dans le SQL Editor
**avant** de fusionner la pull request (sinon le site déployé cherche des tables qui n'existent pas encore).

## 5. Sauvegarde quotidienne

L'offre gratuite de Supabase ne sauvegarde pas la base. Le dépôt contient une tâche GitHub
([`.github/workflows/sauvegarde.yml`](../.github/workflows/sauvegarde.yml)) qui, chaque nuit :

- exporte les données (comptes, profils, fiches, séances, courses…) ;
- les **chiffre** avec une phrase secrète (ce sont des données de santé) ;
- les conserve **30 jours** dans GitHub, onglet **Actions** → **Sauvegarde de la base** → artefacts.

Tant que les deux secrets ci-dessous manquent, la tâche s'arrête avec un simple avertissement.

### Mise en place (10 minutes)

1. Dans Supabase : bouton **Connect** en haut de la page du projet → **Session pooler** → copier la chaîne
   de connexion (`postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-…pooler.supabase.com:5432/postgres`) et y remplacer
   `[YOUR-PASSWORD]` par le mot de passe de la base. Le « Session pooler » est nécessaire : GitHub ne sait pas joindre
   la connexion directe.
2. Choisir une **phrase secrète** longue (5 ou 6 mots) et la ranger dans le gestionnaire de mots de passe. Sans elle,
   les sauvegardes sont illisibles, y compris pour nous.
3. Sur GitHub : **Settings** → **Secrets and variables** → **Actions** → **New repository secret** :
   - `SUPABASE_DB_URL` : la chaîne de connexion ;
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

2. Créer la structure : appliquer toutes les migrations dans l'ordre (étape 1.2).
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

Une fois la migration `20261110090000_echanges.sql` appliquée, le site enregistre les e-mails à envoyer (séance du
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

1. **Appliquer la migration** `20261111090000_garmin.sql` (étape 4), avant de fusionner la pull request.
2. **Créer la clé Garmin** : se connecter sur [connect.garmin.com](https://connect.garmin.com), ouvrir
   [la page de la clé d'API personnelle](https://connect.garmin.com/app/settings/personalApiToken), accepter les
   conditions, choisir une durée (30 jours à 1 an) et cliquer sur **Create**. La clé ne s'affiche qu'**une fois** :
   la copier tout de suite dans le gestionnaire de mots de passe, et ne la coller nulle part ailleurs (ni dans un
   e-mail, ni dans une discussion). Il n'y a rien d'autre à générer : la fonction échange elle-même la clé contre un
   jeton d'accès de 24 h à chaque import.
3. **Ranger la clé dans Supabase** : **Edge Functions** → **Secrets** → ajouter deux secrets :
   - `GARMIN_PERSONAL_API_KEY` : la clé Garmin ;
   - `GARMIN_ATHLETE_EMAIL` : l'adresse e-mail du compte **athlète** Rob1Coach qui recevra ces activités. La
     fonction refuse tout autre compte, coach compris.
4. **Déployer la fonction** `garmin-import`, au choix :
   - avec la ligne de commande : `npx supabase functions deploy garmin-import --project-ref <ref>` ;
   - ou dans le tableau de bord : **Edge Functions** → **Deploy a new function** → **Via Editor**, nom
     `garmin-import`, puis recopier les deux fichiers de
     [`supabase/functions/garmin-import/`](../supabase/functions/garmin-import/) (`index.ts` et `garmin.ts`) et
     **Deploy**. Laisser l'option **Verify JWT** activée.
5. **Essayer** : se connecter sur le site avec le compte athlète choisi, **Mon compte** → **Montre Garmin (essai)**
   → **Importer mes activités Garmin**. Les activités des 14 derniers jours apparaissent ensuite sous la séance prévue
   le même jour, et dans la carte **Ta montre** de l'accueil, qui relance l'import toute seule à l'ouverture (au plus
   toutes les 30 minutes).

Garmin prévient par e-mail une semaine avant l'expiration de la clé. Pour la renouveler : créer une nouvelle clé
(étape 2) et remplacer `GARMIN_PERSONAL_API_KEY` (étape 3). Pour tout arrêter : supprimer la clé dans Garmin Connect,
ce qui coupe aussitôt l'accès.

Si l'import affiche « L'import Garmin n'est pas disponible », la fonction n'est pas déployée ; « pas encore ouvert
pour ton compte », l'adresse de `GARMIN_ATHLETE_EMAIL` ne correspond pas au compte connecté.
