import { describe, expect, it } from 'vitest'
import { buildExport, confirmsDeletion, exportFileName, needsTermsAcceptance } from './account.ts'

describe('confirmsDeletion', () => {
  it('accepte le mot attendu, sans tenir compte de la casse ni des espaces', () => {
    expect(confirmsDeletion('SUPPRIMER')).toBe(true)
    expect(confirmsDeletion('  supprimer ')).toBe(true)
  })

  it('refuse tout le reste', () => {
    expect(confirmsDeletion('')).toBe(false)
    expect(confirmsDeletion('SUPPRIME')).toBe(false)
    expect(confirmsDeletion('oui')).toBe(false)
  })
})

describe('exportFileName', () => {
  it('donne un nom de fichier sans accent ni espace', () => {
    expect(exportFileName('Léa Martin-Dupré', '2026-11-12')).toBe('rob1coach-lea-martin-dupre-2026-11-12.json')
  })

  it('reste lisible sans nom', () => {
    expect(exportFileName('  ', '2026-11-12')).toBe('rob1coach-mes-donnees-2026-11-12.json')
  })
})

describe('buildExport', () => {
  it('date le fichier et garde les tables telles quelles', () => {
    const file = buildExport({ profil: { full_name: 'Léa' }, seances: [] }, new Date('2026-11-12T08:00:00Z'), '0.7.0')
    expect(file.exported_at).toBe('2026-11-12T08:00:00.000Z')
    expect(file.app_version).toBe('0.7.0')
    expect(file.data).toEqual({ profil: { full_name: 'Léa' }, seances: [] })
    expect(file.about).toContain('Rob1Coach')
  })
})

describe('needsTermsAcceptance', () => {
  it("redemande l'accord quand il manque ou date d'une version précédente", () => {
    expect(needsTermsAcceptance(null, '2026-11-12')).toBe(true)
    expect(needsTermsAcceptance('2026-01-01', '2026-11-12')).toBe(true)
  })

  it("ne demande rien quand l'accord est à jour, ni tant que la base ne connaît pas la colonne", () => {
    expect(needsTermsAcceptance('2026-11-12', '2026-11-12')).toBe(false)
    expect(needsTermsAcceptance(undefined, '2026-11-12')).toBe(false)
  })
})
