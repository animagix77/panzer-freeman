/* Music is streamed mp3 only — there is no procedural fallback behind it any
   more. So this checks two things: that each cue swaps to the right file, and
   that nothing synth-shaped can play music at all. The second half matters
   because the old sequencer was audible for exactly as long as an mp3 took to
   buffer, which on a cold load was the whole title screen. */
const { chromium } = require('playwright');
const path = require('path');

let fails = 0;
function ok(name, pass, detail) {
  if (!pass) fails++;
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name.padEnd(32) + (detail || ''));
}

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox',
           '--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__PF.setMaxH(300));

  const st = () => page.evaluate(() => window.__PF.musicState());

  // ---- the synth music engine is gone, not merely quiet -------------------
  const gone = await page.evaluate(() => {
    const P = window.__PF, A = P.Audio_;
    return {
      SONGS: P.SONGS === undefined,
      note: P.note === undefined,
      setSong: A.setSong === undefined,
      song: A.song === undefined,
      musicGain: A.musicGain === undefined,
      sfx: typeof A.sGun === 'function' && typeof A.tone === 'function'
    };
  });
  ok('no procedural music engine left',
     gone.SONGS && gone.note && gone.setSong && gone.song && gone.musicGain,
     JSON.stringify(gone));
  ok('SFX synth survives the cut', gone.sfx);

  // first gesture arms audio and starts the title track
  await page.mouse.move(600, 400); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(1800);
  const title = await st();
  ok('title cue', title.stream === '00_title.mp3' && title.playing, JSON.stringify(title));

  await page.click('#startBtn');
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__PF.setIntroT(1.0));
  await page.waitForTimeout(1800);

  const CUES = [
    ['episode I',   '01_ashen_canyon.mp3',      null],
    ['episode II',  '02_the_drowned_choir.mp3', 0],
    ['episode III', '03_citadel_hours.mp3',     1],
    ['boss cue',    '04_hour_sphinx.mp3',       2]
  ];
  for (const [label, file, advanceFrom] of CUES) {
    if (advanceFrom !== null) {
      await page.evaluate((i) => { const P = window.__PF;
        P.Game.railZ = P.Game.epStartZ + P.world.EPISODES[i].length + 1; }, advanceFrom);
      await page.waitForTimeout(2000);
    }
    const s = await st();
    ok(label, s.stream === file && s.playing, JSON.stringify(s));
  }

  // mute / unmute
  await page.keyboard.press('m'); await page.waitForTimeout(500);
  const muted = await page.evaluate(() => window.__PF.Audio_.muted);
  const mutedVol = (await st()).volume;
  await page.keyboard.press('m'); await page.waitForTimeout(600);
  const back = await page.evaluate(() => window.__PF.Audio_.muted);
  ok('mute silences the stream', muted === true && mutedVol === 0 && back === false,
     JSON.stringify({ muted, mutedVol, back }));

  // death stops the music outright and leaves nothing humming behind it
  await page.evaluate(() => { const P = window.__PF; P.Game.invulnT = 0; P.damagePlayer(60, true); });
  await page.waitForTimeout(2000);
  const dead = await st();
  ok('death stops the music', !dead.playing && !dead.pending, JSON.stringify(dead));

  console.log('\nERRORS', errs.length ? errs.slice(0, 4).join('\n') : 'none');
  console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nall checks passed');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
