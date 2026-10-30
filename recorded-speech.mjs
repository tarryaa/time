import {speechElapsed,durationText,SpeechClock} from './speech-engine.mjs';
export const RECORD_INTERVAL=300000;
export const RECORD_INTERVALS=[30000,60000,300000,600000,900000,1800000,3600000];
export function normalizeRecordedSettings(settings){
  return {...settings,intervalMs:RECORD_INTERVALS.includes(settings.intervalMs)?settings.intervalMs:RECORD_INTERVAL,rate:1,voiceURI:'recorded-ja-v1'};
}
function numberKeys(number){
  const keys=[];for(const unit of [100000000,10000,1000,100,10]){const count=Math.floor(number/unit);if(!count)continue;if(unit>=10000)keys.push(...numberKeys(count));else if(count>1)keys.push(`n${count}`);keys.push(`u${unit}`);number%=unit;}if(number)keys.push(`n${number}`);return keys;
}
export function recordedKeys(ms,available){
  if(!Number.isSafeInteger(ms)||ms<=0||ms%30000!==0)throw new Error('Recorded announcements require thirty-second milestones');
  const seconds=ms/1000;
  if(available[String(seconds)])return [String(seconds)];
  const remainder=seconds%60,whole=seconds-remainder;
  const hours=Math.floor(whole/3600),minutes=Math.floor(whole/60)%60;
  const keys=[];
  if(whole&&available[String(whole)])keys.push(String(whole));
  else{
    if(hours){if(available[`h${hours}`])keys.push(`h${hours}`);else if(available[String(hours*3600)])keys.push(String(hours*3600));else keys.push(...numberKeys(hours),'hours');}
    if(minutes)keys.push(String(minutes*60));
  }
  if(remainder)keys.push('30');
  if(!keys.length||keys.some(key=>!available[key]))throw new Error('Recorded voice unavailable');
  return keys;
}
export function nextRecordedCues(settings,now=Date.now(),horizon=21600000){
  if(!settings.running)return [];
  const elapsed=speechElapsed(settings,now),first=Math.floor(elapsed/settings.intervalMs)+1,cues=[];
  for(let index=first;index*settings.intervalMs-elapsed<=horizon;index++)cues.push({elapsed:index*settings.intervalMs,at:now+index*settings.intervalMs-elapsed});
  return cues;
}
export class RecordedSpeech{
  constructor(audio,{onState=()=>{},onError=()=>{}}={}){
    this.audio=audio;this.onState=onState;this.onError=onError;this.armed=false;this.preparing=false;this.held=false;this.sources=new Set();this.generation=0;this.previewGeneration=0;this.previewSource=null;this.cache=new Map();this.clock=null;this.lastText='';this.pending=null;this.settings=null;this.observedContext=null;
  }
  get ready(){return this.armed&&this.audio.ready;}
  get lastSpoken(){return this.lastText;}
  async load(){
    if(this.packs)return;
    if(!this.pending)this.pending=Promise.all(['natural-ja','natural-ja-short'].map(async name=>{
      const [index,pack]=await Promise.all([fetch(`./audio/${name}.json`).then(response=>{if(!response.ok)throw new Error('Voice index unavailable');return response.json();}),fetch(`./audio/${name}.mp3pack`).then(response=>{if(!response.ok)throw new Error('Recorded voice unavailable');return response.arrayBuffer();})]);
      return {name,index,pack};
    })).then(groups=>{
      const index={},packs={};
      for(const group of groups){packs[group.name]=group.pack;for(const [key,clip] of Object.entries(group.index.clips))index[key]={...clip,pack:group.name};}
      this.index=index;this.packs=packs;
    }).catch(error=>{this.pending=null;throw error;});
    await this.pending;
  }
  async unlock(){
    this.armed=true;await this.audio.unlock();
    if(!this.audio.ready)throw new Error('Audio not running');
    if(this.observedContext!==this.audio.context){this.observedContext=this.audio.context;this.audio.context.addEventListener('statechange',()=>{if(!document.hidden&&this.audio.ready&&this.settings?.running&&!this.held)this.schedule(this.settings);else this.onState();});}
    return true;
  }
  async buffer(ms){
    await this.load();const key=String(ms);if(this.cache.has(key))return this.cache.get(key);
    const promise=(async()=>{
      const keys=recordedKeys(ms,this.index),parts=[];
      for(const word of keys){const clip=this.index[word];parts.push(await this.audio.context.decodeAudioData(this.packs[clip.pack].slice(clip.offset,clip.offset+clip.bytes)));}
      if(parts.length===1)return parts[0];
      const rate=this.audio.context.sampleRate,pause=Math.round(rate*.06),result=this.audio.context.createBuffer(1,parts.reduce((sum,part)=>sum+part.length,0)+pause*(parts.length-1),rate);
      let at=0;for(const part of parts){result.getChannelData(0).set(part.getChannelData(0),at);at+=part.length+pause;}return result;
    })();this.cache.set(key,promise);
    if(this.cache.size>12)this.cache.delete(this.cache.keys().next().value);
    try{return await promise;}catch(error){this.cache.delete(key);throw error;}
  }
  cancel({clearLast=false}={}){
    this.generation++;this.stopPreview();for(const source of this.sources){try{source.stop();}catch{}}this.sources.clear();this.preparing=false;if(clearLast)this.lastText='';this.onState();
  }
  stopPreview(){this.previewGeneration++;if(this.previewSource){try{this.previewSource.stop();}catch{}this.sources.delete(this.previewSource);this.previewSource=null;}}
  hold(value){this.held=value;if(value)this.cancel();else if(this.settings)this.schedule(this.settings);}
  async schedule(settings){
    this.cancel();this.settings={...settings};this.clock=new SpeechClock(this.settings);
    if(!settings.running||!this.ready||this.held||document.hidden||settings.volume<=0)return;
    await this.prepareNext();
  }
  async prepareNext(){
    const generation=this.generation,settings=this.settings;
    if(!settings?.running||!this.ready||this.held||document.hidden||settings.volume<=0)return;
    this.preparing=true;this.onState();
    try{await this.buffer((Math.floor(speechElapsed(settings)/settings.intervalMs)+1)*settings.intervalMs);}
    catch{if(generation===this.generation)this.onError('録音音声を読み込めませんでした。通信を確認して「音声を再開」を押してください。');}
    finally{if(generation===this.generation){this.preparing=false;this.onState();}}
  }
  async tick(now=Date.now()){
    const settings=this.settings;
    if(!this.clock||!settings)return;
    const text=this.clock.poll(now,!document.hidden&&!this.held&&this.ready);
    if(!text||settings.volume<=0)return;
    const generation=this.generation,elapsed=Math.floor(speechElapsed(settings,now)/settings.intervalMs)*settings.intervalMs;
    try{
      const buffer=await this.buffer(elapsed);
      // Play only the current foreground beat. Never reserve background audio.
      if(generation!==this.generation||document.hidden||this.held||!this.ready||Date.now()-now>=700)return;
      let source;
      source=this.audio.playBuffer(buffer,settings.volume,{onended:()=>{this.sources.delete(source);this.onState();}});
      if(source){this.sources.add(source);this.lastText=text;this.onState();}
      this.prepareNext();
    }catch{if(generation===this.generation)this.onError('読み上げ音声を再生できませんでした');}
  }
  async preview(ms,volume){
    this.cancel();const generation=this.generation,previewGeneration=++this.previewGeneration;
    try{await this.unlock();const buffer=await this.buffer(ms);if(generation!==this.generation||previewGeneration!==this.previewGeneration)return;let source;source=this.audio.playBuffer(buffer,volume,{onended:()=>{this.sources.delete(source);if(this.previewSource===source)this.previewSource=null;this.onState();}});if(source){this.sources.add(source);this.previewSource=source;}}
    catch{this.onError('試聴音声を読み込めませんでした');}
  }
}
