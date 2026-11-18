/* Judge Dean LLC — Optional original parody narration and timed captions. */
(function () {
'use strict';
var P = window.__PF, A = P.Audio_, files = window.__PF_VOICE_FILES || {};
var lines = {
  opening: 'At eighty-nine, I had a very short list. Find the Fountain. Get a younger dragon.',
  salvage: 'Five lights in the water. Someone went to a lot of trouble to lose those years.',
  foundry: 'Three carriers. The trick is getting them to show you the soft side.',
  citadel: 'The castle had stairs, once. I prefer the dragon.',
  victory: 'I came all this way for another year. I think I will spend it flying.',
  counter: 'Return to sender. No forwarding address.',
  chargebreak: 'He had a whole speech prepared. Then I shot the microphone.',
  gates: 'Three gates. Not one of them validated parking.',
  pickup: 'That was my left knee in nineteen eighty-six. I would know it anywhere.',
  streak: 'At my age, a hot streak usually means the electric blanket is on.',
  wasp: 'That was the squadron leader. The promotion process just got interesting.',
  ray: 'A flying stingray. Somewhere, an aquarium is getting a very bad review.',
  turret: 'All that swiveling, and he still picked the wrong pensioner.',
  chaser: 'He followed me for three miles. I hope he kept the receipt.',
  carrier: 'That ship had a crew of forty. Apparently none of them drove.',
  mine: 'If you want to be a surprise, son, turn off the blinking light.',
  sentinel: 'A shield on the front. A whole committee signed off on that.',
  bomber: 'He dropped everything to be here. Mostly on his own side.',
  nearmiss: 'That shot went by so slowly, I had time to rewrite my last will and testament.',
  wounded: "That one hurt. And I haven't even earned that knee back yet.",
  hotstreak: 'They sent reinforcements. Bless them. They brought me seconds.',
  decade: 'There goes another decade. I was hoping to lose the pants from that era, too.',
  boss: 'So that is the keeper of time. He missed our appointment by three thousand years.',
  core: "That glowing bit was important. You can tell by the way he's taking it.",
  boost: 'Easy, dragon. My face is still back at the last checkpoint.',
  brake: 'Air brakes. At my age, you appreciate anything that stops on request.',
  momcarrier: "Your mom's so fat, the carrier asked her for docking clearance.",
  momlock: "Your mom's so fat, I tried to lock on and my radar asked, which hemisphere?"
};
var sectorCue = { ep1: 'opening', ep2: 'salvage', foundry: 'foundry', ep3: 'citadel' };
var seen = {}, active = null, pending = null, duck = 0, lastSector = null;
var reactionPriority = {
  boost: 1, brake: 1, pickup: 1, nearmiss: 1,
  wasp: 2, ray: 2, chaser: 2, turret: 2, carrier: 2, mine: 2, sentinel: 2, bomber: 2,
  wounded: 3, decade: 3, streak: 3, hotstreak: 3,
  chargebreak: 4, counter: 4, momlock: 4, momcarrier: 4,
  gates: 5, core: 5, boss: 6
};
// Keep take counts between flights on this page. Short runs can discover both
// delivery variants even if the pilot always performs exactly the same trick.
var heard = {};
var variations = { streak: ['streak', 'hotstreak'], foundryKill: ['momcarrier', 'carrier'] };
var reaction = null, quietTime = 0, lastGap = 0;
var narrator = null, unlocked = false;
var document = window.document, caption = null, captionText = null, credit = null, wrap = null;
if (document && document.createElement) {
  wrap = document.getElementById('wrap') || document.body;
  var style = document.createElement('style');
  style.textContent = '#voice-caption{position:absolute;z-index:45;right:24px;bottom:108px;max-width:min(620px,44vw);padding:10px 14px;background:#07141ce8;border-left:2px solid #f0ca8d;color:#fff5dd;font:italic 15px/1.45 Georgia,serif;pointer-events:none;box-shadow:0 5px 20px #0004}' +
    '#voice-caption[hidden]{display:none}#voice-caption small{display:block;font:600 9px/1.4 system-ui,sans-serif;letter-spacing:.12em;color:#c1d7d2;margin-bottom:4px}#wrap.voice-speaking #quip{visibility:hidden}' +
    '@media(max-width:700px),(max-height:570px){#voice-caption{right:10px;bottom:125px;max-width:44vw;padding:7px 9px;font-size:12px}#voice-caption small{font-size:8px}}';
  document.head.appendChild(style);
  caption = document.createElement('div'); caption.id = 'voice-caption'; caption.hidden = true;
  caption.setAttribute('role', 'status'); caption.setAttribute('aria-live', 'polite');
  credit = document.createElement('small'); captionText = document.createElement('span');
  caption.appendChild(credit); caption.appendChild(captionText); wrap.appendChild(caption);
}
function stop() {
  if (active && active.media) {
    active.media.onended = active.media.onerror = null; active.media.pause();
    if (active.media.removeAttribute) active.media.removeAttribute('src');
  }
  active = null;
  if (caption) caption.hidden = true;
  if (wrap) wrap.classList.remove('voice-speaking');
}
function arm() {
  if (unlocked || active || !P.voice.hasAudio || typeof window.Audio !== 'function') return;
  // Safari grants delayed playback to the media element used in the launch
  // gesture. Play 16 ms of silent PCM on that element before any timed line.
  if (!narrator) narrator = new window.Audio();
  narrator.src = 'data:audio/wav;base64,UklGRiQBAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQABAAAA' + 'AAAA'.repeat(85);
  try {
    var result = narrator.play();
    if (result && result.then) result.then(function () { unlocked = true; }, function () {});
    else unlocked = true;
  } catch (e) {}
}
function start(id) {
  stop();
  var text = lines[id], cue = active = { id: id, elapsed: 0, duration: Math.max(5, text.split(/\s+/).length * .37),
    media: null, playPending: false, failed: false, endAt: null };
  // Missing clips deliberately remain caption-only; no placeholder audio URL.
  if (files[id] && typeof window.Audio === 'function') {
    cue.media = narrator || new window.Audio(); cue.media.preload = 'metadata'; cue.media.src = files[id];
    cue.media.onended = function () {
      if (active !== cue) return;
      cue.media.pause(); cue.endAt = Math.max(cue.duration, cue.elapsed + .65);
    };
    cue.media.onerror = function () { if (active === cue) { cue.failed = true; cue.media.pause(); } };
  }
  if (caption) {
    captionText.textContent = text;
    credit.textContent = files[id] ? 'AI PARODY VOICE · PARROT AI' : 'THE RIDER';
    caption.hidden = false; wrap.classList.add('voice-speaking');
  }
}
function play(cue) {
  if (!cue.media || cue.failed || cue.playPending || !cue.media.paused || cue.endAt !== null) return;
  cue.playPending = true; cue.interrupted = false;
  try {
    var result = cue.media.play();
    if (result && result.then) result.then(function () {
      cue.playPending = false;
      if (active !== cue) return;
      if ((P.Game.state !== 'playing' && P.Game.state !== 'win') || (document && document.hidden)) cue.media.pause();
    }, function (error) {
      cue.playPending = false;
      if (active !== cue) return;
      // Pausing may abort a pending play promise: retry that clip on resume,
      // but keep genuine autoplay/decoding failures caption-only.
      var interrupted = cue.interrupted && error && error.name === 'AbortError';
      cue.failed = !interrupted && (P.Game.state === 'playing' || P.Game.state === 'win') && !(document && document.hidden);
      cue.media.pause();
    });
    else cue.playPending = false;
  } catch (e) { cue.playPending = false; cue.failed = true; }
}
P.voice = {
  lines: lines,
  arm: arm,
  hasAudio: Object.keys(lines).some(function (id) { return !!files[id]; }),
  isSpeaking: function () { return !!active; },
  react: function (event) {
    if (P.Game.state !== 'playing' || P.Game.ending || P.Game.cinematic || (document && document.hidden)) return false;
    var choices = variations[event], id = event;
    if (choices) {
      id = null;
      choices.forEach(function (take) {
        if (!seen[take] && (!id || (heard[take] || 0) < (heard[id] || 0))) id = take;
      });
    }
    var priority = reactionPriority[id];
    if (!priority || seen[id]) return false;
    if (reaction && reaction.id !== id && (priority < reaction.priority ||
        (priority === reaction.priority && (heard[id] || 0) >= (heard[reaction.id] || 0)))) return false;
    var briefing = pending || (active && !reactionPriority[active.id]);
    // A collected salvage trail can wait until the briefing ends. A flyby or
    // kill only makes sense while the player can still connect it to the shot.
    var lifetime = id === 'pickup' && briefing ? 16 : id === 'boss' ? 7 : priority >= 4 ? 3.5 : 2;
    if (reaction && reaction.id === id) reaction.remaining = lifetime;
    else reaction = { id: id, priority: priority, remaining: lifetime,
      // Leave ordinary events a beat for the outcome of this volley to arrive.
      delay: priority <= 2 ? .42 : 0 };
    return true;
  },
  reset: function () {
    stop(); pending = reaction = null; seen = {}; duck = quietTime = 0; lastSector = null;
  },
  update: function (dt) {
    if (!P.Game) return;
    var state = P.Game.state, visible = !document || !document.hidden;
    var running = visible && (state === 'playing' || state === 'win');
    if (state === 'title' || state === 'over') { stop(); pending = reaction = null; }
    var ep = P.world && P.world.EPISODES[P.Game.epIndex];
    if (state === 'playing' && ep && lastSector !== ep.id) {
      if (lastSector !== null) { stop(); pending = reaction = null; }
      lastSector = ep.id;
    }
    var id = state === 'win' ? 'victory' : state === 'playing' && ep ? sectorCue[ep.id] : null;
    if (id && !seen[id]) {
      seen[id] = true; stop(); pending = { id: id, delay: id === 'victory' ? .5 : 4.6 };
    }
    if (state === 'win' || (P.Game.ending && state === 'playing')) reaction = null;
    if (running) quietTime = Math.max(0, quietTime - dt);
    var cardVisible = P.el && P.el.card && P.el.card.classList.contains('on');
    if (running && pending) {
      pending.delay -= dt;
      if (pending.delay <= 0 && (pending.id === 'victory' || !cardVisible)) {
        var next = pending.id; pending = null; start(next);
      }
    }
    if (running && reaction) {
      reaction.remaining -= dt; reaction.delay -= dt;
      if (reaction.remaining <= 0) reaction = null;
      // Six seconds between incidental remarks. A special achievement can
      // answer the action sooner, with a minimum breath between recordings.
      else if (!pending && !active && !cardVisible && reaction.delay <= 0 &&
          quietTime <= (reaction.priority >= 4 ? Math.max(0, lastGap - 1.25) : 0)) {
        seen[reaction.id] = true;
        heard[reaction.id] = (heard[reaction.id] || 0) + 1;
        start(reaction.id); reaction = null;
      }
    }
    if (active) {
      var cue = active, media = cue.media;
      if (caption) caption.hidden = !running;
      if (media) {
        var voiceLevel = P.sound && Number.isFinite(P.sound.settings.voice) ? Math.max(0, Math.min(1, P.sound.settings.voice)) : 1;
        // iOS can ignore programmatic volume changes. Explicit mute guarantees
        // a zero voice setting is silent while the captions keep their timing.
        media.muted = !!A.muted || voiceLevel === 0;
        try { media.volume = .88 * voiceLevel; } catch (e) {}
        if (!running) { if (cue.playPending) cue.interrupted = true; media.pause(); }
        else play(cue);
      }
      if (running) {
        cue.elapsed += dt;
        var duration = media && !cue.failed ? Math.max(cue.duration, Number.isFinite(media.duration) ? media.duration + 1 : cue.duration + 6) : cue.duration;
        if (cue.elapsed >= (cue.endAt === null ? duration : cue.endAt)) {
          quietTime = lastGap = reactionPriority[cue.id] ? 6 : 2;
          stop();
        }
      }
    }
    var audible = running && active && active.media && !active.failed && !active.media.paused && !active.media.muted && voiceLevel > 0;
    duck += ((audible ? .48 : 0) - duck) * (1 - Math.exp(-dt * 7));
    if (A.duck && duck > .001) A.duck(duck);
  },
  state: function () { return { id: active ? active.id : null, elapsed: active ? active.elapsed : 0,
    caption: active ? lines[active.id] : '', hasAudio: !!(active && active.media && !active.failed), pending: pending ? pending.id : null }; }
};
if (document && document.addEventListener) document.addEventListener('visibilitychange', function () {
  if (document.hidden && active) {
    if (active.playPending) active.interrupted = true;
    if (active.media) active.media.pause();
    if (caption) caption.hidden = true;
  }
});
})();
