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
