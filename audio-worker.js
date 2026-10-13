/* Audio is prepared before playback so background announcements do not need timers. */
importScripts('./vendor/lame.min.js');
const RATE=8000,FRAME_SAMPLES=576,FRAME_MS=72;
let voiceData,voiceIndex,voiceVariant;
const voiceCache=new Map(),toneCache=new Map();
function encode(pcm){
  const encoder=new lamejs.Mp3Encoder(1,RATE,8),chunks=[];
  for(let i=0;i<pcm.length;i+=1152){const data=encoder.encodeBuffer(pcm.subarray(i,i+1152));if(data.length)chunks.push(new Uint8Array(data));}
  const tail=encoder.flush();if(tail.length)chunks.push(new Uint8Array(tail));
  const result=new Uint8Array(chunks.reduce((sum,c)=>sum+c.length,0));let offset=0;
  for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
  if(result.length%72!==0)throw new Error('Unexpected MP3 frame format');
  return result;
}
const encodedSilence=encode(new Int16Array(RATE));
const silence=encodedSilence.slice(72*3,72*4);
async function loadVoice(){
  if(voiceData)return;
  const [metadata,response]=await Promise.all([fetch('./audio/ja-times.json').then(r=>{if(!r.ok)throw new Error('Voice metadata unavailable');return r.json();}),fetch('./audio/ja-times.pcm.gz')]);
  if(!response.ok)throw new Error('Japanese voice unavailable');
  const raw=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  voiceData=new Int16Array(raw);voiceIndex=metadata.clips;
}
function encodeWord(text,volume,rate){
  const key=`${text}/${volume}/${rate}`;if(voiceCache.has(key))return voiceCache.get(key);
  const clip=voiceIndex[text];if(!clip)throw new Error(`Voice is unavailable for ${text}`);
  const source=voiceData.subarray(clip.offset/2,(clip.offset+clip.bytes)/2),pcm=new Int16Array(Math.ceil(source.length/rate));
  for(let i=0;i<pcm.length;i++){const position=i*rate,index=Math.floor(position),fraction=position-index;pcm[i]=Math.round(((source[index]||0)*(1-fraction)+(source[index+1]||0)*fraction)*volume/100);}
  const mp3=encode(pcm);voiceCache.set(key,mp3);return mp3;
}
function spokenWords(ms){
  const seconds=Math.floor(ms/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds/60)%60,remain=seconds%60;
  return [hours?`${hours}時間`:null,minutes?`${minutes}分`:null,remain?`${remain}秒`:null].filter(Boolean);
}
function numberWords(number){
  const result=[];
  for(const unit of [100000000,10000,1000,100,10]){
    const count=Math.floor(number/unit);if(!count)continue;
    if(unit>=10000)result.push(...numberWords(count));else if(count>1)result.push(`n${count}`);
    result.push(`u${unit}`);number%=unit;
  }
  if(number)result.push(`n${number}`);return result;
}
function wordParts(text){if(voiceIndex[text])return [text];if(/^\d+時間$/.test(text))return [...numberWords(Number(text.slice(0,-2))),'hourUnit'];throw new Error(`Voice is unavailable for ${text}`);}
function encodeSpeech(ms,settings){
  const words=spokenWords(ms),clips=words.flatMap(word=>wordParts(word).map(part=>encodeWord(part,settings.volume,settings.rate)));
  const bytes=new Uint8Array(clips.reduce((sum,c)=>sum+c.length,0));let position=0;for(const clip of clips){bytes.set(clip,position);position+=clip.length;}
  return {bytes,text:words.join('')};
}
function encodeTone(settings,custom){
  const key=`${settings.sound}/${settings.volume}/${custom?.key||''}`;if(toneCache.has(key))return toneCache.get(key);
  const recipes={wood:{notes:[[320,1],[740,.16]],duration:.16},bell:{notes:[[740,.8],[1482,.22],[2228,.08]],duration:.75},click:{notes:[[1600,1],[2400,.25]],duration:.035},beep:{notes:[[880,1]],duration:.13},drop:{notes:[[620,1]],duration:.22}};
  let pcm;
  if(settings.sound==='custom'){
    if(!custom?.samples)throw new Error('Custom sound is not ready');
    pcm=new Int16Array(Math.min(custom.samples.length,RATE*3));for(let i=0;i<pcm.length;i++)pcm[i]=Math.round(Math.max(-1,Math.min(1,custom.samples[i]))*26000*settings.volume/100);
  }else{
    const recipe=recipes[settings.sound]||recipes.wood;pcm=new Int16Array(Math.ceil((recipe.duration+.05)*RATE));
    const level=.3*Math.pow(settings.volume/100,1.7);
    for(let i=0;i<pcm.length;i++){
      const t=i/RATE;if(t>recipe.duration)continue;
      let sum=0;for(const[freq,gain]of recipe.notes){const phase=settings.sound==='wood'||settings.sound==='drop'?2*Math.PI*freq*(t-.225*t*t/recipe.duration):2*Math.PI*freq*t;sum+=Math.sin(phase)*gain;}
      const envelope=Math.min(1,t/.003)*Math.exp(-9*t/recipe.duration);pcm[i]=Math.round(Math.max(-1,Math.min(1,sum*level*envelope))*32767);
    }
  }
  const bytes=encode(pcm);toneCache.set(key,bytes);return bytes;
}
function settingsAt(s,now){return s.accumulated+(s.running?Math.max(0,now-s.startedAt):0);}
async function build(message){
  const {id,interval,speech,custom,preview}=message;
  if(speech?.running||preview)await loadVoice();
  const voiceSettings=preview?.settings||speech;
  if(voiceSettings){const variant=`${voiceSettings.volume}/${voiceSettings.rate}`;if(variant!==voiceVariant){voiceCache.clear();voiceVariant=variant;}}
  if(preview){const clip=encodeSpeech(preview.ms,preview.settings);postMessage({id,bytes:clip.bytes.buffer,duration:clip.bytes.length/72*FRAME_MS/1000,preview:true},[clip.bytes.buffer]);return;}
  const startAt=message.startAt,durationMs=message.durationMs||21600000;
  const frameCount=Math.ceil(durationMs/FRAME_MS),bytes=new Uint8Array(frameCount*72);
  for(let i=0;i<frameCount;i++)bytes.set(silence,i*72);
  const tone=interval?.enabled&&interval.volume>0?encodeTone(interval,custom):null;
  const reading=speech?.running&&speech.volume>0;
  let nextTone=tone?interval.anchor+(Math.floor((startAt-interval.anchor)/interval.intervalMs)+1)*interval.intervalMs:Infinity;
  const elapsed=reading?settingsAt(speech,startAt):0;
  let speechIndex=reading?Math.floor(elapsed/speech.intervalMs)+1:0;
  let nextSpeech=reading?startAt+speechIndex*speech.intervalMs-elapsed:Infinity;
  let occupiedUntil=0;const cues=[];
  // One continuous MP3 contains both streams. Speech takes priority over a tone.
  while(Math.min(nextTone,nextSpeech)<startAt+durationMs){
    const isSpeech=nextSpeech<=nextTone,at=isSpeech?nextSpeech:nextTone,frame=Math.max(0,Math.round((at-startAt)/FRAME_MS));
    if(frame>=occupiedUntil){
      const clip=isSpeech?encodeSpeech(speechIndex*speech.intervalMs,speech):{bytes:tone,text:null};
      const count=clip.bytes.length/72;
      if(frame+count<frameCount){bytes.set(clip.bytes,frame*72);occupiedUntil=frame+count;if(isSpeech)cues.push({at:frame*FRAME_MS/1000,text:clip.text});}
    }
    if(isSpeech){speechIndex++;nextSpeech=startAt+speechIndex*speech.intervalMs-elapsed;}else nextTone+=interval.intervalMs;
  }
  postMessage({id,bytes:bytes.buffer,startAt,duration:frameCount*FRAME_MS/1000,cues},[bytes.buffer]);
}
let queue=Promise.resolve();
self.onmessage=event=>{queue=queue.then(()=>build(event.data)).catch(error=>postMessage({id:event.data.id,error:error.message}));};
