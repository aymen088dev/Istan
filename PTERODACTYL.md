# ISTAN CREATOR sur Pterodactyl

Le serveur fonctionne sans droits administrateur et sans PostgreSQL obligatoire.

## Installation

1. Téléverser le projet complet (le zip décompressé à la racine du serveur).
2. Créer `token.json` à la racine du projet (optionnel, pour l'IA) :

```json
{
  "GROQ_API_KEY": "ta-cle-groq"
}
```

3. Lancer avec `node start.js`. Le script utilise automatiquement `PORT`,
   `SERVER_PORT` ou `PTERODACTYL_PORT` fournis par le panel. Si aucune de ces
   variables n'existe, le port par défaut est **10089** ; il n'est donc plus
   nécessaire de modifier `start.js` manuellement.
4. Donner au processus les droits d'écriture sur le dossier du projet.

La clé est lue uniquement par l'API Node.js. Elle n'est jamais envoyée au navigateur.

L'interface appelle les routes IA avec `/api/ai/...`. `start.js` transmet ce
chemin à l'API interne ; ne pas ajouter un deuxième `/api` dans le client.

## Données partagées

Si `DATABASE_URL` est défini, l'API utilise PostgreSQL. Sinon elle utilise automatiquement
`data/lineup-shared.json`, créé au premier enregistrement. Ce fichier contient les clubs,
les effectifs et les compositions communes à tous les utilisateurs du serveur.

Le dossier `data` doit donc rester persistant et accessible en écriture. Pour déplacer le
fichier, définir `SHARED_DATA_FILE=/chemin/lineup-shared.json`.

## Logos des clubs

Les logos importés dans la section Clubs sont stockés dans le dossier `data/uploads/`
(PNG/JPG/WEBP/GIF/SVG, 3 Mo max) et servis via `/api/uploads/<fichier>`. Le base64 n'est
jamais enregistré dans les données, ce qui allège fortement `lineup-shared.json` et la base.
Le dossier `data/uploads` doit rester persistant lui aussi (même dossier `data`).

Variables optionnelles :
- `UPLOADS_DIR=/chemin/uploads` — déplace le dossier des logos.
- `GROQ_API_KEY` — peut aussi être défini en variable d'environnement au lieu de `token.json`.

## Multi-utilisateur

Aucune base de données complexe n'est requise : tous les navigateurs rafraîchissent
leurs clubs et compositions depuis l'API toutes les quelques secondes. Un club ou un
logo ajouté par un utilisateur apparaît donc chez les autres sans recharger la page.
