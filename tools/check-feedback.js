// Hit feedback follows actual damage and clears on reset, never on an empty shot.
const assert=require('node:assert/strict');
const {flight}=require('./check-motion');
const {P}=flight(),E=P.entities;
const e=E.spawnEnemy('carrier',{hpMul:2,pos:new P.V3(0,22,120)});
assert.equal(e.maxHp,12);E.fireGun();assert.equal(P.Game.hitConfirmT,0);
E.hurtEnemy(e,1);assert(P.Game.hitConfirmT>0);assert.equal(e.hp,11);
E.updateProjectiles(.2);assert.equal(P.Game.hitConfirmT,0);
E.hurtEnemy(e,100);assert(P.Game.killConfirmT>0);const kills=P.Game.kills;
E.hurtEnemy(e,100);assert.equal(P.Game.kills,kills,'dead target cannot award twice');
E.reset();assert.equal(P.Game.hitConfirmT,0);assert.equal(P.Game.killConfirmT,0);
console.log('Feedback checks passed: misses, confirmed damage, health scaling, decay, kill confirmation and reset.');

// Shockwaves own their fading material; reusing shared debris material made them
// opaque and would let any fade also change all nearby fragments.
E.reset();
const fire=E.SHARD_MATS.fire, before=fire.opacity;
E.boom(new P.V3(0,22,80),2,[fire]);
const wave=P.scene.children.find(o=>o.visible && o.name==='combat-shockwave');
assert(wave,'explosion has its own shockwave material');
assert(wave.material.transparent);const start=wave.material.opacity;
E.updateProjectiles(.2);assert(wave.material.opacity<start,'shockwave fades during expansion');
assert.equal(fire.opacity,before,'debris opacity remains independent');
console.log('Shockwave checks passed: translucent expansion and independent pooled materials.');
