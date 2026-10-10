import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,activate,settle,total,elapsed,reset,validSession,timeParts} from '../timer-engine.mjs';
test('switching is atomic; total always equals individual elapsed time',()=>{
  const s=createSession(['読む','解く','見直す','調べる']);
  activate(s,s.timers[0].id,1000);
  assert.equal(total(s,3500),2500);
  activate(s,s.timers[1].id,3500);
  assert.equal(s.timers[0].elapsed,2500);
  activate(s,s.timers[2].id,7000);
  assert.equal(total(s,9000),8000);
  assert.equal(s.timers.reduce((n,t)=>n+elapsed(t,s,9000),0),8000);
  assert.equal(s.timers[1].elapsed,3500);
});
test('global pause excludes breaks and arbitrary timer resumes',()=>{
  const s=createSession();activate(s,s.timers[0].id,0);settle(s,1250);
  assert.equal(total(s,100000),1250);activate(s,s.timers[1].id,100000);
  assert.equal(total(s,102000),3250);reset(s);
  assert.equal(total(s,200000),0);assert.equal(s.activeId,null);assert.equal(s.lastId,null);
});
test('persisted running session recovers closed-app elapsed time',()=>{
  const s=createSession();activate(s,s.timers[0].id,1000);
  const restored=JSON.parse(JSON.stringify(s));assert.ok(validSession(restored));
  assert.equal(total(restored,3601000),3600000);
  activate(restored,restored.timers[1].id,3601000);
  assert.equal(total(restored,3602000),3601000);
});
test('same timer and missing timer do not reset timing',()=>{
  const s=createSession();activate(s,s.timers[0].id,0);
  assert.equal(activate(s,s.timers[0].id,1000),false);
  assert.equal(activate(s,'missing',2000),false);assert.equal(total(s,3000),3000);
});
test('bad persisted state is rejected; hour formatting does not wrap',()=>{
  const s=createSession();assert.ok(validSession(s));
  s.timers[1].id=s.timers[0].id;assert.equal(validSession(s),false);
  assert.deepEqual(timeParts(3661999,true),{main:'01:01:01',fraction:9});
  assert.equal(timeParts(360000000,true).main,'100:00:00');
});
