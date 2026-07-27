# PANZER FREEMAN — Chronos Requiem

A low-poly, Sega-Saturn-flavoured 3D rail shooter that runs in a single HTML file.
An eighty-nine-year-old man rides a dragon toward a machine that runs time backwards.
Every drone he tears out of the sky peels a year off him. Every hit puts one back on.

**[▶ Play it](https://animagix77.github.io/panzer-freeman/)** · no install, no download, works offline once loaded.

![Title](docs/00-title.png)

---

## What it is

A tribute to **Panzer Dragoon** (Sega Saturn, 1995) — the rail flight, the four-way
view rotation, the sweep-to-paint lock-on volleys — with a soundtrack aimed squarely
at **Lords of Thunder** (PC Engine CD). Everything is generated at runtime: no models,
no textures, no audio files. The whole game is one 750 KB HTML file with Three.js
inlined, and it runs with the network unplugged.

| | |
|---|---|
| ![Rider](docs/01-rider.png) | ![Canyon](docs/02-canyon.png) |
| ![Lasers](docs/03-lasers.png) | ![Boss](docs/05-boss.png) |

## Controls

| Key | Action |
|---|---|
| `A` `D` | bank left / right |
| `W` `S` | dive / climb (inverted by default) |
| Mouse | aim reticle |
| Hold LMB | sweep to paint lock-ons (up to 8) |
| Release LMB | fire the homing laser volley |
| RMB | rapid gun |
| `Q` `E` | rotate the view 90° |
| `I` | toggle inverted pitch |
| `P` | pause · `M` mute |

## The interesting bits

**Saturn-accurate rendering.** The 3D is drawn into a ~400×232 buffer and
nearest-neighbour upscaled. Every material gets a shader patch that snaps vertices to
a coarse clip-space grid — the wobble is the real 90s-console integer-math artifact,
not a filter. Flat-shaded faces only, ordered-dither gradient skies quantised to
15-bit colour, heavy fog, CRT scanlines on top.

**A dragon with a flight model.** Wingbeats are driven by an *effort* value derived
from actual vertical velocity, so climbing costs work and diving is free:

| | vertical speed | flap rate |
|---|---|---|
| level | 0 | 1.8 Hz |
| climbing | +45 | **3.8 Hz** |
| diving | −46 | **0.7 Hz** |

The beat is asymmetric — a fast powered downstroke, a slow recovery — and each
downstroke fires an impulse into a damped spring, so the body genuinely lifts and
settles. Gliding flattens and sweeps the wings back; climbing cups them forward.
Altitude trades for airspeed in both directions.

**Panzer Dragoon lock-on.** Sweeping the reticle stacks locks (a big target soaks
several), and the volley launches in a wide fan before the homing tightens and curls
each bolt onto its target. Each bolt drags an additively-blended ribbon trail whose
anchors are laid down *by distance travelled*, so the streak is the same length at
30fps or 144.

**A synthesized rock band.** Five original tracks, no samples. Notes sum into shared
distortion channels *before* the waveshaper so power chords intermodulate the way a
real amp does; the signal path is waveshaper → cab lowpass → highpass → presence bell
→ bus compressor. Guitars are high-passed out of the bass's way. Multi-pattern
arrangements with intros, choruses, breakdowns and tom fills.

Renders of all five are in [`ost/`](ost/) — they're the game's own synth, bounced
through an `OfflineAudioContext`, so they're literally what you hear.

## Building

The repo ships a prebuilt `index.html`. To rebuild from source:

```bash
npm install          # pulls three.js, which gets inlined into the output
node build.js        # concatenates src/ into index.html
```

`src/` is split into five parts that share one namespace:

| File | Contents |
|---|---|
| `p1_core.js` | renderer, retro shader patch, sky, the whole audio engine and songs |
| `p2_models.js` | procedural dragon + rider + enemies + boss, and the flight model |
| `p3_world.js` | terrain chunking, prop fields, episode definitions |
| `p4_game.js` | player, projectiles, ribbons, impacts, enemies, boss AI |
| `p5_hud_loop.js` | HUD canvas, opening cinematic, input, main loop |

## Testing

Everything is verified headlessly with Playwright — including things you'd normally
have to eyeball:

```bash
node tools/e2e-play.js        # full playthrough, screenshots, console errors
node tools/e2e-endings.js     # pause, death and victory paths
node tools/check-controls.js  # strafe/pitch directions in all four view rotations
node tools/check-flight.js    # effort response to climb and dive, spring stability
node tools/check-lasers.js    # lock painting and volley behaviour
node tools/check-music.js     # live sequencer tempo and per-stage track switching
node tools/render-ost.js      # bounce the songs to WAV via OfflineAudioContext
node tools/analyze-mix.js *.wav   # spectral balance + onset rate of the mixes
node tools/check-perf.js      # draw calls, triangles, sim cost under worst case
```

`analyze-mix.js` is how the soundtrack got mixed without listening to it — the first
pass had guitars at 5% of the spectrum against 100% sub, which the band-energy readout
made obvious.

## Notes

Unaffiliated fan work. *Panzer Dragoon* is Sega's and *Lords of Thunder* is Hudson's;
this borrows their ideas out of admiration, not their assets. The rider is a low-poly
parody character, and the narrator captions are written in-character rather than
presented as anyone's real words.

MIT licensed — see [LICENSE](LICENSE).
