# PANZER FREEMAN — Chronos Requiem

A low-poly, Sega-Saturn-flavoured 3D rail shooter that runs in a single HTML file.
An eighty-nine-year-old man rides a dragon toward a machine that runs time backwards.
Defeating enemies gives him time back. Taking hits ages him.

**[▶ Play it](https://animagix77.github.io/panzer-freeman/)** · no install required.

![Title](docs/00-title.png)

---

## What it is

A tribute to **Panzer Dragoon** (Sega Saturn, 1995) — the rail flight, the four-way
view rotation, the sweep-to-paint lock-on volleys — drawn as clean low-poly rather
than as a Saturn emulation, with a soundtrack aimed squarely at **Lords of Thunder**
(PC Engine CD). The ~1.4 MB HTML bundle embeds Three.js, the rider model,
and procedural game systems. Six MP3 cues stream from `sound/`; effects use an
original Web Audio sample bank rendered at startup. Serve the folder over HTTP.

| | |
|---|---|
| ![Rider](docs/01-rider.png) | ![Canyon](docs/02-canyon.png) |
| ![Lasers](docs/03-lasers.png) | ![Boss](docs/05-boss.png) |

![The dragon](docs/06-model.png)

## Controls

| Key | Action |
|---|---|
| `A` `D` | bank left / right |
| `W` `S` | dive / climb (inverted by default) |
| Mouse | aim reticle |
| Hold LMB | sweep to paint lock-ons (up to 8) |
| Release LMB | fire the homing laser volley |
| RMB | rapid gun |
| `Shift` | boost; consumes wing power |
| `X` | air brake |
| `Space` + direction | evasive roll; costs 28 wing power, 1.4s cooldown |
| `Q` `E` | rotate the view 90° |
| `I` | toggle inverted pitch |
| `R` | toggle Saturn mode |
| `P` | pause · `M` mute |

## The interesting bits

**Four stages and a finale.** The wider Ashen Canyon divides around a central mesa;
blue rings reward either passage with score and wing power. The Drowned Choir has
crossing squadrons and an ambush. The new Ember Foundry adds a carrier convoy with a
three-year mission reward. The Citadel of Hours and final arena now have continuous
mountain terrain and keeps planted on deep foundations, with bridges between towers.
The foundry currently shares the canyon music cue.

**A continuous horizon.** Terrain and scenery recycle beyond the fog in forward,
side and rear views. Three persistent mountain silhouettes add depth beyond the
playable landscape. Static scenery meshes are batched by material to keep the
larger scenery buffers practical.

**Architecture you fly through.** Large stone aqueducts cross the canyon, pointed
cathedral arches rise from the drowned landscape, furnace gantries span the foundry,
and mountain gates frame the citadel. Foundations reach the terrain and the central
openings clear the dragon's full flight envelope. Lateral flight room is 33–56% wider
than the previous release, depending on the stage.

**Sharper flight feedback.** Boosts and evasive rolls leave short, soft vapor trails
from the animated wingtips. Target health appears while locked; pale hit markers
and gold kill confirmations show when shots connect. The power display shows roll
readiness, cooldown and recovery, and rolls protect immediately when triggered.
Blue route gates glow, animate on collection and report progress. A clean three-gate
canyon run awards an extra 500 points and 25 wing power; diagonal boost crossings
are judged at the gate plane.
Segments around the reticle show loaded locks, with a gold cue for a full volley.
A shrinking chain meter shows how much time remains to continue a kill streak.

**Break the charge.** Focus fire while a heavy enemy winds up to cancel its attack
and expose it for 1.8 seconds of +50% follow-up damage. The first interruption of
each enemy restores 15 wing power. Cyan brackets and a countdown arc mark that
window. Interrupting a bomber also prevents its mines; sentinel armor still rewards
flanking. This mechanic is introduced after the guided opening.

**An enemy force with distinct roles.** Mixed squadrons replace the random single-type
spawns. Squadrons arrive from beyond the fog over nine seconds; interceptors take
ten seconds to sweep around the flanks and settle astern. This also applies to the
guided opening: lesson timers wait for the incoming ships to reach formation.
Larger hulls and distant engine lights make the approach readable. Target markers fade in
as enemies approach. Wasps and rear interceptors match cruise speed during attack runs;
boosting can still open distance. Shield sentinels resist frontal fire, but flanking
or their post-volley opening bypasses the shield. Heavy bombers fire five lanes after
a longer windup and release a pair of mines. Skimmers rake three lanes in sequence,
interceptors fire tight three-shot bursts, and turrets fire a single fast precision
shot after a longer warning. Carriers deploy two escorts. Orange rings and brackets warn of
incoming volleys; lateral aim commits during that warning so dodging works.
The director and escort launches stay within 18 active enemies, with at most three
simultaneous attacks and 100 ordinary hostile shots. Up to 28 enemies can remain
rendered while departing through the fog; departing actors no longer block fresh
waves. Ships orient to their arrival paths and turn smoothly into combat. Warning
rings persist through staggered bursts, and close-range attacks cancel if boosted past. Scripted mission encounters can
add their own enemies. Ramming enemies does not award kill rewards.

**More forgiving orbs.** Collection radius is 18 world units (previously 4.2), with
strong attraction starting at 95 units (previously 46). Passing near an orb collects
it without requiring contact with its small visible mesh.

**Flight choices.** Boost, air brake and evasive roll add speed control and a brief
evasion window. Boost and roll share a replenishing power reserve. Carriers take
double damage when attacked from more than 26 units to either side or 18 units above;
the HUD indicates when a core is exposed.

**Combat light.** Laser heads have soft cyan glow and bright tapered trails. Hits
flare, explosions throw hot fragments and expanding shockwaves, and three pooled
point lights illuminate nearby surfaces. Forty pooled glow bursts bound the cost.
Clouds use soft mist sprites instead of solid polygon lumps.
Destruction adds cooling ember streaks and textured smoke that rises after ignition.
Shockwaves expand translucently and fade; their materials are independent of debris.
The afterglow uses one shared spark batch and at most 18 smoke sprites, with distant
glow and sparks fading into the stage fog.

**A guided opening flight.** An optional opening teaches sweeping lock-ons with
three non-firing targets worth one year each, shows the years actually earned,
then introduces a telegraphed shot and a carrier with escorts. The carrier holds
formation long enough to engage before a crossing patrol arrives. Press Enter
or use the briefing's skip button to join normal combat immediately. Guidance can
also be disabled on the title screen.

**Clean low-poly rendering.** Everything is drawn at display resolution with MSAA:
hard flat-shaded facets, a textured rider, and soft procedural glow textures. Skies are ordered-dithered
gradients — the dither is there to kill 8-bit banding, not to fake it. Terrain splits
each cell on an alternating diagonal so slopes face in a scattered mosaic instead of
developing long directional slivers. A whisper of scanline and a soft vignette are all
that's left of the CRT pass.

**Saturn mode is still in there.** Press `R` and the buffer drops to 232 lines
nearest-upscaled, the sky quantises to 15-bit, the full scanline/vignette pass comes
back, and every material starts snapping its vertices to a coarse clip-space grid —
the real 90s integer-math wobble, not a filter. The snap shader is always compiled in
and gated on a uniform, so the switch is instant and doesn't rebuild a single
material. The HUD is a separate full-res canvas, so it stays sharp either way.

**A dragon with a flight model.** Wingbeats are driven by an *effort* value derived
from actual vertical velocity, so climbing costs work and diving is free:

| | vertical speed | wingbeats |
|---|---|---|
| idle / level glide | 0 | 0.58/s — one every 1.7s |
| climbing | +45 | **3.70/s** — one every 0.3s |
| diving | −46 | **0.32/s** — one every 3.1s |

A flap takes a fixed ~0.4s however often it comes, so at low effort the dragon
holds an extended glide and flaps only occasionally, with jittered timing so idle
beats aren't metronomic. Climbing is 6.4× the idle rate and 12× the dive rate.

The beat is asymmetric — a fast powered downstroke, a slow recovery — and each
downstroke fires an impulse into a damped spring, so the body genuinely lifts and
settles. Gliding flattens and sweeps the wings back; climbing cups them forward.
Altitude trades for airspeed in both directions. The body banks into its turns,
pitches with its climb, and yaws so the nose leads — all three verified by
measuring the model's world orientation against the camera basis, because every
one of them was silently inverted at first.

**A tail that trails.** The tail isn't told about the turn. It's a chain of
spring joints, each of which keeps its own heading when the joint ahead of it
swings away, then springs back into line — so a turn sends a travelling wave down
it and the tip whips out behind. Two incommensurate sine pairs add a slow waver
that never quite repeats, freer toward the tip.

Movement poses follow actual travel in the dragon's frame, so changing the view
doesn't reverse its bank. Steering eases into the flight boundaries and the rig
settles into a glide when movement stops. Flaps finish before their timing changes,
wing folds ease through recovery, and the rider's brace stays consistent across
frame rates. The tail passes each joint's remaining rotation down the chain rather
than repeating the full turn at every joint.

**Panzer Dragoon lock-on.** Sweeping the reticle stacks locks (a big target soaks
several), and the volley launches in a wide fan before the homing tightens and curls
each bolt onto its target. Each bolt drags an additively-blended ribbon trail whose
anchors are laid down *by distance travelled*, so the streak is the same length at
30fps or 144.

**A recorded score, six cues deep.** One track per episode plus a title and a boss
theme, streamed from [`sound/`](sound/) and cross-faded on episode change. There is
no synth fallback behind them: the game either plays its score or runs on sound
effects alone. It used to open with a procedural chiptune band covering the gap
while the first mp3 buffered, which meant the one thing you always heard was the
one thing that wasn't the soundtrack.

The prompt pack the tracks were generated from — keys, tempo and section plans
measured against the game itself — is in [`ost/ELEVENLABS_PROMPTS.md`](ost/ELEVENLABS_PROMPTS.md).

Effects combine swept FM energy, filtered noise, bass resonance, impact transients,
and decaying chimes. Three reusable variants per effect avoid identical repeated
shots. Stereo placement, distance attenuation, a short reverb and a compressor
blend the layers. The revised weapons use electrical cracks, mechanical clacks,
metal resonances, debris and low pressure tails. Wingbeats have distinct downstroke
and recovery textures. Three reusable stereo loops supply speed-sensitive wind,
stage ambience and an evolving lock charge; they fade out when paused or hidden.
Near misses and enemy shots have positional cues. Large impacts briefly lower the
music, and distant effects lose high frequencies as well as volume.

Press `P` for independently saved music, effects and ambience levels, plus buttons
to audition the laser, explosion and wings. The existing recorded score is retained.
A 28-voice cap and per-effect rate limits control busy volleys.
These are original procedural effects, with no external sample licenses required.

## Building

The repo ships a prebuilt `index.html`. To rebuild from source:

```bash
npm install          # pulls three.js, which gets inlined into the output
node build.js        # concatenates src/ into index.html
```

`src/` is split into modules that share one namespace:

| File | Contents |
|---|---|
| `p1_core.js` | renderer, retro shader patch, sky, SFX synth and the streamed score |
| `p1b_audio.js` | layered effect bank, stereo mix, reverb and compression |
| `p1c_soundscape.js` | flight ambience, charge loop, music ducking and saved mix controls |
| `p2_models.js` | procedural dragon + rider + enemies + boss, and the flight model |
| `p3_world.js` | terrain chunking, batched prop fields, episode definitions |
| `p3c_horizon.js` | layered distant mountain silhouettes |
| `p3d_landmarks.js` | grounded aqueducts, cathedral arches, furnace gantries and mountain gates |
| `p4_game.js` | player, projectiles, ribbons, impacts, enemies, boss AI |
| `p4b_opening.js` | guided opening and authored first encounter |
| `p4c_effects.js` | pooled glow, shockwaves and impact lights |
| `p4e_enemies.js` | mixed squadrons, shield and bomber roles, attack telegraphs |
| `p4d_campaign.js` | boost/brake/roll, route gates and authored stage encounters |
| `p5_hud_loop.js` | HUD canvas, opening cinematic, input, main loop |

## Testing

The release gate runs production-code integration checks without a browser:
`npm run check:release`. It covers the opening, flight rig, maneuvers, authored
formations, route and convoy rewards, world foundations, hidden scenery recycling, enemy approaches and attack patterns,
orb proximity collection, FX bounds and audio buffers.
Visual review uses `tools/combat-preview.html` and `tools/motion-preview.html`.
The combat preview's **Run gauntlet** button cycles through all five stages with
volleys, rolls, boosts, orb pickups and view rotation, reporting frame rate, draw
calls and browser errors.
`tools/audio-check.html` renders the production mix through a real browser
OfflineAudioContext and checks output headroom. The older Playwright tools below require their configured browser installation;
they are additional developer probes, not part of the release gate:

```bash
npm run check:gauntlet       # swept route rewards, roll response, hit feedback and wing trails
node tools/check-enemies.js  # distant approaches, role attacks, shields, stage population and caps
node tools/check-visibility.js # concealed recycling, side views, horizon depth and orb pickup
node tools/check-audio.js    # audio graph lifecycle, mixing, looping, mute and cleanup
node tools/check-upgrade.js  # maneuvers, campaign, world, effects, audio (includes motion)
node tools/check-opening.js  # briefing lifecycle plus real laser/dodge collision checks
node tools/check-motion.js   # real dragon/rider rig, view directions, boundary settling, frame rates
node tools/e2e-play.js        # full playthrough, screenshots, console errors
node tools/e2e-endings.js     # pause, death and victory paths
node tools/check-controls.js  # strafe/pitch directions in all four view rotations
node tools/check-flight.js    # effort response to climb and dive, spring stability
node tools/check-orientation.js   # roll/pitch/yaw measured against the camera basis
node tools/check-flaprate.js  # real wingbeats per second of game time in each state
node tools/check-tail.js      # confirms the tail trails the turn instead of steering it
node tools/model-viewer.js    # isolated turntable renders of the dragon
node tools/check-lasers.js    # lock painting and volley behaviour
node tools/check-music.js     # per-stage track switching, and that no synth music remains
node tools/check-fixes.js     # regression probes for previously shipped defects
node tools/check-perf.js      # draw calls, triangles, sim cost under worst case
```

For visual motion review, serve the project locally and open
`tools/motion-preview.html`. It cycles through turns, climbs, dives and boundary
holds with side/front views, pause and half-speed playback.

## Notes

Unaffiliated fan work. *Panzer Dragoon* is Sega's and *Lords of Thunder* is Hudson's;
this borrows their ideas out of admiration, not their assets. The rider is a low-poly
parody character, and the narrator captions are written in-character rather than
presented as anyone's real words.

MIT licensed — see [LICENSE](LICENSE).
