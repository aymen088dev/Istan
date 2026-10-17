# ISTAN Projects sur Pterodactyl

Le portail sert ISTAN CREATOR et MipMap derrière une seule allocation HTTP publique. Le serveur Bedrock/Endstone est séparé : le plugin Endstone MipMap envoie ses données vers l'API publique de ce projet.

## Installation

1. Téléverser le projet complet (le zip décompressé à la racine du serveur).
2. Créer `token.json` à la racine du projet (optionnel, pour l'IA) :

```json
{
  "GROQ_API_KEY": "ta-cle-groq"
}
```

3. Donner au processus les droits d'écriture sur le dossier `data/`.
4. Allouer un port HTTP public, puis lancer `node start.js`. Le script donne
   priorité à `PORT`, puis `MAP_PORT`, `SERVER_PORT` et `PTERODACTYL_PORT`.
   Sans allocation injectée, le port par défaut est **10005**. Il restaure les
   données de carte intégrées si nécessaire.
5. L'adresse publique du portail est déjà renseignée dans
   `artifacts/endstone-mipmap/src/endstone_mipmap/config.toml`
   (`http://151.240.30.10:10005`) : la corriger si l'allocation réelle
   diffère. Les deux URLs visent déjà le portail, sur son
   préfixe carte `/api/map/` (`mapApi.prefix` de `projects.json`) : ne pas
   pointer le plugin vers `API_PORT` ni `MAP_SERVER_PORT`, qui restent internes.
   Construire et installer la wheel avec `pnpm run build:mipmap`, puis copier
   `artifacts/endstone-mipmap/releases/endstone_mipmap-1.0.4-py2.py3-none-any.whl`
   dans le dossier plugins du serveur Endstone. Détails :
   [guide du plugin](./artifacts/endstone-mipmap/README.md).

Le port public `PORT` est la seule allocation HTTP à exposer. `API_PORT` (défaut
`PORT+1`) et `MAP_SERVER_PORT` (défaut `PORT+2`) sont des ports internes locaux,
ils ne doivent pas être alloués publiquement. `MAP_DATA_FILE` déplace le fichier
des chunks, par défaut `data/chunks.ndjson`. Ne pas démarrer le serveur Bedrock
avec ce lanceur web.

L'interface appelle les routes IA avec `/api/ai/...`. `start.js` transmet ce
chemin à l'API interne ; ne pas ajouter un deuxième `/api` dans le client.

## Données partagées

Si `DATABASE_URL` est défini, l'API utilise PostgreSQL. Sinon elle utilise automatiquement
`data/lineup-shared.json`, créé au premier enregistrement. Ce fichier contient les clubs,
les effectifs et les compositions communes à tous les utilisateurs du serveur.

Le dossier `data` doit donc rester persistant et accessible en écriture. Pour déplacer le
fichier, définir `SHARED_DATA_FILE=/chemin/lineup-shared.json`.

## Données du Discord Publisher

Profils, photos, catégories et webhooks vivent dans `data/publisher/` (même format que
l'ancien site, persistant lui aussi). Pour reprendre une installation existante, deux
chemins équivalents :

- **depuis l'interface** — `/publisher/` → panneau *Santé des données* → *Importer
data.zip* (rien à copier sur le serveur) ;
- **depuis la console** — `node artifacts/discord-publisher/import-data.js [dossier|data.zip]`.

Les entrées déjà présentes sont conservées : relancer l'import ne crée pas de doublon
(`--overwrite` pour remplacer). Le diagnostic exact est affiché dans le panneau *Santé des
données* et sur `GET /api/publisher/health`.

Les photos de profil sont servies par `/api/profiles/<dossier>/avatar`. Discord les
télécharge lui-même : l'adresse publique est reprise de la page (rien à configurer), et
`PUBLIC_BASE_URL` sert de repli pour les appels sans navigateur. Si les photos
n'apparaissent pas dans Discord alors que *Santé des données* affiche « Photos livrables »,
c'est que l'allocation du portail n'est pas joignable **depuis l'extérieur** : le lien
« Photo telle que Discord la téléchargera » doit s'ouvrir dans un navigateur en dehors du
serveur, et le port doit être accessible publiquement (ou définir `PUBLIC_BASE_URL` avec
une adresse publique, ex. un domaine en HTTPS devant le portail).

## Logos des clubs

Les logos importés dans la section Clubs sont stockés dans le dossier `data/uploads/`
(PNG/JPG/WEBP/GIF/SVG, 3 Mo max) et servis via `/api/uploads/<fichier>`. Le base64 n'est
jamais enregistré dans les données, ce qui allège fortement `lineup-shared.json` et la base.
Le dossier `data/uploads` doit rester persistant lui aussi (même dossier `data`).

Variables optionnelles :
- `UPLOADS_DIR=/chemin/uploads` — déplace le dossier des logos.
- `GROQ_API_KEY` — peut aussi être défini en variable d'environnement au lieu de `token.json`.

## Où mettre le dossier `data/`

Tout ce qui est écrit au fil de l'eau vit dans **`data/` à la racine du projet** :

| Fichier | Contenu |
|---|---|
| `data/chunks.ndjson` | Données de la webmap (reçues du plugin MipMap) |
| `data/lineup-shared.json` | Clubs, effectifs, compositions du CREATOR |
| `data/uploads/` | Logos de clubs |
| `data/publisher/` | Profils, webhooks, messages et avatars du Discord Publisher |
| `data/mercato/` | Messages lus et dernier rapport de Mercato Analyser |

Ce dossier est **ignoré par git** (il devient vite lourd) : il n'a pas besoin d'être téléversé dans le dépôt. Sur Pterodactyl, il suffit de le déposer tel quel à la racine du projet, à côté de `start.js` :

```
/home/container/
  start.js
  projects.json
  data/                 ← le dossier lourd, à déposer ici
    chunks.ndjson
    lineup-shared.json
    uploads/
    publisher/
    mercato/
```

`node start.js` recrée automatiquement les dossiers et les fichiers manquants. Les données de carte intégrées étant fournies compressées (`mapserver/data/chunks.ndjson.gz`, ~7 Mo), **la webmap fonctionne même sans ce dossier** : elles sont restaurées dans `data/chunks.ndjson` au premier démarrage. Pour les ranger ailleurs (disque plus grand), utilisez `MAP_DATA_FILE`, `SHARED_DATA_FILE`, `UPLOADS_DIR` ou `PUBLISHER_DATA_DIR`.

## Discord Publisher

L'interface est servie par le portail sur `/publisher/` et parle à l'API via `/api/...` : rien à configurer côté navigateur.

Le **bot de relais** n'est pas lancé tant qu'on ne le demande pas : `node start.js` démarre l'API et la carte, puis écrit `Bot Discord : non lancé. …`. Pour l'activer sur la même allocation, mets tout dans le `token.json` de la **racine** (fichier ignoré par git, à recréer sur le serveur) :

```json
{
  "DISCORD_BOT": "1",
  "DISCORD_BOT_TOKEN": "…",
  "DISCORD_CHANNEL_ID": "1407091475082383420",
  "PUBLISHER_SERVER_URL": "http://151.240.30.10:10005"
}
```

Le bot démarre alors avec les autres services et **ses journaux arrivent dans la console Pterodactyl**. Mêmes clés en variables d'environnement (`Startup`) : `DISCORD_BOT=1`, `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `PUBLISHER_SERVER_URL` — `DISCORD_BOT=0` le désactive. Pour le lancer seul, sur un second serveur :

```bash
pnpm --filter @workspace/discord-publisher start
```

## Mercato Analyser

Le portail `/mercato/` est indépendant du Publisher : il lit l'historique du salon
`1465801451971412219` (ou `MERCATO_CHANNEL_ID`) sur quatre mois et en extrait les
transferts annoncés. Rien à configurer de plus que dans le `token.json` de la racine :
`DISCORD_BOT_TOKEN` (lecture du salon) et `GROQ_API_KEY` (analyse). Le bot doit être
membre du serveur, voir le salon et lire son historique ; l'application Discord doit
avoir le *Message Content Intent* activé.

L'analyse dure quelques minutes et tourne côté serveur : la page suit sa progression,
puis relit `data/mercato/report.json`. Le salon n'est jamais modifié (lecture seule).

Un point sur lequel on perd vite du temps : `invalid Authorization header` dans la console ne veut pas dire « token faux », mais « token abîmé » — le plus souvent collé sur deux lignes dans `token.json`, ou entouré de guillemets. Le bot nettoie maintenant tout seul guillemets, préfixe `Bot `, espaces et retours à la ligne (il l'affiche), et nomme par leur code Unicode les autres caractères fautifs (`U+00A0`, `U+2019`…). Recopie le token d'un seul bloc.

Deux variables côté portail :

- `PUBLISHER_BOT_SECRET` — si elle est définie, le bot doit envoyer la même valeur dans l'en-tête `x-bot-secret`, sinon ses messages sont refusés (401).
- `PUBLIC_BASE_URL` — adresse publique du portail (`http://151.240.30.10:10005`), pour que Discord affiche les avatars des profils lors des publications.

Les données restent dans `data/publisher/` (voir le tableau ci-dessus) ; `PUBLISHER_DATA_DIR` les déplace.

## Multi-utilisateur

Aucune base de données complexe n'est requise : tous les navigateurs rafraîchissent
leurs clubs et compositions depuis l'API toutes les quelques secondes. Un club ou un
logo ajouté par un utilisateur apparaît donc chez les autres sans recharger la page.
