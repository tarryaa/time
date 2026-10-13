import test from 'node:test';
import assert from 'node:assert/strict';
import {speechDefaults,validSpeech,speechElapsed,startSpeech,stopSpeech,resetSpeech,durationText,SpeechClock,speechRemaining} from '../speech-engine.mjs';
test('elapsed speech uses hours, minutes and seconds without zero units',()=>{
  for(const[ms,text]of [[1000,'1秒'],[70000,'1分10秒'],[300000,'5分'],[600000,'10分'],[900000,'15分'],[3900000,'1時間5分'],[3601000,'1時間1秒'],[90061000,'25時間1分1秒'],[0,'0秒']])assert.equal(durationText(ms),text);
});
test('five-minute announcements report elapsed milestones from own start',()=>{
  const s=speechDefaults();startSpeech(s,1000);const clock=new SpeechClock(s,1000);
  assert.equal(clock.poll(300999),null);assert.equal(clock.poll(301030),'5分');assert.equal(clock.poll(301040),null);
  assert.equal(clock.poll(601050),'10分');assert.equal(clock.poll(901100),'15分');
});
test('stop freezes time; resume excludes stopped duration; reset cancels session',()=>{
  const s={...speechDefaults(),intervalMs:10000};startSpeech(s,0);const clock=new SpeechClock(s,0);
  stopSpeech(s,7000);assert.equal(speechElapsed(s,50000),7000);assert.equal(clock.poll(50000),null);
  startSpeech(s,50000);clock.skip(50000);assert.equal(clock.poll(53001),'10秒');
  assert.equal(speechRemaining(s,56000),7000);resetSpeech(s);assert.equal(speechElapsed(s,99999),0);assert.equal(clock.poll(99999),null);
});
test('background and restart skip missed speech and preserve phase',()=>{
  const s={...speechDefaults(),intervalMs:10000};startSpeech(s,1000);const clock=new SpeechClock(s,1000);
  assert.equal(clock.poll(11010,false),null);clock.skip(35500);assert.equal(clock.poll(35501),null);
  assert.equal(clock.poll(41010),'40秒');
  const restored=JSON.parse(JSON.stringify(s));assert.ok(validSpeech(restored));const reopened=new SpeechClock(restored,86402500);
  assert.equal(reopened.poll(86402501),null);assert.equal(reopened.poll(86411001),'24時間10秒');
});
test('stored speech configuration validation rejects invalid input',()=>{
 assert.ok(validSpeech(speechDefaults()));assert.equal(validSpeech({...speechDefaults(),intervalMs:1}),false);
 assert.equal(validSpeech({...speechDefaults(),running:true}),false);assert.equal(validSpeech({...speechDefaults(),volume:-1}),false);
});
