import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Version affichée dans le site et jointe au journal des erreurs.
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '') },
  build: {
    rolldownOptions: {
      output: {
        // Bibliothèques dans des fichiers séparés : mieux mis en cache entre deux versions.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'vendor', test: /node_modules/ },
          ],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    // Les tests de base de données démarrent un PostgreSQL complet (PGlite) par fichier.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
