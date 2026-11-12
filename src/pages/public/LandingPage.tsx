import type { ReactNode } from 'react'
import { PlanTile } from '../../components/PlanCard.tsx'
import { ButtonLink, PublicLayout } from '../../components/PublicLayout.tsx'
import { COACHING_MODES } from '../../domain/flexible.ts'
import { LISTED_PLANS } from '../../domain/plans.ts'
import { SITE } from '../../lib/site.ts'

const FEATURES: { title: string; text: string; icon: string }[] = [
  {
    title: 'Planifier',
    text: 'Un calendrier à la semaine ou au mois, pour un athlète ou pour tous. Les séances se construisent en blocs (échauffement, répétitions, récupérations) et se glissent d’un jour à l’autre.',
    icon: 'M4 7h16M4 7v12h16V7M4 7V5h16v2M8 3v4m8-4v4m-8 6h3',
  },
  {
    title: 'Des cibles qui s’adaptent',
    text: 'Le coach prescrit en zones. Chaque athlète voit la fréquence cardiaque et l’allure qui lui correspondent, et exporte la séance vers sa montre.',
    icon: 'M3 12h4l2-6 4 12 2-6h6',
  },
  {
    title: 'Suivre',
    text: 'Après la séance : durée, distance, ressenti, douleurs. Avec la montre : courbes, tours, temps par zone, et le réalisé comparé au prévu, étape par étape.',
    icon: 'M5 19V9m7 10V5m7 14v-7',
  },
  {
    title: 'Échanger',
    text: 'Un fil de commentaires sous chaque séance, une messagerie en temps réel et des e-mails regroupés, sans jamais y mettre de données de santé.',
    icon: 'M4 5h16v11H8l-4 4V5Zm4 5h8M8 13h5',
  },
]

const TRUST: { title: string; text: string }[] = [
  {
    title: 'Hébergé dans l’Union européenne',
    text: 'La fréquence cardiaque, les blessures et les douleurs sont des données de santé : elles restent en Europe.',
  },
  {
    title: 'Visible par l’athlète et son coach, personne d’autre',
    text: 'La règle est appliquée par la base de données elle-même et vérifiée par des tests automatiques à chaque version.',
  },
  {
    title: 'Ni publicité, ni revente, ni mesure d’audience',
    text: 'Aucun cookie publicitaire. Chacun peut télécharger ses données ou supprimer son compte en deux clics.',
  },
]

/** Aperçu d'une semaine, dessiné en HTML : suit le thème clair ou sombre, sans image à charger. */
const WEEK: { day: string; title: string; detail: string; tone: string; done?: boolean }[] = [
  { day: 'lun.', title: 'Footing 45 min', detail: 'Zone 2 · 5:40 – 6:10 /km', tone: 'border-l-emerald-500', done: true },
  { day: 'mar.', title: 'Renfo gainage', detail: '30 min', tone: 'border-l-violet-500', done: true },
  { day: 'mer.', title: '10 × 400 m', detail: 'Zone 5 · récup 1 min', tone: 'border-l-emerald-500' },
  { day: 'jeu.', title: 'Repos', detail: '', tone: 'border-l-slate-400' },
  { day: 'sam.', title: 'Sortie longue trail', detail: '2 h · 600 m D+', tone: 'border-l-amber-500' },
]

function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="py-10">
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
      {intro && <p className="mt-2 max-w-2xl text-slate-600">{intro}</p>}
      <div className="mt-6">{children}</div>
    </section>
  )
}

/** Accueil public : ce que fait le site, pour qui, et ce qu'il fait des données. */
export function LandingPage() {
  return (
    <PublicLayout>
      <section className="grid items-center gap-10 py-6 lg:grid-cols-[1.1fr_1fr] lg:py-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            L’entraînement de tes coureurs, du plan à la montre.
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            {SITE.name} réunit le coach et ses athlètes : les séances planifiées, les zones de chacun, les retours
            après l’effort et les échanges, sur téléphone comme sur ordinateur.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink to="/inscription">Créer mon espace coach</ButtonLink>
            <ButtonLink to="/connexion" variant="secondary">
              Se connecter
            </ButtonLink>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Gratuit jusqu’à 3 athlètes, sans carte bancaire. Tu es athlète ? Ton coach t’envoie un lien d’invitation
            personnel : ton compte se crée en un clic.
          </p>
        </div>

        <div aria-hidden="true" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-slate-900">Ta semaine</p>
          <ul className="space-y-2">
            {WEEK.map((item) => (
              <li key={item.day} className="flex items-center gap-3">
                <span className="w-9 shrink-0 text-xs font-semibold text-slate-500">{item.day}</span>
                <span className={`min-w-0 flex-1 rounded-xl border border-l-4 border-slate-200 px-3 py-2 ${item.tone}`}>
                  <span className="block truncate text-sm font-medium text-slate-900">{item.title}</span>
                  {item.detail && <span className="block truncate text-xs text-slate-500">{item.detail}</span>}
                </span>
                <span className={`w-12 shrink-0 text-right text-xs font-semibold ${item.done ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {item.done ? '✓ faite' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Section title="Tout le suivi au même endroit">
        <ul className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={feature.icon} />
                </svg>
              </span>
              <h3 className="mt-3 font-semibold text-slate-900">{feature.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{feature.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Deux façons de coacher"
        intro="Chaque athlète a son mode, que le coach choisit et change quand il veut."
      >
        <ul className="grid gap-4 md:grid-cols-2">
          <li className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-900">{COACHING_MODES.strict.label}</h3>
            <p className="mt-1 text-sm text-slate-600">{COACHING_MODES.strict.summary}</p>
          </li>
          <li className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-900">{COACHING_MODES.flexible.label}</h3>
            <p className="mt-1 text-sm text-slate-600">{COACHING_MODES.flexible.summary}</p>
            <div aria-hidden="true" className="mt-4 rounded-xl bg-slate-50 p-3">
              <p className="text-sm text-slate-600">
                <strong className="text-lg font-bold text-slate-900">26 km</strong> courus sur 35 à 45 km
              </p>
              <div className="relative mt-2 h-2.5 rounded-full bg-slate-200">
                <div className="absolute inset-y-0 left-[68%] w-[19%] rounded-sm bg-emerald-200" />
                <div className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-emerald-600" />
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-800">Il te reste entre 9 et 19 km à courir.</p>
              <p className="mt-1 text-xs text-slate-500">Séances : 1 faite, 1 à faire</p>
            </div>
          </li>
        </ul>
      </Section>

      <Section
        title="Montres connectées"
        intro="Chaque séance s’exporte au format .FIT pour la montre. La liaison directe avec Garmin Connect (envoi des séances, import des activités) est en cours de demande auprès de Garmin ; les autres marques suivront."
      >
        <p className="text-sm text-slate-500">
          La liaison est toujours facultative : elle se fait sur la page d’autorisation de la marque et se retire à
          tout moment.
        </p>
      </Section>

      <Section
        title="Des offres à la taille de ton groupe"
        intro="Toutes les fonctions sont dans toutes les offres : seul le nombre d’athlètes suivis change. C’est gratuit pour les athlètes, toujours, et un athlète archivé ne compte pas."
      >
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LISTED_PLANS.map((plan) => (
            <PlanTile key={plan.code} plan={plan} highlighted={plan.monthlyPrice === 0} />
          ))}
        </ul>
        <div className="mt-6">
          <ButtonLink to="/inscription">Commencer gratuitement</ButtonLink>
        </div>
      </Section>

      <Section title="Tes données restent les tiennes">
        <ul className="grid gap-4 md:grid-cols-3">
          {TRUST.map((item) => (
            <li key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{item.text}</p>
            </li>
          ))}
        </ul>
      </Section>
    </PublicLayout>
  )
}
