const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, 'src');
const parts = [
  'p1_core.js',
  'p1b_audio.js',
  'p1c_soundscape.js',
  'gen/rider_model.js',   // baked from model/*.glb by tools/bake-glb.js
  'p2_models.js',
  'p2b_rider_model.js',
  'p3_world.js',
  'p3b_weather.js',
  'p4_game.js',
  'p4b_opening.js',
  'p4c_effects.js',
  'p4d_campaign.js',
  'p5_hud_loop.js'
];
const js = parts.map(f => fs.readFileSync(path.join(src, f), 'utf8')).join('\n\n');
const shell = fs.readFileSync(path.join(src, 'shell.html'), 'utf8');
const three = fs.readFileSync(path.join(__dirname, 'node_modules/three/build/three.min.js'), 'utf8');
const out = shell
  .replace('/* __THREE_JS__ */', () => three)
  .replace('/* __GAME_JS__ */', () => js);
const dest = path.join(__dirname, 'index.html');
fs.writeFileSync(dest, out);
console.log('built', dest, (out.length / 1024).toFixed(1) + ' KB');
