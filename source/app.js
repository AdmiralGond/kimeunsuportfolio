(()=>{'use strict';
const M=JSON.parse(document.getElementById('portfolio-data').textContent);
const $=id=>document.getElementById(id);
const ORDER=M.pages, CODES=M.pageCodes, SCALE=M.cameraScale||9.2, VX=952.5, VY=455.5;
const GUIDE='키워드 버튼 위에 마우스 포인터를 올리거나 버튼을 누르면 해당 키워드의 내용이 여기에 표시됩니다.';
const NAV=[['프로필',0],['소개',1],['게임을 개발하고,',2],['게임을 플레이하며,',3],['게임을 관찰한다.',4],['1인 게임 개발 프로젝트',5],['기획 문서 작성 이력',7],['게임 플레이 이력',8]];
const escapeHTML=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function rich(v){
 const raw=String(v),pattern=/\[((?:\\.|[^\]\\])*)\]\((https:\/\/[^\s)]+)\)/g;
 let result='',start=0,match;
 while((match=pattern.exec(raw))!==null){
  result+=escapeHTML(raw.slice(start,match.index));
  const label=escapeHTML(match[1].replace(/\\([\[\]])/g,'$1'));
  result+='<a target="_blank" rel="noopener noreferrer" href="'+escapeHTML(match[2])+'">'+label+'</a>';
  start=pattern.lastIndex;
 }
 result+=escapeHTML(raw.slice(start));
 result=result.replace(/&lt;br\s*\/?&gt;/gi,'<br>');
 return result.split('<br>').map(line=>/[\u3040-\u30ff]/.test(line)?'<span lang="ja" class="jp-quote">'+line+'</span>':/[ō]/.test(line)?'<span lang="en" class="latin-transliteration">'+line+'</span>':line).join('<br>')
}
const content={};
ORDER.forEach(name=>{const rows=M.strings['string_'+name+'_1.csv'];const groups=[];let current=null;
  rows.forEach(([id,text])=>{if(id.endsWith('_keyword')){current={title:text,body:[]};groups.push(current)}else if(current){current.body.push(text)}});
  content[name]={rows,groups};
});
const profileStrings=content.profile.rows.map(row=>row[1]);
const media=new Map(M.media.map(item=>[item.page+'|'+item.keyword,item.paths]));
const state={index:0,busy:false,target:null,queued:null,textAnimations:new Map(),wheelPose:0,wheelRAF:0,hoverBlocked:false,pointerX:0,pointerY:0,hoverX:0,hoverY:0};
const world=$('world-layer'),frame=$('frame'),pageMap=new Map();
function installWorldPages(){
 const worldRoot=$('world-pages');
 pageMap.set('profile',worldRoot.querySelector('[data-page="profile"]'));
 for(const name of ORDER.slice(1)){
  const section=document.createElement('section');section.className='world-page report-page';section.dataset.page=name;
  section.innerHTML='<div class="keyword-row"></div><div class="report-art"><div class="report-label">보고서</div><div class="report-copy"><div class="report-body" aria-live="polite"></div></div><div class="report-media"></div></div>';
  $('report-pages').appendChild(section);pageMap.set(name,section);
 }
 // The page center is a source-image world coordinate. Local HTML has its own 1905x911 layout.
 ORDER.forEach((name,i)=>{const c=M.camera[i],section=pageMap.get(name);
  section.style.left=(c.x-VX/SCALE)+'px';section.style.top=(c.y-VY/SCALE)+'px';
  section.style.transform='scale('+(1/SCALE)+')';
 });
}
function cornerButton(label){const b=document.createElement('button');b.type='button';b.className='corner-button';
 b.innerHTML=['tl','tr','bl','br'].map(c=>'<span class="corner '+c+'"></span>').join('')+'<span>'+escapeHTML(label)+'</span>';return b}
function tableHTML(table,id){
 const widths=table.widths||[],total=widths.reduce((a,b)=>a+b,0);
 const cols=total?'<colgroup>'+widths.map(n=>'<col style="width:'+(n/total*100).toFixed(5)+'%">').join('')+'</colgroup>':'';
 return '<table data-table="'+escapeHTML(id)+'">'+cols+table.rows.map((r,i)=>'<tr>'+r.map(v=>'<'+(i?'td':'th')+'>'+rich(v)+'</'+(i?'td':'th')+'>').join('')+'</tr>').join('')+'</table>'
}
function inlineTable(name,title){for(const [id,t] of Object.entries(M.tables)){if(t.page===name&&t.keyword===title&&Number.isInteger(t.insertAfter))return{after:t.insertAfter,html:tableHTML(t,id)}}return null}
function extras(name,title){let s='';for(const [id,t] of Object.entries(M.tables)){if(t.page===name&&t.keyword===title&&!Number.isInteger(t.insertAfter))s+=tableHTML(t,id)}
 for(const video of M.videos){if(video.page===name&&video.keyword===title){const url=escapeHTML(video.video_url);s+='<p><a href="'+url+'" target="_blank" rel="noopener noreferrer">'+url+'</a></p>'}}return s}
function stopTextAnim(page){const a=state.textAnimations.get(page);if(a){try{a.cancel()}catch{}}state.textAnimations.delete(page)}
function writeText(page,body,animate,append='',insert=null){
 const area=page.querySelector('.report-body');stopTextAnim(page);
 const token=(Number(page.dataset.textToken)||0)+1;page.dataset.textToken=String(token);
 const draw=()=>{const parts=(body.length?body:[GUIDE]).map(p=>'<p>'+rich(p)+'</p>');if(insert)parts.splice(insert.after,0,insert.html);area.innerHTML=parts.join('')+append};
 if(!animate||matchMedia('(prefers-reduced-motion: reduce)').matches){draw();return}
 area.setAttribute('aria-busy','true');
 const out=area.animate([{transform:'translateY(0)',opacity:1},{transform:'translateY(-50px)',opacity:0}],{duration:200,easing:'ease-in-out',fill:'forwards'});
 state.textAnimations.set(page,out);
 out.onfinish=()=>{if(Number(page.dataset.textToken)!==token)return;draw();out.cancel();
  const incoming=area.animate([{transform:'translateY(50px)',opacity:0},{transform:'translateY(0)',opacity:1}],{duration:200,easing:'ease-in-out',fill:'forwards'});
  state.textAnimations.set(page,incoming);incoming.onfinish=()=>{if(Number(page.dataset.textToken)!==token)return;incoming.cancel();state.textAnimations.delete(page);area.removeAttribute('aria-busy')};
 };
}
function showMedia(page,name,title){const slots=page.querySelector('.report-media');slots.replaceChildren();const imgs=media.get(name+'|'+title)||[];
 page.classList.toggle('media-active',imgs.length>0);
 imgs.slice(0,2).forEach(path=>{const box=document.createElement('div'),img=document.createElement('img');box.className='media-slot';img.src=path;img.alt='';img.loading='lazy';box.appendChild(img);slots.appendChild(box)})}
function chooseKeyword(page,index,clicked){const name=page.dataset.page,group=content[name].groups[index];if(!group)return;
 if(!clicked&&(state.busy||state.hoverBlocked))return;
 if(page.dataset.selected===String(index)){return}
 page.dataset.selected=String(index);page.querySelector('.report-label').textContent='보고서 - '+group.title;
 page.querySelectorAll('.keyword-row button').forEach((b,j)=>b.classList.toggle('active',j===index));
 showMedia(page,name,group.title);writeText(page,group.body,clicked,extras(name,group.title),inlineTable(name,group.title));
}
function initReports(){for(const name of ORDER.slice(1)){
 const page=pageMap.get(name),row=page.querySelector('.keyword-row');
 for(const [i,group] of content[name].groups.entries()){
  const b=cornerButton(group.title);b.addEventListener('mouseenter',()=>chooseKeyword(page,i,false));
  b.addEventListener('click',()=>chooseKeyword(page,i,true));row.appendChild(b)
 }
 resetReport(page);
}}
function resetReport(page){delete page.dataset.selected;page.querySelector('.report-label').textContent='보고서';
 page.querySelectorAll('.keyword-row button').forEach(b=>b.classList.remove('active'));
 page.querySelector('.report-media').replaceChildren();page.classList.remove('media-active');
 writeText(page,[GUIDE],false)
}
function renderProfile(){const q=profileStrings[2].split(/<br\s*\/?\s*>/i);
 $('hero-first').textContent=profileStrings[0];$('hero-second').textContent=profileStrings[1];
 $('quote-profile').innerHTML='<div>'+rich(q[0])+'</div><div>'+rich(q[1]||'')+'</div><div class="credit">'+rich(q.slice(2).join('<br>'))+'</div>';
 const fields=[['이름',profileStrings[3]],['생년월일',profileStrings[4]],['학교',profileStrings[5]+' · '+profileStrings[6]],['학점',profileStrings[7]],['Tel',profileStrings[8].replace(/^Tel\s*:\s*/, '')],['Email',profileStrings[9].replace(/^Email\s*:\s*/, '')]];
 $('identity-cells').innerHTML=fields.map(([k,v])=>'<div class="row"><span class="key">'+escapeHTML(k)+'</span><span class="value">'+rich(v)+'</span></div>').join('');
 $('profile-image-caption').textContent=profileStrings[10]
}
function refreshCommon(index){$('scroll-guide').hidden=index!==0;$('page-num').textContent=CODES[index];$('frame').dataset.page=ORDER[index];
 document.querySelectorAll('.top-nav button').forEach(b=>b.classList.toggle('active',ORDER[index]===b.dataset.target));
 document.querySelectorAll('#arsenal-items button').forEach(b=>b.classList.toggle('active',Number(b.dataset.page)===index))
}
function activatePage(index){state.index=index;
 ORDER.forEach((name,j)=>{const page=pageMap.get(name);page.dataset.active=String(j===index);delete page.dataset.inTransit;
  if(j===index&&name!=='profile'){resetReport(page)}
 });
 state.hoverBlocked=true;state.hoverX=state.pointerX;state.hoverY=state.pointerY;
 refreshCommon(index)
}
// BASE scale is applied to the ship world as a single camera transform.
function focusPoint(center,zoom){return `translate3d(${VX-center.x*SCALE*zoom}px,${VY-center.y*SCALE*zoom}px,0) scale(${SCALE*zoom})`}
function focus(index,zoom=1){return focusPoint(M.camera[index],zoom)}
function centerBetween(i,j){return{x:(M.camera[i].x+M.camera[j].x)/2,y:(M.camera[i].y+M.camera[j].y)/2}}
function stopZoom(i,j){const dist=Math.hypot(M.camera[i].x-M.camera[j].x,M.camera[i].y-M.camera[j].y)*SCALE;
 // Every transition derives its zoom from actual world-center separation.
 return Math.max(.18,Math.min(.84,1400/(1400+dist)))}
function steer(direction,duration){const el=$('helm-wheel'),pose=state.wheelPose;
 if(state.wheelRAF)cancelAnimationFrame(state.wheelRAF);
 const start=performance.now(),row=direction>0?1:2;
 function tick(now){const t=Math.min(1,(now-start)/duration),f=Math.min(15,Math.floor(t*16));
  el.style.backgroundPosition=(-88*f)+'px '+(-88*row)+'px';el.style.transform='rotate('+pose+'deg)';
  if(t<1){state.wheelRAF=requestAnimationFrame(tick)}else{
    state.wheelPose=pose+(direction>0?334:-334);el.style.transform='rotate('+state.wheelPose+'deg)';
    el.style.backgroundPosition='0 0';state.wheelRAF=0;
  }
 }
 state.wheelRAF=requestAnimationFrame(tick)
}
function hillProgress(t){return t-Math.sin(4*Math.PI*t)/(4*Math.PI)}
function zoomProgress(t,min){const u=t<.5?2*t:2*t-1;const half=(1-Math.cos(Math.PI*u))/2;return t<.5?1-(1-min)*half:min+(1-min)*half}
function navigate(next){if(next<0||next>=ORDER.length)return;
 if(state.busy){state.queued=next;return}
 if(next===state.index)return;
 const from=state.index,min=stopZoom(from,next),duration=1880;
 state.busy=true;state.target=next;
 const targetPage=pageMap.get(ORDER[next]);targetPage.dataset.inTransit='true';if(ORDER[next]!=='profile')resetReport(targetPage);
 const start=performance.now(),origin=M.camera[from],destination=M.camera[next];let midpointSwapped=false;
 // Camera-space UI is anchored to the viewport. Its position follows the camera,
 // but its own scale is independent of the world zoom (always visually 1).
 frame.style.transform='translate3d(0,0,0)';
 steer(next>from?1:-1,duration);
 function tick(now){
  const t=Math.min(1,(now-start)/duration),progress=hillProgress(t),zoom=zoomProgress(t,min);
  const c={x:origin.x+(destination.x-origin.x)*progress,y:origin.y+(destination.y-origin.y)*progress};
  world.style.transform=focusPoint(c,zoom);
  frame.style.setProperty('--camera-center-x',c.x);
  frame.style.setProperty('--camera-center-y',c.y);
  frame.style.setProperty('--camera-zoom',zoom);
  if(t>=.5&&!midpointSwapped){midpointSwapped=true;activatePage(next)}
  if(t<1){state.cameraRAF=requestAnimationFrame(tick);return}
  world.style.transform=focus(next);frame.style.transform='translate3d(0,0,0)';state.cameraRAF=0;
  state.busy=false;state.target=null;
  const queued=state.queued;state.queued=null;if(queued!==null&&queued!==state.index)navigate(queued)
 }
 state.cameraRAF=requestAnimationFrame(tick)
}
function fit(){const scale=Math.min(innerWidth/1905,innerHeight/911);$('stage').style.transform='scale('+scale+')'}
function initNav(){const list=$('arsenal-items');for(const [label,i] of NAV){const b=document.createElement('button');b.type='button';b.dataset.page=String(i);b.textContent=CODES[i]+' - '+label;b.addEventListener('click',()=>navigate(i));list.appendChild(b)}}
window.addEventListener('pointermove',e=>{state.pointerX=e.clientX;state.pointerY=e.clientY;
 if(state.hoverBlocked&&!state.busy&&Math.hypot(e.clientX-state.hoverX,e.clientY-state.hoverY)>3){state.hoverBlocked=false;
  const button=e.target.closest?.('.world-page[data-active="true"] .keyword-row button');
  if(button){const page=button.closest('.world-page');chooseKeyword(page,[...page.querySelectorAll('.keyword-row button')].indexOf(button),false)}
 }},{passive:true});
let lastWheel=0;window.addEventListener('wheel',e=>{e.preventDefault();if(Math.abs(e.deltaY)<3)return;
 const now=performance.now();if(now-lastWheel<125)return;lastWheel=now;
 const base=state.queued!==null?state.queued:state.target!==null?state.target:state.index;
 navigate(base+(e.deltaY>0?1:-1))},{passive:false});
window.addEventListener('keydown',e=>{if(['ArrowDown','PageDown'].includes(e.key)){e.preventDefault();navigate(state.index+1)}
 else if(['ArrowUp','PageUp'].includes(e.key)){e.preventDefault();navigate(state.index-1)}});
window.addEventListener('resize',fit);
$('brand').addEventListener('click',()=>navigate(0));
document.querySelectorAll('.top-nav button').forEach(b=>b.addEventListener('click',()=>navigate(ORDER.indexOf(b.dataset.target))));
$('starboard').addEventListener('click',()=>window.open('https://youtu.be/mS9qQByGAWE?si=cqDjgb7t6tDbiFTW','_blank','noopener,noreferrer'));
installWorldPages();initReports();renderProfile();initNav();fit();world.style.transform=focus(0);activatePage(0);
})();
