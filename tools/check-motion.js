// Production rig + flight simulation, with rendering and audio left out.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('three');

function flight(extraFiles = []) {
  const P = {
    V3: THREE.Vector3, TAU: Math.PI * 2,
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    lerp: (a, b, t) => a + (b - a) * t,
    damp: (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt)),
    rand: (a, b) => (a + b) / 2, randi: (a, b) => Math.floor((a + b) / 2),
    pick: a => a[0], angDelta: (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a)),
    M: (color, opts = {}) => new THREE.MeshPhongMaterial({ color, flatShading: true,
      shininess: opts.shine || 0, side: opts.side || THREE.FrontSide }),
    G: (color, opts) => new THREE.MeshBasicMaterial({ color, ...opts }),
    retroPatch() {}, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(56, 16 / 9, .6, 1600),
    tmpA: new THREE.Vector3(), tmpB: new THREE.Vector3(), tmpC: new THREE.Vector3(),
    skyMesh: new THREE.Object3D(), el: { flash: {}, toast: {}, quip: {} },
    Audio_: new Proxy({}, { get: () => () => {} }), terrain: { enabled: false },
    world: { EPISODES: [{ speed: 56, railY: 22 }] }
  };
  const context = vm.createContext({ THREE, window: { __PF: P }, atob, Image: class {} });
  for (const file of ['gen/rider_model.js', 'gen/flight_dragon.js', 'p2a_flight_dragon.js', 'p2_models.js', 'p2b_rider_model.js', 'p4_game.js', ...extraFiles]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
  }
  P.Game.state = 'playing'; P.Player.railY = 22;
  function step(key, seconds, fps = 60) {
    P.Input.keys = {};
    for (const held of [].concat(key || [])) P.Input.keys[held] = true;
    for (let i = 0; i < Math.round(seconds * fps); i++) {
      P.Game.time += 1 / fps;
      P.entities.updatePlayer(1 / fps);
    }
    P.dragon.root.updateMatrixWorld(true);
    return P;
  }
  return { P, step, context };
}

// The exported marker sits on the foremost finger of each physical wing.
function wingTips(dragon) {
  return dragon.wingTips.map(bone => dragon.body.worldToLocal(bone.getWorldPosition(new THREE.Vector3())));
}

function checkMotion() {
  const beatSamples = [];
  for (const fps of [30, 60, 120]) {
    const { P, step } = flight();
    const d = P.dragon;
    let high = -Infinity, descent = 0, lifted = false, lowestAt = 0;
    for (let frame = 0; frame < Math.round(1.5 * fps); frame++) {
      step(null, 1 / fps, fps);
      const [right, left] = wingTips(d);
      assert(Math.abs(right.y - left.y) < .4, 'both wings share the level-flight stroke');
      high = Math.max(high, left.y);
      if (high - left.y > descent) { descent = high - left.y; lowestAt = (frame + 1) / fps; }
      if (high - left.y > 2 && d.getBob() > .005) lifted = true;
    }
    assert(descent > 3 && lifted, 'the authored downstroke drives both tips down as the rider gains lift');
    beatSamples.push({ descent, lowestAt });

    step('d', .2, fps);
    const [inside, outside] = wingTips(d);
    assert(inside.z < outside.z - 1 && inside.y < outside.y - 1, 'the inside wing should sweep aft and lower first');
    step('d', .5, fps);
    step('a', .2, fps);
    assert(d.body.rotation.z < -.1 && d.root.rotation.y < 0, 'the new bank should lead the change of heading');
  }

  for (const beat of beatSamples) {
    assert(Math.abs(beat.descent - beatSamples[2].descent) < .35, 'wing travel is consistent from 30 to 120 Hz');
    assert(Math.abs(beat.lowestAt - beatSamples[2].lowestAt) < .08, 'the flight action reaches its low point at the same time');
  }

  {
    function sustainedFlight(vy) {
      const { P } = flight(), dragon = P.dragon, dt = 1 / 60;
      const st = { strafeX: 0, vy, aimX: 0, aimY: 0, boost: 0 };
      let beats = 0, coast = 0;
      dragon.onBeat = () => beats++;
      for (let tick = 0; tick < 600; tick++) {
        dragon.update(dt, tick * dt, st);
        if (dragon.getPhase() === 0) coast += dt;
      }
      return { beats, coast };
    }
    const climb = sustainedFlight(40), dive = sustainedFlight(-40);
    assert(climb.beats > dive.beats && dive.coast > climb.coast + 2,
      'climbing gains powered strokes while a sustained dive leaves room to glide');
  }

  {
    const slow = flight(['p4d_campaign.js']), fast = flight(['p4d_campaign.js']);
    slow.step(['s', 'x'], .65);
    fast.step(['s', 'shift'], .65);
    assert(Math.abs(fast.P.Player.motionY - slow.P.Player.motionY) < .01);
    assert(fast.P.dragon.body.rotation.x > slow.P.dragon.body.rotation.x + .15,
      'the same climb rate at boost speed needs a shallower pitch than under air brake');
  }

  for (const view of [0, 2]) {
    for (const key of ['a', 'd']) {
      const { P, step } = flight(['p4d_campaign.js']);
      P.Player.camYaw = P.Player.camYawTarget = view * Math.PI / 2;
      P.Input.keys = { [key]: true };
      assert(P.flight.roll());
      step(key, .12);
      const entryRoll = P.dragon.root.rotation.z;
      assert(entryRoll * P.Player.motionX < 0, 'barrel roll must lower the wing on the side of travel');
      P.Player.camYawTarget += Math.PI;
      step(key, .25);
      assert(entryRoll * P.dragon.root.rotation.z > 0, 'looking around mid-roll must preserve the original spin');
    }
  }

  // The nose and bank must follow travel in world space in every view.
  for (let view = 0; view < 4; view++) {
    for (const key of ['a', 'd']) {
      const { P, step } = flight();
      P.Player.viewIndex = view;
      P.Player.camYaw = P.Player.camYawTarget = view * Math.PI / 2;
      step(key, .5);
      const nose = new THREE.Vector3(0, 0, 1).transformDirection(P.dragon.body.matrixWorld);
      if (view % 2 === 0) {
        assert(nose.x * P.Player.motionX > 0, `${key}, view ${view}: nose must lead actual travel`);
        assert(P.dragon.body.rotation.z * P.Player.motionX < 0, 'bank must lower the inside wing');
      } else {
        assert(Math.abs(nose.x) < .01, 'fore/aft movement in side view must not yaw the dragon sideways');
        assert(Math.abs(P.dragon.body.rotation.z) < .02, 'side-view travel must not bank as a lateral turn');
      }
      step(key, 3);
      assert(Math.abs(P.Player.motionX) < .1 && Math.abs(P.Player.motionZ) < .1, 'edge must stop actual travel');
      assert(Math.abs(P.dragon.body.rotation.z) < .025, 'edge must return to a level bank');
    }
  }

  // A held climb/dive becomes a glide when altitude stops changing.
  for (const key of ['s', 'w']) {
    const { P, step } = flight();
    step(key, .45);
    const nose = new THREE.Vector3(0, 0, 1).transformDirection(P.dragon.body.matrixWorld);
    assert(nose.y * P.Player.motionY > 0, 'pitch must match climb/dive');
    step(key, 4);
    assert(Math.abs(P.Player.motionY) < .1);
    assert(Math.abs(P.dragon.body.rotation.x) < .05, 'nose should level at altitude limit');
    assert(Math.abs(P.dragon.getEffort() - .24) < .02, 'no endless powered flapping at the ceiling');
  }

  // Compare real rider/wing settling at low and high frame rates after reversals.
  const samples = [];
  for (const fps of [30, 60, 120]) {
    const { P, step } = flight();
    step('s', .3, fps);
    const activeRider = P.dragon.rider.rotation.x;
    for (const key of ['d', 'a', 's', 'w', 'd', 'a']) {
      step(key, .5, fps);
      const joints = P.dragon.tail.map(joint => joint.getWorldPosition(new THREE.Vector3()));
      let length = 0;
      for (let i = 1; i < joints.length; i++) length += joints[i].distanceTo(joints[i - 1]);
      assert(joints[0].distanceTo(joints[joints.length - 1]) > .75 * length,
        'the articulated tail must trail the turn without coiling back into the rider');
    }
    step(null, 3, fps);
    const d = P.dragon;
    d.root.traverse(o => {
      assert([o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z].every(Number.isFinite));
    });
    const [rightTip, leftTip] = wingTips(d);
    assert(leftTip.x - rightTip.x > 10, 'both wings extend into the glide after steering');
    const tailRoot = d.body.worldToLocal(d.tail[0].getWorldPosition(new THREE.Vector3()));
    const tailEnd = d.body.worldToLocal(d.tail[d.tail.length - 1].getWorldPosition(new THREE.Vector3()));
    assert(tailRoot.z - tailEnd.z > 3 && Math.abs(tailRoot.x - tailEnd.x) < 1,
      'the tail streams aft as the turn settles');
    assert(Math.abs(d.body.rotation.z) < .025);
    samples.push({ fps, activeRider, pitch: d.body.rotation.x, rider: d.rider.rotation.x, wingSpan: leftTip.x - rightTip.x });
  }
  for (const s of samples) {
    assert(Math.abs(s.pitch - samples[2].pitch) < .05, 'body settling must agree across frame rates');
    assert(Math.abs(s.rider - samples[2].rider) < .05, 'rider brace must not accumulate per frame');
    assert(Math.abs(s.activeRider - samples[2].activeRider) < .035, 'rider brace must agree during acceleration');
  }
  {
    const { P, step } = flight();
    P.dragon.resetMotion();
    const startingBones = P.dragon.flightRig.mesh.skeleton.bones.map(bone => bone.quaternion.clone());
    step('d', .6); step('s', .3);
    P.dragon.root.rotation.set(0, 0, 0); P.dragon.resetMotion();
    assert.equal(P.dragon.getPhase(), 0);
    assert.equal(P.dragon.getBob(), 0);
    assert.equal(P.dragon.body.rotation.z, 0);
    P.dragon.flightRig.mesh.skeleton.bones.forEach((bone, i) => {
      assert(bone.quaternion.angleTo(startingBones[i]) < .0001, 'replay must restore the authored pose of ' + bone.name);
    });
  }
  console.log('Motion checks passed: control-relative flight, downstroke lift, bank reversals, dive and boost pitch, roll direction, boundaries and rider stability at 30/60/120 fps.');
  console.log(samples);
}

if (require.main === module) checkMotion();
module.exports = { flight, checkMotion };
