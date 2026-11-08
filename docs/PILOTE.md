# Pilote de la 0.3.0

But : utiliser Rob1Coach pour de vrai avec 2 ou 3 athlètes pendant 3 à 4 semaines, **en parallèle de Nolio**,
avant de basculer tout le monde (0.4.0, avec Garmin).

## Avant de commencer

- [ ] Migration `20261110090000_echanges.sql` appliquée (`docs/DEPLOIEMENT.md`, étape 4).
- [ ] E-mails activés (`docs/DEPLOIEMENT.md`, étape 7), puis un essai : l'athlète fait un retour, le coach reçoit l'e-mail dans les 10 minutes.
- [ ] Sauvegarde quotidienne activée (`docs/DEPLOIEMENT.md`, étape 5).
- [ ] Choisir 2 ou 3 athlètes : idéalement un sur route, un en trail, un en reprise après blessure.

## Pendant le pilote

- Le coach planifie dans Rob1Coach **et** dans Nolio (Nolio reste la référence pour l'envoi sur la montre ; sinon, export `.FIT`).
- Les athlètes pilotes font leur retour et échangent dans Rob1Coach seulement.
- Chaque semaine, noter dans une issue GitHub (ou envoyer à Claude) :
  - ce qui manque par rapport à Nolio ;
  - ce qui est plus lent ou moins clair ;
  - les bugs (capture d'écran + téléphone ou ordinateur).

## Critères pour passer à la suite

- Les athlètes font leur retour sans aide, depuis leur téléphone.
- Le coach lit tous les retours depuis le planning et la liste « À voir », sans rien rater.
- Les e-mails arrivent (et pas en double), sans être envahissants.
- Aucune fuite : un athlète ne voit jamais les données d'un autre (vérifié par les tests automatiques, à confirmer à l'usage).
