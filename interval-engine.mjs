export const SOUNDS = ['wood', 'bell', 'click', 'beep', 'drop', 'custom'];
export const defaults = () => ({ enabled:false, intervalMs:60000, volume:25, sound:'wood', anchor:null });
export function validInterval(s) {
  return !!s && typeof s.enabled==='boolean' && Number.isFinite(s.intervalMs) && s.intervalMs>=1000 && s.intervalMs<=86400000 && Number.isFinite(s.volume) && s.volume>=0 && s.volume<=100 && SOUNDS.includes(s.sound) && (s.enabled ? Number.isFinite(s.anchor) && s.anchor>=0 : s.anchor===null);
}
export const intervalIndex = (s, now=Date.now()) => s.enabled ? Math.max(0,Math.floor((now-s.anchor)/s.intervalMs)) : 0;
export const nextAt = (s, now=Date.now()) => s.enabled ? s.anchor+(intervalIndex(s,now)+1)*s.intervalMs : null;
export class IntervalClock {
  constructor(settings, now=Date.now()){ this.reset(settings,now); }
  reset(settings,now=Date.now()){ this.settings=settings;this.index=intervalIndex(settings,now); }
  skip(now=Date.now()){this.index=intervalIndex(this.settings,now);}
  poll(now=Date.now(),visible=true){
    if(!this.settings.enabled)return false;
    const index=intervalIndex(this.settings,now);
    const crossed=index>this.index;
    this.index=index;
    // Never replay missed beats after backgrounding, sleep or closing the app.
    const lateness=(now-this.settings.anchor)%this.settings.intervalMs;
    return crossed && visible && lateness>=0 && lateness<Math.min(700,this.settings.intervalMs/2);
  }
}
