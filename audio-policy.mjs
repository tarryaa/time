export const PLAYBACK_KEY='switchtime-playback-v1';
export const MODES=['mix','lock'];
export function readPlaybackMode(storage){
  try{const saved=JSON.parse(storage?.getItem(PLAYBACK_KEY));if(MODES.includes(saved?.mode))return saved.mode;}catch{}
  return 'mix';
}
export class AudioPolicy{
  constructor(navigatorObject=globalThis.navigator){
    try{this.session=navigatorObject?.audioSession||null;}catch{this.session=null;}
    this.supported=!!this.session;this.mode='mix';
  }
  get interrupted(){return this.session?.state==='interrupted';}
  apply(mode){
    if(!MODES.includes(mode))throw new RangeError('Invalid playback mode');
    this.mode=mode;
    if(!this.session){this.supported=false;return false;}
    try{
      // Ambient is explicitly mixable. Never fall back to exclusive playback in mix mode.
      const type=mode==='mix'?'ambient':'playback';this.session.type=type;
      this.supported=this.session.type===type;return this.supported;
    }catch{this.supported=false;return false;}
  }
}
