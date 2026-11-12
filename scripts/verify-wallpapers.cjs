const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const {camera,shoreX,setCoast}=await import('../ocean.js');
 const {stepVoyage,voyageBounds}=await import('../voyage.js');
 const source=fs.readFileSync('app.js','utf8');
 const scenes=[...source.matchAll(/id:'(tropical|snow|autumn)',name:'[^']+',file:'[^']+',coast:(\[[^\]]+\])/g)];
 assert.equal(scenes.length,3);
 for(const [,id,raw] of scenes){
  const coast=JSON.parse(raw);assert.equal(coast.length,33);setCoast(coast);
  for(const [w,h] of [[1920,1080],[390,844]]){
   const cam=camera(w,h);cam.wallpaper=true;
   const b=voyageBounds(cam,h/2),boat={x:(b.left+b.right)/2,y:(b.top+b.bottom)/2,vx:0,vy:0,heading:0,phase:1.4};
   for(let frame=0;frame<60*180;frame++){
    stepVoyage(boat,cam,frame/60,.8,1/60);
    assert.ok(boat.x>=shoreX(boat.y,cam)+60,`${id}: boat crosses shoreline`);
    assert.ok(boat.x<=cam.w-60,`${id}: boat leaves viewport`);
   }
  }
  console.log(`PASS: ${id} shoreline, desktop and narrow-screen voyages.`);
 }
})().catch(e=>{console.error(e);process.exit(1)});

