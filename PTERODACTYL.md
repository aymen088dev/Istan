# ISTAN CREATOR sur Pterodactyl

Le serveur fonctionne sans droits administrateur et sans PostgreSQL obligatoire.

## Installation

1. Téléverser le projet complet.
2. Créer `token.json` à la racine du projet :

```json
{
  "GROQ_API_KEY": "ta-cle-groq"
}
```

3. Lancer avec `node start.js`. Le script utilise automatiquement `PORT`,
   `SERVER_PORT` ou `PTERODACTYL_PORT` fournis par le panel. Si aucune de ces
   variables n'existe, le port par défaut est `0089` ; il n'est donc plus
   nécessaire de modifier `start.js` manuellement.
4. Donner au processus les droits d’écriture sur le dossier du projet.

La clé est lue uniquement par l’API Node.js. Elle n’est jamais envoyée au navigateur.

L'interface appelle les routes IA avec `/api/ai/...`. `start.js` transmet ce
chemin à l'API interne ; ne pas ajouter un deuxième `/api` dans le client.

## Données partagées

Si `DATABASE_URL` est défini, l’API utilise PostgreSQL. Sinon elle utilise automatiquement
`data/lineup-shared.json`, créé au premier enregistrement. Ce fichier contient les clubs,
les effectifs et les compositions communes à tous les utilisateurs du serveur.

Le dossier `data` doit donc rester persistant et accessible en écriture. Pour déplacer le
fichier, définir `SHARED_DATA_FILE=/chemin/lineup-shared.json`.