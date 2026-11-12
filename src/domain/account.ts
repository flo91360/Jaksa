/** Compte : export des données et suppression (logique sans dépendance, testée). */

/** Mot à recopier pour confirmer la suppression du compte. */
export const DELETE_CONFIRMATION = 'SUPPRIMER'

/** Vrai si la saisie confirme la suppression (casse et espaces ignorés). */
export function confirmsDeletion(input: string): boolean {
  return input.trim().toUpperCase() === DELETE_CONFIRMATION
}

/** Nom du fichier d'export : rob1coach-lea-martin-2026-11-12.json */
export function exportFileName(fullName: string, date: string): string {
  const slug = fullName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `rob1coach-${slug || 'mes-donnees'}-${date}.json`
}

export type AccountExport = {
  /** Description du fichier, pour qui l'ouvre plus tard. */
  about: string
  exported_at: string
  app_version: string
  data: Record<string, unknown>
}

/** Contenu du fichier d'export : les tables telles quelles, avec de quoi comprendre d'où il vient. */
export function buildExport(data: Record<string, unknown>, now: Date, appVersion: string): AccountExport {
  return {
    about:
      'Export de vos données Rob1Coach. Durées en secondes, distances en mètres, allures en secondes par kilomètre, dates au format ISO 8601.',
    exported_at: now.toISOString(),
    app_version: appVersion,
    data,
  }
}

/** Les conditions acceptées sont-elles à jour ? (`undefined` : la base ne connaît pas encore la colonne.) */
export function needsTermsAcceptance(accepted: string | null | undefined, current: string): boolean {
  return accepted !== undefined && accepted !== current
}
