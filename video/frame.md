# ISTAN PROJECTS — direction artistique de la vidéo

Design system du film vertical 1080 × 1920 (TikTok / Reels), dérivé du portail
`projects.json`. Tout ce qui suit est une règle de composition, pas une
suggestion : les plans s'y tiennent pour que le film reste cohérent d'un bout à
l'autre.

## Idée

Un serveur, quatre outils, une seule adresse. Le film se lit comme une visite
guidée du portail : on entre par la promesse, on descend dans chaque projet, on
termine sur le point de départ — `node start.js`.

La caméra est fixe, le mouvement vient du contenu : les cartes montent, les
chiffres se comptent, les plans se succèdent. Aucun effet gratuit.

## Couleurs

| Rôle | Valeur | Usage |
|---|---|---|
| Fond | `#08090B` | fond plein cadre |
| Surface | `#111318` | cartes, panneaux |
| Surface haute | `#171A20` | éléments posés sur une carte |
| Trait | `rgba(255,255,255,.09)` | bordures 1 px |
| Texte | `#F2F1EC` | titres, corps |
| Texte faible | `#8A8F98` | légendes, métadonnées |
| Vert CREATOR | `#6EE7A8` | projet 01 |
| Blurple PUBLISHER | `#8B93FF` | projet 02 |
| Lime MERCATO | `#C8FF3D` | projet 03 |
| Cyan MIPMAP | `#67E8F9` | projet 04 |

Chaque plan n'a **qu'une** couleur d'accent, celle de son projet ; le plan
d'ouverture et le plan final les alignent toutes les quatre en petits points.

## Typographie

- **Inter 800**, interlettrage `-0.045em`, interligne `0.9` : les titres.
- **Instrument Serif italique** : un seul mot accentué par plan, en bas de
  casse. C'est le contraste éditorial du film.
- **Inter 500** : étiquettes, corps de carte, données. Jamais en dessous de
  26 px sur un canvas de 1080 px.
- Les deux familles sont embarquées en `woff2` dans `assets/fonts/`, jamais
  chargées depuis un CDN : le rendu doit être identique hors ligne.

## Grille

- Marges : 72 px gauche/droite, 112 px en haut, 260 px en bas (zone d'interface
  TikTok).
- Largeur utile : 936 px.
- Rayons : 26 px (cartes), 18 px (chips), 34 px (panneaux plein).
- Espacement vertical : multiples de 8 px.

## Mouvement

- Entrées : `y: 40 → 0`, `opacity: 0 → 1`, 0,7 s, `power3.out`.
- Titres : décalage de 0,2 s par ligne, jamais plus de trois lignes.
- Listes : `stagger 0.08`, plafonné à huit éléments.
- Sorties : fondu court sur le contenu interne 0,5 s avant la fin du plan ; les
  clips sont masqués par le moteur, jamais par GSAP.
- Aucune boucle infinie, aucun `Math.random`, aucune horloge : la timeline est
  entièrement seekable.

## Son

- Voix off française, une phrase par plan, calée sur la durée du plan.
- Nappe musicale synthétisée à 100 BPM, pic à −8 dB, moyenne −22 dB : elle
  passe sous la voix sans qu'on ait à la baisser plan par plan.
- Effets : whoosh sur les transitions, impact sur les entrées fortes, pop sur
  les compteurs, tick sur les listes. Jamais deux effets à moins de 0,4 s.

## Interdits

Pas de dégradé violet/rose, pas de faux écran de téléphone, pas d'emoji dans
les titres, pas de texte qui touche un bord, pas de chiffre inventé : chaque
statistique affichée vient des données réelles du projet.
