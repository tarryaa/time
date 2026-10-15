import { COLORS, uid, makeTimers, createSession, elapsed, total, settle, activate, reset, validSession, timeParts } from './timer-engine.mjs';
import { defaults, validInterval, IntervalClock, nextAt } from './interval-engine.mjs';
import { AudioPlayer, readCustom, saveCustom } from './audio-player.mjs';
import { mountSpeech } from './speech-ui.mjs';
const $ = id => document.getElementById(id);
const KEY = 'switchtime-session-v1', PRESETS_KEY = 'switchtime-presets-v1';
const AUDIO_KEY='switchtime-interval-v1';
const soundNames={wood:'トン',bell:'やわらかなベル',click:'小さなクリック',beep:'ピッ',drop:'しずく',custom:'自分の音'};
let interval=defaults(), savedCustom=null, soundEditorOpen=false;
try{const saved=JSON.parse(localStorage.getItem(AUDIO_KEY));if(validInterval(saved))interval=saved;}catch{}
const clock=new IntervalClock(interval),audio=new AudioPlayer();
readCustom().then(saved=>{savedCustom=saved||null;}).catch(()=>{});
let session = createSession(), presets = [], modalSubmit = null, toastTimeout, wakeLock, wantWake = false, draft, lastPaint = 0;
const builtins = [
  { id:'reading', title:'読解トレーニング', names:['本文を読む','問題を解く'] },
  { id:'study', title:'学習の3ステップ', names:['インプット','演習','振り返り'] },
  { id:'work', title:'作業の4ステップ', names:['調べる','考える','つくる','見直す'] }
];
const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
try { const saved = JSON.parse(localStorage.getItem(KEY)); if (validSession(saved)) session = saved; } catch {}
try { const saved = JSON.parse(localStorage.getItem(PRESETS_KEY)); if (Array.isArray(saved)) presets = saved.filter(p => typeof p.id === 'string' && validSession({title:p.title,timers:p.timers,activeId:null,lastId:null,startedAt:null})); } catch {}
function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimeout); toastTimeout = setTimeout(()=>$('toast').classList.remove('show'),3200); }
function persist() { try { localStorage.setItem(KEY,JSON.stringify(session)); } catch { toast('端末に保存できませんでした。空き容量やブラウザ設定をご確認ください。'); } }
function savePresets() { try { localStorage.setItem(PRESETS_KEY,JSON.stringify(presets)); return true; } catch { toast('保存できませんでした。端末の空き容量をご確認ください。'); return false; } }
function persistInterval(){try{localStorage.setItem(AUDIO_KEY,JSON.stringify(interval));}catch{toast('通知音の設定を端末に保存できませんでした');}}
function intervalLabel(ms){return ms%3600000===0?`${ms/3600000}時間`:ms%60000===0?`${ms/60000}分`:`${ms/1000}秒`;}
function drawRhythm(){
  $('rhythm-summary').textContent=`${intervalLabel(interval.intervalMs)}ごと · ${soundNames[interval.sound]}`;
  $('interval-toggle').setAttribute('aria-pressed',String(interval.enabled));
  $('interval-toggle').lastElementChild.textContent=interval.enabled?'オン':'オフ';
  $('interval-unlock').hidden=!interval.enabled||audio.ready||soundEditorOpen;
  $('rhythm-caption').textContent=!interval.enabled?'オンの間だけ、一定の間隔で音を鳴らす。':!audio.ready?'間隔は継続中。音声を再開するにはタップ。':interval.volume===0?'間隔は継続中。音量が0のため無音です。':`次の音まで ${Math.max(1,Math.ceil((nextAt(interval)-Date.now())/1000))}秒 · 閉じている間は無音`;
}
async function unlockAudio(){
  try{await audio.unlock();if(interval.sound==='custom'&&savedCustom&&!audio.customBuffer)await audio.setCustom(savedCustom.blob,savedCustom.name);drawRhythm();return audio.ready;}
  catch{toast('音声を開始できませんでした。再度タップしてお試しください。');drawRhythm();return false;}
}
$('interval-toggle').addEventListener('click',async()=>{
  if(interval.enabled){interval.enabled=false;interval.anchor=null;audio.stop();}
  else{
    if(interval.sound==='custom'&&!savedCustom){toast('設定から通知音のファイルを選んでください');return;}
    interval.enabled=true;interval.anchor=Date.now();
    // This runs directly from the tap, satisfying mobile autoplay restrictions.
    unlockAudio();
  }
  clock.reset(interval);persistInterval();drawRhythm();
});
$('interval-unlock').addEventListener('click',()=>{clock.skip();unlockAudio();});
function openSoundSettings(){
  let draftSound=interval.sound, draftFile=null;
  let unit=interval.intervalMs%3600000===0?'hours':interval.intervalMs%60000===0?'minutes':'seconds';
  const units={seconds:1000,minutes:60000,hours:3600000};
  const amount=interval.intervalMs/units[unit];
  const options=Object.entries(soundNames).map(([id,name])=>`<button type="button" class="sound-choice${id===draftSound?' selected':''}" data-sound="${id}" aria-pressed="${id===draftSound}"><span aria-hidden="true">${{wood:'◒',bell:'♧',click:'·',beep:'∿',drop:'◌',custom:'＋'}[id]}</span>${name}</button>`).join('');
  showModal('集中に、小さなリズムを。',`<label class="field-label" for="interval-amount">音を鳴らす間隔</label><div class="interval-inputs"><input type="number" inputmode="decimal" class="text-input" id="interval-amount" min="0.001" max="86400" step="any" required value="${amount}"><select id="interval-unit" class="text-input" aria-label="間隔の単位"><option value="seconds" ${unit==='seconds'?'selected':''}>秒ごと</option><option value="minutes" ${unit==='minutes'?'selected':''}>分ごと</option><option value="hours" ${unit==='hours'?'selected':''}>時間ごと</option></select></div><div class="interval-shortcuts">${[10,30,60,300,900].map(sec=>`<button type="button" data-seconds="${sec}">${intervalLabel(sec*1000)}</button>`).join('')}</div><label class="field-label" for="sound-volume">音量 <span id="volume-value">${interval.volume}%</span></label><input type="range" id="sound-volume" min="0" max="100" value="${interval.volume}" aria-label="通知音の音量"><p class="volume-note">端末本体の音量設定も反映されます。</p><span class="field-label sound-label">通知音</span><div class="sound-choices">${options}</div><div id="custom-sound-field" ${draftSound==='custom'?'':'hidden'}><label class="file-picker">音声ファイルを選ぶ<input type="file" id="sound-file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac"></label><p id="custom-file-name" class="volume-note">${escape(savedCustom?.name||'MP3・WAVなど、10MBまで。先頭3秒を使用します。')}</p></div><button type="button" class="preview-sound" id="preview-sound"><span aria-hidden="true">▷</span> この音を試す</button><div class="sound-route-note"><strong>音声は端末の出力先に従います</strong><br>イヤホン接続時は通常イヤホンから聞こえますが、外すとスピーカーへ切り替わる場合があります。イヤホン限定の保証はできません。</div><p class="editor-hint">通知音は専用ボタンでオンにした間だけ。ストップウォッチの停止とは独立して動きます。閉じていた間の通知は後から鳴らしません。バイブは使用しません。</p>`,actions('設定を保存'),async()=>{
    const ms=Math.round(Number($('interval-amount').value)*units[$('interval-unit').value]);
    if(!Number.isFinite(ms)||ms<1000||ms>86400000){toast('間隔は1秒〜24時間の範囲で設定してください');return;}
    if(draftSound==='custom'&&!draftFile&&!savedCustom){toast('音声ファイルを選んでください');return;}
    if(draftFile){try{await saveCustom(draftFile.blob,draftFile.name);savedCustom=draftFile;}catch{toast('音声ファイルを保存できませんでした');return;}}
    if(ms!==interval.intervalMs){interval.intervalMs=ms;if(interval.enabled)interval.anchor=Date.now();}
    interval.volume=Number($('sound-volume').value);interval.sound=draftSound;
    audio.customBuffer=null;
    clock.reset(interval);persistInterval();$('modal').close();if(interval.enabled)unlockAudio();drawRhythm();toast('通知音の設定を保存しました');
  });
  soundEditorOpen=true;drawRhythm();
  $('sound-volume').addEventListener('input',()=>$('volume-value').textContent=`${$('sound-volume').value}%`);
  $('modal-body').addEventListener('click',function settingsClick(e){
    const quick=e.target.closest('[data-seconds]'),choice=e.target.closest('[data-sound]');
    if(quick){const sec=Number(quick.dataset.seconds);$('interval-unit').value=sec%60===0?'minutes':'seconds';$('interval-amount').value=sec%60===0?sec/60:sec;}
    if(choice){draftSound=choice.dataset.sound;document.querySelectorAll('[data-sound]').forEach(button=>{button.classList.toggle('selected',button===choice);button.setAttribute('aria-pressed',String(button===choice));});$('custom-sound-field').hidden=draftSound!=='custom';}
  },{signal:settingsAbort.signal});
  $('sound-file').addEventListener('change',async()=>{
    const file=$('sound-file').files[0];if(!file)return;
    if(file.size>10*1024*1024){toast('10MB以下の音声ファイルを選んでください');return;}
    try{await audio.setCustom(file,file.name);draftFile={blob:file,name:file.name};$('custom-file-name').textContent=`${file.name} · 先頭3秒を使用`;}
    catch{toast('この音声ファイルを読み込めませんでした');}
  });
  $('preview-sound').addEventListener('click',async()=>{
    try{await audio.unlock();if(draftSound==='custom'){const custom=draftFile||savedCustom;if(!custom){toast('音声ファイルを選んでください');return;}await audio.setCustom(custom.blob,custom.name);}audio.play(draftSound,Number($('sound-volume').value));}
    catch{toast('音を再生できませんでした');}
  });
}
let settingsAbort=new AbortController();
$('sound-settings').addEventListener('click',()=>{settingsAbort.abort();settingsAbort=new AbortController();openSoundSettings();});
$('modal').addEventListener('close',()=>{if(soundEditorOpen){soundEditorOpen=false;settingsAbort.abort();audio.stop();audio.customBuffer=null;clock.skip();if(interval.enabled&&audio.ready)unlockAudio();drawRhythm();}});
document.addEventListener('visibilitychange',()=>{
  clock.skip();
  if(document.hidden)audio.hide();
  else{if(interval.enabled&&audio.context)audio.context.resume().then(()=>unlockAudio()).catch(()=>drawRhythm());drawRhythm();}
});
window.addEventListener('pagehide',()=>{clock.skip();audio.hide();});
window.addEventListener('pageshow',()=>{clock.skip();drawRhythm();});
window.addEventListener('storage',e=>{if(e.key!==AUDIO_KEY)return;try{const saved=JSON.parse(e.newValue);if(validInterval(saved)){interval=saved;clock.reset(interval);audio.stop();drawRhythm();}}catch{}});
setInterval(()=>{if(clock.poll(Date.now(),!document.hidden&&!soundEditorOpen)&&interval.enabled)audio.play(interval.sound,interval.volume);if(!document.hidden)drawRhythm();},100);
drawRhythm();
function format(ms,hours=false) { const t = timeParts(ms,hours); return `<span class="digits">${t.main}</span><span class="fraction">.${t.fraction}</span>`; }
function drawStructure(recentId) {
  $('session-title').textContent = session.title;
  $('task-count').textContent = `${session.timers.length}つのタイマーが連動`;
  $('timer-grid').classList.toggle('many',session.timers.length>2);
  $('timer-grid').innerHTML = session.timers.map((t,i)=>`<button class="timer-card ${t.color}${session.activeId===t.id?' active':''}${recentId===t.id?' recent-switch':''}" data-timer="${escape(t.id)}" aria-label="${escape(t.name)}の計測を${session.activeId===t.id?'一時停止':'開始・切り替え'}" aria-pressed="${session.activeId===t.id}"><div class="card-top"><span class="card-name">${escape(t.name)}</span><span class="card-index">${String(i+1).padStart(2,'0')}</span></div><div class="card-time" data-time="${escape(t.id)}">${format(elapsed(t,session))}</div><div class="card-bottom"><span class="card-state">${session.activeId===t.id?'<span class="playing-bars" aria-hidden="true"><i></i><i></i><i></i></span>計測中 · タップで停止':total(session)>0?'タップで再開・切り替え':'タップして、はじめる'}</span><span class="card-action" aria-hidden="true">${session.activeId===t.id?'Ⅱ':'↗'}</span></div></button>`).join('');
  $('distribution').innerHTML = session.timers.map(t=>`<span class="${t.color}" data-segment="${escape(t.id)}"></span>`).join('');
  $('breakdown-list').innerHTML = session.timers.map(t=>`<div class="breakdown-list-row ${t.color}"><span class="breakdown-name"><i class="color-dot"></i>${escape(t.name)}</span><div class="small-bar"><span data-bar="${escape(t.id)}"></span></div><span class="breakdown-time" data-breaktime="${escape(t.id)}"></span><span class="breakdown-percent" data-percent="${escape(t.id)}"></span></div>`).join('');
  const active = session.timers.find(t=>t.id===session.activeId);
  const hasTime = total(session)>0;
  $('status').classList.toggle('running',!!active);
  $('status').lastElementChild.textContent = active ? '計測中' : hasTime ? '一時停止中' : '開始待ち';
  $('total-caption').textContent = active ? `${active.name}に、集中しています。` : hasTime ? 'ひと息ついたら、カードをタップして再開。' : 'あなたの集中を、ひとつの時間に。';
  $('pause').innerHTML = `<span class="control-symbol" aria-hidden="true">${active?'Ⅱ':'▷'}</span><span>${active?'一時停止':'再開'}</span>`;
  $('pause').disabled = !active && !session.lastId;
  $('reset').disabled = !hasTime && !active;
  drawTimes(Date.now());
}
function drawTimes(now) {
  const sum = total(session,now);
  $('total-time').innerHTML = format(sum,true);
  for (const t of session.timers) {
    const ms=elapsed(t,session,now), percent=sum?ms/sum*100:0;
    const timeElement=document.querySelector(`[data-time="${CSS.escape(t.id)}"]`);
    timeElement.innerHTML = format(ms);
    timeElement.classList.toggle('long-time',ms>=3600000);
    document.querySelector(`[data-segment="${CSS.escape(t.id)}"]`).style.width = `${sum?percent:100/session.timers.length}%`;
    document.querySelector(`[data-bar="${CSS.escape(t.id)}"]`).style.width = `${percent}%`;
    document.querySelector(`[data-breaktime="${CSS.escape(t.id)}"]`).textContent = timeParts(ms).main;
    document.querySelector(`[data-percent="${CSS.escape(t.id)}"]`).textContent = `${Math.round(percent)}%`;
  }
}
function changed(id) { persist(); drawStructure(id); }
$('timer-grid').addEventListener('click',e=>{
  const card=e.target.closest('[data-timer]'); if (!card) return;
  const id=card.dataset.timer;
  if(session.activeId===id) settle(session); else activate(session,id);
  changed(session.activeId); if (wantWake) requestWake();
});
$('pause').addEventListener('click',()=>{ if(session.activeId) settle(session); else if(session.lastId) activate(session,session.lastId); changed(session.activeId); if(wantWake)requestWake(); });
function showModal(title,body,actions,submit) {
  if($('modal').open) $('modal').close();
  $('modal-title').textContent=title; $('modal-body').innerHTML=body; $('modal-actions').innerHTML=actions; modalSubmit=submit;
  $('modal').showModal();
}
const actions=(label='保存する')=>`<button type="button" class="secondary-button" data-close>キャンセル</button><button type="submit" class="pause-button">${label}</button>`;
function confirmAction(title,copy,label,callback) { showModal(title,`<div class="confirm-icon" aria-hidden="true">↺</div><p class="modal-copy">${escape(copy)}</p>`,actions(label),()=>{ $('modal').close();callback(); }); }
$('modal-form').addEventListener('submit',e=>{e.preventDefault(); modalSubmit?.();});
$('modal-close').addEventListener('click',()=>$('modal').close());
$('modal').addEventListener('click',e=>{if(e.target.closest('[data-close]'))$('modal').close();if(e.target===$('modal')){const rect=$('modal').getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)$('modal').close();}});
$('reset').addEventListener('click',()=>confirmAction('時間をリセットしますか？','すべてのタイマーと合計時間が0になり、計測を停止します。名前とプリセットは残ります。','リセットする',()=>{reset(session);changed();toast('すべての時間をリセットしました');}));
function showView(view) { const timer=view==='timer'; $('timer-view').hidden=!timer;$('presets-view').hidden=timer;$('timer-tab').classList.toggle('selected',timer);$('presets-tab').classList.toggle('selected',!timer);$('timer-tab').toggleAttribute('aria-current',timer);$('presets-tab').toggleAttribute('aria-current',!timer);if(timer)$('timer-tab').setAttribute('aria-current','page');else{$('presets-tab').setAttribute('aria-current','page');drawPresets();} }
$('timer-tab').addEventListener('click',()=>showView('timer'));$('presets-tab').addEventListener('click',()=>showView('presets'));
function openEditor(newPreset=false) {
  draft = newPreset ? createSession(['タイマー 1','タイマー 2']) : structuredClone(session);
  if(newPreset)draft.title='新しいプリセット';
  showModal('タイマーを、自分らしく。',`<label class="field-label" for="edit-title">プリセットの名前</label><input class="text-input" id="edit-title" maxlength="60" required value="${escape(draft.title)}"><div class="edit-list" id="edit-list"></div><button type="button" class="add-timer" id="add-timer">＋ タイマーを追加</button><p class="editor-hint">最大12個。色の丸をタップすると変更できます。<br>編集している間も計測は続きます。</p>`,actions(newPreset?'作成して使う':'変更を保存'),()=>{
    const title=$('edit-title').value.trim(); const inputs=[...document.querySelectorAll('[data-name]')];
    if(!title || inputs.some(i=>!i.value.trim())) {toast('名前を入力してください');return;}
    draft.title=title; inputs.forEach(input=>draft.timers.find(t=>t.id===input.dataset.name).name=input.value.trim());
    const apply=()=>{
      const now=Date.now();
      if(!newPreset) {
        const current=structuredClone(session); settle(current,now);
        draft.timers.forEach(t=>{t.elapsed=current.timers.find(c=>c.id===t.id)?.elapsed||0;});
        draft.activeId=draft.timers.some(t=>t.id===session.activeId)?session.activeId:null;
        draft.lastId=draft.timers.some(t=>t.id===session.lastId)?session.lastId:null;
        draft.startedAt=draft.activeId?now:null;
      }
      if(newPreset){presets.push({id:uid(),title:draft.title,timers:draft.timers.map(t=>({...t,elapsed:0}))});if(!savePresets()){presets.pop();return;}}
      session=draft;
      $('modal').close();changed();showView('timer');toast(newPreset?'プリセットを作成しました':'タイマーを更新しました');
    };
    if(newPreset && (total(session)>0||session.activeId)) confirmAction('新しい計測に切り替えますか？','現在の計測時間をリセットして、新しいプリセットを使用します。','切り替える',apply);
    else if(session.timers.some(t=>!draft.timers.some(d=>d.id===t.id)&&elapsed(t,session)>0)) confirmAction('タイマーを削除しますか？','削除するタイマーの計測時間も消え、合計時間から差し引かれます。','変更を保存',apply);
    else apply();
  });
  drawEditor();
  $('add-timer').addEventListener('click',()=>{captureDraft();if(draft.timers.length>=12)return;draft.timers.push({id:uid(),name:`タイマー ${draft.timers.length+1}`,color:COLORS[draft.timers.length%COLORS.length],elapsed:0});drawEditor();$('edit-list').lastElementChild.querySelector('input').focus();});
}
function captureDraft(){document.querySelectorAll('[data-name]').forEach(input=>{const t=draft.timers.find(t=>t.id===input.dataset.name);if(t)t.name=input.value;});}
function drawEditor(){
  $('edit-list').innerHTML=draft.timers.map((t,i)=>`<div class="edit-row"><button type="button" class="color-select ${t.color}" data-color="${escape(t.id)}" aria-label="${i+1}番目のタイマーの色を変更"></button><input class="text-input" data-name="${escape(t.id)}" maxlength="40" required value="${escape(t.name)}" aria-label="${i+1}番目のタイマー名"><button type="button" class="remove-timer" data-remove="${escape(t.id)}" aria-label="${i+1}番目のタイマーを削除" ${draft.timers.length<=1?'disabled':''}>×</button></div>`).join('');
  $('add-timer').disabled=draft.timers.length>=12;
  $('edit-list').onclick=e=>{const color=e.target.closest('[data-color]'),remove=e.target.closest('[data-remove]');if(!color&&!remove)return;captureDraft();if(color){const t=draft.timers.find(t=>t.id===color.dataset.color);t.color=COLORS[(COLORS.indexOf(t.color)+1)%COLORS.length];}if(remove&&draft.timers.length>1)draft.timers=draft.timers.filter(t=>t.id!==remove.dataset.remove);drawEditor();};
}
$('edit').addEventListener('click',()=>openEditor());$('session-edit').addEventListener('click',()=>openEditor());$('new-preset').addEventListener('click',()=>openEditor(true));
$('save-preset').addEventListener('click',()=>showModal('この組み合わせを保存',`<p class="modal-copy" style="margin-bottom:18px">タイマーの名前・色・組み合わせを保存します。計測時間は保存されません。</p><label class="field-label" for="preset-title">プリセットの名前</label><input class="text-input" id="preset-title" maxlength="60" value="${escape(session.title)}" required>`,actions(),()=>{
  const title=$('preset-title').value.trim();if(!title)return;
  const p={id:uid(),title,timers:session.timers.map(t=>({...t,elapsed:0}))};presets.push(p);
  if(savePresets()){$('modal').close();session.title=title;changed();toast('プリセットを保存しました');}else presets.pop();
}));
function presetHtml(p,builtin=false){const timers=builtin?makeTimers(p.names):p.timers;return `<article class="preset"><div class="preset-swatch" aria-hidden="true">${timers.map(t=>`<i class="${t.color}"></i>`).join('')}</div><h3>${escape(p.title)}</h3><div class="preset-names">${timers.map(t=>`<span>${escape(t.name)}</span>`).join('')}</div><div class="preset-actions"><button class="preset-use" data-use="${escape(p.id)}" data-builtin="${builtin}">使う <span aria-hidden="true">↗</span></button>${builtin?`<span class="tiny-label">${timers.length} TIMERS</span>`:`<button class="preset-delete" data-delete="${escape(p.id)}">削除</button>`}</div></article>`;}
function drawPresets(){$('saved-presets').innerHTML=presets.length?presets.map(p=>presetHtml(p)).join(''):'<div class="empty-presets">いつもの組み合わせを、ここに。<br>タイマー画面の「プリセットに保存」から追加できます。</div>';$('built-in-presets').innerHTML=builtins.map(p=>presetHtml(p,true)).join('');}
$('presets-view').addEventListener('click',e=>{
  const use=e.target.closest('[data-use]'),del=e.target.closest('[data-delete]');
  if(use){const p=use.dataset.builtin==='true'?builtins.find(p=>p.id===use.dataset.use):presets.find(p=>p.id===use.dataset.use);if(!p)return;const apply=()=>{session=createSession();session.title=p.title;session.timers=p.names?makeTimers(p.names):p.timers.map(t=>({...t,id:uid(),elapsed:0}));changed();showView('timer');toast(`${p.title}を読み込みました`);};if(total(session)>0||session.activeId)confirmAction('プリセットを切り替えますか？','現在の計測時間をリセットして、選んだ組み合わせを読み込みます。','切り替える',apply);else apply();}
  if(del){const p=presets.find(p=>p.id===del.dataset.delete);if(!p)return;confirmAction('プリセットを削除しますか？',`「${p.title}」を削除します。現在のタイマーはそのまま使えます。`,'削除する',()=>{const previous=presets;presets=presets.filter(p=>p.id!==del.dataset.delete);if(savePresets()){drawPresets();toast('プリセットを削除しました');}else presets=previous;});}
});
function help(){showModal('小さな切り替えで、深い集中。',`<div class="help-chips"><span>ワンタップ切り替え</span><span>自動で合計</span><span>オフライン対応</span></div><ol class="help-steps"><li>計測したいカードをタップして開始。</li><li>別のカードをタップすると、前の計測が止まり、次の計測が始まります。</li><li>休憩は「一時停止」。カードをタップするか「再開」で続きから。</li><li>「編集・追加」で名前・色・個数を変更。「プリセットに保存」で次回も使えます。</li></ol><section class="help-section"><h3>ホーム画面に追加</h3><p class="modal-copy"><strong>iPhone・iPad（Safari）</strong><br>このアプリのURLをSafariで開き、共有ボタン →「ホーム画面に追加」→「追加」。<br><br><strong>Android（Chrome）</strong><br>メニュー ⋮ →「ホーム画面に追加」または「アプリをインストール」。</p></section><section class="help-section"><h3>安心して、集中するために</h3><p class="modal-copy">一度開くと、通信がなくても使えます。計測中にアプリを閉じても時間は進み、次に開いたときに反映されます。休憩前は一時停止してください。<br>「画面を保持」をオンにすると、対応端末では表示中の画面がスリープしにくくなります。</p><div class="storage-note">時間とプリセットは、この端末・ブラウザ内に保存されます。Safariとホーム画面版など、開く場所によって保存領域が異なる場合があります。ブラウザのデータを消すと保存内容も消えます。</div></section>`,`<button type="submit" class="pause-button">わかりました</button>`,()=>$('modal').close());}
$('help').addEventListener('click',help);$('install-footer').addEventListener('click',help);
async function requestWake(){if(!wantWake||document.visibilityState!=='visible'||!('wakeLock'in navigator)||wakeLock)return;try{wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null;});}catch{wantWake=false;$('wake').setAttribute('aria-pressed','false');toast('画面を保持できませんでした。省電力モードなどをご確認ください。');}}
$('wake').addEventListener('click',async()=>{if(!('wakeLock'in navigator)){toast('このブラウザは画面の保持に対応していません');return;}wantWake=!wantWake;$('wake').setAttribute('aria-pressed',String(wantWake));if(wantWake)await requestWake();else if(wakeLock){await wakeLock.release();wakeLock=null;}});
window.addEventListener('storage',e=>{if(e.key===KEY){try{const s=JSON.parse(e.newValue);if(validSession(s)){session=s;drawStructure();toast('別の画面での変更を反映しました');}}catch{}}if(e.key===PRESETS_KEY){try{const p=JSON.parse(e.newValue);if(Array.isArray(p)){presets=p.filter(p=>typeof p.id==='string'&&validSession({title:p.title,timers:p.timers,activeId:null,lastId:null,startedAt:null}));drawPresets();}}catch{}}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){drawStructure();if(wantWake)requestWake();}});
window.addEventListener('pageshow',()=>drawStructure());
function frame(now){if(now-lastPaint>=80 && !document.hidden && !$('timer-view').hidden){drawTimes(Date.now());lastPaint=now;}requestAnimationFrame(frame);}
drawStructure();requestAnimationFrame(frame);
mountSpeech({toast,showModal,actions,audio});
if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}
