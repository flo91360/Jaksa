// Thème clair ou sombre appliqué avant le premier affichage.
// Même clé et mêmes valeurs que src/domain/theme.ts.
try {
  var t = localStorage.getItem('rob1coach-theme')
  var dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
} catch {
  // Stockage indisponible (navigation privée) : thème clair par défaut.
}
