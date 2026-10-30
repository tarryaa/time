import {speechDefaults,validSpeech,startSpeech,stopSpeech,resetSpeech,speechElapsed,speechRemaining,durationText} from './speech-engine.mjs';
import {RecordedSpeech,normalizeRecordedSettings,RECORD_INTERVALS} from './recorded-speech.mjs';
import {timeParts} from './timer-engine.mjs';
const KEY='switchtime-speech-v1';
export function mountSpeech({toast,showModal,actions,audio}){
  const $=id=>document.getElementById(id);
  let settings=speechDefaults(),editing=false;
  try{const saved=JSON.parse(localStorage.getItem(KEY));if(validSpeech(saved))settings=saved;}catch{}
  settings=normalizeRecordedSettings(settings);
  const player=new RecordedSpeech(audio,{onState:()=>draw(),onError:message=>toast(message)});
  function save(){try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{toast('読み上げの設定を保存できませんでした');}}
  save();
  function draw(){
    const elapsed=speechElapsed(settings),parts=timeParts(elapsed);
    $('speech-time').textContent=parts.main;
    $('speech-summary').textContent=`${durationText(settings.intervalMs)}ごと · 録音音声`;
    $('speech-start').textContent=settings.accumulated?'再開':'開始';$('speech-start').hidden=settings.running;
    $('speech-stop').disabled=!settings.running;$('speech-reset').disabled=!settings.running&&!settings.accumulated;
    $('speech-unlock').hidden=!settings.running||player.ready||player.preparing||editing;
    $('speech-panel').classList.toggle('on',settings.running);
    $('speech-caption').textContent=!settings.running?(elapsed?'停止中。再開すると続きから計測します。':`${durationText(settings.intervalMs)}ごとに、経過時間を短い録音音声で。`):player.preparing?'音声を準備しています…':!player.ready?'時間は継続中。音声を再開するにはタップ。':settings.volume===0?'音量0のため無音です。':`次は「${durationText((Math.floor(elapsed/settings.intervalMs)+1)*settings.intervalMs)}」 · あと${Math.max(1,Math.ceil(speechRemaining(settings)/1000))}秒`;
    const last=player.lastSpoken;$('speech-last').textContent=last?`前回の読み上げ：${last}`:'ストップウォッチとは独立して計測。開いている間だけ読み上げます。';
  }
  async function arm(){
    try{await player.unlock();await player.schedule(settings);}
    catch{toast('音声を開始できませんでした。「音声を再開」を押してください。');}
    draw();
  }
  $('speech-start').addEventListener('click',()=>{startSpeech(settings);save();arm();draw();});
  function stop(){stopSpeech(settings);player.schedule(settings);save();draw();}
  $('speech-stop').addEventListener('click',stop);
  $('speech-unlock').addEventListener('click',arm);
  $('speech-reset').addEventListener('click',()=>{resetSpeech(settings);player.cancel({clearLast:true});player.schedule(settings);save();draw();toast('読み上げの経過時間をリセットしました');});
  function openSettings(){
    showModal('普通の声で、そっとお知らせ。',`<label class="field-label" for="speech-record-interval">読み上げる間隔</label><select class="text-input" id="speech-record-interval">${RECORD_INTERVALS.map(ms=>`<option value="${ms}" ${settings.intervalMs===ms?'selected':''}>${durationText(ms)}ごと</option>`).join('')}</select><p class="speech-example" id="speech-example"></p><p class="volume-note">「1分」「2分」などの録音音声を鳴らします。30秒ごとなら「30秒、1分、1分30秒…」とお知らせします。</p><label class="field-label" for="speech-volume">読み上げの音量 <span id="speech-volume-value">${settings.volume}%</span></label><input type="range" id="speech-volume" min="0" max="100" value="${settings.volume}"><p class="volume-note">端末本体の音量設定も反映されます。声の高さ・速さは標準です。</p><div class="speech-preview-buttons"><button type="button" class="preview-sound" data-record-preview="60000">▷ 「1分」を試聴</button><button type="button" class="preview-sound" data-record-preview="90000">▷ 「1分30秒」を試聴</button><button type="button" class="preview-sound" data-record-preview="300000">▷ 「5分」を試聴</button><button type="button" class="preview-sound" data-record-preview="3900000">▷ 「1時間5分」を試聴</button></div><div class="sound-route-note"><strong>音楽・動画との同時再生を優先します</strong><br>長い無音の音声ファイルは再生せず、必要な時刻に短い録音を効果音として鳴らします。iPhone・iPadでは消音モードを解除してください。アプリを開いている間だけ鳴ります。画面ロック中や別アプリを表示中は無音です。</div><p class="editor-hint">開始からの経過時間をお知らせします。ストップで声と時間を停止し、再開で続きから。間隔は30秒・1分・5分・10分・15分・30分・1時間から選べます。音楽やYouTubeとの実機での同時再生は未検証です。</p>`,actions('設定を保存'),()=>{
      settings.intervalMs=Number($('speech-record-interval').value);settings.volume=Number($('speech-volume').value);settings.rate=1;
      save();$('modal').close();toast('読み上げの設定を保存しました');
    });
    editing=true;player.hold(true);draw();
    function example(){const ms=Number($('speech-record-interval').value);$('speech-example').textContent=`${durationText(ms)} … ${durationText(ms*2)} … ${durationText(ms*3)}`;}
    example();$('speech-record-interval').addEventListener('change',example);
    $('speech-volume').addEventListener('input',()=>$('speech-volume-value').textContent=`${$('speech-volume').value}%`);
    document.querySelectorAll('[data-record-preview]').forEach(button=>button.addEventListener('click',async()=>{audio.stop();const label=button.textContent;button.disabled=true;button.textContent='音声を準備しています…';try{await player.preview(Number(button.dataset.recordPreview),Number($('speech-volume').value));}finally{button.disabled=false;button.textContent=label;}}));
  }
  $('speech-settings').addEventListener('click',openSettings);
  $('modal').addEventListener('close',()=>{if(editing){editing=false;player.cancel();player.settings={...settings};player.hold(false);draw();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)player.cancel();else if(settings.running&&!editing&&player.armed)arm();draw();});
  window.addEventListener('pagehide',()=>player.cancel());
  window.addEventListener('pageshow',()=>{if(settings.running&&player.ready&&!editing)player.schedule(settings);draw();});
  window.addEventListener('storage',event=>{if(event.key!==KEY)return;try{const saved=JSON.parse(event.newValue);if(validSpeech(saved)){settings=normalizeRecordedSettings(saved);player.schedule(settings);draw();}}catch{}});
  setInterval(()=>{player.tick();if(!document.hidden)draw();},100);
  player.settings={...settings};draw();
  return {busy:()=>false,cancel:()=>player.stopPreview(),draw,stopFromMedia:stop};
}
