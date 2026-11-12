const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

(async()=>{
  const {camera,shoreX}=await import(pathToFileURL(path.resolve(__dirname,'../ocean.js')));
  const {stepVoyage,resetVoyage,voyageBounds,boatDirection}=await import(pathToFileURL(path.resolve(__dirname,'../voyage.js')));
  for(let i=0;i<8;i++)assert.equal(boatDirection(i*45-35),i,'Correct upright artwork for each compass heading');
  assert.equal(boatDirection(24-35,0),0,'Hysteresis prevents view flicker near boundary');
  assert.equal(boatDirection(30-35,0),1,'View changes once turn crosses hysteresis');
  assert.equal(boatDirection(359-35,0),0,'Heading wraps without flipping artwork');
  function run(width,height,wind,seconds,fps=60,wallpaper=false){
    const cam=camera(width,height);cam.wallpaper=wallpaper;
    const boats=[.4,2.1,4.9].map(phase=>{
      const bounds=voyageBounds(cam,height*.45);
      return{x:bounds.left+(bounds.right-bounds.left)*.5,y:Math.max(bounds.top,Math.min(bounds.bottom,height*.45)),vx:0,vy:0,phase};
    });
    const spans=boats.map(()=>({minU:1,maxU:0,minV:1,maxV:0,cells:new Set(),travel:0,checkedAt:0}));
    let time=0;
    for(let frame=0;frame<seconds*fps;frame++){
      const steps=Math.ceil(60/fps),dt=1/fps/steps;
      for(let sub=0;sub<steps;sub++){
        time+=dt;
        boats.forEach((it,index)=>{
          const oldX=it.x,oldY=it.y;
          stepVoyage(it,cam,time,wind,dt);
          const b=voyageBounds(cam,it.y),span=spans[index];
          assert.ok([it.x,it.y,it.vx,it.vy].every(Number.isFinite),'Finite state');
          if(Math.hypot(it.vx,it.vy)>.5){
            const heading=(it.heading+35)*Math.PI/180,speed=Math.hypot(it.vx,it.vy);
            assert.ok(Math.cos(heading)*it.vx/speed+Math.sin(heading)*it.vy/speed>1-1e-8,'Painted bow aligns with actual velocity');
          }
          assert.ok(it.x>=b.left-1e-7&&it.x<=b.right+1e-7&&it.y>=b.top-1e-7&&it.y<=b.bottom+1e-7,'Inside navigable sea');
          assert.ok(it.x>=shoreX(it.y,cam)+77.99,'Never cross coastline');
          assert.ok(Math.hypot(it.x-oldX,it.y-oldY)<3,'No teleport between physics steps');
          span.travel+=Math.hypot(it.x-oldX,it.y-oldY);
          if(time-span.checkedAt>=30){
            if(wind>0)assert.ok(span.travel>40,'Keep sailing after reaching a waypoint');
            span.travel=0;span.checkedAt=time;
          }
          const u=(it.x-b.left)/Math.max(1,b.right-b.left),v=(it.y-b.top)/Math.max(1,b.bottom-b.top);
          span.minU=Math.min(span.minU,u);span.maxU=Math.max(span.maxU,u);span.minV=Math.min(span.minV,v);span.maxV=Math.max(span.maxV,v);
          span.cells.add(Math.min(2,Math.floor(u*3))+3*Math.min(2,Math.floor(v*3)));
        });
      }
    }
    return{boats,spans,cam};
  }
  for(const [width,height,wallpaper] of [[1440,900,false],[1920,1080,true],[3840,2160,true],[390,844,false],[390,844,true]]){
    const result=run(width,height,.35,600,15,wallpaper);
    result.spans.forEach(span=>{
      assert.ok(span.maxU-span.minU>=.7,'Visit both near and far water');
      assert.ok(span.maxV-span.minV>=.7,'Visit both upper and lower water');
      assert.ok(span.cells.size>=8,'Visit at least eight ninths of the sea');
    });
    console.log(`PASS: ${width}x${height}${wallpaper?' wallpaper':''}, all boats cover >=70% of both axes and >=8/9 sea regions in ten minutes.`);
  }
  const high=run(1440,900,.35,30,60),low=run(1440,900,.35,30,1);
  high.boats.forEach((it,i)=>assert.ok(Math.hypot(it.x-low.boats[i].x,it.y-low.boats[i].y)<.01,'Same route at low FPS'));
  console.log('PASS: one and sixty FPS follow the same route.');
  run(390,844,1,60,1,true);console.log('PASS: strong wind remains in narrow wallpaper sea.');
  const calm=run(1440,900,0,30),b=voyageBounds(calm.cam,405);
  calm.boats.forEach(it=>assert.ok(Math.hypot(it.x-(b.left+b.right)*.5,it.y-405)<.001,'Calm does not cruise'));
  const boat=high.boats[0],velocity=[boat.vx,boat.vy];resetVoyage(boat);
  assert.equal(boat.voyage,undefined);assert.deepEqual([boat.vx,boat.vy],velocity);
  console.log('PASS: calm stays still; resetting a route preserves release inertia.');
  function destinations(phase){
    const cam=camera(1440,900),it={x:900,y:450,vx:0,vy:0,phase},cells=[],points=[];
    for(let i=0;i<27;i++){
      stepVoyage(it,cam,i,.35,1/60);cells.push(it.voyage.cell);points.push([it.voyage.u,it.voyage.v]);
      const b=voyageBounds(cam,it.y);it.y=b.top+(b.bottom-b.top)*it.voyage.v;
      const row=voyageBounds(cam,it.y);it.x=row.left+(row.right-row.left)*it.voyage.u;
    }
    return {cells,points};
  }
  const sequence=destinations(.4),other=destinations(2.1);
  for(let i=0;i<27;i+=9)assert.equal(new Set(sequence.cells.slice(i,i+9)).size,9,'Every random tour visits all sea regions');
  assert.notDeepEqual(sequence.cells.slice(0,9),sequence.cells.slice(9,18),'Successive tours use different orders');
  assert.notDeepEqual(sequence.points,other.points,'Boats choose independent random routes');
  console.log('PASS: bow follows velocity; randomized full-sea tours differ across boats and laps.');
})().catch(error=>{console.error(error);process.exitCode=1;});
