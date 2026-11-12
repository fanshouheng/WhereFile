import {shoreX} from './ocean.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const ranges=new WeakMap();

export function voyageBounds(cam,y) {
  let range=ranges.get(cam);
  if(!range||range.wallpaper!==!!cam.wallpaper){
    const top=cam.wallpaper?80:115,bottom=Math.max(top,cam.h-(cam.wallpaper?90:195)),right=Math.max(65,cam.w-65);
    // Tall, narrow windows can have no water below a bend in the coast. Use the
    // longest connected strip that can contain a boat, rather than beaching it.
    let start=null,bestTop=top,bestBottom=top;
    for(let scan=top;scan<=bottom+4;scan+=4){
      const row=Math.min(scan,bottom),fits=scan<=bottom&&Math.max(65,shoreX(row,cam)+78)<=right-12;
      if(fits&&start===null)start=row;
      if(!fits&&start!==null){if(scan-4-start>bestBottom-bestTop){bestTop=start;bestBottom=Math.min(bottom,scan-4);}start=null;}
    }
    range={top:bestTop,bottom:bestBottom,right,wallpaper:!!cam.wallpaper};ranges.set(cam,range);
  }
  const row=clamp(y,range.top,range.bottom);
  return {top:range.top,bottom:range.bottom,left:Math.min(range.right,Math.max(65,shoreX(row,cam)+78)),right:range.right};
}

export function resetVoyage(it) { delete it.voyage; }

export function boatDirection(heading,current){
  const angle=((heading+35)%360+360)%360;
  if(current!==undefined){const delta=((angle-current*45+540)%360)-180;if(Math.abs(delta)<29)return current;}
  return Math.round(angle/45)%8;
}

function random(state){state.seed=(Math.imul(state.seed,1664525)+1013904223)>>>0;return state.seed/4294967296;}
function nextDestination(it){
  const state=it.voyage;
  if(!state.remaining.length){
    state.remaining=Array.from({length:9},(_,i)=>i);
    for(let i=8;i>0;i--){const j=Math.floor(random(state)*(i+1));[state.remaining[i],state.remaining[j]]=[state.remaining[j],state.remaining[i]];}
    if(state.remaining[8]===state.cell)[state.remaining[0],state.remaining[8]]=[state.remaining[8],state.remaining[0]];
  }
  state.cell=state.remaining.pop();
  state.u=clamp((state.cell%3+.15+random(state)*.7)/3,.07,.93);
  state.v=clamp((Math.floor(state.cell/3)+.15+random(state)*.7)/3,.07,.93);
}
function destination(it,cam) {
  const state=it.voyage,bounds=voyageBounds(cam,it.y),y=bounds.top+(bounds.bottom-bounds.top)*state.v;
  const row=voyageBounds(cam,y),u=state.u;
  return {x:row.left+(row.right-row.left)*u,y};
}

export function stepVoyage(it,cam,time,wind,dt) {
  if(!it.voyage){
    const phase=((it.phase%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
    it.voyage={seed:(Math.floor(phase*0x20000000)>>>0)||1,remaining:[],cell:-1};
    nextDestination(it);
  }
  let bounds=voyageBounds(cam,it.y);
  it.y=clamp(it.y,bounds.top,bounds.bottom);it.x=clamp(it.x,bounds.left,bounds.right);
  let target=destination(it,cam),dx=target.x-it.x,dy=target.y-it.y,distance=Math.hypot(dx,dy);
  const arrival=Math.min(18,Math.max(5,(bounds.right-bounds.left)*.055));
  if(distance<arrival&&wind>0){
    nextDestination(it);
    target=destination(it,cam);dx=target.x-it.x;dy=target.y-it.y;distance=Math.hypot(dx,dy);
  }
  const size=clamp(Math.sqrt(cam.w*cam.h/(1440*900)),.7,1.75);
  const speed=Math.pow(clamp(wind,0,1),.55)*32*size;
  let wantedX=dx/Math.max(distance,1)*speed,wantedY=dy/Math.max(distance,1)*speed;
  // The long route carries boats through the bay; small currents keep the
  // course from becoming a straight line or a synchronized procession.
  wantedX+=Math.sin(it.y*.009+time*.18+it.phase)*wind*1.8;
  wantedY+=Math.cos(it.x*.008-time*.13+it.phase)*wind*1.2;
  const lookY=clamp(it.y+wantedY*1.7,bounds.top,bounds.bottom),look=voyageBounds(cam,lookY);
  const safeLeft=Math.max(bounds.left,look.left),edge=Math.min(12,(bounds.right-bounds.left)*.045);
  if(it.x<safeLeft+edge)wantedX=Math.max(wantedX,(safeLeft+edge-it.x)*.8);
  if(it.x>bounds.right-edge)wantedX=Math.min(wantedX,(bounds.right-edge-it.x)*.8);
  if(it.y<bounds.top+16)wantedY=Math.max(wantedY,(bounds.top+16-it.y)*.8);
  if(it.y>bounds.bottom-16)wantedY=Math.min(wantedY,(bounds.bottom-16-it.y)*.8);
  if(wind===0)wantedX=wantedY=0;
  const response=1-Math.exp(-dt*.8);
  it.vx+=(wantedX-it.vx)*response;it.vy+=(wantedY-it.vy)*response;
  it.y=clamp(it.y+it.vy*dt,bounds.top,bounds.bottom);
  bounds=voyageBounds(cam,it.y);
  it.x=clamp(it.x+it.vx*dt,bounds.left,bounds.right);
  // Cancel only the component into the boundary, retaining tangential motion.
  if(it.x<=bounds.left&&it.vx<0)it.vx=0;if(it.x>=bounds.right&&it.vx>0)it.vx=0;
  if(it.y<=bounds.top&&it.vy<0)it.vy=0;if(it.y>=bounds.bottom&&it.vy>0)it.vy=0;
  if(Math.hypot(it.vx,it.vy)>.5){
    // The painted bow points down-right, 35 degrees clockwise from screen-right.
    const angle=Math.atan2(it.vy,it.vx)*180/Math.PI-35;
    it.heading=it.heading===undefined?angle:it.heading+((angle-it.heading+540)%360+360)%360-180;
  }
}
