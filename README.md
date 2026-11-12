# Rob1Coach

Application web pour un coach de course à pied et ses athlètes (semi, marathon,
ultra-trail, reprise après blessure). Elle remplace l'essentiel de Nolio, pour un
coût d'hébergement proche de zéro.

- **Coach** : invite ses athlètes par lien, tient leur fiche (physiologie, objectifs, blessures, notes privées) et définit leurs zones de FC et les allures correspondantes.
- **Planification** : calendrier à la semaine ou au mois, par athlète ou pour tous, avec glisser-déposer ; constructeur de séances (échauffement, blocs répétés, récupérations) dont les zones se traduisent en FC et en allure ; bibliothèque de séances types ; courses A/B/C.
- **Athlète** : rejoint son coach en un clic, voit sa séance du jour et sa semaine, exporte la séance en `.FIT` pour sa montre Garmin, retrouve ses zones et ses courses.
- **Échanges** : l'athlète fait son retour de séance (faite ou non, durée, distance, D+, RPE, douleurs) et le coach le voit dans son planning, avec la mention « vu par le coach » ; fil de commentaires sous chaque séance ; messagerie en temps réel ; e-mails (séance du lendemain, nouveaux retours et messages).
- **Garmin (essai)** : un compte de test importe ses activités Garmin (durée, distance, allure, FC, D+), rattachées à la séance prévue et visibles par son coach.
- **Données personnelles** : page d'accueil et pages légales publiques, accord explicite à l'inscription, export et suppression du compte par chacun, retrait de l'accès du coach.
- Le site fonctionne sur téléphone et sur ordinateur, et s'installe sur l'écran d'accueil.

La suite (envoi automatique sur les montres Garmin, suivi de la charge) est décrite dans [docs/PLAN.md](docs/PLAN.md).

## Technique

React + TypeScript (Vite), Tailwind CSS, React Query.
[Supabase](https://supabase.com) (PostgreSQL, authentification, règles RLS) et
hébergement statique sur Cloudflare.
Détails : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Démarrer

```bash
npm install
cp .env.example .env.local   # URL et clé publishable du projet Supabase
npm run dev
```

La mise en ligne pas à pas (Supabase, compte coach, Cloudflare) est décrite dans
[docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).

## Vérifier

```bash
npm run check   # lint (oxlint) + types + tests + build
```

Les tests couvrent :

- la logique métier (zones, allures, formulaires, calendrier, séances, export `.FIT` relu par le SDK Garmin) ;
- les règles de sécurité de la base, exécutées sur un vrai PostgreSQL en mémoire (PGlite) : un coach ne voit que ses athlètes, un athlète ne voit pas les autres, etc.

La CI GitHub les lance sur chaque pull request.
