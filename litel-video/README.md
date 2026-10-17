# Litel — le film de campagne

Publicité verticale **1080 × 1920 / 30 fps / 35,5 s** pour l’enseigne Litel,
présente dans tous les Istanmusta. Le film part d’une rue au crépuscule, en
caméra subjective : on marche vers l’enseigne, les portes s’ouvrent, et la pub
démarre — prix, rayons, carte finale.

Version diffusée : `artifacts/films/public/media/litel.mp4` (page `/films/#litel`).

## Découpage

| Temps | Plan | Contenu |
|---|---|---|
| 0 – 7,5 s | La rue | POV, lampadaires, enseigne au bout de la rue, pas |
| 7,5 – 12,5 s | La façade | Wordmark LITEL, portes automatiques, « Tous les Istanmusta » |
| 12,5 – 20,5 s | Les prix | Riz, café, savon, tampon « le panier à moins de dix » |
| 20,5 – 28,5 s | Les rayons | Étagères, 12 000 produits, nouveau rayon, promos du mardi |
| 28,5 – 35,5 s | La carte | Logo, « Des petits prix. Partout. », 7j/7 |

## Commandes

```bash
cd litel-video
npm run score    # musique synthétisée (112 BPM, 35,5 s)
npm run sfx      # pas, porte, caisse, pop, swoosh
npm run voice    # voix off HeyGen par plan + assemblage
npm run check    # lint + runtime + layout + contraste
npm run render   # rendu MP4 avec reprise par segments
```

Prérequis identiques au film ISTAN : Node ≥ 22, FFmpeg, Chrome headless
(`npx hyperframes browser ensure`) et une session HeyGen dans
`~/.heygen/credentials`.

## Notes de production

- La musique et les effets sont **synthétisés** (`tools/score.mjs`,
  `tools/sfx.mjs`) : aucun sample, aucune licence à gérer.
- La voix est calée plan par plan (`tools/voice.mjs`) : chaque segment est
  complété au silence jusqu’à la durée exacte du plan, donc `voice.wav` fait
  exactement 35,5 s et les `data-start` restent valables.
- Les décors (rue, façade, étagères, prix) sont en HTML/CSS : aucun visuel
  externe, tout est modifiable dans `index.html`.
- Le rendu 1080×1920 prend ~1 min 50 sur 2 vCPU en capture logicielle.
