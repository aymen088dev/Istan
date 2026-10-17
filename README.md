# ISTAN Projects

Portail modulaire qui rassemble **ISTAN CREATOR**, la webmap Minecraft MipMap, le **Discord Publisher** et les projets ajoutés à `projects.json` derrière un seul serveur Node.js et une seule allocation publique (`10005` par défaut, ou le `PORT` fourni par l'hébergeur). Le plugin Endstone MipMap adapté se trouve dans `artifacts/endstone-mipmap/`.

---

## 🚀 Démarrage rapide

```bash
pnpm install
pnpm run build          # typecheck + build de tous les packages
node start.js           # port 10005 par défaut (PORT/SERVER_PORT sinon)
```

Sur Pterodactyl : téléversez le projet, allouez le port public correspondant à `PORT`, puis lancez `node start.js`. Voir [PTERODACTYL.md](./PTERODACTYL.md).

## Ajouter un projet au portail

Un projet = **une seule entrée** dans `projects.json`. `start.js` et la page
d'accueil en déduisent tout le reste (carte, routes statiques, redirections,
montage d'API) : aucun code à modifier.

```jsonc
{
  "id": "mon-projet",              // identifiant unique
  "title": "Mon projet",           // titre affiché
  "category": "Catégorie courte",  // surtitre de la carte
  "description": "À quoi ça sert", // texte de la carte
  "href": "/mon-projet/",          // cible du bouton « Ouvrir »
  "icon": "🚀",                    // emoji de la carte
  "accent": "green",               // "green" ou "cyan"
  "static": [                      // fichiers statiques servis sous un préfixe
    { "prefix": "/mon-projet", "root": "artifacts/mon-projet/dist", "fallback": true }
  ],
  "redirects": [                   // alias d'URL optionnels
    { "paths": ["/mon-projet"], "location": "/mon-projet.html" }
  ],
  "api": {                         // API optionnelle (proxy interne)
    "prefix": "/api/mon-projet/",
    "portEnv": "MON_PROJET_PORT"   // ou "port": 4000 (défaut : API_PORT)
  }
}
```

Le bloc `portal` du même fichier habille la page d'accueil (`name`,
`nameAccent`, `tagline`, `title`, `eyebrow`, `heroTitle`, `heroAccent`,
`heroLead`, `note`, `footer`). Le préfixe d'API le plus long gagne :
`/api/map/…` part vers la carte, `/api/…` vers le backend du CREATOR.
`start.js` n'a besoin d'être modifié que pour un protocole de routage inédit.

---

## ✨ 8 features spéciales

### 1. 🧠 Best XI intelligent (deterministic + IA)
L'algorithme local optimise **poste naturel, côté gauche/droit, note OVR et gardien** ensemble, puis affine avec des échanges correctifs. L'IA Groq (optionnelle) ne fait que départager les égalités — jamais de placement absurde. **Garanties : chaque poste reçoit un joueur au poste exact ou compatible, un gardien ne quitte jamais le but, un joueur de champ n'y est jamais envoyé, les remplaçants disponibles comblent les postes de champ restants sur la ligne la plus proche de leur poste (côté gauche/droite respecté), et un poste sans candidat viable est affiché « Libre »** au lieu d'être occupé par un faux joueur. Les logos sont rendus via `background-size: contain` — jamais recadrés, y compris à l'export PNG.

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

## 🎨 16 thèmes d'apparence (onglet Options → Thème)

Un onglet **Thème** dans Options permet de choisir parmi 16 ambiances, appliquées instantanément à **tout le site** (header, onglets, cadres, boutons, dialogs, halos) et mémorisées sur l'appareil :

1. **Émeraude Néon** — violet → bleu → vert (thème signature)
2. **Océan Profond** — bleus marins et cyans glacés
3. **Soleil Couchant** — orange brûlé et rose crépusculaire
4. **Pourpre Royal** — violet impérial rehaussé d'or
5. **Forêt Sombre** — verts profonds et citronnelle
6. **Minuit Glacé** — ardoise froide et bleu cristal
7. **Lave Ardente** — rouge braise sur basalte noir
8. **Aurore Boréale** — vert laiteux, cyan et violet du Grand Nord
9. **Tokyo Néon** — nuits cyberpunk, rose électrique et cyan
10. **Désert Doré** — sables chauds, ambre et cuir vieilli
11. **Iceberg Polaire** — blancs bleutés et glace éternelle
12. **Matrix** — pluie de code verte sur terminal noir
13. **Barbe à Papa** — roses sucrées et violets pastels
14. **Retro 90** — courts de tennis vintage, teal et corail
15. **Nuit de Stade** — projecteurs blancs sur pelouse nocturne
16. **Ballon d'Or** — or massif, noir laqué et prestige

---

## 🃏 Outils & Simulateur (Options → Général)

1. **⚽ Simulateur de match** — Mon XI contre les remplaçants ou une équipe générée au niveau équivalent. Score **déterministe** (même compo = même résultat), chronologie des buts minute par minute, buteurs pondérés par la note, MVP, possession, tirs et passes réussies.
2. **🔀 Équipes équilibrées** — répartit le terrain en deux équipes de force égale (tirage « serpent » par note), moyennes affichées.
3. **🎯 Replacer en formation** — remet chaque joueur exactement sur son slot de formation après des déplacements libres.
4. **📸 Snapshots de compo** — sauvegarde l'état complet du terrain (formation, joueurs, banc, couleurs) en un clic, restaure en un clic — pratique avant d'essayer un Best XI. 12 snapshots maximum, raccourci « Snap » dans la barre rapide mobile.
5. **💾 Sauvegarde complète JSON** — exporte tout (clubs, effectifs, compositions, bibliothèque joueurs, snapshots) dans un fichier téléchargeable, et le restaure avec fusion intelligente (par identifiant, sans doublon) — idéal pour migrer de serveur Pterodactyl.

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

## 💬 Discord Publisher

Le projet **Discord Publisher** (`/publisher/`) réunit un studio de publication et un espace de modération RP : profils d'identité (avatar, catégorie, rôle, badge vérifié), salons cibles (webhooks), composition de messages markdown avec jusqu'à 4 images, flux en direct du salon, mutes et bans journalisés.

- **Interface** : `artifacts/discord-publisher/public/`, servie par le portail sur `/publisher/`.
- **API** : `/api/profiles`, `/api/webhooks`, `/api/categories`, `/api/publish`, `/api/moderation`, `/api/discord/messages` (routes `publisher.ts` et `discord.ts` de l'API Express).
- **Bot de relais** : `artifacts/discord-publisher/bot.js` copie les messages du salon surveillé vers le flux ; il se lance à part avec `pnpm --filter @workspace/discord-publisher start` et un token Discord.
- **Données** : `data/publisher/` (profils, webhooks, catégories, messages, avatars) — un dossier par entrée, **exactement le format de l'ancien site**, donc copiable tel quel et jamais commité.

Détails, variables et dépannage : [artifacts/discord-publisher/README.md](./artifacts/discord-publisher/README.md).

---

## ⇄ Mercato Analyser

**Mercato Analyser** (`/mercato/`) est un portail à part, indépendant du Discord Publisher. Il relit l'historique du salon mercato (`1465801451971412219` par défaut), sur quatre mois, et en extrait les **transferts individuels réellement annoncés** : joueur, club quitté, club rejoint, montant, type (transfert, prêt, retour, libre), date, auteur et extrait du message. Les offres et négociations non conclues sont écartées.

- **Interface** : `artifacts/mercato/public/`, servie par le portail sur `/mercato/`.
- **API** : `POST /api/mercato/analyze` (lance une analyse), `GET /api/mercato/status` (configuration + progression), `GET /api/mercato/jobs/:id`, `GET /api/mercato/report`.
- **Lecture Discord** : REST `/channels/<id>/messages`, avec le token du bot (`DISCORD_BOT_TOKEN` ou `token` dans `token.json`) — le bot doit voir le salon et lire son historique, et l'application doit avoir le *Message Content Intent*.
- **Analyse** : Groq par lots (même clé `GROQ_API_KEY` que le CREATOR), modèle `openai/gpt-oss-120b` si disponible, sinon `openai/gpt-oss-20b` ; `GROQ_MODEL` force un modèle.
- **Données** : `data/mercato/` (messages lus + dernier rapport), jamais commité.

---

## 🗂️ Structure

```
artifacts/
  lineup-creator/     # Frontend React + Vite + Tailwind + shadcn/ui
  api-server/         # API Express 5 (IA, clubs, compositions, uploads, Discord)
  discord-publisher/  # Studio de publication Discord (interface + bot)
  mercato/            # Portail d'analyse des transferts (interface seule)
  endstone-mipmap/    # Plugin Endstone 0.11 + wheel reconstruite (MipMap)
lib/
  api-spec/           # OpenAPI + génération orval
  api-client-react/   # Client API React généré
  api-zod/            # Schémas Zod générés
  db/                 # Schéma Drizzle (PostgreSQL optionnel)
scripts/              # Utilitaires
start.js              # Lanceur configurable (port 10005 par défaut)
projects.json         # Un projet par entrée : carte, statiques, redirections, API
```

## 🛠️ Commandes

| Commande | Description |
|---|---|
| `pnpm run typecheck` | Typecheck complet du workspace |
| `pnpm run build` | Typecheck + build de tous les packages |
| `pnpm --filter @workspace/api-server run dev` | API en local |
| `pnpm --filter @workspace/lineup-creator run dev` | Frontend Vite en local |
| `pnpm run build:mipmap` | Reconstruire le plugin Endstone MipMap (`.whl`) |
| `pnpm run test:mipmap` | Tester le plugin et l'API réelle de la webmap |
| `pnpm --filter @workspace/discord-publisher start` | Lancer le bot de relais Discord |

## 🔑 Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` / `MAP_PORT` / `SERVER_PORT` / `PTERODACTYL_PORT` | Port public partagé | `10005` |
| `DATABASE_URL` | PostgreSQL (optionnel) | JSON à plat |
| `GROQ_API_KEY` ou `token.json` | IA génération (optionnel) | — |
| `SHARED_DATA_FILE` | Emplacement du JSON partagé | `data/lineup-shared.json` |
| `UPLOADS_DIR` | Dossier des logos | `data/uploads/` |
| `MAP_DATA_FILE` | Données de chunks persistées par la carte | `data/chunks.ndjson` |
| `MAP_SERVER_PORT` / `API_PORT` | Ports internes (ne pas allouer publiquement) | `PORT+2` / `PORT+1` |
| `PUBLISHER_DATA_DIR` | Dossier des profils, webhooks et messages Discord | `data/publisher/` |
| `MERCATO_CHANNEL_ID` | Salon Discord analysé par Mercato Analyser | `1465801451971412219` |
| `MERCATO_DATA_DIR` | Messages lus et rapports mercato | `data/mercato/` |
| `PUBLISHER_BOT_SECRET` | Secret attendu du bot (`x-bot-secret`) | non vérifié |
| `PUBLIC_BASE_URL` | Adresse publique du portail, pour les avatars Discord | — |
| `DISCORD_BOT_TOKEN` / `DISCORD_CHANNEL_ID` | Bot de relais Discord | `token.json` / salon ISTAN |

## 📄 Licence

MIT
