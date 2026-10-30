import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeRecordedSettings,recordedKeys,nextRecordedCues} from '../recorded-speech.mjs';
import {speechDefaults,durationText} from '../speech-engine.mjs';

test('recorded speech keeps the five-minute default and supports shorter intervals without pitch changes',()=>{
 const s=normalizeRecordedSettings({...speechDefaults(),intervalMs:1000,rate:1.5});assert.equal(s.intervalMs,300000);assert.equal(s.rate,1);
 for(const intervalMs of [30000,60000,300000,600000,900000,1800000,3600000]){
  const normalized=normalizeRecordedSettings({...s,intervalMs});assert.equal(normalized.intervalMs,intervalMs);assert.equal(normalized.rate,1);
 }
});
test('five-minute cues report five, ten, fifteen minutes from the same start',()=>{
 const s={...speechDefaults(),running:true,startedAt:1000};const cues=nextRecordedCues(s,1000,900000);
 assert.deepEqual(cues,[{elapsed:300000,at:301000},{elapsed:600000,at:601000},{elapsed:900000,at:901000}]);
});
test('thirty-second cues announce half-minutes and whole minutes in sequence',()=>{
 const s={...speechDefaults(),intervalMs:30000,running:true,startedAt:1000};
 const cues=nextRecordedCues(s,1000,120000);
 assert.deepEqual(cues.map(cue=>[cue.at,durationText(cue.elapsed)]),[[31000,'30秒'],[61000,'1分'],[91000,'1分30秒'],[121000,'2分']]);
});
test('one-minute cues announce each minute from the same start',()=>{
 const s={...speechDefaults(),intervalMs:60000,running:true,startedAt:1000};
 assert.deepEqual(nextRecordedCues(s,1000,180000),[{elapsed:60000,at:61000},{elapsed:120000,at:121000},{elapsed:180000,at:181000}]);
});
test('reopen skips past cues and stop does not schedule any audio',()=>{
 const s={...speechDefaults(),running:true,startedAt:1000};const cues=nextRecordedCues(s,611000,300000);
 assert.deepEqual(cues,[{elapsed:900000,at:901000}]);assert.deepEqual(nextRecordedCues({...s,running:false},611000),[]);
 const short={...s,intervalMs:30000};assert.deepEqual(nextRecordedCues(short,91100,30000),[{elapsed:120000,at:121000}]);
});
test('half-minute recordings reuse a complete minute phrase and add thirty seconds',()=>{
 const available={'30':{},'60':{},'90':{},'3540':{},'3600':{},'3900':{}};
 assert.deepEqual(recordedKeys(30000,available),['30']);
 assert.deepEqual(recordedKeys(60000,available),['60']);
 // An available complete utterance takes precedence over composition.
 assert.deepEqual(recordedKeys(90000,available),['90']);
 delete available['90'];assert.deepEqual(recordedKeys(90000,available),['60','30']);
 assert.deepEqual(recordedKeys(3570000,available),['3540','30']);
 assert.deepEqual(recordedKeys(3600000,available),['3600']);
 assert.deepEqual(recordedKeys(3630000,available),['3600','30']);
 assert.deepEqual(recordedKeys(3930000,available),['3900','30']);
});
test('long sessions compose hours, remaining minutes and optional thirty seconds',()=>{
 const available={'h25':{},'h72':{},'60':{},'300':{},'30':{}};
 assert.deepEqual(recordedKeys(90000000,available),['h25']);
 assert.deepEqual(recordedKeys(90300000,available),['h25','300']);
 assert.deepEqual(recordedKeys(90060000,available),['h25','60']);
 assert.deepEqual(recordedKeys(90090000,available),['h25','60','30']);
 assert.deepEqual(recordedKeys(259230000,available),['h72','30']);
});
test('only positive, exact thirty-second milestones are accepted',()=>{
 for(const ms of [0,-30000,1000,70000,30000.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>recordedKeys(ms,{'30':{},'70':{}}));
 assert.throws(()=>recordedKeys(90000,{'30':{}}),'missing minute recording must not silently shorten speech');
});
test('recordings cover every thirty-second milestone through seventy-two hours with correct words',()=>{
 const load=name=>JSON.parse(readFileSync(new URL(`../audio/${name}`,import.meta.url),'utf8')).clips;
 const base=load('natural-ja.json'),short=load('natural-ja-short.json'),available={...base,...short};
 for(let ms=30000;ms<=72*3600000;ms+=30000){
  const keys=recordedKeys(ms,available);
  assert.ok(keys.length>0,`missing speech for ${ms}`);
  assert.ok(keys.every(key=>available[key]),`missing recording for ${ms}`);
  assert.equal(keys.map(key=>available[key].text).join(''),durationText(ms),`incorrect speech for ${ms}`);
 }
 // Keep every pre-existing full phrase rather than rebuilding it from smaller clips.
 for(const key of Object.keys(base).filter(key=>/^\d+$/.test(key)))assert.deepEqual(recordedKeys(Number(key)*1000,available),[key]);
});
