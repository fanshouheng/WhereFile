import {camera,shoreX,waveAt,createOcean,SeaLife,setCoast} from './ocean.js';
import {stepVoyage,resetVoyage,voyageBounds,boatDirection} from './voyage.js';

const $=id=>document.getElementById(id);
const paths={
  plus:'M12 5v14M5 12h14',search:'m21 21-4.5-4.5M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
  anchor:'M12 8v13M5 12H2a10 10 0 0 0 20 0h-3M8 12h8M15 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  wind:'M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M4 16h4a3 3 0 1 1-3 3',
  muted:'M11 4 6 8H3v8h3l5 4V4Zm5 5 5 6m0-6-5 6',
  sound:'M11 4 6 8H3v8h3l5 4V4Zm5 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  pause:'M8 5v14M16 5v14',play:'m8 4 12 8-12 8V4Z',fullscreen:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5'
};
function icon(name){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;}
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
$('sound').innerHTML=icon('muted');$('pause').innerHTML=icon('pause');$('fullscreen').innerHTML=icon('fullscreen');

function kindOf(file){const n=file.name.toLowerCase();if(file.type?.startsWith('image/')||/\.(png|jpe?g|webp|gif|avif)$/.test(n))return'image';if(file.type?.startsWith('audio/')||/\.(mp3|wav|ogg|m4a)$/.test(n))return'audio';if(file.type?.startsWith('video/')||/\.(mp4|webm|mov)$/.test(n))return'video';if(/\.(txt|md|json|csv|log|js|css|html|xml|yaml|yml)$/.test(n))return'text';if(n.endsWith('.pdf'))return'pdf';return'file';}
function fileIcon(kind,id){
  const colors={image:['#80d1f5','#3199dd'],text:['#b5a2ec','#8971c6'],audio:['#f2bb91','#dd9269'],video:['#c6a1f2','#a06bda'],pdf:['#eda4a0','#d77770'],file:['#a6c6c2','#6f9d97']};
  const [light,dark]=colors[kind]||colors.file;
  const glyph={image:`<circle cx="37" cy="29" r="5" fill="${dark}"/><path d="m9 48 12-15 10 12 7-7 9 11v7H9Z" fill="${dark}"/>`,text:'<path d="M15 29h25M15 36h25M15 43h17M15 50h21" stroke="white" stroke-width="3.2" stroke-linecap="round"/>',audio:'<path d="M23 44V28l16-4v17M23 33l16-4" fill="none" stroke="white" stroke-width="3"/><ellipse cx="18" cy="46" rx="5" ry="4" fill="white"/><ellipse cx="34" cy="43" rx="5" ry="4" fill="white"/>',video:'<path d="m23 28 17 11-17 11Z" fill="white"/>',pdf:'<text x="28" y="45" text-anchor="middle" font-size="14" font-family="sans-serif" font-weight="700" fill="white">PDF</text>',file:'<path d="M19 32h18M19 39h18M19 46h11" stroke="white" stroke-width="3" stroke-linecap="round"/>'}[kind];
  return `<svg viewBox="0 0 56 64" aria-hidden="true"><defs><linearGradient id="paper-${id}" x2=".8" y2="1"><stop stop-color="#fffef8"/><stop offset="1" stop-color="#e5edf0"/></linearGradient><linearGradient id="color-${id}" x2=".5" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><path d="M5 1h33l13 13v44a4 4 0 0 1-4 4H5a4 4 0 0 1-4-4V5a4 4 0 0 1 4-4Z" fill="url(#paper-${id})" stroke="#cbd8db" stroke-width="1"/><path d="M38 1v10q0 4 4 4h9" fill="#d9e8ed"/><rect x="8" y="22" width="38" height="34" rx="4" fill="url(#color-${id})"/>${glyph}</svg>`;
}

let cam=camera(innerWidth,innerHeight),items=[],selected=null,drag=null,time=0,paused=false,wind=.35;
const nativeHost=window.chrome?.webview;
let hostWallpaper=false,hostSuspended=false,sceneDirty=true;
const motionMedia=matchMedia('(prefers-reduced-motion: reduce)');
let motionChoice=null;
try{const saved=localStorage.getItem('island-motion');if(saved==='play'||saved==='pause')motionChoice=saved;}catch{}
let reduced=motionChoice===null&&motionMedia.matches;
paused=motionChoice==='pause';
function updateMotionControl(){
  sceneDirty=true;
  const stopped=reduced||paused,label=reduced?'播放动态海浪':paused?'继续漂流':'暂停漂流';
  $('pause').innerHTML=icon(stopped?'play':'pause');$('pause').setAttribute('aria-pressed',String(stopped));$('pause').setAttribute('aria-label',label);$('pause').title=label;
  $('scene-status').textContent=reduced?'海风已停，随时可以启程。':paused?'让时间，也停一会儿。':'风很轻，海很慢。';
  nativeHost?.postMessage({type:'motion-state',paused:stopped});
}
function chooseMotion(choice){motionChoice=choice;reduced=false;paused=choice==='pause';try{localStorage.setItem('island-motion',choice);}catch{}updateMotionControl();}
updateMotionControl();
let ocean=null,db=null,previewItem=null,previewURL=null,toastTimer,foundTimer;
const wallpapers=[
  {id:'tropical',name:'热带海湾',file:'coast-hd.webp',coast:[278,352,415,430,417,405,396,390,383,371,360,357,364,386,414,438,465,481,505,507,501,495,479,476,477,490,501,526,544,570,598,624,648]},
  {id:'snow',name:'雪松湖岸',file:'coast-snow.webp',coast:[540, 480, 440, 430, 480, 427, 444, 400, 380, 415, 440, 415, 415, 449, 474, 490, 474, 437, 456, 465, 487, 491, 505, 545, 567, 585, 626, 654, 653, 679, 696, 692, 730]},
  {id:'autumn',name:'秋日湖畔',file:'coast-autumn.webp',coast:[612, 588, 555, 502, 461, 442, 429, 431, 434, 445, 461, 487, 509, 485, 468, 451, 456, 465, 455, 447, 446, 433, 422, 416, 413, 431, 464, 492, 531, 556, 569, 592, 616]}
];
let wallpaperChoice='tropical',sceneRequest=0;
try{const saved=localStorage.getItem('island-wallpaper');if(wallpapers.some(w=>w.id===saved))wallpaperChoice=saved;}catch{}
for(const scene of wallpapers){
  const button=document.createElement('button');button.type='button';button.dataset.wallpaper=scene.id;
  button.innerHTML=`<img src="assets/${scene.file}" alt="" loading="lazy"><span>${scene.name}</span>`;
  button.onclick=()=>changeWallpaper(scene.id);$('wallpaper-options').append(button);
}
function markWallpaper(){
  for(const button of $('wallpaper-options').children)button.setAttribute('aria-pressed',String(button.dataset.wallpaper===wallpaperChoice));
  nativeHost?.postMessage({type:'wallpaper-choice',id:wallpaperChoice});
}
async function changeWallpaper(id){
  const scene=wallpapers.find(w=>w.id===id);if(!scene)return;
  const request=++sceneRequest;
  try{
    const image=new Image();image.src=`assets/${scene.file}`;await image.decode();if(request!==sceneRequest)return;
    setCoast(scene.coast);ocean?.setScene?.(image,scene.id==='tropical'?1:.16);
    const fallback=document.querySelector('.scene-fallback');fallback.src=image.src;fallback.alt=scene.name;
    wallpaperChoice=id;resize();savePositions();markWallpaper();
    try{localStorage.setItem('island-wallpaper',id);}catch{}
  }catch(error){console.error('Wallpaper:',error);toast('壁纸未能加载，请再试一次。');}
}
$('choose-wallpaper').onclick=()=>{$('wallpaper-dialog').showModal();markWallpaper();};
$('close-wallpaper').onclick=()=>$('wallpaper-dialog').close();
const life=new SeaLife($('life'));life.resize(cam);
const clamp=(n,min,max)=>Math.max(min,Math.min(Math.max(min,max),n));
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3300);}
function dismissHint(){$('first-hint').classList.add('dismissed');try{localStorage.setItem('island-hint','seen');}catch{}}
$('dismiss-hint').onclick=dismissHint;
try{if(localStorage.getItem('island-hint'))dismissHint();wind=Number(localStorage.getItem('island-wind')??.35);}catch{}
wind=Number.isFinite(wind)?clamp(wind,0,1):.35;$('wind').value=wind*100;

function openDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open('tidal-desktop',1);request.onupgradeneeded=()=>request.result.createObjectStore('files',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function storeRecord(record){return new Promise((resolve,reject)=>{if(!db){reject(new Error('Local storage unavailable'));return;}const tx=db.transaction('files','readwrite');tx.objectStore('files').put(record);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
function readRecords(){return new Promise((resolve,reject)=>{const request=db.transaction('files').objectStore('files').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function deleteRecord(id){return new Promise((resolve,reject)=>{if(!db){resolve();return;}const tx=db.transaction('files','readwrite');tx.objectStore('files').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
function savePositions(){try{localStorage.setItem('island-positions',JSON.stringify(items.filter(it=>!it.desktop).map(it=>({id:it.id,x:it.x/cam.w,y:it.y/cam.h,sea:it.sea}))));}catch{}}
function safePosition(it){
  if(it.sea){const bounds=voyageBounds(cam,it.y);it.y=clamp(it.y,bounds.top,bounds.bottom);it.x=clamp(it.x,bounds.left,bounds.right);}
  else{it.y=clamp(it.y,110,cam.h-180);it.x=clamp(it.x,55,Math.max(55,shoreX(it.y,cam)-40));}
}

function addItem(record,position){
  sceneDirty=true;
  const it={...record,kind:kindOf(record),x:position.x,y:position.y,sea:position.sea,vx:0,vy:0,phase:Math.random()*Math.PI*2,target:null};
  safePosition(it);
  const el=document.createElement('button');el.className='file'+(it.sea?' at-sea':'');el.dataset.id=it.id;el.setAttribute('aria-label',it.name);el.title=it.name+' · 双击打开，拖动出海';
  el.innerHTML=`<span class="boat-shadow"></span><span class="file-visual"><span class="boat-art" aria-hidden="true"></span><span class="file-icon">${fileIcon(it.kind,it.id)}</span></span><span class="file-label"></span>`;
  el.querySelector('.file-label').textContent=it.name;
  it.el=el;it.visual=el.querySelector('.file-visual');$('files').append(el);items.push(it);
  el.addEventListener('pointerdown',e=>beginDrag(e,it));
  el.addEventListener('dblclick',()=>openFile(it));
  el.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();openFile(it);}
    if(e.key===' '){e.preventDefault();select(it);}
    if(e.key==='Delete'){e.preventDefault();removeItem(it);}
    if(e.key.toLowerCase()==='s'){e.preventDefault();if(it.desktop){nativeHost.postMessage({type:'desktop-restore',id:it.id});return;}it.sea=!it.sea;it.x=shoreX(it.y,cam)+(it.sea?110:-70);resetVoyage(it);safePosition(it);updateSea(it);savePositions();}
    const dir={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
    if(dir){e.preventDefault();it.x+=dir[0]*18;it.y+=dir[1]*18;it.sea=it.x>shoreX(it.y,cam)+15;resetVoyage(it);safePosition(it);updateSea(it);select(it);savePositions();}
  });
  return it;
}
function updateSea(it){sceneDirty=true;it.el.classList.toggle('at-sea',it.sea);}
function select(it){selected?.el.classList.remove('selected');selected=it;it?.el.classList.add('selected');}
function beginDrag(e,it){
  if(e.button!==0||drag)return;e.preventDefault();select(it);it.target=null;it.el.setPointerCapture(e.pointerId);
  drag={it,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,ox:it.x-e.clientX,oy:it.y-e.clientY,px:e.clientX,py:e.clientY,tx:it.x,ty:it.y,last:performance.now(),vx:0,vy:0,moved:false,wasSea:it.sea,initialX:it.x,initialY:it.y};
  it.el.addEventListener('pointermove',moveDrag);it.el.addEventListener('pointerup',endDrag);it.el.addEventListener('pointercancel',cancelDrag);it.el.addEventListener('lostpointercapture',lostCapture);
}
function moveDrag(e){if(!drag||drag.pointer!==e.pointerId)return;const now=performance.now(),dt=Math.max(.008,(now-drag.last)/1000);
  if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>5){drag.moved=true;drag.it.el.classList.add('dragging');document.body.classList.add('is-dragging');}
  drag.vx=drag.vx*.4+(e.clientX-drag.px)/dt*.6;drag.vy=drag.vy*.4+(e.clientY-drag.py)/dt*.6;drag.last=now;drag.px=e.clientX;drag.py=e.clientY;
  drag.tx=clamp(e.clientX+drag.ox,40,cam.w-40);drag.ty=clamp(e.clientY+drag.oy,95,cam.h-145);
  if(drag.moved){const sea=drag.tx>shoreX(drag.ty,cam)+20;if(sea!==drag.it.sea){drag.it.sea=sea;updateSea(drag.it);if(sea&&!reduced)life.ripple(drag.it.x,drag.it.y+35,.8);}}
}
function finishDrag(cancelled=false){
  if(!drag)return;sceneDirty=true;const d=drag;drag=null;const it=d.it;
  resetVoyage(it);
  it.el.removeEventListener('pointermove',moveDrag);it.el.removeEventListener('pointerup',endDrag);it.el.removeEventListener('pointercancel',cancelDrag);it.el.removeEventListener('lostpointercapture',lostCapture);
  if(it.el.hasPointerCapture(d.pointer))it.el.releasePointerCapture(d.pointer);
  it.el.classList.remove('dragging');document.body.classList.remove('is-dragging');
  if(cancelled){it.x=d.initialX;it.y=d.initialY;it.sea=d.wasSea;updateSea(it);it.vx=it.vy=0;return;}
  if(it.desktop&&d.moved&&!it.sea){nativeHost.postMessage({type:'desktop-restore',id:it.id});return;}
  if(d.moved){it.x=d.tx;it.y=d.ty;it.vx=it.sea&&!paused&&!reduced?clamp(d.vx,-350,350)*.2:0;it.vy=it.sea&&!paused&&!reduced?clamp(d.vy,-250,250)*.2:0;safePosition(it);dismissHint();if(it.sea&&!reduced)life.ripple(it.x,it.y+38,1.1);savePositions();}
}
function endDrag(e){if(e.pointerId===drag?.pointer)finishDrag();}
function cancelDrag(){finishDrag(true);}
function lostCapture(){if(drag)finishDrag(true);}
window.addEventListener('blur',()=>finishDrag(true));
window.addEventListener('keydown',e=>{if(e.key==='Escape')finishDrag(true);});

function recall(){finishDrag(true);dismissHint();let n=0;items.forEach((it,i)=>{
  if(it.desktop){nativeHost.postMessage({type:'desktop-restore',id:it.id});n++;return;}
  const rows=Math.max(1,Math.floor((cam.h-300)/105));const row=i%rows,col=Math.floor(i/rows);const y=155+row*105;const x=Math.max(52,shoreX(y,cam)-70-col*95);
  it.target={x,y};it.vx=0;it.vy=0;n++;
});toast(n?'小船正在靠岸。':'海岛上还没有文件。');}
$('recall').onclick=recall;

async function importFiles(files,point){
  const incoming=Array.from(files);if(!incoming.length)return;
  let saved=0;let sessionOnly=0;
  for(let i=0;i<incoming.length;i++){
    const file=incoming[i];const record={id:crypto.randomUUID(),name:file.name,type:file.type,blob:file,lastModified:file.lastModified};
    let x=point?.x??cam.w*.57+i*38,y=point?.y??cam.h*.45+i*25;
    const sea=x>shoreX(y,cam)+20;
    const it=addItem(record,{x,y,sea});if(sea&&!reduced)life.ripple(it.x,it.y+35,1);
    try{await storeRecord(record);saved++;}catch{sessionOnly++;}
  }
  dismissHint();savePositions();
  toast(sessionOnly?`${incoming.length} 个文件已放入；其中 ${sessionOnly} 个仅保留到本次关闭。`:`${saved} 个文件已放入，双击可以预览。`);
}
$('add-file').onclick=()=>$('file-input').click();
$('file-input').onchange=async e=>{await importFiles(e.target.files);e.target.value='';};
let dragDepth=0;
window.addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();dragDepth++;$('drop-overlay').classList.add('active');}});
window.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
window.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('drop-overlay').classList.remove('active');}});
window.addEventListener('drop',async e=>{e.preventDefault();dragDepth=0;$('drop-overlay').classList.remove('active');if(e.dataTransfer?.files.length)await importFiles(e.dataTransfer.files,{x:e.clientX,y:e.clientY});});

function showSearch(){renderSearch('');$('search-dialog').showModal();$('search-input').value='';$('search-input').focus();}
function renderSearch(query){
  const list=$('search-results');list.replaceChildren();const matches=items.filter(it=>it.name.toLowerCase().includes(query.toLowerCase()));
  for(const it of matches){const li=document.createElement('li'),button=document.createElement('button');button.innerHTML=`<span class="result-icon">${fileIcon(it.kind,'search-'+it.id)}</span><span class="result-name"></span><span class="result-position"></span>`;button.querySelector('.result-name').textContent=it.name;button.querySelector('.result-position').textContent=it.sea?'在海上':'在岸边';button.onclick=()=>{$('search-dialog').close();select(it);items.forEach(i=>i.el.classList.remove('found'));it.el.classList.add('found');it.el.focus({preventScroll:true});clearTimeout(foundTimer);foundTimer=setTimeout(()=>it.el.classList.remove('found'),6000);};li.append(button);list.append(li);}
  if(!matches.length){const li=document.createElement('li');li.className='empty-results';li.textContent='这片海里还没有这个文件。';list.append(li);}
}
$('find-file').onclick=showSearch;$('close-search').onclick=()=>$('search-dialog').close();$('search-input').oninput=e=>renderSearch(e.target.value);
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(!$('search-dialog').open&&!$('preview-dialog').open)showSearch();}});

async function openFile(it){
  if(it.desktop){nativeHost.postMessage({type:'desktop-open',id:it.id});return;}
  select(it);previewItem=it;const content=$('preview-content');content.replaceChildren();$('preview-title').textContent=it.name;$('download-file').hidden=!it.blob;
  if(!$('preview-dialog').open)$('preview-dialog').showModal();
  if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;}
  if(it.kind==='text'&&it.blob){const pre=document.createElement('pre');pre.textContent='正在打开…';content.append(pre);const text=await it.blob.slice(0,512000).text();if(previewItem===it){pre.textContent=text+(it.blob.size>512000?'\n\n（仅预览前 500 KB，可保存完整副本。）':'');}}
  else if(['image','video','audio'].includes(it.kind)){
    const el=document.createElement(it.kind==='image'?'img':it.kind);previewURL=it.blob?URL.createObjectURL(it.blob):null;el.src=previewURL||it.url;if(it.kind==='image')el.alt=it.name;else el.controls=true;
    el.onerror=()=>{content.replaceChildren();const p=document.createElement('p');p.className='file-info';p.textContent='浏览器无法预览这个格式，可以保存副本后用本机应用打开。';content.append(p);};content.append(el);
  } else {const p=document.createElement('p');p.className='file-info';p.textContent=`${it.name}\n${it.blob?formatSize(it.blob.size):''}\n这个格式可以保存副本后，用本机应用打开。`;p.style.whiteSpace='pre-line';content.append(p);}
}
function formatSize(bytes){return bytes<1024?`${bytes} B`:bytes<1048576?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1048576).toFixed(1)} MB`;}
$('close-preview').onclick=()=>$('preview-dialog').close();
$('preview-dialog').addEventListener('close',()=>{$('preview-content').replaceChildren();if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;previewItem=null;});
$('download-file').onclick=()=>{if(!previewItem?.blob)return;const url=URL.createObjectURL(previewItem.blob);const a=document.createElement('a');a.href=url;a.download=previewItem.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
async function removeItem(it){
  if(it.desktop){nativeHost.postMessage({type:'desktop-restore',id:it.id});return;}
  try{await deleteRecord(it.id);}catch{toast('本地存储暂时不可用，未移除文件。');return;}
  if(it.demo){try{const hidden=JSON.parse(localStorage.getItem('island-hidden')||'[]');hidden.push(it.id);localStorage.setItem('island-hidden',JSON.stringify(hidden));}catch{}}
  if(previewItem===it)$('preview-dialog').close();if(selected===it)selected=null;items=items.filter(i=>i!==it);it.el.remove();savePositions();toast('已移出海岛，原文件不受影响。');
}
$('remove-file').onclick=()=>{if(previewItem)removeItem(previewItem);};
for(const id of ['search-dialog','preview-dialog','wallpaper-dialog'])$(id).addEventListener('click',e=>{if(e.target===$(id)){const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$(id).close();}});

let audioContext=null,audioMaster=null,audioEnabled=false;
async function toggleSound(){
  try{
    if(!audioContext){audioContext=new AudioContext();const size=audioContext.sampleRate*12,buffer=audioContext.createBuffer(2,size,audioContext.sampleRate);
      for(let ch=0;ch<2;ch++){const data=buffer.getChannelData(ch);let brown=0;for(let i=0;i<size;i++){const white=Math.random()*2-1;brown=(brown+.025*white)/1.025;data[i]=brown*3.3*(.45+.25*Math.sin(i/audioContext.sampleRate*.8+ch*.7));}}
      const source=audioContext.createBufferSource();source.buffer=buffer;source.loop=true;const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1250;audioMaster=audioContext.createGain();audioMaster.gain.value=0;source.connect(filter).connect(audioMaster).connect(audioContext.destination);source.start();
    }
    await audioContext.resume();audioEnabled=!audioEnabled;audioMaster.gain.setTargetAtTime(audioEnabled&&!hostSuspended?.32:0,audioContext.currentTime,.6);
    $('sound').innerHTML=icon(audioEnabled?'sound':'muted');$('sound').setAttribute('aria-pressed',String(audioEnabled));$('sound').setAttribute('aria-label',audioEnabled?'关闭海浪声':'开启海浪声');
  }catch{toast('当前浏览器未能开启声音。');}
}
$('sound').onclick=toggleSound;
$('pause').onclick=()=>chooseMotion(reduced||paused?'play':'pause');
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('当前窗口不支持全屏，可使用浏览器全屏。');}};
document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'退出全屏':'全屏');});
$('tide-settings').onclick=()=>{const show=$('wind-panel').hidden;$('wind-panel').hidden=!show;$('tide-settings').setAttribute('aria-expanded',String(show));};
function updateWind(){sceneDirty=true;wind=Number($('wind').value)/100;$('wind-label').textContent=wind<.15?'平静':wind<.65?'轻柔':'轻快';try{localStorage.setItem('island-wind',String(wind));}catch{}}
$('wind').oninput=updateWind;updateWind();
document.addEventListener('pointerdown',e=>{if(!$('wind-panel').contains(e.target)&&!$('tide-settings').contains(e.target)){$('wind-panel').hidden=true;$('tide-settings').setAttribute('aria-expanded','false');}});
$('island').addEventListener('pointerdown',e=>{if(e.target.closest('.file'))return;select(null);if(!paused&&!reduced&&e.clientX>shoreX(e.clientY,cam)+20)life.ripple(e.clientX,e.clientY,.7);});

function resize(){
  sceneDirty=true;
  finishDrag(true);const old=cam;cam=camera(innerWidth,innerHeight);cam.wallpaper=hostWallpaper;ocean?.resize(cam);life.resize(cam);
  for(const it of items){it.x=it.x/old.w*cam.w;it.y=it.y/old.h*cam.h;it.target=null;resetVoyage(it);safePosition(it);}
}
window.addEventListener('resize',resize);
motionMedia.addEventListener('change',e=>{if(motionChoice===null){reduced=e.matches;updateMotionControl();}});
window.addEventListener('pagehide',savePositions);
function syncSound(){if(audioMaster)audioMaster.gain.setTargetAtTime(audioEnabled&&!document.hidden&&!hostSuspended?.32:0,audioContext.currentTime,.3);}
document.addEventListener('visibilitychange',()=>{last=performance.now();sceneDirty=true;if(document.hidden)savePositions();syncSound();});

let last=performance.now(),lastWake=0,lastSave=0,lastScenery=0,lastLifeTime=0;
function frame(now){
  const elapsed=Math.max(0,Math.min((now-last)/1000,1.25));last=now;
  if(!document.hidden&&!hostSuspended){
    const active=!paused&&!reduced;
    if(!active&&!sceneDirty&&!drag?.moved&&!items.some(it=>it.target)){requestAnimationFrame(frame);return;}
    // Preview windows can render at 1 FPS. Advance real time in small physics steps.
    const steps=Math.max(1,Math.ceil(elapsed*60)),dt=elapsed/steps;
    for(let step=0;step<steps;step++){
      if(active)time+=dt;
      for(const it of items){
        if(drag?.it===it&&drag.moved){const response=1-Math.exp(-dt*26);it.x+=(drag.tx-it.x)*response;it.y+=(drag.ty-it.y)*response;}
        else if(it.target){
          const dx=it.target.x-it.x,dy=it.target.y-it.y;const speed=reduced?1:1-Math.exp(-dt*2.2);it.x+=dx*speed;it.y+=dy*speed;
          const sea=it.x>shoreX(it.y,cam)+16;if(sea!==it.sea){it.sea=sea;updateSea(it);}
          if(Math.hypot(dx,dy)<2||reduced){it.x=it.target.x;it.y=it.target.y;it.sea=false;updateSea(it);it.target=null;savePositions();}
        } else if(it.sea&&active&&drag?.it!==it&&!it.nativeDragging){
          stepVoyage(it,cam,time,wind,dt);
        }
      }
      // Soft separation only affects free boats, never the boat under the pointer.
      if(active)for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
        const a=items[i],b=items[j];if(!a.sea||!b.sea||a.target||b.target||a.nativeDragging||b.nativeDragging||drag?.it===a||drag?.it===b)continue;
        const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<95&&d>.01){const f=(95-d)*dt*.55;a.x-=dx/d*f;b.x+=dx/d*f;a.y-=dy/d*f;b.y+=dy/d*f;}
      }
      if(active)for(const it of items)if(it.sea&&!it.target&&drag?.it!==it)safePosition(it);
    }
    const poses=[];
    for(const it of items){
      const wx=(it.x-cam.x)/cam.scale,wy=(it.y-cam.y)/cam.scale;
      const bob=it.sea&&!reduced?waveAt(wx,wy,time,wind):0;
      const lean=it.sea&&!reduced?clamp((waveAt(wx+24,wy,time,wind)-waveAt(wx-24,wy,time,wind))*.3,-2,2):0;
      it.direction=boatDirection(it.heading??10,it.direction);
      // Native boats have their own windows; their hidden DOM copies need no style updates.
      if(nativeHost&&hostWallpaper&&it.desktop){
        poses.push({id:it.id,x:it.x,y:it.y+bob,direction:it.direction,roll:Number(lean.toFixed(2))});
      }else{
        it.el.style.setProperty?.('--boat-direction',it.direction);
        it.el.style.transform=`translate3d(${it.x.toFixed(2)}px,${(it.y+bob).toFixed(2)}px,0)`;
        it.visual.style.transform=`rotate(${lean.toFixed(2)}deg)`;it.el.style.zIndex=String(Math.round(it.y/10));
      }
      if(it.sea&&active&&time-lastWake>.12&&Math.hypot(it.vx,it.vy)>1){const speed=Math.hypot(it.vx,it.vy);life.wake(it.x-it.vx/speed*27,it.y+bob-it.vy/speed*27,it.vx,it.vy);}
    }
    if(time-lastWake>.12)lastWake=time;
    // Scenery runs at 30 FPS; boat motion and pointer feedback keep every animation frame.
    if(sceneDirty||now-lastScenery>=1000/30-.5){
      ocean?.draw(time,wind);life.draw(time,Math.max(0,time-lastLifeTime),wind,reduced);
      lastScenery=now;lastLifeTime=time;
    }
    if(poses.length)nativeHost.postMessage({type:'desktop-poses',items:poses});
    sceneDirty=false;
    if(now-lastSave>5000){savePositions();lastSave=now;}
  }
  requestAnimationFrame(frame);
}

if(nativeHost){
  $('set-wallpaper').hidden=false;$('fullscreen').hidden=true;
  $('set-wallpaper').onclick=()=>{if(motionChoice===null)chooseMotion('play');nativeHost.postMessage({type:'wallpaper'});};
  nativeHost.addEventListener('message',event=>{
    const data=event.data;
    if(data?.type==='choose-wallpaper'){changeWallpaper(data.id);return;}
    if(data?.type==='desktop-moved'){
      const sea=hostWallpaper&&data.x>shoreX(data.y,cam)+78&&data.x<cam.w-60&&data.y>65&&data.y<cam.h-70;
      nativeHost.postMessage({type:sea?'desktop-capture':'desktop-ignore',id:data.id,x:data.x,y:data.y});return;
    }
    if(data?.type==='desktop-added'){
      if(!items.some(it=>it.id===data.id)){const it=addItem({id:data.id,name:data.name,type:'',desktop:true},{x:data.x,y:data.y,sea:true});it.el.classList.add('desktop-file');}return;
    }
    if(data?.type==='desktop-removed'){const it=items.find(it=>it.id===data.id);if(it){it.el.remove();items=items.filter(i=>i!==it);if(selected===it)selected=null;}return;}
    if(data?.type==='desktop-drag'||data?.type==='desktop-drop'||data?.type==='desktop-doubleclick'){
      const it=items.find(it=>it.id===data.id);if(!it)return;
      if(data.type==='desktop-doubleclick'){openFile(it);return;}
      sceneDirty=true;it.nativeDragging=data.type==='desktop-drag';
      if(!it.nativeDragging){if(data.x<=shoreX(data.y,cam)+40)nativeHost.postMessage({type:'desktop-restore',id:it.id});else{it.x=data.x;it.y=data.y;it.vx=it.vy=0;safePosition(it);resetVoyage(it);}}return;
    }
    if(data?.type==='host-state'){
      const changed=hostWallpaper!==!!data.wallpaper;
      hostWallpaper=!!data.wallpaper;hostSuspended=!!data.suspended;sceneDirty=true;
      document.body.classList.toggle('wallpaper-mode',hostWallpaper);
      if(hostWallpaper){finishDrag(true);for(const id of ['search-dialog','preview-dialog','wallpaper-dialog'])if($(id).open)$(id).close();if(motionChoice===null)chooseMotion('play');}
      if(changed)resize();last=performance.now();syncSound();
    }else if(data?.type==='host-command'&&['pause','resume'].includes(data.command))chooseMotion(data.command==='pause'?'pause':'play');
  });
}

async function init(){
  let positions=[],hidden=[];
  try{positions=JSON.parse(localStorage.getItem('island-positions')||'[]');hidden=JSON.parse(localStorage.getItem('island-hidden')||'[]');if(!Array.isArray(positions))positions=[];if(!Array.isArray(hidden))hidden=[];}catch{}
  const demos=[
    {id:'demo-list',name:'旅行清单.txt',type:'text/plain',blob:new Blob(['下一次去海边\n\n带一本没读完的书。\n走一条没有计划的小路。\n等太阳慢慢落进海里。\n\n记得带上：\n防晒霜、相机、泳衣、一双舒服的鞋。\n\n剩下的，到了再说。'],{type:'text/plain'}),position:{x:80,y:170,sea:false}},
    {id:'demo-note',name:'灵感便签.txt',type:'text/plain',blob:new Blob(['偶尔，也让文件放个假。\n\n拖到海上，变成小船。\n拖回沙滩，就靠岸了。\n双击，可以读到里面的内容。\n\n你也可以把自己的文件拖进来。\n文件只保存在这个浏览器里，不会上传，也不会移动原文件。\n\n键盘操作：方向键移动，S 键出海或靠岸，Enter 打开。\nCtrl + K 查找文件。'],{type:'text/plain'}),position:{x:95,y:300,sea:false}},
    {id:'demo-photo',name:'海边的一天.webp',type:'image/webp',url:'assets/coast-hd.webp',position:{x:cam.w*.56,y:cam.h*.29,sea:true}},
    {id:'demo-letter',name:'给自己的信.txt',type:'text/plain',blob:new Blob(['给忙碌的自己：\n\n今天的风很轻。\n\n没有需要立刻回复的消息，\n没有必须马上完成的事情。\n\n就看一会儿海吧。\n\n等这艘小船慢慢漂回来，\n再继续也来得及。'],{type:'text/plain'}),position:{x:cam.w*.77,y:cam.h*.51,sea:true}}
  ];
  function pos(record,fallback){const p=positions.find(p=>p.id===record.id);return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?{x:p.x*cam.w,y:p.y*cam.h,sea:!!p.sea}:fallback;}
  for(const demo of demos)if(!nativeHost&&!hidden.includes(demo.id))addItem({...demo,demo:true},pos(demo,demo.position));
  try{db=await openDB();const records=await readRecords();for(const r of records)addItem(r,pos(r,{x:cam.w*.6,y:cam.h*.45,sea:true}));}catch{toast('本地存储不可用，文件仅保留到本次关闭。');}
  try{ocean=await createOcean($('ocean'));ocean.resize(cam);}catch(error){console.error('Ocean renderer:',error);$('ocean').hidden=true;}
  await changeWallpaper(wallpaperChoice);
  nativeHost?.postMessage({type:'ready'});updateMotionControl();
  requestAnimationFrame(frame);
}
init();
