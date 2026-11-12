# Plan de Rob1Coach

Objectif : remplacer Nolio par un outil plus simple et bien moins cher, taillé
pour la façon de travailler du coach. Le plan a été établi le 8 novembre 2026.

## Le besoin

| Question | Réponse |
|---|---|
| Athlètes suivis | Une dizaine aujourd'hui |
| Disciplines | Semi-marathon, marathon, ultra-trail, et des reprises après blessure |
| Ce qu'il utilise vraiment dans Nolio | Le planificateur de séances, les commentaires et la messagerie |
| Façon de prescrire | Des allures qu'il calcule à partir des zones de FC |
| Montres des athlètes | Surtout des Garmin. L'envoi des séances sur la montre est **indispensable** |
| Paiement des athlètes dans l'outil | Non |
| Structure déclarée | Oui, mais **fermée** pour l'instant (voir « Garmin ») |
| Support | Ordinateur et téléphone, pour le coach comme pour les athlètes |

Coût visé : environ 0 €/mois au départ, plus un nom de domaine (~10-15 €/an).
L'offre gratuite de Supabase suffit largement pour une dizaine d'athlètes.

## Versions prévues

Chaque version passe par une pull request et des tests automatiques.

### 0.1.0 : le socle (fait)

- Comptes coach et athlète. Le coach invite par un lien à usage unique, envoyé par SMS ou WhatsApp.
- Fiche athlète :
  - physiologie : FC max, FC repos, FC seuil, VMA ;
  - objectifs, blessures et reprise, disponibilités ;
  - notes privées du coach.
- Zones FC calculées automatiquement (% FC max, % FC de réserve ou % FC seuil). Le coach y associe les allures qu'il en déduit. L'historique est conservé.
- Site utilisable sur téléphone et ordinateur, installable sur l'écran d'accueil.

### 0.2.0 : la planification (fait)

- Calendrier à la semaine et au mois : par athlète, et en vue « tous mes athlètes ».
- Glisser-déposer, copie d'une séance, duplication d'une semaine.
- Constructeur de séances :
  - échauffement, blocs répétés (ex. 10 × 400 m), récupérations, retour au calme ;
  - cibles en zone FC ou en allure, durée ou distance ;
  - durée et distance totales estimées.
- Les cibles en zone se traduisent automatiquement en FC **et** en allure, d'après les zones de l'athlète.
- Bibliothèque de séances types.
- Courses et objectifs (priorité A/B/C) affichés dans le calendrier.
- Côté athlète : « Ta séance du jour » et la semaine à venir.
- En attendant l'accès Garmin : export de la séance en fichier `.FIT`, que l'athlète copie sur sa montre par câble USB.
- Sauvegarde quotidienne chiffrée de la base (voir « Points d'attention »).

### 0.3.0 : les échanges et les retours (fait)

- Fil de commentaires sur chaque séance, avec la mention « vu par le coach ».
- Messagerie coach ↔ athlète, mise à jour en temps réel.
- Séance faite : durée, distance, D+, ressenti (RPE de 1 à 10).
- Douleur : où, et avec quelle intensité. C'est important pour les reprises après blessure.
- E-mails : séance du lendemain pour l'athlète, nouveau retour ou message pour le coach.
- **Pilote** : le coach et 2 ou 3 athlètes, en parallèle de Nolio (voir [PILOTE.md](PILOTE.md)).

### 0.4.0 : Garmin

Étape préalable, **faite** (mise en route : [DEPLOIEMENT.md](DEPLOIEMENT.md), étape 8) : un **test perso**
avec le niveau Personal, sur le seul compte Garmin de Florian (voir « Garmin : le point bloquant ») :

- import de ses activités des 14 derniers jours (résumé JSON : durée, distance, D+, FC moyenne et max),
  rattachées à la séance prévue le même jour ; la lecture des fichiers `.FIT` (tours, courbes de FC,
  d'allure et d'altitude) est faite depuis la 0.5.0 ;
- affichage de ces données sous la séance, pour l'athlète et son coach, et pré-remplissage du retour ;
- import automatique toutes les 15 minutes (0.4.1), puisque ce niveau ne prévient pas à chaque synchronisation ;
- but : valider le rattachement aux séances et l'affichage, qui resteront
  valables au niveau Starter. La récupération des données sera à refaire, car le
  Starter envoie les données au site au lieu de les laisser lire à la demande ;
- l'envoi des séances sur la montre ne peut pas être testé à ce niveau.

À lancer dès que Garmin a donné son accord (voir ci-dessous) :

- connexion du compte Garmin de chaque athlète ;
- envoi automatique des séances planifiées vers Garmin Connect, puis vers la montre ;
- import automatique des activités réalisées (FC, allure, D+), rattachées à la séance prévue.

Le coach peut résilier Nolio à partir de cette version.

### 0.5.0 : le suivi

- **Fait** : page détaillée de chaque séance faite et de chaque sortie libre (chiffres de la montre, prévu / réalisé
  étape par étape, courbes, temps par zone, tours, tracé GPS), à partir du fichier `.FIT` de l'activité.

- Charge d'entraînement : durée × RPE (méthode de Foster), puis TRIMP à partir de la FC des activités Garmin.
- Volumes par semaine (km, heures, D+) et courbe forme/fatigue.
- Tableau de bord du coach avec des alertes : séance manquée, RPE anormal, douleur signalée, hausse brutale de la charge.

### 0.7.0 à 0.9.0 : la plateforme (fait)

- 0.7.0 : page d'accueil publique, pages légales, accord explicite, export et suppression du compte.
- 0.8.0 : inscription des coachs, offres selon le nombre d'athlètes (gratuit jusqu'à 3).
- 0.9.0 : deux modes de coaching par athlète, **strict** (jours imposés) et **souple** (fourchette de kilomètres et
  séances à placer dans la semaine par l'athlète).

### Ensuite

- Paiement en ligne des offres (Stripe), une fois la structure juridique créée.
- Applications Android et iOS : le même code, emballé avec Capacitor ; l'app iOS ouvre aussi l'accès à Apple Santé.
- Liaison directe avec les montres : Garmin d'abord (demande en cours), puis Polar, Suunto, COROS et Wahoo.

## Garmin : le point bloquant

Garmin a rouvert son programme développeur le 21 octobre 2026, avec trois niveaux.
Le contenu de chaque niveau a été vérifié le 8 novembre 2026 sur
[developer.garmin.com](https://developer.garmin.com/gc-developer-program/overview/) ;
les tarifs et plafonds viennent de la presse.

- **Personal** : limité à ses propres données, en **lecture seule** (activités en JSON
  et `.FIT`, santé). Pas de candidature : on récupère sa clé d'API personnelle et ses
  jetons depuis son compte sur connect.garmin.com. Pas d'API Training, donc pas d'envoi
  sur la montre. Il ne convient pas à un coach, mais il suffit pour le test perso de
  la 0.4.0. Les jetons vont dans les secrets Supabase, jamais dans le code.
- **Starter** : réservé aux entreprises. D'après la presse, il est gratuit et plafonné à environ 1 000 utilisateurs. Les données arrivent par envoi automatique de Garmin, sans l'historique. C'est le bon niveau pour Rob1Coach.
- **Enterprise** : payant, avec un tarif négocié.

L'envoi des séances sur la montre (Training API) n'est pas ouvert au niveau
Personal : il faut un compte **professionnel**. Il faut donc, dans l'ordre :

1. **Rouvrir une structure** : la micro-entreprise du coach (démarche en ligne), ou une autre entité légale qui exploite le site.
2. **Mettre le site en ligne** avec une page de confidentialité. Garmin les demande lors de la candidature.
3. **Candidater** au niveau Starter. Le délai de réponse est inconnu, d'où l'intérêt de s'y prendre dès maintenant.
4. Brancher les API (version 0.4.0).

D'ici là, il faut garder Nolio pour l'envoi sur montre, ou passer par l'export `.FIT` manuel de la version 0.2.0.

Strava est écarté : ses conditions d'utilisation interdisent, depuis novembre 2024, de
montrer les données d'un utilisateur à quelqu'un d'autre, coach compris.

## Points d'attention

- **RGPD** : la FC, les blessures et la douleur sont des données de santé. Elles imposent :
  - un hébergement dans l'UE (projet Supabase en région Europe) ;
  - un accès limité à l'athlète et à son coach (règles RLS, testées automatiquement) ;
  - fait en 0.7.0 : pages de confidentialité, de conditions et de mentions légales, accord explicite à l'inscription, export et suppression du compte par l'utilisateur, départ d'un coach.
- **Sauvegardes** : l'offre gratuite de Supabase n'en fait pas. Depuis la 0.2.0, une tâche GitHub fait une sauvegarde quotidienne chiffrée, gardée 30 jours. Elle reste à activer en ajoutant deux secrets (voir `docs/DEPLOIEMENT.md`, étape 5).
- **Reprise de l'existant** : vérifier ce que Nolio permet d'exporter (séances types, historique).
