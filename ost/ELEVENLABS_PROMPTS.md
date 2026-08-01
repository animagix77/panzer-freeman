# Panzer Freeman — Eleven Music prompt pack

Grounded in what's already in the game, not generic fantasy orchestral. Every key,
tempo and duration below was read out of `src/p1_core.js` and `src/p3_world.js`.

## What the game already establishes

| Track | Episode | Key (from the note data) | Screen time |
|---|---|---|---|
| `title` | The Sky Still Owes Him | **G major** | loops until Begin |
| `ep1` | The Ashen Canyon | **D Dorian** (D F G A B — minor 3rd, major 6th) | **~96 s** |
| `ep2` | The Drowned Choir | **A minor / C major** (all naturals) | **~90 s** |
| `ep3` | The Citadel of Hours | **D minor / Aeolian** (D E F G A B♭) | **~81 s** |
| `boss` | Chronos, the Hour-Sphinx | **low E Phrygian cluster** (E F F♯ G, MIDI 28–43) | until it dies |

**Tempo: 111 BPM.** The sequencer runs a 16th-note step every 0.135 s, so a beat is
0.54 s. Everything you generate should sit at 111 BPM or an exact half/double (55.5
or 222) if you want it to feel related to the existing cues.

Episode timings are `length / speed` — so a track only needs ~90 s before it loops.
Generate **2–3× that** and crossfade, rather than generating exactly 90 s.

## Eleven Music rules that actually matter here

- Add **"instrumental only"** to every prompt — this is a score, you never want vocals
  with words. (Wordless choir is different; ask for "wordless choral vowels".)
- **Tempo and key in the prompt work.** "111 BPM", "in D Dorian" are respected.
- **Composition plans** (`music_v2`) give per-section control: up to 30 chunks,
  3–120 s each, 3 s–10 min total. Use these for the boss.
- **Negative styles are the highest-leverage knob.** Use them liberally.
- Longer prompts are *not* automatically better — the docs say brevity can help.
- The **first chunk sets the genre for the whole piece.** Don't open on an ambient
  intro if the body is percussive; it drags the whole track that way.

Don't name the Sega composer or the original soundtrack in a prompt. Describe the
*sound* instead — it's more reliable and it keeps the output yours.

## House style — paste into every prompt

> Instrumental only. 111 BPM. Mid-90s Sega Saturn game score: FM synthesis pads,
> detuned saw leads, tuned hand percussion, dulcimer and ney flute, wordless choral
> vowels. Dry room, narrow stereo, slight tape saturation. No modern production
> polish, no sidechain pumping, no EDM drops.

**Negative styles for all tracks:**
`lyrics, vocals with words, rap, modern EDM, dubstep, trap hi-hats, sidechain pumping, orchestral hybrid trailer, lo-fi hip hop, distorted guitar, cinematic braams, heavy reverb wash`

---

## 00 — The Sky Still Owes Him (Title)

The lede is "Eighty-nine years old, and the sky still owes him something." It should
sound like a fanfare that knows it's late in the day. Yours already drops into the
riff at 0:11 — keep that.

**Simple prompt**

> Instrumental only. 111 BPM in G major. A weary heroic fanfare for a Sega Saturn era
> rail shooter title screen. Opens with a lone muted trumpet over a low drone, then at
> 11 seconds a full ensemble enters: FM brass stabs, tuned frame drums, dulcimer
> arpeggio, wordless choir on open vowels. Proud but tired, like a last ride. Dry room,
> narrow stereo, tape saturation. Ends on an unresolved suspended chord so it loops.

**Composition plan**

```json
{
  "chunks": [
    { "duration_ms": 11000, "context_adherence": "high",
      "text": "[Intro] lone muted trumpet over a low sustained drone, sparse",
      "positive_styles": ["111 BPM", "G major", "solo muted trumpet", "low synth drone", "FM synthesis", "sparse", "dry room", "instrumental only"],
      "negative_styles": ["drums", "vocals with words", "heavy reverb wash", "modern EDM"] },
    { "duration_ms": 24000, "context_adherence": "high",
      "text": "[Fanfare] full ensemble enters on the downbeat, the main theme",
      "positive_styles": ["FM brass stabs", "tuned frame drums", "hammered dulcimer arpeggio", "wordless choral vowels", "heroic but weary", "111 BPM", "G major"],
      "negative_styles": ["cinematic braams", "orchestral hybrid trailer", "sidechain pumping"] },
    { "duration_ms": 24000, "context_adherence": "high",
      "text": "[Theme B] the melody restated lower, strings and ney flute answer",
      "positive_styles": ["ney flute counter-melody", "low strings", "restrained", "111 BPM"],
      "negative_styles": ["key change", "tempo change", "drums drop out"] },
    { "duration_ms": 16000, "context_adherence": "high",
      "text": "[Turnaround] resolve onto an unresolved suspended chord, ready to repeat",
      "positive_styles": ["suspended chord", "loop-ready", "no final ritardando", "sustained"],
      "negative_styles": ["fade out", "big ending", "cymbal swell", "ritardando"] }
  ]
}
```

---

## 01 — Ashen Gallop (Episode I: The Ashen Canyon)

*"Where the empire buried its machines, the sand still hums."* Desert, orange sky,
first flight. Should feel like forward motion more than threat.

> Instrumental only. 111 BPM in D Dorian. Driving desert flight music for a rail
> shooter — galloping 6/8 hand percussion, darbuka and riq, a detuned saw-wave lead
> playing a modal ostinato, drone strings underneath. Bright and propulsive but with a
> minor colour. Buried machinery hums under the sand: add a faint metallic resonance
> pad. Mid-90s FM synthesis, dry and narrow. Loops seamlessly, no ending.

**Negative styles (add to house list):** `major key resolution, triumphant, sparse ambient, half-time breakdown`

---

## 02 — The Drowned Choir (Episode II)

*"A city sang here once. Now only the water keeps the tune."* This one should be the
strangest track on the disc. Lean into the choir being underwater.

> Instrumental only. 111 BPM in A minor. Submerged, reverberant flight music. Wordless
> choral vowels drifting slightly out of tune, as if heard through water. Bowed glass
> and vibraphone, slow arpeggiated FM bell pad, soft mallet percussion with no attack.
> A pulse exists but stays under the surface — felt, not driven. Melancholy and
> beautiful, not frightening. Mid-90s Sega Saturn score. Loops seamlessly.

**Negative styles (add):** `aggressive percussion, bright brass, staccato strings, dry mix, upbeat`

---

## 03 — Citadel of Hours (Episode III)

*"Above the last cloud, the Fountain keeps its own weather."* Highest, coldest,
closest to the goal. Clockwork should start creeping in — it sets up the boss.

> Instrumental only. 111 BPM in D minor. High-altitude approach music, thin cold air.
> A clockwork ostinato of plucked pizzicato and tuned woodblock, like an escapement
> ticking in 16ths. Choir enters on sustained open fifths. Low brass swells announce
> something enormous ahead. Tension rising across the whole track without ever
> releasing. Mid-90s FM synthesis, dry room, narrow stereo. Loops seamlessly, no
> resolution.

**Negative styles (add):** `resolution, warm, comforting, major key, fade out, triumphant brass`

---

## 04 — The Hour-Sphinx (Final)

*"It has counted every second of his life. It intends to keep them."* The existing cue
sits in a low E–G cluster (MIDI 28–43) — deliberately claustrophobic. It plays until
the boss dies, so this needs to loop hard. Use a composition plan for the phases.

```json
{
  "chunks": [
    { "duration_ms": 18000, "context_adherence": "high",
      "text": "[Phase 1] low menacing pulse, the machine notices him",
      "positive_styles": ["111 BPM", "E Phrygian", "very low register", "detuned FM bass cluster", "ticking clock percussion", "sparse", "menacing", "instrumental only"],
      "negative_styles": ["melody", "bright timbres", "vocals with words", "cinematic braams"] },
    { "duration_ms": 30000, "context_adherence": "high",
      "text": "[Phase 2] full battle, driving and relentless",
      "positive_styles": ["driving taiko and darbuka", "chromatic FM brass stabs", "wordless male choir chanting on one note", "relentless", "111 BPM", "E Phrygian"],
      "negative_styles": ["swing", "resolution", "major key", "tempo change"] },
    { "duration_ms": 30000, "context_adherence": "high",
      "text": "[Phase 3] the clock motif returns over the battle rhythm, escalating",
      "positive_styles": ["clockwork 16th ostinato", "layered choir", "rising chromatic tension", "organ pedal tone"],
      "negative_styles": ["breakdown", "silence", "fade out"] },
    { "duration_ms": 22000, "context_adherence": "high",
      "text": "[Loop back] tension held, no cadence, returns to the phase 1 pulse",
      "positive_styles": ["unresolved", "loop-ready", "sustained low cluster", "no ritardando"],
      "negative_styles": ["final chord", "cymbal crash ending", "fade out", "ritardando"] }
  ]
}
```

---

## 05 — Rank Reborn (Ending) — you don't have this one yet

The ending sets his final age from survival time and says *"The old rider swings down
off the dragon at N."* Worth its own cue rather than reusing the title.

> Instrumental only. 92 BPM in G major. A quiet resolution of a heroic theme — the same
> melody as a title fanfare but played by solo ney flute and hammered dulcimer, no
> percussion, warm and unhurried. Strings enter halfway and lift it. Ends on a full
> resolved cadence. Mid-90s Sega Saturn score, dry room. About 45 seconds.

---

## Looping

Eleven Music won't give you a seamless loop. Two options that work:

1. Generate **3–4× the needed length**, find a bar line ~2 bars in, cut there, and
   crossfade the tail over the head by exactly one bar (at 111 BPM, one 4/4 bar =
   **2.162 s**).
2. Write the last chunk with `negative_styles: ["fade out", "final chord", "ritardando"]`
   and `positive_styles: ["loop-ready", "unresolved"]` — as above — then hard-cut.

The game currently plays a **procedural WebAudio sequencer**, not files; `ost/*.mp3`
are renders of that via `tools/render-ost.js`. Swapping to generated audio means
loading real files, which changes the single-file build — worth deciding before you
generate a full set.
