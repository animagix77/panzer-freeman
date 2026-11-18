// Judge Dean LLC — pointer ownership and touch/keyboard flight lifecycle checks.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {flight}=require('./check-motion');
class Element {
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.dataset={};this.children=[];this.style={};this.handlers={};this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),toggle:(c,on)=>on?this.classes.add(c):this.classes.delete(c)};}
 appendChild(child){this.children.push(child);child.parent=this;} setAttribute(){} addEventListener(name,fn){this.handlers[name]=fn;}
 closest(selector){if(selector==='[data-touch-action]')return this.dataset.touchAction?this:this.parent?.closest(selector);return /button/.test(selector)&&this.tagName==='BUTTON'?this:null;}
 getBoundingClientRect(){return {left:20,top:200,width:126,height:126};}
}
function setup(touch=true){
 const {P,context}=flight(),handlers={};let guns=0,lasers=0,rolls=0;
 const document={head:new Element(),body:new Element(),createElement:t=>new Element(t),addEventListener:(n,f)=>handlers[n]=f,hidden:false};
 Object.assign(context,{document,navigator:{maxTouchPoints:touch?5:0}});
 Object.assign(context.window,{addEventListener:(n,f)=>handlers[n]=f,requestAnimationFrame(){},matchMedia:()=>({matches:touch})});
 P.HUD={w:800,h:500};P.entities.fireGun=()=>guns++;P.entities.fireLasers=()=>{lasers++;P.Locks.list.length=0;};
 P.flight={roll(){if(P.Player.rollT>0)return false;P.Player.rollT=.65;rolls++;return true;}};
 P.touchActions={pause(){P.Game.state=P.Game.state==='playing'?'paused':'playing';},skipIntro(){}};
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/p5b_touch.js'),'utf8'),context);
 const root=P.touch.root,stick=root.children[0],buttons=root.children[1].children,canvas=new Element('canvas');
 function send(type,id,target=canvas,x=400,y=250){const e={pointerId:id,pointerType:'touch',target,clientX:x,clientY:y,preventDefault(){},stopPropagation(){}};handlers[type](e);}
 const button=action=>buttons.find(b=>b.dataset.touchAction===action);
 return {P,handlers,document,root,stick,send,button,counts:()=>({guns,lasers,rolls})};
}
{
 const {P,send,stick,button,counts,handlers}=setup();
 send('pointerdown',1,stick,128,218);assert(P.Input.touchX>.5&&P.Input.touchY>.5,'pad supports simultaneous horizontal and vertical steering');
 send('pointerdown',2);assert(P.Input.lmb);P.Locks.list.push({});
 send('pointerdown',3,button('boost'));assert(P.Input.keys.shift);
 handlers.keyup({key:'Shift'});assert(P.Input.keys.shift,'releasing a physical key does not release a held touch action');
 send('pointerup',3,button('boost'));assert(!P.Input.keys.shift);assert(P.Input.lmb,'boost release preserves aiming finger');assert.equal(counts().lasers,0);
 send('pointerup',2);assert.equal(counts().lasers,1);assert(P.Input.touchX>.5,'aim release preserves steering finger');
 send('pointercancel',1);assert.equal(P.Input.touchX,0);assert.equal(P.Input.touchY,0);
 send('pointerdown',4);P.Locks.list.push({});send('pointercancel',4);assert.equal(counts().lasers,1);assert.equal(P.Locks.list.length,0,'cancel clears stale locks without firing');
 send('pointerdown',5,button('gun'));assert(P.Input.rmb);send('pointerup',5,button('gun'));assert(!P.Input.rmb);assert.equal(counts().guns,0,'weapon button release does not create a stray shot');
 send('pointerdown',6,button('roll'));assert.equal(counts().rolls,1);P.Input.touchX=-1;
 send('pointerdown',7,button('roll'));assert.equal(P.Player.rollDir,1,'failed cooldown roll cannot reverse an active roll');
 send('pointerdown',8,button('left'));assert.equal(P.Player.viewIndex,-1);
 send('pointerdown',9);send('pointerdown',10,button('boost'));send('pointerdown',11,button('pause'));
 assert.equal(P.Game.state,'paused');assert.equal(P.touch.activePointers(),0);assert(!P.Input.lmb&&!P.Input.keys.shift);
 send('pointerup',9);assert.equal(counts().guns,0,'pause cancellation never releases a weapon');
 P.Game.state='playing';P.touch.update();send('pointerdown',12,button('boost'));send('pointerdown',13,button('gun'));handlers.blur();
 assert(!P.Input.keys.shift&&!P.Input.rmb,'blur clears all owned held actions');
 P.Game.time=10;P.touch.update();send('pointerdown',14,stick,125,220);P.Game.time=0;P.touch.update();assert.equal(P.Input.touchX,0,'restart cancels steering');
}
{
 const {P,root,send,button}=setup(false);assert(!root.classes.has('on'),'controls stay hidden on mouse-only devices');
 send('pointerdown',1,button('boost'));P.touch.update();assert(root.classes.has('on'),'a real touch enables the controls on hybrid devices');
 P.Game.state='paused';P.touch.update();assert(!root.classes.has('on'),'menus are not covered by flight controls');
}
// Production flight integration: touch-up must climb with either keyboard pitch convention.
for(const invert of [true,false]){
 const {P}=flight();P.Player.invertY=invert;P.Input.touchY=.7;P.Input.touchX=.6;
 for(let i=0;i<30;i++){P.Game.time+=1/60;P.entities.updatePlayer(1/60);}
 assert(P.Player.y>3,'touch upward always climbs');assert(P.Player.x<0,'touch right follows screen-right');
 P.Input.touchX=P.Input.touchY=0;
 for(let i=0;i<120;i++)P.entities.updatePlayer(1/60);
 assert(Math.abs(P.Player.vx)<.01&&Math.abs(P.Player.vy)<.01,'released pad settles');
}
console.log('Touch checks passed: independent steering/aim/action pointers, cancellation, pause/restart/blur, no stray shots, cooldown direction, touch visibility, and direct analog flight.');
