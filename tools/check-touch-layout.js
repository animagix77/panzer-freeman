// Judge Dean LLC — real Chromium layout checks using production CSS and touch UI.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const source=file=>fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PF_CHROMIUM?{executablePath:process.env.PF_CHROMIUM}:{})});
 try {
  for(const [width,height] of [[320,568],[375,667],[600,800],[600,375],[844,390],[1024,768]]){
   const context=await browser.newContext({viewport:{width,height},hasTouch:true});const page=await context.newPage();
   const css=source('shell.html').match(/<style>([\s\S]*?)<\/style>/)[1];
   await page.setContent('<style>'+css+'</style><div id="wrap"><canvas id="gl"></canvas><aside id="briefing"><div id="briefingStep">01 / FLIGHT CHECK</div><h3 id="briefingTitle">Bank into the canyon</h3><p id="briefingText">Steer left or right, then hold BOOST briefly. Complete the flight check while three scouts approach.</p><button id="skipBriefing">Skip briefing · Enter</button></aside><aside id="objective"><div class="objective-line">FLIGHT OBJECTIVE</div><b id="objectiveTitle">Recover lost time</b><div id="objectiveHint">Collect 5 cyan orbs. Boost toward the trail; nearby orbs pull in.</div></aside></div>');
   await page.evaluate(()=>{window.__PF={Game:{state:'playing',time:1},Player:{energy:100,rollCD:0,rollT:0},Input:{keys:{},lmb:false,rmb:false},HUD:{w:innerWidth,h:innerHeight},Audio_:{},Locks:{list:[]},touchActions:{},entities:{}};});
   await page.addScriptTag({content:source('p1d_voice.js')});
   await page.addScriptTag({content:source('p5b_touch.js')});
   await page.evaluate(()=>{const c=document.getElementById('voice-caption');c.hidden=false;c.querySelector('small').textContent='RIDER · FIELD NOTES';c.querySelector('span').textContent='At eighty-nine, I had a very short list. Find the Fountain. Get a younger dragon.';window.__PF.touch.update();});
   for(const guided of [true,false]){
    await page.evaluate(g=>{document.getElementById('briefing').hidden=!g;window.__PF.touch.update();},guided);
    const boxes=await page.evaluate(()=>{
     const ids=['briefing','voice-caption','objective','touch-stick','touch-buttons','touch-status','touch-hint'];
     return Object.fromEntries(ids.map(id=>{const el=document.getElementById(id),b=el.getBoundingClientRect();return[id,{x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height,visible:!el.hidden&&getComputedStyle(el).display!=='none'}];}));
    });
    const overlap=(a,b)=>a.visible&&b.visible&&Math.min(a.right,b.right)>Math.max(a.x,b.x)+1&&Math.min(a.bottom,b.bottom)>Math.max(a.y,b.y)+1;
    for(const panel of ['briefing','voice-caption','objective'])for(const control of ['touch-stick','touch-buttons','touch-status','touch-hint'])
     assert(!overlap(boxes[panel],boxes[control]),`${width}x${height}, guided=${guided}: ${panel} overlaps ${control}`);
    assert(!overlap(boxes['voice-caption'],boxes[guided?'briefing':'objective']),`${width}x${height}: captions overlap instruction panel`);
    assert(!overlap(boxes['touch-stick'],boxes['touch-buttons']),`${width}x${height}: controls overlap`);
    for(const id of ['touch-stick','touch-buttons']){const b=boxes[id];assert(b.x>=0&&b.y>=0&&b.right<=width&&b.bottom<=height,`${id} stays inside viewport`);}
    if(guided&&width===600&&height===375)await page.screenshot({path:'/tmp/panzer-touch-landscape.png'});
    if(guided&&width===375)await page.screenshot({path:'/tmp/panzer-touch-portrait.png'});
   }
   console.log(`Touch layout clear: ${width}×${height}, guided and mission panels`);await context.close();
  }
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
