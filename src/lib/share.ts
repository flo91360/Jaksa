/** Le navigateur sait-il ouvrir le menu de partage (SMS, WhatsApp…) ? */
export function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Ouvre le menu de partage ; faux si la personne l'a fermé ou si c'est impossible. */
export async function shareLink(url: string, text: string): Promise<boolean> {
  try {
    await navigator.share({ title: 'Jaksa', text, url })
    return true
  } catch {
    return false
  }
}
