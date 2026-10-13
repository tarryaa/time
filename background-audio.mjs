// HTML audio plays a prepared file; no setInterval or SpeechSynthesis is used while locked.
export class BackgroundAudio{
  constructor({onState=()=>{},onStop=()=>{},onError=()=>{}}={}){
    this.media=document.createElement('audio');this.media.id='background-audio';this.media.preload='auto';this.media.setAttribute('playsinline','');this.media.hidden=true;document.body.append(this.media);
    this.worker=new Worker('./audio-worker.js');this.jobs=new Map();this.id=0;this.version=0;this.armed=false;this.preparing=false;this.held=false;this.interval=null;this.speech=null;this.custom=null;this.track=null;this.nextTrack=null;this.urls=new Set();this.onState=onState;this.onStop=onStop;this.onError=onError;
    this.worker.onmessage=event=>{const response=event.data,job=this.jobs.get(response.id);if(!job)return;this.jobs.delete(response.id);response.error?job.reject(new Error(response.error)):job.resolve(response);};
    this.worker.onerror=()=>{for(const job of this.jobs.values())job.reject(new Error('Audio worker failed'));this.jobs.clear();this.preparing=false;this.onError('音声の準備に失敗しました。再度開始してください。');};
    this.media.addEventListener('ended',()=>{if(!this.active)return;if(this.nextTrack){this.install(this.nextTrack,0);this.prepareNext();}else this.rebuild();});
    this.media.addEventListener('error',()=>{if(this.armed&&!this.held)this.onError('音声を再生できませんでした。「音声を再開」を押してください。');});
    for(const event of ['playing','pause','waiting'])this.media.addEventListener(event,()=>{if(event==='playing')this.align();this.onState();});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.align();});
    if('mediaSession'in navigator){
      try{
        navigator.mediaSession.setActionHandler('pause',()=>{this.stop();this.onStop();});
        navigator.mediaSession.setActionHandler('stop',()=>{this.stop();this.onStop();});
        navigator.mediaSession.setActionHandler('play',()=>{if(this.active)this.media.play().catch(()=>this.onState());});
      }catch{}
    }
  }
  get active(){return !!(this.interval?.enabled||this.speech?.running);}
  get ready(){return this.armed&&!this.media.paused;}
  align(){if(!this.track||this.media.paused)return;const position=Math.max(0,(Date.now()-this.track.startAt)/1000);if(position<this.track.duration&&Math.abs(position-this.media.currentTime)>1)this.media.currentTime=position;}
  arm(){
    if(this.ready)return Promise.resolve();
    this.armed=true;
    const old=this.media.src;this.media.src=this.silentURL();this.media.loop=true;if(old?.startsWith('blob:')){URL.revokeObjectURL(old);this.urls.delete(old);}
    const promise=this.media.play();promise?.catch(error=>{if(error.name==='NotAllowedError')this.armed=false;this.onState();});
    if('mediaSession'in navigator&&globalThis.MediaMetadata){navigator.mediaSession.metadata=new MediaMetadata({title:'Switch Time — リズムと読み上げ',artist:'集中を、切り替える。'});}
    return promise;
  }
  silentURL(){
    const pcm=new Uint8Array(44+8000*2),view=new DataView(pcm.buffer);
    const string=(at,s)=>[...s].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
    string(0,'RIFF');view.setUint32(4,pcm.length-8,true);string(8,'WAVE');string(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);string(36,'data');view.setUint32(40,pcm.length-44,true);
    const url=URL.createObjectURL(new Blob([pcm],{type:'audio/wav'}));this.urls.add(url);return url;
  }
  job(input){const id=++this.id;return new Promise((resolve,reject)=>{this.jobs.set(id,{resolve,reject});this.worker.postMessage({...input,id});});}
  setTone(settings,custom){this.interval=structuredClone(settings);this.custom=custom||this.custom;this.rebuild();}
  setSpeech(settings){this.speech=structuredClone(settings);this.rebuild();}
  hold(value){this.held=value;if(value){this.media.pause();this.onState();}else this.rebuild();}
  async rebuild(){
    const version=++this.version;
    if(!this.active){this.media.pause();this.preparing=false;this.track=null;this.nextTrack=null;const url=this.media.src;this.media.removeAttribute('src');this.media.load();if(url?.startsWith('blob:')){URL.revokeObjectURL(url);this.urls.delete(url);}this.onState();return;}
    if(!this.armed||this.held)return;
    if(this.track)this.media.pause();
    this.preparing=true;this.onState();
    const startAt=Date.now();
    try{
      const response=await this.job({interval:this.interval,speech:this.speech,custom:this.custom,startAt});
      if(version!==this.version||!this.active||this.held)return;
      this.preparing=false;this.install(response,Math.max(0,(Date.now()-startAt)/1000));this.prepareNext();
    }catch(error){if(version===this.version){this.preparing=false;this.media.pause();this.onError(`音声の準備に失敗しました。通信や端末の対応状況をご確認ください。`);}}
    this.onState();
  }
  install(track,position){
    const oldURL=this.media.src;this.track=track;this.nextTrack=null;
    const url=URL.createObjectURL(new Blob([track.bytes],{type:'audio/mpeg'}));this.urls.add(url);
    this.media.loop=false;this.media.src=url;this.media.currentTime=Math.min(position,track.duration-.1);
    this.media.play().catch(()=>{this.armed=false;this.onState();});
    if(oldURL?.startsWith('blob:')){URL.revokeObjectURL(oldURL);this.urls.delete(oldURL);}
  }
  async prepareNext(){
    const version=this.version,current=this.track;if(!current)return;
    try{const next=await this.job({interval:this.interval,speech:this.speech,custom:this.custom,startAt:current.startAt+current.duration*1000});if(version===this.version&&current===this.track)this.nextTrack=next;}catch{}
  }
  get lastSpoken(){
    if(!this.track?.cues)return '';
    const time=this.media.currentTime;let text='';for(const cue of this.track.cues){if(cue.at>time)break;text=cue.text;}return text;
  }
  stop(){this.version++;this.armed=false;this.preparing=false;this.media.pause();this.track=null;this.nextTrack=null;this.onState();}
  async preview(ms,settings){
    const version=(this.previewVersion||0)+1;this.previewVersion=version;
    const preview=document.createElement('audio');preview.src=this.silentURL();preview.loop=true;preview.play().catch(()=>{});
    try{const track=await this.job({preview:{ms,settings}});if(version!==this.previewVersion){preview.pause();URL.revokeObjectURL(preview.src);return;}const old=preview.src;const url=URL.createObjectURL(new Blob([track.bytes],{type:'audio/mpeg'}));preview.src=url;preview.loop=false;preview.onended=()=>{URL.revokeObjectURL(url);preview.remove();};URL.revokeObjectURL(old);await preview.play();}
    catch{preview.pause();this.onError('試聴を再生できませんでした');}
    this.previewMedia?.pause();this.previewMedia=preview;
  }
  stopPreview(){this.previewVersion=(this.previewVersion||0)+1;this.previewMedia?.pause();if(this.previewMedia?.src?.startsWith('blob:'))URL.revokeObjectURL(this.previewMedia.src);this.previewMedia=null;}
}
