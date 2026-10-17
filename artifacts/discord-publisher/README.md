# Discord Publisher

Interface de publication et de modération RP pour un salon Discord, intégrée au
portail ISTAN.

| Morceau | Où il vit | Adresse |
|---|---|---|
| Interface (studio de publication) | `artifacts/discord-publisher/public/` | `/publisher/` |
| API (profils, webhooks, flux, publication, modération) | `artifacts/api-server/src/routes/publisher.ts` et `discord.ts` | `/api/...` |
| Bot de relais Discord | `artifacts/discord-publisher/bot.js` | processus séparé |

L'interface appelle `/api/profiles`, `/api/webhooks`, `/api/categories`,
`/api/publish`, `/api/moderation` et `/api/discord/messages` : le portail
(`start.js`) renvoie déjà `/api/*` vers l'API interne, il n'y a donc rien à
configurer côté navigateur.

## Le bot Discord

Le bot copie chaque message du salon surveillé vers
`POST <PUBLISHER_SERVER_URL>/api/discord/messages` ; ils apparaissent ensuite
dans le flux « Ce qui se passe dans le salon » de l'interface.

1. Créer une application sur <https://discord.com/developers/applications>,
   activer l'intent **Message Content**, puis copier le token du bot.
2. Mettre le token **et** le contexte du bot dans le `token.json` de la
   **racine du dépôt** — le même fichier que la clé IA, ignoré par git :

```json
{
  "GROQ_API_KEY": "…",
  "DISCORD_BOT_TOKEN": "TON_TOKEN_DISCORD",
  "DISCORD_CHANNEL_ID": "1407091475082383420",
  "PUBLISHER_SERVER_URL": "http://151.240.30.10:10005",
  "PUBLISHER_BOT_SECRET": "…"
}
```

Ordre de lecture : **variables d'environnement** → **`token.json` de la
racine** → `artifacts/discord-publisher/token.json` (ancien emplacement, clé
`"token"`, toujours accepté). Le bot indique la source retenue au démarrage,
et un même fichier racine suffit donc à le configurer entièrement.

Tout peut aussi rester en variables d'environnement :

```bash
DISCORD_BOT_TOKEN=TON_TOKEN          \
DISCORD_CHANNEL_ID=1407091475082383420 \
PUBLISHER_SERVER_URL=http://localhost:10005 \
pnpm --filter @workspace/discord-publisher start
```

| Variable | Rôle | Défaut |
|---|---|---|
| `DISCORD_BOT_TOKEN` | token du bot | `token.json` de la racine, puis celui du bot (`"token"`) |
| `DISCORD_CHANNEL_ID` | salon surveillé | `1407091475082383420` |
| `PUBLISHER_SERVER_URL` | adresse du portail | `http://localhost:10005` |
| `PUBLISHER_BOT_SECRET` | secret partagé avec l'API (`x-bot-secret`) | `CHANGE_MOI_PAR_UN_SECRET` |

Si `PUBLISHER_BOT_SECRET` est définie côté API, le bot doit présenter la même
valeur, sinon ses messages sont refusés (401). Sans cette variable, l'API
accepte les messages de bot sans contrôle — pratique en développement, à
sécuriser en production.

## Bot hors ligne sur un serveur distant (Pterodactyl)

Le bot n'est pas un service du portail : `node start.js` démarre l'API et la
carte, **pas** le bot. Sur une seule allocation Pterodactyl, le plus simple est
de l'activer dans le lanceur avec un drapeau, dans le `token.json` de la racine :

```json
{ "DISCORD_BOT": "1", "DISCORD_BOT_TOKEN": "…" }
```

`node start.js` (la commande de démarrage) lance alors le bot **avec** les autres
services, et ses journaux arrivent dans la même console. Équivalent en variable
d'environnement : `DISCORD_BOT=1` (`DISCORD_BOT=0` pour le désactiver). Sans ce
drapeau, le lanceur écrit toujours `Bot Discord : non lancé. …` avec la marche à
suivre : la console ne peut plus être muette sur ce point.

Pour le lancer seul, à côté du portail :

```bash
pnpm install                              # dépendances du workspace (discord.js)
node artifacts/discord-publisher/bot.js   # ou : pnpm --filter @workspace/discord-publisher start
```

Quatre causes classiques d'un bot hors ligne « alors que tout est bon » :

1. **`token.json` absent sur le serveur** — ce fichier est ignoré par git
   (`.gitignore:15`), donc ni `git clone` ni une archive ne l'apportent : il
   faut le recréer à la racine (`{ "DISCORD_BOT_TOKEN": "..." }`), à côté du
   bot, ou définir `DISCORD_BOT_TOKEN` dans l'onglet *Startup*.
2. **Node trop ancien** — `discord.js` 14 exige **Node 18 ou plus**
   (champ `engines` du paquet).
3. **Intents privilégiés** — sans *Message Content*, le bot se connecte mais ne
   voit aucun message ; demandé sans être activé, Discord refuse carrément la
   connexion au gateway.
4. **Token collé sur deux lignes** — un espace ou un retour à la ligne au milieu
   du token casse l'en-tête HTTP `Authorization` et Discord répond
   `invalid Authorization header`, une erreur qui ne dit pas d'où elle vient.
   Le bot **retire lui-même** espaces, retours à la ligne, guillemets et préfixe
   `Bot ` (il le signale), puis nomme les autres caractères fautifs par leur code
   Unicode (`U+00A0` pour une espace insécable, par exemple). Recopie le token
   d'un seul bloc, sans guillemets.

Diagnostic en une commande, sur le serveur — le token n'est **jamais** affiché :

```bash
node artifacts/discord-publisher/bot.js --check
# 🔑 Token lu depuis : … (variable d'environnement ou fichier)
# 🟩 Node v20.x — discord.js exige Node 18 ou plus.
# ✅ utilisateur du bot → HTTP 200 · bot : Istan Bot
# ✅ salon 1407091475082383420 → HTTP 200 · salon : 🐦・twitter
```

Au démarrage normal, la console explique **toujours** pourquoi en cas d'échec :

- source du token et version de Node dès les premières lignes ;
- token vide, placeholder du dépôt ou token tronqué (pas 3 segments séparés par
  des points) : refus immédiat **avec la cause**, au lieu d'un « invalid token »
  de Discord ;
- token entouré de guillemets, préfixé par `Bot ` ou coupé sur deux lignes :
  nettoyé automatiquement, avec la ligne `⚠️ Token nettoyé avant usage (… → …
  caractères)` qui indique combien de caractères ont été retirés ;
- caractère impossible dans un token (espace insécable, guillemet courbe, lettre
  accentuée…) : refus **en le nommant** (`caractère(s) inattendu(s) U+00A0`),
  plutôt que le `invalid Authorization header` de Discord ;
- si le bot n'est pas en ligne au bout de **30 s** (`DISCORD_READY_TIMEOUT`, en
  secondes — 5 à 600 —, hors bornes ramené d'autorité avec avertissement), un
  bilan est imprimé : dernier événement gateway, puis
  `GET /users/@me` qui tranche entre **token refusé** et **sortie HTTPS bloquée**
  (si ce test répond 200, le token est bon ⇒ c'est le WebSocket qui est filtré) ;
- les fermetures du gateway sont traduites par leur cause — 4004 token refusé,
  4014 intents non activés, 1006 connexion coupée, 4008 trop de connexions,
  4003 non authentifié, 4011 sharding requis… ;
- reconnexions, reprises de session, erreurs de shard et session invalidée sont
  journalisées elles aussi ;
- `DISCORD_DEBUG=1` déroule le journal brut du gateway (DNS, TLS, heartbeats) :
  c'est ce qu'il faut transmettre à l'hébergeur quand rien d'autre ne parle ;
- une promesse rejetée ou une exception non rattrapée affiche sa cause au lieu
  d'une pile illisible ou d'un silence.

## Données

Tout est stocké dans `data/publisher/` **au même format que l'ancien site** :
un dossier par entrée, avec les mêmes noms de fichiers et les mêmes champs
(créé au premier enregistrement, ignoré par git, persistant sur Pterodactyl) :

```
data/publisher/
  profils/<dossier>/profil.json       identité (id, name, folder, category, role,
                                      verified, avatar, createdAt)
  profils/<dossier>/avatar.jpg        photo de profil, à côté de son profil
  webhooks/<dossier>/webhook.json     salon cible (id, name, folder, url, createdAt)
  categories/<dossier>/categorie.json catégorie (id, name, folder, createdAt)
  messages/messages.json              flux des 200 derniers messages
```

Les dossiers d'une installation existante — l'archive `data.zip` du dépôt les
contient — se copient donc tels quels dans `data/publisher/` : rien à convertir,
et le résultat se re-télécharge à l'identique. L'ancien `avatar`
(`/api/profiles/<dossier>/avatar`) garde également la même adresse.

`PUBLISHER_DATA_DIR=/chemin/data` déplace ce dossier. Les URL de webhook ne
sont jamais renvoyées au navigateur : seul le nom du salon est public.

## Reprendre les données de l'ancien site

L'ancien site rangeait tout en dossiers (`profils/<dossier>/profil.json` et son
`avatar.jpg`, `webhooks/<dossier>/webhook.json`,
`categories/<dossier>/categorie.json`, `messages/messages.json`). Le script
`import-data.js` reprend ces dossiers — ou une archive `data.zip` — sans passer
par `unzip` :

```bash
# archive data.zip de la racine du dépôt (envoyée à l'API, qui la décompresse)
pnpm --filter @workspace/discord-publisher run import-data

# dossier déjà décompressé : copie directe, aucun serveur nécessaire
node artifacts/discord-publisher/import-data.js /chemin/vers/ancien-data

# remplacer des entrées existantes, ou viser un autre dossier de données
node artifacts/discord-publisher/import-data.js data.zip --overwrite
node artifacts/discord-publisher/import-data.js /chemin/data --data-dir /chemin/data/publisher
```

Le même import existe **depuis l'interface**, sans accès au serveur : panneau
« Santé des données » → *Importer data.zip*. Il envoie l'archive à
`POST /api/publisher/import`, qui applique exactement les mêmes règles que le
script (un seul comportement à maintenir).

Ce qui existe déjà dans `data/publisher/` est conservé : relancer la commande
n'ajoute aucun doublon (`--overwrite` pour remplacer), et une nouvelle archive
se synchronise de la même façon. `PUBLISHER_DATA_DIR` déplace la destination.
Les données importées restent locales (ignorées par git) — les URL de webhook
ne doivent pas être publiées.

## Pourquoi un profil « importé » n'apparaissait pas

La lecture des données était plus stricte que les données réelles : un dossier
n'était pris en compte que s'il contenait **exactement** `profil.json`, avec les
champs **exactement** nommés `name` / `category` / `role`. Tout le reste
disparaissait silencieusement. C'est corrigé — le chargeur accepte désormais :

- `profil.json`, `profile.json`, `data.json`, `index.json` ou tout autre
  `.json` du dossier (dossier à plat `profils/<nom>.json` compris) ;
- les champs `nom` / `pseudo` / `displayName` / `username`, `categorie` / `cat`
  / `group`, `verifie` / `verified`, `rang` / `rank` ;
- un JSON **avec BOM UTF-8** (export Notepad, Excel) ;
- un dossier qui ne contient qu'une **photo** : le profil est reconstruit depuis
  le nom du dossier et son image est servie ;
- une photo nommée autrement que `avatar.*` (`photo.png`, `pp.jpg`…) ou posée
  à côté du JSON ;
- les catégories qui n'ont pas de `categorie.json` (nom du dossier) et celles
  utilisées par un profil mais absentes de `categories/`.

Les fichiers parasites des archives (`__MACOSX/`, `.DS_Store`, `._profil.json`)
sont ignorés, les webhooks en double (même URL) sont fusionnés, et **ce qui n'a
pas pu être lu est affiché** : panneau « Santé des données », ou
`GET /api/publisher/health` (`skipped`, `repaired`, `counts`). Plus de profil
manquant sans explication.

## Photos de profil sur Discord

Discord télécharge l'avatar d'un webhook lui-même, depuis l'URL fournie dans
`avatar_url`. Si cette URL n'est pas joignable **de l'extérieur**, la photo est
simplement ignorée : le message part, l'avatar reste celui par défaut, aucune
erreur n'est renvoyée. C'est la cause à connaître avant de chercher ailleurs.

L'adresse est donc résolue dans cet ordre :

1. **l'origine de la page** (`location.origin`, envoyée par l'interface) :
   c'est l'URL que le navigateur utilise déjà pour joindre `/api/`, donc
   l'adresse réellement fonctionnelle, protocole et nom d'hôte compris ;
2. `PUBLIC_BASE_URL`, pour les appels sans navigateur (scripts, `curl`) :

```bash
PUBLIC_BASE_URL=https://publisher.tondomaine.fr   # origine seule, sans chemin
```

3. les en-têtes de la requête, avec un protocole déduit de la cible — une
   `IP:port` est en HTTP (hébergement Pterodactyl), un nom de domaine en HTTPS.
   `start.js` n'invente plus `X-Forwarded-Proto` : son socket interne est
   toujours en clair, l'annoncer revenait à faire chercher `http://…` à Discord
   là où le portail n'existe qu'en HTTPS.

Ce qui est refusé et **dit** au lieu d'un échec muet : adresse locale
(`localhost`, `127.0.0.1`, IP privée), aucune photo dans le dossier, fichier
annoncé dans le JSON mais absent du disque. La publication part quand même et
l'interface affiche le motif.

Le panneau « Santé des données » affiche l'adresse retenue et un lien
**« Photo telle que Discord la téléchargera »** : le cliquer permet de vérifier
soi-même que l'image est joignable de l'extérieur. Les réponses de
`/api/publish` portent les mêmes informations (`avatarSent`, `avatarUrl`,
`avatarWarning`), y compris en `dryRun=1` — d'où le bouton *Tester le réglage*,
qui valide webhook, profil et photo sans rien publier.

L'URL de l'avatar porte la date de modification de l'image (`?v=`), sinon
Discord continuerait d'afficher l'ancienne photo après un remplacement.
