import {speechDefaults,validSpeech,startSpeech,stopSpeech,resetSpeech,speechElapsed,speechRemaining,durationText,SpeechClock} from './speech-engine.mjs';
import {timeParts} from './timer-engine.mjs';
const KEY='switchtime-speech-v1';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountSpeech({toast,showModal,actions,audio,background}){
  const $=id=>document.getElementById(id);
  let settings=speechDefaults(),editing=false,lastSpoken='',settingsAbort;
  try{const saved=JSON.parse(localStorage.getItem(KEY));if(validSpeech(saved))settings=saved;}catch{}
  const clock=new SpeechClock(settings);
  function save(){try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{toast('読み上げの設定を保存できませんでした');}}
  function draw(){
    const ms=speechElapsed(settings),parts=timeParts(ms);
    $('speech-time').textContent=parts.main;
    $('speech-summary').textContent=`${durationText(settings.intervalMs)}ごと`;
    $('speech-start').textContent=settings.accumulated?'再開':'開始';
    $('speech-start').hidden=settings.running;
    $('speech-stop').disabled=!settings.running;
    $('speech-reset').disabled=!settings.running&&!settings.accumulated;
    $('speech-unlock').hidden=!settings.running||background.ready||background.preparing||editing;
    $('speech-panel').classList.toggle('on',settings.running);
    $('speech-caption').textContent=!settings.running?(ms?'停止中。再開すると続きから計測します。':'開始からの経過時間を、日本語でお知らせ。'):background.preparing?'ロック中も再生できる音声を準備しています…':!background.ready?'時間は継続中。音声を再開するにはタップ。':settings.volume===0?'音量0のため無音です。':`次は「${durationText((Math.floor(ms/settings.intervalMs)+1)*settings.intervalMs)}」 · あと${Math.max(1,Math.ceil(speechRemaining(settings)/1000))}秒`;
    lastSpoken=settings.running||settings.accumulated?(background.lastSpoken||lastSpoken):'';
    $('speech-last').textContent=lastSpoken?`前回の読み上げ：${lastSpoken}`:'ストップウォッチとは独立して計測します。';
  }
  $('speech-start').addEventListener('click',()=>{
    background.arm();startSpeech(settings);clock.skip();save();background.setSpeech(settings);draw();
  });
  $('speech-stop').addEventListener('click',()=>{stopSpeech(settings);save();background.setSpeech(settings);draw();});
  $('speech-unlock').addEventListener('click',()=>{background.arm();clock.skip();background.setSpeech(settings);draw();});
  $('speech-reset').addEventListener('click',()=>{resetSpeech(settings);lastSpoken='';clock.skip();save();background.setSpeech(settings);draw();toast('読み上げの経過時間をリセットしました');});
  function openSettings(){
    settingsAbort?.abort();settingsAbort=new AbortController();
    const units={seconds:1000,minutes:60000,hours:3600000};
    const unit=settings.intervalMs%3600000===0?'hours':settings.intervalMs%60000===0?'minutes':'seconds';
    showModal('経過時間を、耳で知る。',`<label class="field-label" for="speech-amount">読み上げる間隔</label><div class="interval-inputs"><input type="number" inputmode="decimal" class="text-input" id="speech-amount" min="0.001" max="86400" step="any" required value="${settings.intervalMs/units[unit]}"><select id="speech-unit" class="text-input" aria-label="読み上げ間隔の単位"><option value="seconds" ${unit==='seconds'?'selected':''}>秒ごと</option><option value="minutes" ${unit==='minutes'?'selected':''}>分ごと</option><option value="hours" ${unit==='hours'?'selected':''}>時間ごと</option></select></div><p class="speech-example" id="speech-example"></p><div class="interval-shortcuts">${[10,30,60,300,600].map(sec=>`<button type="button" data-speech-seconds="${sec}">${durationText(sec*1000)}</button>`).join('')}</div><label class="field-label" for="speech-volume">読み上げの音量 <span id="speech-volume-value">${settings.volume}%</span></label><input type="range" id="speech-volume" min="0" max="100" value="${settings.volume}"><p class="volume-note">端末本体の音量設定も反映されます。</p><label class="field-label" for="speech-rate">読み上げの速さ</label><select id="speech-rate" class="text-input">${[.75,1,1.25,1.5].map(rate=>`<option value="${rate}" ${settings.rate===rate?'selected':''}>${rate===1?'標準':`${rate}倍`}</option>`).join('')}</select><p class="volume-note">時間は日本語で読み上げます。</p><button type="button" class="preview-sound" id="speech-preview">▷ 「1時間5分」を試聴</button><div class="sound-route-note"><strong>音声は端末の出力先に従います</strong><br>イヤホン接続の検知は行いません。準備した音声をメディアとして再生するので、画面ロック中も再生を継続できます。アプリの完全終了やOSによる再生停止には対応できません。</div><p class="editor-hint">開始からの経過時間を読み上げます。ストップで時間と声が止まり、再開で続きから。間隔を変更しても経過時間は残ります。声が長い場合は次の読み上げをスキップし、重ねません。</p>`,actions('設定を保存'),()=>{
      const ms=Math.round(Number($('speech-amount').value)*units[$('speech-unit').value]/1000)*1000;
      if(!Number.isFinite(ms)||ms<1000||ms>86400000){toast('間隔は1秒〜24時間で設定してください');return;}
      settings.intervalMs=ms;settings.volume=Number($('speech-volume').value);settings.rate=Number($('speech-rate').value);settings.voiceURI='';
      background.stopPreview();clock.skip();save();background.setSpeech(settings);$('modal').close();draw();toast('読み上げの設定を保存しました');
    });
    editing=true;background.hold(true);draw();
    function example(){const ms=Math.round(Number($('speech-amount').value)*units[$('speech-unit').value]/1000)*1000;$('speech-example').textContent=ms>=1000&&ms<=86400000?`${durationText(ms)} … ${durationText(ms*2)} … ${durationText(ms*3)}`:'間隔は1秒〜24時間で設定できます。';}
    example();
    $('speech-amount').addEventListener('input',example);$('speech-unit').addEventListener('change',example);
    $('modal-body').addEventListener('click',e=>{const quick=e.target.closest('[data-speech-seconds]');if(!quick)return;const sec=Number(quick.dataset.speechSeconds);$('speech-unit').value=sec%60===0?'minutes':'seconds';$('speech-amount').value=sec%60===0?sec/60:sec;example();},{signal:settingsAbort.signal});
    $('speech-volume').addEventListener('input',()=>$('speech-volume-value').textContent=`${$('speech-volume').value}%`);
    $('speech-preview').addEventListener('click',()=>{audio.stop();background.preview(3900000,{volume:Number($('speech-volume').value),rate:Number($('speech-rate').value)});});
  }
  $('speech-settings').addEventListener('click',openSettings);
  $('modal').addEventListener('close',()=>{if(editing){editing=false;settingsAbort?.abort();background.stopPreview();background.hold(false);clock.skip();draw();}});
  document.addEventListener('visibilitychange',()=>{clock.skip();draw();});
  window.addEventListener('pageshow',()=>{clock.skip();draw();});
  window.addEventListener('storage',e=>{if(e.key!==KEY)return;try{const saved=JSON.parse(e.newValue);if(validSpeech(saved)){settings=saved;clock.reset(settings);background.setSpeech(settings);draw();}}catch{}});
  setInterval(()=>{
    if(!document.hidden)draw();
  },100);
  background.setSpeech(settings);draw();
  return {busy:()=>false,cancel:()=>background.stopPreview(),draw,stopFromMedia:()=>{stopSpeech(settings);save();background.setSpeech(settings);draw();}};
}
