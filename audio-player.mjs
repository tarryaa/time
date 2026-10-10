export class AudioPlayer {
  constructor(){this.context=null;this.voices=new Set();this.customBuffer=null;this.customBlob=null;this.customName='';}
  get ready(){return this.context?.state==='running';}
  async unlock(){
    const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!Audio)throw new Error('Web Audio unavailable');
    if(!this.context)this.context=new Audio();
    if(this.context.state!=='running')await this.context.resume();
    return this.ready;
  }
  stop(){for(const voice of this.voices){try{voice.stop();}catch{}}this.voices.clear();}
  hide(){this.stop();if(this.context?.state==='running')this.context.suspend().catch(()=>{});}
  async setCustom(blob,name){await this.unlock();const buffer=await this.context.decodeAudioData(await blob.arrayBuffer());this.customBuffer=buffer;this.customBlob=blob;this.customName=name;}
  play(sound,volume){
    if(document.visibilityState!=='visible'||!this.ready||volume<=0)return false;
    this.stop();
    const ctx=this.context,now=ctx.currentTime,level=.3*Math.pow(volume/100,1.7);
    const output=ctx.createGain();output.connect(ctx.destination);
    const track=source=>{this.voices.add(source);source.onended=()=>{this.voices.delete(source);source.disconnect();if(!this.voices.size)output.disconnect();};};
    if(sound==='custom'){
      if(!this.customBuffer)return false;
      const source=ctx.createBufferSource();source.buffer=this.customBuffer;source.connect(output);
      const duration=Math.min(3,this.customBuffer.duration);
      output.gain.setValueAtTime(0,now);output.gain.linearRampToValueAtTime(level,now+.01);
      output.gain.setValueAtTime(level,now+Math.max(.01,duration-.04));output.gain.linearRampToValueAtTime(0,now+duration);
      track(source);source.start(now,0,duration);return true;
    }
    const recipes={wood:{notes:[[320,1],[740,.16]],duration:.16},bell:{notes:[[740,.8],[1482,.22],[2228,.08]],duration:.75},click:{notes:[[1600,1],[2400,.25]],duration:.035},beep:{notes:[[880,1]],duration:.13},drop:{notes:[[620,1]],duration:.22}};
    const recipe=recipes[sound]||recipes.wood;
    output.gain.setValueAtTime(0,now);output.gain.linearRampToValueAtTime(level,now+.003);output.gain.exponentialRampToValueAtTime(.0001,now+recipe.duration);
    for(const [freq,gain]of recipe.notes){
      const osc=ctx.createOscillator(),mix=ctx.createGain();osc.type='sine';osc.frequency.setValueAtTime(freq,now);
      if(sound==='wood'||sound==='drop')osc.frequency.exponentialRampToValueAtTime(freq*.55,now+recipe.duration);
      mix.gain.value=gain;osc.connect(mix);mix.connect(output);track(osc);osc.start(now);osc.stop(now+recipe.duration+.02);
    }
    return true;
  }
}
function audioDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open('switchtime-audio',1);request.onupgradeneeded=()=>request.result.createObjectStore('sounds');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function readCustom(){const db=await audioDB();try{return await new Promise((resolve,reject)=>{const request=db.transaction('sounds').objectStore('sounds').get('custom');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}finally{db.close();}}
export async function saveCustom(blob,name){const db=await audioDB();try{await new Promise((resolve,reject)=>{const transaction=db.transaction('sounds','readwrite');transaction.objectStore('sounds').put({blob,name},'custom');transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});}finally{db.close();}}
