# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commandes

- `npm run dev` — serveur de développement Vite (HMR)
- `npm run build` — build de production
- `npm run preview` — sert le build de production
- `npm run lint` — ESLint sur tout le projet

Aucun framework de test n'est configuré.

## Vue d'ensemble

Tableau de bord financier (SPA React 19 + Vite, JSX sans TypeScript) pour le **SARM** (Service Anesthésie Réanimation Millénaire), une structure de 8 associés à parts égales. L'interface est entièrement en français : CA, charges, salariés CDI, remplaçants IADE/MAR, rétrocessions, trésorerie, règles de virements.

## Architecture

- **Routing manuel sans router.** [src/App.jsx](src/App.jsx) gère la page courante via `useState` + un `switch` qui rend la page correspondante ; la navigation passe par `onNavigate` depuis [src/components/Sidebar.jsx](src/components/Sidebar.jsx). Il n'y a pas de routes URL. (`react-router-dom` est dans les dépendances mais n'est pas câblé — ne pas supposer qu'il est utilisé.)

- **Données = mock centralisé.** Toutes les données viennent de [src/data/mockData.js](src/data/mockData.js), codées en dur. Structure récurrente : un objet indexé par année (`2022/2023/2024`) → tableau de 12 valeurs mensuelles (ex. `CA[2024][0]` = janvier 2024). `MOIS_ACTUEL = 8` (septembre, index 0) sert de point de cumul « à ce jour ». Aucun fond réseau n'est branché — `@supabase/supabase-js` et `papaparse` sont déclarés mais inutilisés pour l'instant.

- **Helpers de calcul/format dans mockData.js**, à réutiliser plutôt que réimplémenter : `fmtEur`, `fmtK`, `sum`, `pct`, `diffLabel` (libellé « ↑ +X% vs année »), `diffColor` (avec `invert` pour les charges où une hausse est « mauvaise »).

- **Pattern de page.** Chaque page de [src/pages/](src/pages/) détient son propre état de période (`moisDe`/`moisA`/`year1`/`year2`/`shortcut`), le passe à [src/components/PeriodeFilter.jsx](src/components/PeriodeFilter.jsx), puis `slice(de, a+1)` les tableaux mensuels pour la plage choisie et compare `year1` vs `year2`. Les graphiques utilisent **recharts**, les KPI passent par [src/components/KpiCard.jsx](src/components/KpiCard.jsx).

- **Styling.** Inline styles + variables CSS (palette, rayons, `--sidebar-width`) définies dans `:root` de [src/index.css](src/index.css). Pas de framework CSS, pas de CSS Modules. Réutiliser les tokens `var(--color-*)` plutôt que des couleurs en dur (sauf dans les configs recharts qui utilisent déjà des hex littéraux comme `#534AB7`).

- Icônes : `lucide-react` disponible, mais la Sidebar utilise actuellement des glyphes Unicode inline.
