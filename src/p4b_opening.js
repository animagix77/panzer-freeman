/* An authored first minute. All clocks use simulation time, including pause. */
(function () {
var P = window.__PF, E = P.entities, Game = P.Game, Player = P.Player;
var panel = document.getElementById('briefing');
var heading = document.getElementById('briefingTitle');
var body = document.getElementById('briefingText');
var step = document.getElementById('briefingStep');
var state = P.opening = {
  active: false, phase: 'off', t: 0, elapsed: 0, kills: 0, startAge: 89,
  targets: [], shot: null, hit: false, wave: false
};
function copy(title, text, label) {
  if (heading.textContent !== title) heading.textContent = title;
  if (body.textContent !== text) body.textContent = text;
  if (step.textContent !== label) step.textContent = label;
  panel.hidden = false;
}
function phase(name) { state.phase = name; state.t = 0; }
function clearTargets() {
  state.targets.forEach(function (e) { E.dismissEnemy(e); });
  state.targets.length = 0;
  if (state.shot) E.dismissShot(state.shot);
  state.shot = null;
}
state.reset = function () {
  clearTargets();
  state.active = false; state.phase = 'off'; state.t = state.elapsed = state.kills = 0;
  state.hit = state.wave = false;
  panel.hidden = true;
};
state.start = function () {
  state.reset();
  if (!document.getElementById('guidedOpening').checked) return;
  state.active = true; state.startAge = Game.age;
  phase('arrival');
};
state.skip = function () {
  if (!state.active) return;
  state.reset();
  P.toast('THE SKY IS YOURS');
};
document.getElementById('skipBriefing').addEventListener('click', function (e) {
  e.stopPropagation(); state.skip();
});
state.onKill = function (e) {
  if (state.active && e.tag === 'opening-target') state.kills++;
};
state.onHit = function () {
  if (state.active && state.phase === 'dodge') state.hit = true;
};
function practice() {
  phase('volley');
  for (var i = -1; i <= 1; i++) {
    var offset = new P.V3(i * 19, 12, 95);
    var e = E.spawnEnemy('wasp', {
      tag: 'opening-target', hpMul: 0.5, deAge: 1,
      openingOffset: offset,
      pos: new P.V3(offset.x, Player.railY + offset.y, Game.railZ + offset.z)
    });
    state.targets.push(e);
  }
}
function warn() {
  phase('warning');
  // Hold the source ahead; only the single explicitly timed shot can fire.
  var offset = new P.V3(Player.x, Player.y, 260);
  state.targets.push(E.spawnEnemy('ray', {
    tag: 'opening-sentry', openingOffset: offset,
    pos: new P.V3(offset.x, Player.railY + offset.y, Game.railZ + offset.z)
  }));
  copy('Watch the sentry', 'One shot is coming. When it fires, bank with A or D.', '02 / EVADE');
}
function encounter() {
  phase('encounter');
  copy('The canyon wakes', 'A carrier and its escort. Sweep the formation, then release your volley.', '03 / PUT IT TOGETHER');
  E.spawnEnemy('carrier', {
    pos: new P.V3(0, Player.railY + 17, Game.railZ + 160),
    formation: new P.V3(0, 17, 160), holdFor: 12
  });
  for (var i = -1; i <= 1; i += 2) {
    var e = E.spawnEnemy('wasp', {
      pos: new P.V3(i * 24, Player.railY + 10, Game.railZ + 105),
      formation: new P.V3(i * 24, 10, 105), holdFor: 10
    });
    e.fireT = 4; e.phase = i < 0 ? 0 : Math.PI;
  }
}
state.update = function (dt) {
  if (!state.active || Game.state !== 'playing') return;
  if (Game.epIndex !== 0 || Game.ending) { state.reset(); return; }
  state.t += dt; state.elapsed += dt;
  if (state.phase === 'arrival') {
    if (state.t >= 4) practice();
  } else if (state.phase === 'volley') {
    var unique = state.targets.filter(function (e) { return P.Locks.list.indexOf(e) >= 0; }).length;
    var forward = ((Player.viewIndex % 4) + 4) % 4 === 0;
    if (!forward) {
      copy('Face the formation', 'Use Q or E to return to FORWARD on the radar.', '01 / LOCK & RELEASE');
    } else if (P.Input.lmb && unique) {
      copy('Release to fire', unique + ' target' + (unique === 1 ? '' : 's') + ' locked. Sweep across the others or release now.', '01 / LOCK & RELEASE');
    } else {
      copy('Take your years back', 'Hold the left mouse button and sweep across the three gold targets. Release to fire.', '01 / LOCK & RELEASE · ' + state.kills + ' / 3');
    }
    var inFlight = E.lasers.some(function (laser) { return laser.target.alive && state.targets.indexOf(laser.target) >= 0; });
    if (state.kills >= 3 || (state.t >= 20 && !inFlight) || state.t >= 23) {
      clearTargets(); phase('reward');
      var years = state.startAge - Game.age;
      copy(years > 0 ? years.toFixed(0) + (years === 1 ? ' YEAR RETURNED' : ' YEARS RETURNED') : 'Keep the volley in mind',
        years > 0 ? 'Age ' + state.startAge.toFixed(0) + ' → ' + Game.age.toFixed(0) + '. Defeating enemies makes you younger; hits make you older.'
                  : 'Hold to lock. Release to fire. You can keep practicing in the next formation.',
        '01 / ' + (years > 0 ? 'TIME RECLAIMED' : 'ONWARD'));
      if (years > 0) P.flashScreen(0.12, '#8fffc4');
    }
  } else if (state.phase === 'reward') {
    if (state.t >= 4) warn();
  } else if (state.phase === 'warning') {
    if (state.t >= 3) {
      var sentry = state.targets[0];
      // A player who destroys the sentry has already dealt with the threat.
      if (!sentry.alive) {
        clearTargets(); phase('evaded');
        copy('Threat removed', 'That works too. A or D will carry you clear of incoming fire.', '02 / CLEAR');
      } else {
        state.shot = E.enemyShoot(sentry, 65, 1, 0);
        state.startX = Player.x; state.hit = false;
        phase('dodge');
        copy('Bank now — A or D', 'Move out of the shot’s path. The shot will not follow your turn.', '02 / EVADE');
      }
    }
  } else if (state.phase === 'dodge') {
    // Resolve after the projectile crosses the player, not when a key is tapped.
    if (state.t >= 3.5) {
      var dodged = !state.hit && Math.abs(Player.x - state.startX) > 4;
      clearTargets(); phase('evaded');
      copy(dodged ? 'Clean escape' : state.hit ? 'A year lost. Keep flying.' : 'The shot is past',
        dodged ? 'Keep moving between volleys. You can aim while you bank.' : 'A or D banks the dragon. Move after a shot is fired to leave its path.', '02 / ONWARD');
    }
  } else if (state.phase === 'evaded') {
    if (state.t >= 3) {
      phase('breath');
      copy('Something larger is ahead', 'Ready your next volley.', 'THE ASHEN CANYON');
    }
  } else if (state.phase === 'breath') {
    if (state.t >= 3) encounter();
  } else if (state.phase === 'encounter') {
    if (state.t >= 7) panel.hidden = true;
    if (state.t >= 10 && !state.wave) {
      state.wave = true;
      for (var i = -1; i <= 1; i += 2) {
        var ray = E.spawnEnemy('ray', { pos: new P.V3(i * 85, Player.railY + 13, Game.railZ + 270) });
        ray.vel.x = -i * 22; ray.fireT = 3;
      }
      P.toast('CROSSING PATROL');
    }
    if (state.elapsed >= 60) {
      state.reset();
      P.toast('THE SKY IS YOURS');
    }
  }
};
})();
