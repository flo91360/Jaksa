#!/usr/bin/env bash
# Applique les nouvelles migrations et déploie les fonctions Supabase.
# Lancé par .github/workflows/deploiement-supabase.yml à chaque fusion dans main.
# Explications : docs/DEPLOIEMENT.md, étape 4.
#
# Variables d'environnement :
#   SUPABASE_DB_URL        chaîne de connexion « Session pooler » (la même que pour la sauvegarde)
#   SUPABASE_ACCESS_TOKEN  jeton d'accès personnel Supabase (sbp_…), pour déployer les fonctions
#   SUPABASE_PROJECT_REF   facultatif : la ref du projet, sinon lue dans SUPABASE_DB_URL
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL manquant}"
cd "$(dirname "$0")/../.."

psql_q() { psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -At -c "$1"; }

# 1. Reprise de l'historique.
# Jusqu'à la 0.4.0, les migrations étaient collées à la main dans le SQL Editor : Supabase ne les a donc pas
# notées dans son historique (supabase_migrations.schema_migrations) et « db push » voudrait les rejouer.
# Pour chacune, si sa table principale existe déjà, on la marque comme appliquée sans l'exécuter.
# Les migrations suivantes sont toujours appliquées par cette tâche : la liste ne bouge plus.
declare -A TEMOIN=(
  [20261108120000]=public.profiles
  [20261109090000]=public.workouts
  [20261110090000]=public.workout_feedback
  [20261111090000]=public.garmin_activities
)
historique=""
if [ "$(psql_q "select to_regclass('supabase_migrations.schema_migrations') is not null")" = "t" ]; then
  historique=$(psql_q "select version from supabase_migrations.schema_migrations")
fi
a_reprendre=()
for version in $(printf '%s\n' "${!TEMOIN[@]}" | sort); do
  if grep -qx "$version" <<<"$historique"; then continue; fi
  if [ "$(psql_q "select to_regclass('${TEMOIN[$version]}') is not null")" = "t" ]; then
    a_reprendre+=("$version")
  fi
done
if [ ${#a_reprendre[@]} -gt 0 ]; then
  echo "Déjà appliquées à la main, notées dans l'historique sans être rejouées : ${a_reprendre[*]}"
  supabase migration repair --remote="$SUPABASE_DB_URL" --status applied --yes "${a_reprendre[@]}"
fi

# 2. Nouvelles migrations, dans l'ordre, une seule fois chacune.
supabase db push --remote="$SUPABASE_DB_URL" --yes

# 3. Fonctions (supabase/functions/*), compilées par Supabase (sans Docker).
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "::warning::Fonctions non déployées : ajouter le secret SUPABASE_ACCESS_TOKEN (docs/DEPLOIEMENT.md, étape 4)."
  exit 0
fi
ref="${SUPABASE_PROJECT_REF:-}"
if [ -z "$ref" ]; then
  # postgresql://postgres.<ref>:…@…pooler.supabase.com/… ou postgresql://postgres:…@db.<ref>.supabase.co/…
  ref=$(sed -nE 's#^postgres(ql)?://postgres\.([a-z0-9]+):.*#\2#p; s#.*@db\.([a-z0-9]+)\.supabase\.co.*#\1#p' <<<"$SUPABASE_DB_URL" | head -1)
fi
if [ -z "$ref" ]; then
  echo "::error::Impossible de lire la ref du projet dans SUPABASE_DB_URL : ajouter le secret SUPABASE_PROJECT_REF."
  exit 1
fi
supabase functions deploy --remote="$ref" --use-api --yes
