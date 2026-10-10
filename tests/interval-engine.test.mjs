import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,validInterval,IntervalClock,nextAt} from '../interval-engine.mjs';
test('only enabled intervals produce beats and do not drift',()=>{
 const s={...defaults(),enabled:true,intervalMs:2000,anchor:1000};const clock=new IntervalClock(s,1000);
 assert.equal(clock.poll(2999),false);assert.equal(clock.poll(3010),true);assert.equal(clock.poll(3020),false);
 assert.equal(nextAt(s,3020),5000);assert.equal(clock.poll(5010),true);
 s.enabled=false;assert.equal(clock.poll(7010),false);
});
test('background periods and missed beats are silent, original phase survives',()=>{
 const s={...defaults(),enabled:true,intervalMs:60000,anchor:1000};const clock=new IntervalClock(s,1000);
 assert.equal(clock.poll(61000,false),false);clock.skip(301200);
 assert.equal(clock.poll(301201,true),false);assert.equal(nextAt(s,301201),361000);
 assert.equal(clock.poll(361020,true),true);
 assert.equal(clock.poll(421800,true),false);
});
test('reopening after a day skips all past beats and keeps next scheduled beat',()=>{
 const s={...defaults(),enabled:true,intervalMs:10000,anchor:1000};
 const restored=JSON.parse(JSON.stringify(s));const clock=new IntervalClock(restored,86402500);
 assert.equal(clock.poll(86402501,true),false);assert.equal(nextAt(restored,86402501),86411000);
 assert.equal(clock.poll(86411001,true),true);
});
test('interval configuration validates boundaries and persisted state',()=>{
 assert.ok(validInterval(defaults()));assert.equal(validInterval({...defaults(),intervalMs:0}),false);
 assert.equal(validInterval({...defaults(),volume:101}),false);assert.equal(validInterval({...defaults(),sound:'bad'}),false);
 assert.equal(validInterval({...defaults(),enabled:true}),false);
});
