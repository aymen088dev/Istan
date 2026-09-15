# ⚽ ISTAN CREATOR

**Créateur de compositions football & hockey** — design pro, export PNG haute qualité, placement intelligent des joueurs et synchronisation multi-utilisateur sans base de données complexe.

Conçu pour tourner partout : en local, sur **Pterodactyl** (port `10089` par défaut) ou derrière n'importe quel hébergeur Node.js.

---

## 🚀 Démarrage rapide

```bash
pnpm install
pnpm run build          # typecheck + build de tous les packages
node start.js           # port 10089 par défaut (PORT/SERVER_PORT sinon)
```

Sur Pterodactyl : téléversez le projet, `node start.js`, c'est tout. Voir [PTERODACTYL.md](./PTERODACTYL.md).

---

## ✨ 8 features spéciales

### 1. 🧠 Best XI intelligent (deterministic + IA)
L'algorithme local optimise **poste naturel, côté gauche/droit, note OVR et gardien** ensemble, puis affine avec des échanges correctifs. L'IA Groq (optionnelle) ne fait que départager les égalités — jamais de placement absurde. **Garanties : chaque poste reçoit un joueur au poste exact ou compatible, un gardien ne quitte jamais le but, un joueur de champ n'y est jamais envoyé, et un poste sans joueur compatible est affiché « Libre »** au lieu d'être occupé par un faux joueur.

### 2. 📊 Analyse poste par poste de toutes les formations
Pour chaque effectif, l'app note les **~65 systèmes football + 22 systèmes hockey** : compatibilité moyenne, postes naturels exacts, adaptations, gardien prêt, recommandation de meilleure formation et alertes par poste. Export JSON complet en un clic.

### 3. 🎨 Personnalisation complète du maillot
8 styles de maillots dessinés en SVG (uni, bicolore, rayures, bandes, écharpe, diagonal, chevron, col), 4 couleurs personnalisables + presets de clubs réels (PSG, OM, Barça, Real…), couleurs gardien dédiées, drapeaux de nationalité (200+ pays + pays fictif **ISTANMUSTA**).

### 4. 🖼️ 18 terrains + fond personnalisé + tint overlay
12 pelouses football et 6 glaces hockey (standard, nuit, rétro, indoor, or, marine…), couleur de gazon personnalisée, image de fond importée, overlay coloré avec opacité réglable, logo d'équipe positionné, titre et score du match personnalisables.

### 5. 📲 UI mobile-first pensée pour le partage
Grille de contrôles rapides, panneau remplaçants en bottom-sheet, **menu club en bottom-sheet à 3 onglets** (Aperçu / Matchs / Effectif), **effectif en fenêtre plein écran** (plus aucun panneau invisible coincé sous la grille), safe-area iOS, navigation 3 onglets (Terrain / Options / Biblio). Export PNG haute résolution ×2 optimisé pour les bancs chargés.

### 6. 🏟️ Multi-utilisateur temps quasi-réel, zéro base complexe
Clubs, effectifs, compositions et **logos** partagés entre tous les visiteurs du serveur : JSON persistant (`data/lineup-shared.json`) ou PostgreSQL si `DATABASE_URL` est défini. Polling intelligent (5 s) avec détection de changement — aucun re-rendu inutile, aucun clignotement, aucun rechargement de page.

### 7. 🖼️ Stockage des logos sur le serveur
Les logos importés ne polluent plus les données en base64 : ils sont stockés dans **`data/uploads/`** (PNG/JPG/WEBP/GIF/SVG, 3 Mo max) et servis via `/api/uploads/<fichier>` avec cache immuable. Payloads légers, synchronisation rapide, compatible stockage persistant Pterodactyl.

### 8. ✍️ Génération d'effectifs par IA (Groq)
Collez un texte brut (liste de joueurs, page Wikipédia…) → effectif structuré complet. Ou générez par critères : nombre, âge min/max, OVR min/max, nationalité, postes — avec **répartition en % des nationalités** (ex. 40% BR, 30% FR, le reste prend la nationalité par défaut). Les joueurs générés restent modifiables et s'ajoutent à l'effectif du club.

---

## 🆕 Menu club — redesign complet (8 nouveautés)

1. **Recherche instantanée** — trouve un club en tapant son nom, bouton d'effacement rapide.
2. **Tri intelligent** — par GEN moyen, par nom ou par taille d'effectif, plus filtre Clubs / Sélections.
3. **Favoris synchronisés** — étoile un club : l'état est persisté sur le serveur et partagé avec tout le monde.
4. **Aperçu du Meilleur XI sur mini-terrain** — la meilleure formation est détectée automatiquement parmi tous les systèmes, avec les joueurs, leur % de compatibilité et le bilan postes naturels. Mêmes règles que le placement réel.
5. **Distribution par poste** — barres GB / DEF / MIL / ATT calculées par le référentiel de postes, avec filtres cliquables dans l'onglet Effectif.
6. **Feuille de match & trophées** — enregistre les résultats (adversaire, score), bilan V-N-D, buts pour/contre, historique daté supprimable, persisté côté serveur.
7. **Duplication de club** — copie complète d'un club (couleurs, maillot, effectif) sans l'historique de matchs, en un clic.
8. **Export CSV de l'effectif** — fichier Excel/LibreOffice compatible (UTF-8 BOM, séparateur `;`) avec nom, poste, numéro, âge, OVR et nationalité.

Le menu s'ouvre en cliquant sur un club : hero dégradé aux couleurs du club, 3 onglets (Aperçu / Matchs / Effectif), et l'**effectif complet s'ouvre en fenêtre plein écran** — le bug d'affichage sous la grille est réglé.

---

## 🗂️ Structure

```
artifacts/
  lineup-creator/     # Frontend React + Vite + Tailwind + shadcn/ui
  api-server/         # API Express 5 (IA, clubs, compositions, uploads)
lib/
  api-spec/           # OpenAPI + génération orval
  api-client-react/   # Client API React généré
  api-zod/            # Schémas Zod générés
  db/                 # Schéma Drizzle (PostgreSQL optionnel)
scripts/              # Utilitaires
start.js              # Lanceur Pterodactyl/production (port 10089)
```

## 🛠️ Commandes

| Commande | Description |
|---|---|
| `pnpm run typecheck` | Typecheck complet du workspace |
| `pnpm run build` | Typecheck + build de tous les packages |
| `pnpm --filter @workspace/api-server run dev` | API en local |
| `pnpm --filter @workspace/lineup-creator run dev` | Frontend Vite en local |

## 🔑 Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` / `SERVER_PORT` / `PTERODACTYL_PORT` | Port public | `10089` |
| `DATABASE_URL` | PostgreSQL (optionnel) | JSON à plat |
| `GROQ_API_KEY` ou `token.json` | IA génération (optionnel) | — |
| `SHARED_DATA_FILE` | Emplacement du JSON partagé | `data/lineup-shared.json` |
| `UPLOADS_DIR` | Dossier des logos | `data/uploads/` |

## 📄 Licence

MIT
