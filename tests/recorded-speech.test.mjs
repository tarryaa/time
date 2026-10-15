import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRecordedSettings,recordedKeys,nextRecordedCues} from '../recorded-speech.mjs';
import {speechDefaults} from '../speech-engine.mjs';
test('recorded speech defaults to five minutes and never pitch-shifts the voice',()=>{
 const s=normalizeRecordedSettings({...speechDefaults(),intervalMs:1000,rate:1.5});assert.equal(s.intervalMs,300000);assert.equal(s.rate,1);
 assert.equal(normalizeRecordedSettings({...s,intervalMs:600000}).intervalMs,600000);
});
test('five-minute cues report five, ten, fifteen minutes from the same start',()=>{
 const s={...speechDefaults(),running:true,startedAt:1000};const cues=nextRecordedCues(s,1000,900000);
 assert.deepEqual(cues,[{elapsed:300000,at:301000},{elapsed:600000,at:601000},{elapsed:900000,at:901000}]);
});
test('reopen skips past cues and stop does not schedule any audio',()=>{
 const s={...speechDefaults(),running:true,startedAt:1000};const cues=nextRecordedCues(s,611000,300000);
 assert.deepEqual(cues,[{elapsed:900000,at:901000}]);assert.deepEqual(nextRecordedCues({...s,running:false},611000),[]);
});
test('normal sessions use a complete utterance rather than joining units',()=>{
 assert.deepEqual(recordedKeys(3900000,{'3900':{}}),['3900']);
 assert.deepEqual(recordedKeys(90000000,{'h25':{}}),['h25']);
 assert.deepEqual(recordedKeys(90300000,{'h25':{},'300':{}}),['h25','300']);
 assert.throws(()=>recordedKeys(70000,{}));
});
