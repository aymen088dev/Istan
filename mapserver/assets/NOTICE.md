# Provenance des assets

Ce dossier ne contient **aucun** asset produit par ce projet : tout vient de
ressources externes, sous leurs licences respectives.

## `textures/blocks/` — textures des blocs

Deux banques fusionnées (même dossier, la résolution choisit le meilleur
fichier pour chaque bloc) :

1. **MipMap** — `MipMap/webmap/assets/textures/blocks` (~970 fichiers,
   nommage « Java »).
   Source : <https://github.com/MipaSenpai/MipMap> — licence **MIT**
   (`textures/MIPMAP-LICENSE`).
2. **bedrock-samples (Mojang)** — `resource_pack/textures/blocks` du dépôt
   officiel, version **1.26.50.4** (~730 fichiers ajoutés, nommage Bedrock,
   PNG et TGA).
   Source : <https://github.com/Mojang/bedrock-samples>
   © Mojang AB — soumis au **Minecraft End User License Agreement**
   (<https://www.minecraft.net/en-us/eula>), comme indiqué dans le `LICENSE.md`
   du dépôt. Ces fichiers ne sont donc **pas** couverts par la licence du
   projet : ce sont des assets Minecraft, redistribués ici uniquement pour
   afficher une carte du monde de ce serveur.

## `bedrock_blocks.json` — table bloc → texture

Généré depuis `resource_pack/blocks.json` et
`resource_pack/textures/terrain_texture.json` du même dépôt bedrock-samples :

- pour chaque bloc, la texture de sa **face supérieure** (`up`), sinon `side`,
  sinon `down` ;
- la clé de texture est résolue via `terrain_texture.json` (préfixe
  `flattened_` retiré quand la version simple existe) vers un nom de fichier
  présent dans `textures/blocks/`.

## `skins/default.png` — skin par défaut

Vendorée depuis MipMap (MIT), utilisée quand le plugin n'envoie pas le skin
d'un joueur.
