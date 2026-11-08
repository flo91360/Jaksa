# Journal des versions

## [0.4.2] - 2026-11-08

- **Séance faite avec un jour de retard** : une activité Garmin sans séance prévue le jour même est rattachée à la séance de la veille, si celle-ci n'a pas encore d'activité. Jamais à celle du lendemain, qui n'a peut-être pas encore été courue.
- **Sorties libres dans le planning du coach** : une activité Garmin sans séance apparaît le jour où elle a été faite (« ⌚ Sortie libre »), avec durée et distance, et le détail (allure, FC, D+) au survol.

## [0.4.1] - 2026-11-08

- **Import Garmin automatique** : toutes les 15 minutes, Supabase va chercher les nouvelles activités du compte de test chez Garmin et les rattache aux séances, sans que l'athlète ait à ouvrir le site. Le coach les voit donc aussitôt.
- La carte « Ta montre » indique l'heure du dernier import automatique, et prévient si Garmin refuse la clé (clé expirée).
- Le bouton « Importer mes activités Garmin » reste disponible pour ne pas attendre le prochain passage.
- Garmin ne prévient pas le site quand une montre se synchronise avec la clé personnelle : ce sera possible avec l'accès Starter.

## [0.4.0] - 2026-11-08

Garmin, première étape : l'import des activités, pour un compte de test.

- **Import des activités Garmin** des 14 derniers jours, avec la clé d'API personnelle Garmin (niveau « Personal ») :
  - bouton dans **Mon compte** → **Montre Garmin (essai)**, puis import automatique à l'ouverture de l'accueil (au plus toutes les 30 minutes) ;
  - réservé pour l'instant au compte désigné dans Supabase : la clé Garmin ne donne accès qu'aux données de son propriétaire.
- **Rattachement** de chaque activité à la séance prévue le même jour et du même sport (biquotidien compris).
- **Sous la séance**, pour l'athlète et son coach : durée, distance, allure moyenne, FC moyenne et max, D+ mesurés par la montre.
- **Retour de séance** pré-rempli avec ce qu'a mesuré la montre.
- **Accueil de l'athlète** : carte « Ta montre » avec les dernières activités.
- Mise en route (migration, clé, secrets, fonction Supabase) : `docs/DEPLOIEMENT.md`, étape 8.
- L'envoi des séances sur la montre attend toujours l'accès Starter de Garmin.

## [0.3.0] - 2026-11-08

Les échanges et les retours.

- **Retour de séance** par l'athlète, en un bouton « J’ai fait ma séance » :
  - faite, faite en partie ou pas faite ;
  - durée, distance et D+, pré-remplis avec l'estimation de la séance prévue ;
  - ressenti (RPE de 1 à 10) ;
  - douleurs : où (genou, tendon d’Achille, mollet…), de quel côté et avec quelle intensité (1 à 10).
- **« Vu par le coach »** : l'athlète sait quand son coach a lu son retour et ses commentaires.
- **Commentaires** sous chaque séance, pour l'athlète comme pour le coach.
- **Planning du coach** : chaque séance affiche le retour (fait / pas fait, RPE, douleur, commentaires), avec un point rouge pour ce qui n'a pas encore été vu, et une liste « À voir » en tête du planning.
- **Messagerie** coach ↔ athlète, mise à jour en temps réel, avec le nombre de messages non lus dans le menu.
- **Athlète** : « Tes dernières séances » rappelle celles qui attendent un retour.
- **E-mails** (à activer, voir `docs/DEPLOIEMENT.md`, étape 7) :
  - chaque soir, la séance du lendemain pour l'athlète ;
  - nouveau retour, commentaire ou message, regroupés toutes les 10 minutes et seulement s'ils n'ont pas déjà été lus sur le site ;
  - aucune donnée de santé ni le texte des messages dans les e-mails, seulement des liens ;
  - désactivables par chacun dans « Mon compte ».

## [0.2.0] - 2026-11-08

La planification.

- **Calendrier du coach** :
  - à la semaine ou au mois, pour un athlète ou pour « tous mes athlètes » ;
  - glisser-déposer pour déplacer une séance, avec Alt ou Ctrl pour la copier, ou vers la ligne d'un autre athlète ;
  - copie d'une séance vers un autre jour ou un autre athlète, duplication d'une semaine entière.
- **Constructeur de séances** :
  - échauffement, efforts, blocs répétés (ex. 10 × 400 m), récupérations, retour au calme ;
  - chaque étape en durée, en distance ou libre (bouton tour), avec une cible en zone, en allure ou en FC ;
  - une cible en zone s'affiche en FC **et** en allure d'après les zones de l'athlète ;
  - durée et distance totales estimées.
- **Bibliothèque de séances types**, à planifier en un clic ; une séance du calendrier peut y être ajoutée.
- **Courses et objectifs** (priorité A, B ou C) dans le calendrier, saisis par le coach ou par l'athlète.
- **Athlète** : « Ta séance du jour », la semaine à venir et le prochain objectif.
- **Export `.FIT`** de la séance, à copier sur la montre Garmin par câble USB, avec les cibles en allure ou en FC.
- **Sauvegarde quotidienne** chiffrée de la base, à activer avec deux secrets GitHub.
- La page d'accueil du coach devient le planning.

## [0.1.0] - 2026-11-08

Première version : le socle.

- **Coach** :
  - invitation des athlètes par un lien personnel, à envoyer par SMS, WhatsApp ou e-mail ;
  - liste des athlètes, avec archivage.
- **Fiche athlète** :
  - physiologie (FC max, FC repos, FC seuil, VMA) ;
  - objectifs, blessures et reprise, disponibilités ;
  - notes privées du coach, invisibles pour l'athlète.
- **Zones** :
  - calcul automatique des zones de FC (% FC max, % FC de réserve ou % FC seuil) ;
  - saisie de l'allure correspondant à chaque zone ;
  - historique conservé.
- **Athlète** :
  - création du compte depuis le lien du coach ;
  - page « Aujourd'hui », profil et zones d'entraînement.
- Site utilisable sur téléphone et ordinateur, installable sur l'écran d'accueil.
