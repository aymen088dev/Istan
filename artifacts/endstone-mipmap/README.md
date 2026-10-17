# plugin-mipmap — MipMap pour Endstone 0.11

Plugin **MipMap** ([MipaSenpai/MipMap](https://github.com/MipaSenpai/MipMap),
licence MIT — voir `LICENSE`) porté sur **Endstone 0.11**, branché sur le
`mapserver/` de ce dépôt.

C'est **le plugin carte du dépôt** : il remplace l'ancien `plugin-worldmap/`
(scanner maison). Pourquoi ce choix :

* il est maintenu, testé, et couvre ce que le nôtre ne faisait pas
  (joueurs + skins, `/loadmap` pour pré-générer une zone) ;
* il s'accroche à `ChunkLoadEvent` : la carte se remplit **exactement** des
  chunks que BDS a réellement chargés — c'est la cause des cartes vides qu'on
  avait (4 225 chunks vides) ;
* son protocole est un simple POST JSON, que `mapserver/` parle déjà.

## Installation

```bash
pnpm run build:mipmap   # produit artifacts/endstone-mipmap/releases/endstone_mipmap-1.0.4-py2.py3-none-any.whl
# ou : cd artifacts/endstone-mipmap && sh ./build.sh
```

Copie la `.whl` dans le dossier `plugins/` du serveur Endstone, puis redémarre.
Le plugin crée `plugins/mipmap/config.toml` au premier lancement.

> **Dépendance** : `aiohttp` (déclarée dans `pyproject.toml`). Le bundle
> officiel Endstone installe les dépendances de la `.whl` tout seul ; sinon
> `pip install aiohttp`.

## Configuration (`plugins/mipmap/config.toml`)

```toml
sendPlayers = true

[api]
chunks  = "http://151.240.30.10:10005/api/map/chunks-data"
players = "http://151.240.30.10:10005/api/map/players-data"
```

C'est le défaut **embarqué dans la wheel** : `plugins/mipmap/config.toml` est créé
avec cette adresse au premier lancement. Si le fichier existe déjà, Endstone ne le
remplace pas — adapte-le à la main (ou supprime-le et redémarre).

Le plugin parle au **portail** (`start.js`), pas directement au mapserver : le
chemin `/api/map/` est celui déclaré dans `projects.json` (`mapApi.prefix`) et le
portail relaie vers le mapserver interne. Remplace `151.240.30.10` par l'adresse
du serveur Node et `10005` par l'allocation publique réelle (`PORT`) si elle
diffère.

Côté serveur, les chunks sont écrits dans `data/chunks.ndjson` (déplaçable avec
`MAP_DATA_FILE`) : c'est le chemin data du portail, indépendant de l'URL du
plugin.

Si le mapserver est verrouillé avec `MAP_MIPMAP_TOKEN`, ajoute la clé dans
l'URL (le plugin n'envoie **aucun header** d'authentification) :

```toml
chunks  = "http://151.240.30.10:10005/api/map/chunks-data?key=<TOKEN>"
players = "http://151.240.30.10:10005/api/map/players-data?key=<TOKEN>"
```

> Pour un mapserver lancé **seul** (sans portail), le port est `PORT` (10005 par
défaut) et les routes sont `/api/chunks-data` et `/api/players-data`, sans le
préfixe `/api/map/`.

**Le plugin exige une réponse HTTP 200** : tout autre code est journalisé
(`[Mipmap] HTTP error <status> for chunk (x, z)`) et le chunk est perdu.
Le mapserver répond 200 dès qu'un chunk contient au moins un bloc valide.

## Commandes

| Commande | Effet |
|---|---|
| `/loadmap` | pré-génère la zone par défaut (`mapLoading.defaultArea`) |
| `/loadmap <minX> <minZ> <maxX> <maxZ>` | pré-génère une zone précise |
| `/loadmap status` | progression du chargement |
| `/loadmap help` | aide |

Permission : `mipmap.command.loadmap`, **défaut `op`** (alias `lm`).

> L'amont mettait `"console"`, ce qui rend la commande **impossible à lancer en
> jeu, même pour un OP**. Valeurs acceptées par Endstone : `True` (tout le
> monde), `False` (personne), `"op"`, `"not_op"`, `"console"`. Pour autoriser un
> joueur non-OP, donne-lui la permission `mipmap.command.loadmap`.
Le pré-chargement passe par des `tickingarea` temporaires : c'est ce qui force
BDS à charger les chunks et donc à déclencher `ChunkLoadEvent`.

## Ce que le port 0.11 change (et pourquoi)

| Correctif | Raison |
|---|---|
| `Block.type` lu comme chaîne | Endstone 0.11 expose `Block.type` en `str` ; l'amont attendait un objet `BlockType` |
| Blacklist filtrée | l'amont contient des entrées `"minecraft:poppy.png"` (restes de la table de textures) qui ne filtraient rien ; elles sont retirées du `config.toml` par défaut |
| Blacklist appliquée aussi à l'air | une colonne dont la surface est de l'air descend maintenant jusqu'au sol |
| `BatchTracker` créé dans `on_load` | l'amont le créait dans `on_enable`, donc `/loadmap` plantait avant |
| Messages tolérants | une clé retirée du `config.toml` ne lève plus d'`AttributeError` |
| `try/except` autour des skins | une skin indisponible ne fait plus échouer l'envoi des joueurs |

Le reste du plugin (envoi `aiohttp`, batch tracker, tickingareas) est celui de
l'amont, inchangé.

## Tests

```bash
python3 artifacts/endstone-mipmap/test_pipeline.py
```

Le test installe des doublures `endstone` dans `sys.modules`, appelle le **vrai**
`_getChunkData()` avec de faux blocs 0.11, puis POSTe le payload au **vrai**
mapserver Node (lancé sur un port libre, chemin de persistance temporaire sous
`data/chunks.ndjson`) et vérifie le 200, le chunk stocké et le joueur. Les assertions
sont exécutées à chaque lancement; le test sort avec `exit 0` si tout passe.

## Limites

* Pas de serveur Bedrock ici : `ChunkLoadEvent`, `tickingarea` et `aiohttp` ne
  sont pas exercés en conditions réelles, seulement le format et l'API 0.11.
* Le `api_version` du plugin est passé à `"0.11"` ; sur un serveur Endstone
  0.10 il faut le remettre à `"0.10"`.
