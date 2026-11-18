(()=>{'use strict';
const M=JSON.parse(document.getElementById('portfolio-data').textContent);
const $=id=>document.getElementById(id);
const GUIDE='키워드 버튼 위에 마우스 포인터를 올리거나 버튼을 누르면 해당 키워드의 내용이 여기에 표시됩니다.';
const ORDER=M.pages, CODES=M.pageCodes;
const NAV=[['프로필',0],['소개',1],['게임을 개발하고,',2],['게임을 플레이하며,',3],['게임을 관찰한다.',4],['1인 게임 개발 프로젝트',5],['기획 문서 작성 이력',7],['게임 플레이 이력',8]];
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rich=s=>escapeHTML(s).replace(/&lt;br\s*\/?&gt;/gi,'<br>').replace(/\[([^\]]+(?:\\\][^\]]+)*)\]\((https:\/\/[^ )]+)\)/g,(_m,label,url)=>'<a target="_blank" rel="noopener noreferrer" href="'+url+'">'+label.replace(/\\\]/g,']')+'</a>');
const groupData={};
for(const name of ORDER){const rows=M.strings['string_'+name+'_1.csv'];let group=null;let groups=[];
 for(const [id,text] of rows){if(id.includes('_keyword')){group={title:text,body:[]};groups.push(group)}else if(group)group.body.push(text)}
 groupData[name]={rows,groups};}
const STATE={index:0,busy:false,queued:null,selected:-1,revision:0,textAnim:null,wheelPose:0,wheelRAF:null};
const media=new Map(M.media.map(r=>[r.page+'|'+r.keyword,r.paths]));
const profileStrings=groupData.profile.rows.map(x=>x[1]);
function cornerButton(title){const b=document.createElement('button');b.className='corner-button';b.type='button';b.innerHTML=['tl','tr','bl','br'].map(k=>'<span class="corner '+k+'"></span>').join('')+'<span>'+escapeHTML(title)+'</span>';return b}
function tableHTML(rows){return'<table>'+rows.map((r,i)=>'<tr>'+r.map(v=>'<'+(i?'td':'th')+'>'+rich(v)+'</'+(i?'td':'th')+'>').join('')+'</tr>').join('')+'</table>'}
function appendix(page,title){let s='';for(const v of Object.values(M.tables)){if(v.page===page&&v.keyword===title)s+=tableHTML(v.rows)}
 for(const v of M.videos){if(v.page===page&&v.keyword===title)s+='<p><a href="'+escapeHTML(v.video_url)+'" rel="noopener noreferrer" target="_blank">'+escapeHTML(v.video_url)+'</a></p>'}return s}
function hideTextAnim(){STATE.revision++;if(STATE.textAnim){try{STATE.textAnim.cancel()}catch{}}STATE.textAnim=null;$('report-body').removeAttribute('aria-busy')}
function setReportText(body,clicked,extra=''){hideTextAnim();const rev=STATE.revision,el=$('report-body');const draw=()=>{el.innerHTML=(body.length?body:[GUIDE]).map(p=>'<p>'+rich(p)+'</p>').join('')+extra;el.scrollTop=0};
 if(!clicked||matchMedia('(prefers-reduced-motion: reduce)').matches){draw();return}
 el.setAttribute('aria-busy','true');
 const out=el.animate([{transform:'translateY(0)',opacity:1},{transform:'translateY(-50px)',opacity:0}],{duration:200,easing:'ease-in-out',fill:'forwards'});STATE.textAnim=out;
 out.onfinish=()=>{if(STATE.revision!==rev)return;draw();out.cancel();const incoming=el.animate([{transform:'translateY(50px)',opacity:0},{transform:'translateY(0)',opacity:1}],{duration:200,easing:'ease-in-out',fill:'forwards'});STATE.textAnim=incoming;incoming.onfinish=()=>{if(STATE.revision!==rev)return;incoming.cancel();STATE.textAnim=null;el.removeAttribute('aria-busy')}};
}
function showMedia(page,title){const box=$('report-media');box.replaceChildren();const imgs=media.get(page+'|'+title)||[];$('report-panel').classList.toggle('media-active',imgs.length>0);
 for(const path of imgs.slice(0,2)){const frame=document.createElement('div'),image=document.createElement('img');frame.className='media-slot';image.src=path;image.alt='';image.loading='lazy';frame.appendChild(image);box.appendChild(frame)} }
function chooseKeyword(i,clicked=false){const page=ORDER[STATE.index],k=groupData[page].groups[i];if(!k)return;
 STATE.selected=i;$('report-label').textContent='보고서 - '+k.title;document.querySelectorAll('#keyword-row button').forEach((b,n)=>b.classList.toggle('active',n===i));
 showMedia(page,k.title);setReportText(k.body,clicked,appendix(page,k.title));}
function renderProfile(){const q=profileStrings[2].split(/<br\s*\/?>/i);$('hero-first').textContent=profileStrings[0];$('hero-second').textContent=profileStrings[1];$('quote-profile').innerHTML='<div>'+rich(q.slice(0,2).join('<br>'))+'</div><div class="credit">'+rich(q.slice(2).join('<br>'))+'</div>';
 $('identity-cells').innerHTML='<div class="row"><span class="key">이름</span><span>'+rich(profileStrings[3])+'</span></div><div class="row"><span class="key">생년월일</span><span>'+rich(profileStrings[4])+'</span></div><div class="row"><span class="key">학교</span><span>'+rich(profileStrings[5])+' · '+rich(profileStrings[6])+'</span></div><div class="row"><span class="key">학점</span><span>'+rich(profileStrings[7])+'</span></div><div class="row"><span class="key">Tel</span><span>'+rich(profileStrings[8].replace(/^Tel\s*:\s*/,''))+'</span></div><div class="row"><span class="key">Email</span><span>'+rich(profileStrings[9].replace(/^Email\s*:\s*/,''))+'</span></div>';
 $('profile-image-caption').textContent=profileStrings[10];}
function renderPage(i){STATE.index=i;STATE.selected=-1;hideTextAnim();$('page-num').textContent=CODES[i];
 $('profile-panel').hidden=i!==0;$('report-panel').hidden=i===0;
 document.querySelectorAll('.top-nav button').forEach(b=>b.classList.toggle('active',ORDER[i]===b.dataset.target));
 document.querySelectorAll('#arsenal-items button').forEach(b=>b.classList.toggle('active',Number(b.dataset.page)===i));
 if(i===0){renderProfile();return}
 const row=$('keyword-row');row.replaceChildren();groupData[ORDER[i]].groups.forEach((kw,j)=>{const b=cornerButton(kw.title);b.addEventListener('mouseenter',()=>chooseKeyword(j,false));b.addEventListener('click',()=>chooseKeyword(j,true));row.appendChild(b)});
 $('report-label').textContent='보고서';$('report-media').replaceChildren();$('report-panel').classList.remove('media-active');setReportText([GUIDE],false);
}
// Source image coordinate system: the ship is shown at 5x its 2172x650 original size.
const SCALE=5, VX=952.5, VY=455.5;
function focus(n,zoom=1){const c=M.camera[n];return `translate3d(${VX-c.x*SCALE*zoom}px,${VY-c.y*SCALE*zoom}px,0) scale(${zoom})`}
function focusMid(a,b,z){const m={x:(M.camera[a].x+M.camera[b].x)/2,y:(M.camera[a].y+M.camera[b].y)/2};return `translate3d(${VX-m.x*SCALE*z}px,${VY-m.y*SCALE*z}px,0) scale(${z})`}
function steer(dir,duration){const el=$('helm-wheel'),pose=STATE.wheelPose;if(STATE.wheelRAF)cancelAnimationFrame(STATE.wheelRAF);
 const start=performance.now(),row=dir>0?1:2;function step(t){const k=Math.min(1,(t-start)/duration),f=Math.min(15,Math.floor(k*16));el.style.backgroundPosition=(-88*f)+'px '+(-88*row)+'px';el.style.transform='rotate('+pose+'deg)';
 if(k<1)STATE.wheelRAF=requestAnimationFrame(step);else{STATE.wheelPose=pose+(dir>0?334:-334);el.style.transform='rotate('+STATE.wheelPose+'deg)';el.style.backgroundPosition='0px 0px';STATE.wheelRAF=null}}STATE.wheelRAF=requestAnimationFrame(step)}
function go(target){if(target<0||target>=ORDER.length)return;
 if(STATE.busy){STATE.queued=target;return}
 if(target===STATE.index)return;
 STATE.busy=true;const from=STATE.index,dst=Math.hypot(M.camera[target].x-M.camera[from].x,M.camera[target].y-M.camera[from].y)*SCALE;
 const min=Math.max(.32,1/(1+dst/1580)),dur=920;
 const scene=$('ship-world'),ui=$('frame');const startPose=scene.style.transform||focus(from);
 const bg=scene.animate([{transform:startPose,offset:0},{transform:focusMid(from,target,min),offset:.5},{transform:focus(target),offset:1}],{duration:dur,easing:'ease-in-out',fill:'forwards'});
 steer(target>from?1:-1,dur);
 const out=ui.animate([{transform:'scale(1)'},{transform:'scale('+min+')'}],{duration:dur/2,easing:'ease-in-out',fill:'forwards'});
 out.onfinish=()=>{ui.style.transform='scale('+min+')';out.cancel();renderPage(target);const inside=ui.animate([{transform:'scale('+min+')'},{transform:'scale(1)'}],{duration:dur/2,easing:'ease-in-out',fill:'forwards'});
 inside.onfinish=()=>{ui.style.transform='scale(1)';inside.cancel();bg.cancel();scene.style.transform=focus(target);STATE.busy=false;
 const queued=STATE.queued;STATE.queued=null;if(queued!==null&&queued!==STATE.index)go(queued)}};
}
function resize(){const scale=Math.min(window.innerWidth/1905,window.innerHeight/911);$('stage').style.transform='scale('+scale+')'}
const arsenal=$('arsenal-items');for(const [label,i] of NAV){const b=document.createElement('button');b.textContent=CODES[i]+' - '+label;b.dataset.page=String(i);b.type='button';b.addEventListener('click',()=>go(i));arsenal.appendChild(b)}
let wheelTime=0;addEventListener('wheel',e=>{e.preventDefault();if(Math.abs(e.deltaY)<3)return;const now=performance.now();if(now-wheelTime<125)return;wheelTime=now;const base=STATE.queued===null?STATE.index:STATE.queued;go(base+(e.deltaY>0?1:-1))},{passive:false});
addEventListener('keydown',e=>{if(['ArrowDown','PageDown'].includes(e.key)){e.preventDefault();go(STATE.index+1)}else if(['ArrowUp','PageUp'].includes(e.key)){e.preventDefault();go(STATE.index-1)}});
addEventListener('resize',resize);
$('starboard').addEventListener('click',()=>window.open('https://youtu.be/mS9qQByGAWE?si=cqDjgb7t6tDbiFTW','_blank','noopener,noreferrer'));
$('brand').addEventListener('click',()=>go(0));document.querySelectorAll('.top-nav button').forEach(b=>b.addEventListener('click',()=>go(ORDER.indexOf(b.dataset.target))));
resize();$('ship-world').style.transform=focus(0);renderPage(0);
})();
