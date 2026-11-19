const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, 'src');
const parts = [
  'p1_core.js',
  'p1b_audio.js',
  'p1c_soundscape.js',
  'p1d_voice.js',
  'gen/rider_model.js',   // baked from model/*.glb by tools/bake-glb.js
  'gen/flight_dragon.js',   // rest mesh, skeleton and Wingbeat action from Blender
  'p2a_flight_dragon.js',
  'p2_models.js',
  'p2b_rider_model.js',
  'p3_world.js',
  'p3b_weather.js',
  'p3c_horizon.js',
  'p3d_landmarks.js',
  'p4_game.js',
  'p4b_opening.js',
  'p4c_effects.js',
  'p4d_campaign.js',
  'p4e_enemies.js',
  'p5_hud_loop.js',
  'p5b_touch.js'
];
// Judge Dean LLC: publish only voice assets that actually exist in this build.
const voiceIds = ['opening', 'salvage', 'foundry', 'citadel', 'victory',
  'counter', 'chargebreak', 'gates', 'pickup', 'streak',
  'wasp', 'ray', 'turret', 'chaser', 'carrier', 'mine', 'sentinel', 'bomber',
  'nearmiss', 'wounded', 'hotstreak', 'decade', 'boss', 'core', 'boost', 'brake', 'momcarrier', 'momlock',
  'momgates', 'momorb', 'momreturn', 'mombomber', 'momclock', 'birthcertificate'];
const voiceFiles = {};
for (const id of voiceIds) {
  const name = 'voice-' + id + '.mp3';
  const file = path.join(__dirname, 'sound', name);
  if (fs.existsSync(file)) {
    const stat = fs.statSync(file);
    if (stat.isFile() && stat.size > 0) voiceFiles[id] = 'sound/' + name;
  }
}
const js = 'window.__PF_VOICE_FILES = ' + JSON.stringify(voiceFiles) + ';\n' +
  parts.map(f => fs.readFileSync(path.join(src, f), 'utf8')).join('\n\n');
const shell = fs.readFileSync(path.join(src, 'shell.html'), 'utf8');
const three = fs.readFileSync(path.join(__dirname, 'node_modules/three/build/three.min.js'), 'utf8');
const out = shell
  .replace('/* __THREE_JS__ */', () => three)
  .replace('/* __GAME_JS__ */', () => js);
const dest = path.join(__dirname, 'index.html');
fs.writeFileSync(dest, out);
console.log('built', dest, (out.length / 1024).toFixed(1) + ' KB');
