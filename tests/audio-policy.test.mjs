import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioPolicy,readPlaybackMode,PLAYBACK_KEY} from '../audio-policy.mjs';
test('default and malformed saved modes prefer mixing; saved lock choice survives',()=>{
 assert.equal(readPlaybackMode(), 'mix');
 assert.equal(readPlaybackMode({getItem:()=>'{bad json'}),'mix');
 assert.equal(readPlaybackMode({getItem:key=>key===PLAYBACK_KEY?' {"mode":"lock"}':null}),'lock');
 assert.equal(readPlaybackMode({getItem:()=>' {"mode":"invalid"}'}),'mix');
});
test('mix requests ambient, never an exclusive session',()=>{
 const types=[],session={state:'active',set type(value){types.push(value);this.value=value;},get type(){return this.value;}};
 const policy=new AudioPolicy({audioSession:session});assert.equal(policy.apply('mix'),true);assert.deepEqual(types,['ambient']);
 assert.equal(policy.interrupted,false);session.state='interrupted';assert.equal(policy.interrupted,true);
});
test('only explicit lock priority requests exclusive playback',()=>{
 const session={type:'auto'};const policy=new AudioPolicy({audioSession:session});
 policy.apply('lock');assert.equal(session.type,'playback');policy.apply('mix');assert.equal(session.type,'ambient');
 assert.throws(()=>policy.apply('bad'),RangeError);
});
test('unsupported/rejected mixing does not fall back to exclusive playback',()=>{
 const unavailable=new AudioPolicy({});assert.equal(unavailable.apply('mix'),false);
 const types=[],policy=new AudioPolicy({audioSession:{set type(value){types.push(value);throw new Error('unsupported');}}});
 assert.equal(policy.apply('mix'),false);assert.deepEqual(types,['ambient']);assert.equal(policy.supported,false);
});
