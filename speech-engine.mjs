export const speechDefaults = () => ({ intervalMs:300000, volume:70, rate:1, voiceURI:'', running:false, accumulated:0, startedAt:null });
export function validSpeech(s){
  return !!s && Number.isSafeInteger(s.intervalMs) && s.intervalMs>=1000 && s.intervalMs<=86400000 && Number.isFinite(s.volume) && s.volume>=0 && s.volume<=100 && Number.isFinite(s.rate) && s.rate>=.5 && s.rate<=2 && typeof s.voiceURI==='string' && typeof s.running==='boolean' && Number.isFinite(s.accumulated) && s.accumulated>=0 && (s.running?Number.isFinite(s.startedAt)&&s.startedAt>=0:s.startedAt===null);
}
export const speechElapsed=(s,now=Date.now())=>s.accumulated+(s.running?Math.max(0,now-s.startedAt):0);
export function startSpeech(s,now=Date.now()){if(s.running)return;s.running=true;s.startedAt=now;}
export function stopSpeech(s,now=Date.now()){s.accumulated=speechElapsed(s,now);s.running=false;s.startedAt=null;}
export function resetSpeech(s){s.accumulated=0;s.running=false;s.startedAt=null;}
export function durationText(ms){
  const seconds=Math.floor(Math.max(0,ms)/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds/60)%60,remainder=seconds%60;
  return `${hours?`${hours}時間`:''}${minutes?`${minutes}分`:''}${remainder?`${remainder}秒`:''}`||'0秒';
}
export const speechIndex=(s,now=Date.now())=>Math.floor(speechElapsed(s,now)/s.intervalMs);
export const speechRemaining=(s,now=Date.now())=>s.intervalMs-speechElapsed(s,now)%s.intervalMs;
export class SpeechClock{
  constructor(settings,now=Date.now()){this.reset(settings,now);}
  reset(settings,now=Date.now()){this.settings=settings;this.skip(now);}
  skip(now=Date.now()){this.index=speechIndex(this.settings,now);}
  poll(now=Date.now(),visible=true){
    const s=this.settings,index=speechIndex(s,now),crossed=index>this.index;this.index=index;
    const delay=speechElapsed(s,now)%s.intervalMs;
    return s.running&&visible&&crossed&&delay<Math.min(700,s.intervalMs/2)?durationText(index*s.intervalMs):null;
  }
}
