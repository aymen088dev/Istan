# ISTAN Projects — le film

Film vertical **1080 × 1920 / 30 fps / 70,5 s** présentant le portail ISTAN et ses
quatre outils. Composition HTML rendue en MP4 par
[HyperFrames](https://github.com/heygen-com/hyperframes) : chaque plan est un
`<section>` avec `data-start` / `data-duration`, les animations sont des
timelines GSAP seekables, et le son est mixé par le moteur au rendu.

Version diffusée : `artifacts/films/public/media/istan-projects.mp4`
(page `/films/#istan` du portail).

## Structure

```
index.html              composition complète (7 plans, audio, timeline)
frame.md                direction artistique (couleurs, typo, mouvement, son)
assets/fonts/           Inter + Instrument Serif, embarquées en woff2
assets/vendor/          gsap.min.js (pas de CDN au rendu)
assets/audio/score.wav  musique originale synthétisée (100 BPM, 70,5 s)
assets/audio/voice.wav  voix off HeyGen calée sur les plans (70,5 s)
assets/audio/voice.vtt  sous-titres générés depuis la transcription
assets/audio/voice/     segments TTS intermédiaires (non versionnés)
assets/audio/sfx-*.wav  whoosh, impact, pop, tick, riser
tools/score.mjs         génère score.wav (aucun sample, aucune licence)
tools/sfx.mjs           génère les cinq effets
tools/voice.mjs         génère la voix par plan, la recale, assemble voice.wav
tools/heygen-auth.mjs   termine la connexion OAuth device HeyGen
renders/                sorties de rendu (non versionnées)
```

## Prérequis

- Node.js ≥ 22
- FFmpeg + ffprobe dans le `PATH`
- Chrome headless : `npx hyperframes browser ensure`
- Pour la voix : une session HeyGen dans `~/.heygen/credentials`
  (`npx hyperframes auth login --device`, ou `HEYGEN_API_KEY`)

## Commandes

```bash
cd video
npm run score      # régénère assets/audio/score.wav
npm run sfx        # régénère les cinq effets
npm run voice      # régénère les segments HeyGen manquants + voice.wav
npm run check      # lint + runtime + layout + contraste
npm run render     # rendu final avec reprise par segments
```

Le rendu complet dure ~3 minutes sur 2 vCPU. HyperFrames capture en mode
`screenshot` (software GL) ; la commande `render` active donc
`HF_SEGMENTED_CAPTURE=true` avec des segments de 600 frames et `--resume`, ce
qui permet de reprendre un rendu interrompu sans repartir de zéro.

## Chaîne audio

1. `tools/score.mjs` synthétise la nappe, le sub, le kick, les charleys et les
   arpèges, puis écrit un WAV 48 kHz (pic ≈ −8 dB, moyenne ≈ −22 dB).
2. `tools/voice.mjs` demande une phrase par plan à HeyGen, vérifie que chaque
   segment tient dans son plan (marge de 0,35 s), ajoute le silence manquant et
   concatène le tout : `voice.wav` mesure exactement 70,5 s, donc les `data-start`
   de la composition restent valables sans dérive.
3. La composition place musique (volume 0,9), voix (0,85) et effets sur des
   pistes séparées ; HyperFrames les mixe à l'encodage.

## Sous-titres

`assets/audio/voice.vtt` est produit à partir de la transcription du WAV
(Whisper via Groq, `whisper-large-v3`), ce qui vérifie au passage que la voix
entendue correspond bien au script. Il est copié dans
`artifacts/films/public/media/istan-projects.vtt` et chargé par le lecteur.
