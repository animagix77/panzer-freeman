/* Judge Dean LLC — Optional original parody narration and timed captions. */
(function () {
'use strict';
var P = window.__PF, A = P.Audio_, files = window.__PF_VOICE_FILES || {};
var lines = {
  opening: 'At eighty-nine, I had a very short list. Find the Fountain. Get a younger dragon.',
  salvage: 'Five lights in the water. Someone went to a lot of trouble to lose those years.',
  foundry: 'Three carriers. The trick is getting them to show you the soft side.',
  citadel: 'The castle had stairs, once. I prefer the dragon.',
  victory: 'I came all this way for another year. I think I will spend it flying.'
};
var sectorCue = { ep1: 'opening', ep2: 'salvage', foundry: 'foundry', ep3: 'citadel' };
var seen = {}, active = null, pending = null, duck = 0, lastSector = null;
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
    active.media.pause(); active.media.onended = active.media.onerror = null;
    if (active.media.removeAttribute) active.media.removeAttribute('src');
  }
  active = null;
  if (caption) caption.hidden = true;
  if (wrap) wrap.classList.remove('voice-speaking');
}
function start(id) {
  stop();
  var text = lines[id], cue = active = { id: id, elapsed: 0, duration: Math.max(5, text.split(/\s+/).length * .37),
    media: null, playPending: false, failed: false, endAt: null };
  // Missing clips deliberately remain caption-only; no placeholder audio URL.
  if (files[id] && typeof window.Audio === 'function') {
    cue.media = new window.Audio(files[id]); cue.media.preload = 'metadata';
    cue.media.onended = function () {
      cue.media.pause();
      if (active === cue) cue.endAt = Math.max(cue.duration, cue.elapsed + .65);
    };
    cue.media.onerror = function () { cue.failed = true; cue.media.pause(); };
  }
  if (caption) {
    captionText.textContent = text;
    credit.textContent = files[id] ? 'AI PARODY VOICE · PARROT AI' : 'THE RIDER';
    caption.hidden = false; wrap.classList.add('voice-speaking');
  }
}
function play(cue) {
  if (!cue.media || cue.failed || cue.playPending || !cue.media.paused || cue.endAt !== null) return;
  cue.playPending = true;
  try {
    var result = cue.media.play();
    if (result && result.then) result.then(function () {
      cue.playPending = false;
      if (active !== cue || (P.Game.state !== 'playing' && P.Game.state !== 'win') || (document && document.hidden)) cue.media.pause();
    }, function () {
      cue.playPending = false;
      // Pausing may abort a pending play promise: retry that clip on resume,
      // but keep genuine autoplay/decoding failures caption-only.
      cue.failed = active === cue && (P.Game.state === 'playing' || P.Game.state === 'win') && !(document && document.hidden);
      cue.media.pause();
    });
    else cue.playPending = false;
  } catch (e) { cue.playPending = false; cue.failed = true; }
}
P.voice = {
  lines: lines,
  hasAudio: Object.keys(lines).some(function (id) { return !!files[id]; }),
  reset: function () { stop(); pending = null; seen = {}; duck = 0; lastSector = null; },
  update: function (dt) {
    if (!P.Game) return;
    var state = P.Game.state, visible = !document || !document.hidden;
    var running = visible && (state === 'playing' || state === 'win');
    if (state === 'title' || state === 'over') { stop(); pending = null; }
    var ep = P.world && P.world.EPISODES[P.Game.epIndex];
    if (state === 'playing' && ep && lastSector !== ep.id) {
      if (lastSector !== null) { stop(); pending = null; }
      lastSector = ep.id;
    }
    var id = state === 'win' ? 'victory' : state === 'playing' && ep ? sectorCue[ep.id] : null;
    if (id && !seen[id]) {
      seen[id] = true; stop(); pending = { id: id, delay: id === 'victory' ? .5 : 4.6 };
    }
    if (running && pending) {
      pending.delay -= dt;
      var cardVisible = P.el && P.el.card && P.el.card.classList.contains('on');
      if (pending.delay <= 0 && (pending.id === 'victory' || !cardVisible)) {
        var next = pending.id; pending = null; start(next);
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
        if (!running) media.pause(); else play(cue);
      }
      if (running) {
        cue.elapsed += dt;
        var duration = media && !cue.failed ? Math.max(cue.duration, Number.isFinite(media.duration) ? media.duration + 1 : cue.duration + 6) : cue.duration;
        if (cue.elapsed >= (cue.endAt === null ? duration : cue.endAt)) stop();
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
    if (active.media) active.media.pause();
    if (caption) caption.hidden = true;
  }
});
})();
