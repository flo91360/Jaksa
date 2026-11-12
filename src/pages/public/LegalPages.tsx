import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { PublicLayout } from '../../components/PublicLayout.tsx'
import { SITE, TERMS_VERSION, formatTermsVersion } from '../../lib/site.ts'

/** Mise en forme des textes longs (titres, paragraphes, listes) sans classe sur chaque élément. */
function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PublicLayout width="max-w-3xl">
      <article className="space-y-4 text-[15px] leading-relaxed text-slate-700 [&_a]:font-medium [&_a]:text-emerald-800 [&_a]:underline [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">Dernière mise à jour : {formatTermsVersion(TERMS_VERSION)}</p>
        </header>
        {children}
      </article>
    </PublicLayout>
  )
}

/** Adresse de contact, ou la marche à suivre tant qu'elle n'est pas publiée. */
function Contact() {
  if (SITE.contactEmail) return <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
  return <>la messagerie du site (ou votre coach, qui transmettra)</>
}

function Publisher() {
  const { name, legalForm, address, siret } = SITE.publisher
  if (!name) {
    return (
      <>
        {SITE.name} est en phase pilote : les coordonnées complètes de la structure qui l’exploite seront publiées
        sur la page <Link to="/mentions-legales">Mentions légales</Link> dès son immatriculation.
      </>
    )
  }
  return <>{[name, legalForm, address, siret && `SIRET ${siret}`].filter(Boolean).join(', ')}.</>
}

export function PrivacyPage() {
  return (
    <LegalPage title="Politique de confidentialité">
      <p>
        {SITE.name} permet à un coach de course à pied de planifier les séances de ses athlètes et de suivre leurs
        entraînements. Cette page explique quelles données nous collectons, pourquoi, qui peut les voir et comment
        exercer vos droits.
      </p>

      <h2>Qui est responsable de vos données</h2>
      <p>
        <Publisher />
      </p>
      <p>
        Contact pour toute question sur vos données : <Contact />.
      </p>

      <h2>Les données que nous collectons</h2>
      <ul>
        <li>
          <strong>Votre compte</strong> : nom, adresse e-mail, mot de passe (enregistré sous forme chiffrée, jamais
          lisible) et rôle (coach ou athlète).
        </li>
        <li>
          <strong>Votre fiche d’athlète</strong> : objectifs, disponibilités, blessures, données physiologiques
          (fréquence cardiaque, allures) et zones d’entraînement.
        </li>
        <li>
          <strong>Votre entraînement</strong> : séances prévues, courses et objectifs, retours de séance (séance faite
          ou non, durée, distance, dénivelé, effort ressenti, douleurs), commentaires et messages échangés avec votre
          coach.
        </li>
        <li>
          <strong>Les données de votre montre</strong>, si vous reliez votre compte Garmin Connect (ou, plus tard, celui
          d’une autre marque) : pour chaque activité, la date, le sport, la durée, la distance, le dénivelé, la
          fréquence cardiaque moyenne et maximale, et le détail enregistré par la montre (courbes de fréquence
          cardiaque, de vitesse, d’altitude, de cadence et de puissance, tracé GPS, tours).
        </li>
        <li>
          <strong>Les erreurs techniques</strong> : si une page plante, le message d’erreur, la page concernée et le
          type de navigateur sont enregistrés pendant 30 jours pour nous permettre de corriger le problème.
        </li>
      </ul>
      <p>
        Certaines de ces données (fréquence cardiaque, blessures, douleurs) sont des <strong>données de santé</strong>.
        Nous ne les traitons qu’avec votre accord explicite, donné quand vous créez votre compte et quand vous reliez
        votre montre. Vous pouvez le retirer à tout moment (voir « Vos droits »).
      </p>

      <h2>Pourquoi nous les utilisons</h2>
      <p>Uniquement pour que votre coach puisse préparer vos séances et suivre vos entraînements :</p>
      <ul>
        <li>afficher vos séances et vos zones ;</li>
        <li>envoyer les séances préparées par votre coach sur votre montre ;</li>
        <li>importer vos activités et les rattacher à la séance prévue ;</li>
        <li>permettre les échanges avec votre coach ;</li>
        <li>
          vous envoyer des e-mails de rappel et de notification (vous pouvez les couper dans « Mon compte »).
        </li>
      </ul>
      <p>
        Nous ne vendons pas vos données, nous ne faisons pas de publicité, nous ne mesurons pas votre navigation et
        nous n’utilisons aucun outil d’intelligence artificielle sur vos données.
      </p>
      <p>
        Base légale : l’exécution des <Link to="/conditions">conditions d’utilisation</Link> pour le fonctionnement du
        service, et votre consentement explicite pour les données de santé.
      </p>

      <h2>Qui peut les voir</h2>
      <p>
        Seuls vous et votre coach. Un athlète ne voit jamais les données d’un autre athlète, et un coach ne voit que
        les athlètes qui l’ont rejoint. Les notes privées d’un coach ne sont visibles que par lui. Ces règles sont
        appliquées par la base de données elle-même et vérifiées par des tests automatiques. Les personnes qui
        assurent la maintenance technique du site n’accèdent aux données que si c’est nécessaire pour résoudre un
        incident.
      </p>

      <h2>Où sont-elles stockées</h2>
      <p>Nous faisons appel à des prestataires techniques, qui ne traitent vos données que pour notre compte :</p>
      <ul>
        {SITE.processors.map((processor) => (
          <li key={processor.name}>
            <strong>{processor.name}</strong> : {processor.role} ({processor.location}).
          </li>
        ))}
      </ul>

      <h2>Garmin et les autres marques de montres</h2>
      <p>
        Si vous reliez votre compte Garmin Connect, vous autorisez {SITE.name}, depuis la page d’autorisation de
        Garmin, à recevoir vos activités et à envoyer des séances sur votre montre. Garmin transmet vos nouvelles
        activités à chaque synchronisation de votre montre. Le même principe s’appliquera à chaque marque proposée
        par la suite : rien n’est relié sans votre accord, donné sur la page d’autorisation de la marque.
      </p>
      <p>
        Vous pouvez retirer cette autorisation à tout moment, depuis {SITE.name} ou depuis les réglages de Garmin
        Connect. Nous cessons alors immédiatement de recevoir vos données et d’envoyer des séances. Les activités déjà
        importées restent visibles par vous et votre coach, sauf si vous demandez leur suppression.
      </p>
      <p>
        Les données reçues de Garmin ne sont jamais vendues, ni partagées avec qui que ce soit d’autre que votre
        coach. L’utilisation de vos données par Garmin est régie par la politique de confidentialité de Garmin.
      </p>

      <h2>Combien de temps nous les gardons</h2>
      <p>
        Tant que votre compte existe. Quand vous supprimez votre compte, vos données sont effacées immédiatement de
        la base, puis des sauvegardes sous 30 jours.
      </p>

      <h2>Vos droits</h2>
      <p>Vous pouvez à tout moment :</p>
      <ul>
        <li>consulter et corriger vos données, dans votre espace ;</li>
        <li>
          <strong>télécharger</strong> toutes vos données dans un fichier (« Mon compte » → « Mes données ») ;
        </li>
        <li>
          <strong>quitter votre coach</strong> : il ne voit alors plus rien de vous (« Mon compte ») ;
        </li>
        <li>
          <strong>supprimer votre compte</strong> et toutes vos données (« Mon compte ») ;
        </li>
        <li>
          nous écrire pour toute autre demande : <Contact />. Nous répondons sous un mois.
        </li>
      </ul>
      <p>
        Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL (
        <a href="https://www.cnil.fr" rel="noreferrer">
          www.cnil.fr
        </a>
        ).
      </p>

      <h2>Âge minimum</h2>
      <p>
        {SITE.name} s’adresse aux personnes de 15 ans et plus. En dessous de cet âge, l’accord d’un parent est
        nécessaire.
      </p>

      <h2>Cookies</h2>
      <p>
        {SITE.name} n’utilise aucun cookie publicitaire ni de mesure d’audience. Le site garde seulement votre session
        et votre choix de thème (clair ou sombre) dans votre navigateur.
      </p>
    </LegalPage>
  )
}

export function TermsPage() {
  return (
    <LegalPage title="Conditions d’utilisation">
      <p>
        Ces conditions encadrent l’utilisation de {SITE.name} par les coachs et par leurs athlètes. Créer un compte
        vaut acceptation de ces conditions et de la{' '}
        <Link to="/confidentialite">politique de confidentialité</Link>.
      </p>

      <h2>Le service</h2>
      <p>
        {SITE.name} est un outil de planification et de suivi de l’entraînement en course à pied. Le coach y prépare
        les séances de ses athlètes ; l’athlète y retrouve ses séances, fait ses retours et échange avec son coach.
      </p>

      <h2>Les comptes</h2>
      <ul>
        <li>Un coach crée son espace sur le site. Un athlète rejoint un coach grâce au lien d’invitation personnel que celui-ci lui envoie.</li>
        <li>
          Chacun est responsable de la confidentialité de son mot de passe et des informations qu’il saisit. Les
          informations fournies doivent être exactes.
        </li>
        <li>Un compte est personnel : il ne se prête pas et ne se partage pas.</li>
      </ul>

      <h2>Le rôle du coach</h2>
      <ul>
        <li>
          Le coach est seul responsable du contenu de l’entraînement qu’il propose et de son adaptation à chaque
          athlète.
        </li>
        <li>
          Il n’invite que des personnes qu’il entraîne réellement, et n’utilise leurs données que pour les entraîner.
          Il ne les copie pas hors du site sans leur accord.
        </li>
        <li>Il respecte la confidentialité des informations de santé que ses athlètes lui confient.</li>
      </ul>

      <h2>Santé</h2>
      <p>
        {SITE.name} n’est pas un dispositif médical et ne donne aucun avis médical. Les zones, allures et charges
        affichées sont des aides à l’entraînement. En cas de douleur, de blessure ou de doute sur votre état de santé,
        consultez un professionnel de santé. La pratique de la course à pied se fait sous la responsabilité de chacun.
      </p>

      <h2>Bon usage</h2>
      <p>
        Il est interdit de tenter d’accéder aux données d’autrui, de perturber le fonctionnement du site, d’y déposer
        des contenus illicites ou de s’en servir à d’autres fins que l’entraînement sportif. Un compte qui ne respecte
        pas ces règles peut être suspendu.
      </p>

      <h2>Montres connectées</h2>
      <p>
        La liaison avec une marque de montre (Garmin Connect, par exemple) est facultative et se fait sur la page
        d’autorisation de la marque. Elle peut être retirée à tout moment. Les marques citées appartiennent à leurs
        propriétaires respectifs ; {SITE.name} n’est ni affilié à ces marques, ni approuvé par elles.
      </p>

      <h2>Tarifs</h2>
      <p>
        L’utilisation de {SITE.name} est gratuite pour les athlètes, toujours. Pour les coachs, l’offre Découverte
        est gratuite, sans limite de durée, jusqu’à 3 athlètes actifs ; les offres suivantes accueillent plus
        d’athlètes. Leur tarif est annoncé à l’avance sur le site, et aucune offre payante ne s’applique sans l’accord
        du coach concerné. Un athlète archivé ne compte pas.
      </p>

      <h2>Disponibilité</h2>
      <p>
        Nous faisons de notre mieux pour que le site soit disponible et que les données soient sauvegardées chaque
        jour, sans pouvoir garantir une disponibilité permanente. Des interruptions pour maintenance sont possibles.
      </p>

      <h2>Vos contenus et vos données</h2>
      <p>
        Vous restez propriétaire de ce que vous saisissez (séances, retours, messages). Vous pouvez à tout moment
        télécharger vos données ou supprimer votre compte depuis « Mon compte ». Un coach qui supprime son compte
        supprime aussi les séances qu’il a planifiées.
      </p>

      <h2>Responsabilité</h2>
      <p>
        {SITE.name} fournit un outil ; il ne se substitue ni au jugement du coach, ni à celui de l’athlète, ni à un
        avis médical. Sa responsabilité ne saurait être engagée pour les conséquences d’un entraînement, ni pour une
        indisponibilité temporaire du service.
      </p>

      <h2>Évolution des conditions</h2>
      <p>
        Ces conditions peuvent évoluer. En cas de changement important, votre accord vous est redemandé à votre
        prochaine visite.
      </p>

      <h2>Droit applicable</h2>
      <p>Ces conditions sont soumises au droit français.</p>

      <h2>Contact</h2>
      <p>
        Pour toute question : <Contact />.
      </p>
    </LegalPage>
  )
}

export function LegalNoticePage() {
  const { name, legalForm, address, siret, director } = SITE.publisher
  const host = SITE.processors.find((processor) => processor.name === 'Cloudflare')
  const database = SITE.processors.find((processor) => processor.name === 'Supabase')
  return (
    <LegalPage title="Mentions légales">
      <h2>Éditeur du site</h2>
      {name ? (
        <ul>
          <li>
            {name}
            {legalForm && `, ${legalForm}`}
          </li>
          {address && <li>Adresse : {address}</li>}
          {siret && <li>SIRET : {siret}</li>}
          {director && <li>Responsable de la publication : {director}</li>}
          {SITE.contactEmail && (
            <li>
              Contact : <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
            </li>
          )}
        </ul>
      ) : (
        <p>
          {SITE.name} est en phase pilote, avec un nombre limité de coachs et d’athlètes invités. Les coordonnées
          complètes de la structure qui l’exploite (dénomination, adresse, numéro d’immatriculation, responsable de la
          publication) seront publiées ici dès son immatriculation. D’ici là, toute demande peut être adressée par{' '}
          <Contact />.
        </p>
      )}

      <h2>Hébergement</h2>
      <ul>
        {host && (
          <li>
            Pages du site : {host.address}.
          </li>
        )}
        {database && (
          <li>
            Base de données et comptes : {database.address}. Les données sont hébergées dans l’Union européenne.
          </li>
        )}
      </ul>

      <h2>Propriété intellectuelle</h2>
      <p>
        Le site, son nom et son logo sont protégés. Les séances, retours et messages appartiennent à leurs auteurs.
        Garmin et Garmin Connect sont des marques de Garmin Ltd. ou de ses filiales ; les autres marques citées
        appartiennent à leurs propriétaires respectifs.
      </p>

      <h2>Données personnelles</h2>
      <p>
        Voir la <Link to="/confidentialite">politique de confidentialité</Link> et les{' '}
        <Link to="/conditions">conditions d’utilisation</Link>.
      </p>
    </LegalPage>
  )
}
