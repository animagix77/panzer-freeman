/* Judge Dean LLC — independent multitouch flight, aiming and maneuver controls. */
(function () {
'use strict';
var P = window.__PF, Input = P.Input, Game = P.Game, Player = P.Player;
var enabled = !!(navigator.maxTouchPoints || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
var pointers = new Map(), aimPointer = null, stickPointer = null, lastState = Game.state, lastTime = Game.time;
var keyOwners = {}, previousKeys = {}, mouseFireBefore = false, shown = false, menuHelp = null;
Input.touchX = Input.touchY = 0;
var style = document.createElement('style');
style.textContent = [
  "#gl{touch-action:none}#touch-flight{position:fixed;inset:0;z-index:14;pointer-events:none;display:none;user-select:none;-webkit-user-select:none}",
  "#touch-flight.on{display:block}#touch-flight button,#touch-stick{pointer-events:auto;touch-action:none;-webkit-tap-highlight-color:transparent}",
  "#touch-stick{position:absolute;left:max(12px,env(safe-area-inset-left));bottom:max(20px,env(safe-area-inset-bottom));width:112px;height:112px;border-radius:50%;border:1px solid #a3d9d466;background:radial-gradient(circle,#152b3655,#08142299);box-shadow:inset 0 0 30px #78d7d812}",
  "#touch-stick:before,#touch-stick:after{content:\"\";position:absolute;background:#a4dddd33;pointer-events:none}#touch-stick:before{left:55px;top:12px;width:1px;height:86px}#touch-stick:after{left:12px;top:55px;width:86px;height:1px}",
  "#touch-knob{position:absolute;left:36px;top:36px;width:38px;height:38px;border:1px solid #b4f5e9aa;border-radius:50%;background:#87d6d64d;pointer-events:none}",
  "#touch-stick-label{position:absolute;top:-22px;left:0;right:0;text-align:center;font:10px system-ui;color:#c2e8e1;letter-spacing:.14em}",
  "#touch-buttons{position:absolute;right:max(12px,env(safe-area-inset-right));bottom:max(20px,env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(4,48px);gap:6px}",
  "#touch-flight button{min-width:44px;min-height:46px;border:1px solid #8eb8bc88;border-radius:12px;background:#10232cba;color:#e3f6ee;font:600 10px system-ui;letter-spacing:.07em;padding:8px 3px}",
  "#touch-flight button.held{background:#518b8bbf;border-color:#c1fff0}#touch-flight button[data-touch-action=boost]{color:#ffd998;border-color:#e5b46f99}",
  "#touch-status{position:absolute;right:12px;bottom:123px;width:210px;text-align:center;color:#c8f1e3;font:10px system-ui;pointer-events:none}",
  "#touch-hint{position:absolute;bottom:147px;right:12px;width:210px;color:#bedcd7;font:9px system-ui;text-align:center;pointer-events:none}",
  "body.touch-mode #briefing{top:108px;bottom:auto;left:12px;transform:none;width:min(330px,calc(50vw - 24px));max-height:calc(100vh - 282px);overflow:auto;padding:8px 10px;touch-action:pan-y}",
  "body.touch-mode #voice-caption{top:108px;bottom:auto;right:12px;max-width:none;width:min(330px,calc(50vw - 24px));max-height:calc(100vh - 282px);overflow:hidden;padding:8px 10px;font-size:12px;line-height:1.35}",
  "body.touch-mode #objective{top:108px;left:12px;width:min(280px,calc(50vw - 24px));padding:6px 8px}",
  "body.touch-guided #objective{display:none}body.touch-mode #skipBriefing{margin-top:4px;min-height:28px}body.touch-mode #briefingText{margin:4px 0;line-height:1.35}",
  "body.touch-mode #briefingTitle{font-size:14px;margin:4px 0}body.touch-mode #briefingStep{font-size:9px}",
  "@media(max-width:620px) and (min-height:560px){body.touch-mode #briefing,body.touch-mode #voice-caption,body.touch-mode #objective{left:12px;right:auto;width:calc(100vw - 24px);max-width:none;box-sizing:border-box}body.touch-mode #briefing{max-height:185px}body.touch-mode #voice-caption{max-height:125px}}",
  "@media(max-height:500px){#touch-stick{width:96px;height:96px;bottom:16px}#touch-knob{left:28px;top:28px}#touch-stick:before{left:47px;height:72px}#touch-stick:after{top:47px;width:72px}#touch-buttons{bottom:16px}#touch-hint{bottom:143px}#touch-status{bottom:119px}body.touch-mode #briefingTitle,body.touch-mode #briefingStep{display:none}body.touch-mode #briefing,body.touch-mode #voice-caption{max-height:calc(100vh - 270px);font-size:11px}body.touch-mode #briefingText{font-size:11px}body.touch-mode #objectiveHint{display:none}}",
  "@media(max-width:350px){#touch-buttons{grid-template-columns:repeat(4,43px);gap:4px;right:8px}#touch-flight button{min-width:43px;font-size:9px}#touch-stick{width:94px;height:94px;left:8px}#touch-knob{left:27px;top:27px}#touch-stick:before{left:46px;height:70px}#touch-stick:after{top:46px;width:70px}#touch-status,#touch-hint{width:184px;right:8px}}"
].join("\n");
document.head.appendChild(style);
var root = document.createElement('div'); root.id = 'touch-flight'; root.setAttribute('aria-label', 'Touch flight controls');
var stick = document.createElement('div'); stick.id = 'touch-stick'; stick.dataset.touchAction = 'steer';
stick.setAttribute('role', 'group'); stick.setAttribute('aria-label', 'Drag to steer. Up climbs.');
var knob = document.createElement('div'); knob.id = 'touch-knob'; stick.appendChild(knob);
var label = document.createElement('span'); label.id = 'touch-stick-label'; label.textContent = 'FLIGHT'; stick.appendChild(label); root.appendChild(stick);
var buttons = document.createElement('div'); buttons.id = 'touch-buttons'; root.appendChild(buttons);
[['boost', 'BOOST'], ['gun', 'FIRE'], ['roll', 'ROLL'], ['brake', 'BRAKE'], ['left', 'VIEW ‹'], ['right', 'VIEW ›'], ['pause', 'PAUSE']].forEach(function (item) {
  var button = document.createElement('button'); button.type = 'button'; button.dataset.touchAction = item[0];
  button.textContent = item[1]; button.setAttribute('aria-label', item[1]); buttons.appendChild(button);
});
var hint = document.createElement('span'); hint.id = 'touch-hint'; hint.textContent = 'DRAG SKY TO LOCK · RELEASE TO FIRE'; root.appendChild(hint);
var status = document.createElement('span'); status.id = 'touch-status'; root.appendChild(status);
document.body.appendChild(root);
function playing() { return Game.state === 'playing' && !Game.cinematic && !Game.ending; }
function aim(e) {
  Input.mx = e.clientX; Input.my = e.clientY;
  Input.ndx = e.clientX / Math.max(1, P.HUD.w) * 2 - 1; Input.ndy = 1 - e.clientY / Math.max(1, P.HUD.h) * 2;
}
function steer(e) {
  var bounds = stick.getBoundingClientRect(), radius = bounds.width * .36;
  var x = (e.clientX - bounds.left - bounds.width / 2) / radius;
  var y = (bounds.top + bounds.height / 2 - e.clientY) / radius;
  var length = Math.hypot(x, y), scale = length > 1 ? 1 / length : 1;
  x *= scale; y *= scale;
  // A small center dead zone avoids drift when resting a thumb on the pad.
  var strength = length < .10 ? 0 : Math.min(1, (length - .10) / .90);
  if (length > .001) { x = x / Math.min(1, length) * strength; y = y / Math.min(1, length) * strength; }
  Input.touchX = x; Input.touchY = y;
  knob.style.transform = 'translate(' + (x * radius) + 'px,' + (-y * radius) + 'px)';
}
function holdKey(key) {
  if (!keyOwners[key]) { previousKeys[key] = !!Input.keys[key]; keyOwners[key] = 0; }
  keyOwners[key]++; Input.keys[key] = true;
}
function releaseKey(key) {
  if (!keyOwners[key]) return;
  keyOwners[key]--; if (!keyOwners[key]) { Input.keys[key] = !!previousKeys[key]; delete previousKeys[key]; }
}
function end(id, canceled) {
  var item = pointers.get(id); if (!item) return;
  pointers.delete(id); if (item.element) item.element.classList.remove('held');
  if (item.action === 'steer') { stickPointer = null; Input.touchX = Input.touchY = 0; knob.style.transform = ''; }
  if (item.action === 'boost') releaseKey('shift');
  if (item.action === 'brake') releaseKey('x');
  if (item.action === 'gun' && !Array.from(pointers.values()).some(function (p) { return p.action === 'gun'; })) Input.rmb = mouseFireBefore;
  if (item.action === 'aim') {
    aimPointer = null; Input.lmb = false;
    if (!canceled && playing()) { if (P.Locks.list.length) P.entities.fireLasers(); else P.entities.fireGun(); }
    else { P.Locks.list.length = 0; P.Locks.cd = 0; }
  }
}
function reset() {
  var heldKeys = Object.keys(keyOwners).filter(function (key) { return keyOwners[key] > 0; });
  var hadGun = Array.from(pointers.values()).some(function (p) { return p.action === 'gun'; });
  Array.from(pointers.keys()).forEach(function (id) { end(id, true); });
  heldKeys.forEach(function (key) { Input.keys[key] = false; });
  if (hadGun) Input.rmb = false;
  Input.touchX = Input.touchY = 0; knob.style.transform = '';
}
function down(e) {
  if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
  enabled = true;
  update();
  var target = e.target, control = target.closest && target.closest('[data-touch-action]');
  if (!control && target.closest && target.closest('button,input,select,a,summary,#briefing')) return;
  if (Game.state === 'intro') { e.preventDefault(); P.touchActions.skipIntro(); return; }
  if (!playing()) return;
  var action = control ? control.dataset.touchAction : 'aim';
  if ((action === 'aim' && aimPointer !== null) || (action === 'steer' && stickPointer !== null)) return;
  e.preventDefault(); e.stopPropagation();
  pointers.set(e.pointerId, { action: action, element: control });
  if (control) control.classList.add('held');
  if (action === 'aim') { aimPointer = e.pointerId; aim(e); Input.lmb = true; }
  else if (action === 'steer') { stickPointer = e.pointerId; steer(e); }
  else if (action === 'boost') holdKey('shift');
  else if (action === 'brake') holdKey('x');
  else if (action === 'gun') { if (!Array.from(pointers.values()).some(function (p) { return p.action === 'gun' && p !== pointers.get(e.pointerId); })) mouseFireBefore = Input.rmb; Input.rmb = true; }
  else if (action === 'roll' && P.flight) { if (P.flight.roll()) Player.rollDir = Input.touchX < -.15 ? -1 : 1; }
  else if (action === 'left' || action === 'right') {
    Player.viewIndex += action === 'left' ? -1 : 1; Player.camYawTarget = Player.viewIndex * Math.PI / 2; P.Audio_.sView();
  } else if (action === 'pause') { reset(); P.touchActions.pause(); }
}
window.addEventListener('pointerdown', down, { capture: true, passive: false });
window.addEventListener('pointermove', function (e) {
  var item = pointers.get(e.pointerId); if (!item) return;
  if (!playing()) { reset(); return; }
  e.preventDefault();
  if (item.action === 'aim') aim(e); else if (item.action === 'steer') steer(e);
}, { capture: true, passive: false });
window.addEventListener('pointerup', function (e) { if (pointers.has(e.pointerId)) { e.preventDefault(); end(e.pointerId, false); } }, { capture: true, passive: false });
window.addEventListener('pointercancel', function (e) { end(e.pointerId, true); }, true);
['keydown','keyup'].forEach(function (eventName) {
  window.addEventListener(eventName, function (e) {
    var key = (e.key || '').toLowerCase();
    if (!keyOwners[key]) return;
    previousKeys[key] = eventName === 'keydown'; Input.keys[key] = true;
  });
});
window.addEventListener('blur', reset);
document.addEventListener('visibilitychange', function () { if (document.hidden) reset(); });
// Control buttons never bubble compatibility mouse events into the weapon bindings.
['mousedown','mouseup','click'].forEach(function (name) { root.addEventListener(name, function (e) { e.stopPropagation(); e.preventDefault(); }); });
function update() {
  if (Game.state !== lastState || Game.time < lastTime || !playing()) reset();
  lastState = Game.state; lastTime = Game.time;
  var visible = enabled && playing();
  if (shown !== visible) { shown = visible; root.classList.toggle('on', visible); document.body.classList.toggle('touch-mode', visible); }
  P.touch.enabled = enabled; P.touch.visible = visible;
  if (enabled && !menuHelp && document.querySelector) {
    var menu = document.querySelector('.extra-controls');
    if (menu) {
      menuHelp = document.createElement('p');
      menuHelp.textContent = 'TOUCH · Use the left pad to steer; up climbs. Drag across enemies to lock, then lift to fire. Hold BOOST, BRAKE or FIRE. Tap ROLL to evade and VIEW to look around.';
      menuHelp.style.cssText = 'font:12px/1.5 system-ui,sans-serif;color:#cce8df;max-width:430px;margin:14px 0 0';
      menu.appendChild(menuHelp);
    }
  }
  if (!visible) { document.body.classList.remove('touch-guided'); return; }
  var text = 'POWER ' + Math.round(Player.energy === undefined ? 100 : Player.energy) + '% · ' +
    (Player.rollT > 0 ? 'ROLLING' : Player.rollCD > 0 ? 'ROLL ' + Player.rollCD.toFixed(1) + 's' : Player.energy < 28 ? 'RECHARGING' : 'ROLL READY');
  if (status.textContent !== text) status.textContent = text;
  var briefing = document.getElementById ? document.getElementById('briefing') : null;
  var caption = document.getElementById ? document.getElementById('voice-caption') : null;
  var objective = document.getElementById ? document.getElementById('objective') : null;
  var guided = !!(briefing && !briefing.hidden);
  document.body.classList.toggle('touch-guided', guided);
  if (caption) {
    var occupied = guided ? briefing : objective;
    var top = P.HUD.w <= 620 && P.HUD.h >= 560 && occupied && !occupied.hidden
      ? Math.max(108, occupied.getBoundingClientRect().bottom + 8) : 108;
    var cssTop = top + 'px'; if (caption.style.top !== cssTop) caption.style.top = cssTop;
  }
  var skip = document.getElementById ? document.getElementById('skipBriefing') : null;
  if (skip && skip.textContent !== 'Skip briefing') skip.textContent = 'Skip briefing';
}
P.touch = { reset: reset, update: update, root: root, enabled: enabled, visible: false, activePointers: function () { return pointers.size; } };
(function frame() { update(); window.requestAnimationFrame(frame); })();
})();
