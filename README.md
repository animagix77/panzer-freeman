# PANZER FREEMAN — Chronos Requiem

A 3D rail shooter by **Judge Dean LLC** that runs in a single HTML file.
An eighty-nine-year-old man rides a dragon toward a machine that runs time backwards.
Defeating enemies gives him time back. Taking hits ages him.

**[▶ Play it](https://animagix77.github.io/panzer-freeman/)** · no install required.

![Title](docs/00-title.png)

---

## What it is

A tribute to **Panzer Dragoon** (Sega Saturn, 1995) — the rail flight, the four-way
view rotation, the sweep-to-paint lock-on volleys — drawn as clean low-poly rather
than as a Saturn emulation, with a soundtrack aimed squarely at **Lords of Thunder**
(PC Engine CD). The HTML bundle embeds Three.js, the rider model,
and procedural game systems. Six MP3 cues stream from `sound/`; effects use an
original Web Audio sample bank rendered at startup. Serve the folder over HTTP.

| | |
|---|---|
| ![Drowned Choir salvage flight](docs/04-drowned-choir.png) | ![Canyon](docs/02-canyon.png) |
| ![Lasers](docs/03-lasers.png) | ![Boss](docs/05-boss.png) |

![The dragon](docs/06-model.png)

## Controls

| Key | Action |
|---|---|
| `A` `D` | bank left / right |
| `W` `S` | dive / climb (inverted by default) |
| Mouse | aim reticle |
| Hold LMB | sweep to paint lock-ons (starts at 8; grows as you reclaim years) |
| Release LMB | fire the homing laser volley |
| RMB | rapid gun |
| `Shift` | boost; consumes wing power |
| `X` | air brake |
| `Space` + direction | evasive roll; costs 28 wing power, 1.4s cooldown |
| `Q` `E` | rotate the view 90° |
| `I` | toggle inverted pitch |
| `R` | toggle Saturn mode |
| `P` | pause · `M` mute |

On touch devices, a separate thumb pad steers while dragging across the sky aims
and paints locks. Lift the aiming finger to fire. Dedicated buttons provide rapid
fire, boost, brake, roll, view rotation and pause. The thumb pad uses direct pitch:
drag up to climb. Touch gestures cancel cleanly when paused, hidden or interrupted.

## The interesting bits

**Choose your departure.** The launch screen previews all five sectors and lets you
start at any of them. Guided flight remains optional in the opening canyon. Pause
now includes Resume and Abandon flight; results let you replay or return to sector
selection. Compact HUD layouts separate age, score and sector progress on smaller
screens.

**Objectives give each sector a purpose.** A live mission panel tracks flight
maneuvers, salvage, canyon gates, marked convoy targets, charge breaks and the final
cores. Diamond markers distinguish mission enemies from ambient patrols. Objectives
award score, wing power and occasional recovered years; missed objectives do not
stop the run. The result screen records completed objectives and reflected shots.

**A rebuilt cast.** The dragon wears ivory flight armor over a deep teal body, with
cyan and gold bands that deform with its articulated wing membranes. A crimson cape fastens to
the rider’s shoulders. Its hem lifts in the slipstream, folds on braking and swings wide when the dragon reverses a bank.
The cloth rests against the saddle and the armoured ridge along the dragon’s back.
Six enemy hulls have distinct sculpted silhouettes,
engine nacelles and exposed machinery, batched into four to six mesh draws apiece.
The Sphinx has a faceted face, an obelisk crown and layered stone flight feathers.
Replays restore its original scale, rings, shields and core state.

**Return fire.** Time a roll as a hostile shot reaches the dragon's wings to reflect
one shot toward its living shooter for 180 points. Only the first 0.22 seconds of
the roll can reflect; the remaining dodge and recovery retain their usual behavior.
Reflection becomes available after the guided opening.

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

**Combat light.** Laser heads leave tapered cyan trails. A destroyed enemy
flashes white at the core, then its fireball rolls outward inside two expanding
shock fronts. Sentinels burst in cyan and blue, bombers in violet and pink, and
mines in lime and cyan. The colors carry into the sparks, fragments and rising
smoke. Nearby surfaces catch the light and distant bursts fade into the stage fog.
Chronos breaks apart in a timed chain of colored detonations.

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

**Dragon flight.** Tap a direction and the inside wing lowers and sweeps back
as the dragon banks. Hold a steady course and the bank shallows. Reverse into a
climb or dive and the dragon rolls through level while pitching toward its new
flight path. Forward speed matters: the same rise looks shallower under boost.

The wingtips drive down as the body lifts on a powered stroke. The shoulder
leads the elbow and wrist, and climbs bring the strokes closer together.
In a dive the wings sweep aft into a glide. The rider braces and the tail
follows the turn joint by joint. Changing the camera view preserves the
direction of an evasive roll already in progress.

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

**Rider dialogue.** The rider narrates the opening flight, salvage run, carrier
convoy, mountain citadel and victory. He also reacts to a reflected shot, an
interrupted charge, a clean three-gate run, an orb pickup and a three-kill chain.
Sector dialogue gets priority, and each flight reaction plays at most once per
run. Eight enemy-specific captions mix into the quieter stretches of combat.
All rider lines have captions. The pause menu has a Rider voice level in builds
with recorded clips. Music dips during speech, and pausing holds the line in place.

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
| `p1d_voice.js` | sector dialogue, captions, recorded clip playback and mix |
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
| `p5b_touch.js` | independent touch steering, aiming, firing and maneuver controls |

## Testing

The release gate runs production-code integration checks without a browser:
`npm run check:release`. It covers the opening, flight rig, maneuvers, authored
formations, route and convoy rewards, world foundations, hidden scenery recycling, enemy approaches and attack patterns,
orb proximity collection, FX bounds, audio buffers, touch input, objective outcomes,
model budgets and boss replay state.
Visual review uses `tools/combat-preview.html` and `tools/motion-preview.html`.
The combat preview's **Run gauntlet** button cycles through all five stages with
volleys, rolls, boosts, orb pickups and view rotation, reporting frame rate, draw
calls and browser errors.
`tools/audio-check.html` renders the production mix through a real browser
OfflineAudioContext and checks output headroom. The older Playwright tools below require their configured browser installation;
they are additional developer probes, not part of the release gate:

```bash
npm run check:gauntlet       # swept route rewards, roll response, hit feedback and wing trails
npm run check:touch          # multitouch steering/aiming, maneuvers and cancellation
node tools/check-models.js   # batched hull budgets, animated cloth and boss replay alignment
node tools/check-objectives.js # sector objectives, earned rewards and replay lifecycle
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

The game code is MIT licensed. Any Parrot AI voice recordings accompanying a build
are synthetic parody performances generated with Parrot AI. The service limits
celebrity voices to noncommercial parody. [Code license](LICENSE) · [Parrot AI voice usage](https://parrotai.crisp.help/en/article/can-i-use-parrot-ai-for-commercial-purposes-gocp00/)
