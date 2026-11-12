export const WORLD = { width:1672, height:941 };
// Shore samples follow the generated plate; CPU hit testing and GPU surf share this curve.
const coast = [278,352,415,430,417,405,396,390,383,371,360,357,364,386,414,438,465,481,505,507,501,495,479,476,477,490,501,526,544,570,598,624,648];
function segments(coast){return coast.slice(0,-1).map((p1,i)=>{
  const p0=coast[Math.max(0,i-1)],p2=coast[i+1],p3=coast[Math.min(coast.length-1,i+2)];
  return [p1,(p2-p0)*.5,p0-2.5*p1+2*p2-.5*p3,(-p0+3*p1-3*p2+p3)*.5];
});}
let shoreSegments=segments(coast);
export function setCoast(points){shoreSegments=segments(points);}
export function coastAt(y) {
  const f=Math.max(0,Math.min(shoreSegments.length-.0001,y/WORLD.height*shoreSegments.length));
  const i=Math.floor(f),u=f-i,[a,b,c,d]=shoreSegments[i];
  return a+u*(b+u*(c+u*d));
}
export function camera(w,h) {
  const scale = Math.max(w/WORLD.width,h/WORLD.height);
  return { w,h,scale, x:(w-WORLD.width*scale)*(w<500?.22:0),y:(h-WORLD.height*scale)*.5 };
}
export function shoreX(y,c) { return coastAt((y-c.y)/c.scale)*c.scale+c.x; }
export function waveAt(x,y,t,wind){return (Math.sin(x*.020+y*.009+t*.8)+.45*Math.sin(x*.031-y*.016+t*1.05))*(3.2+wind*5.0);}

const vertex = `attribute vec2 a_position; void main(){gl_Position=vec4(a_position,0.,1.);}`;
const fragment = `precision highp float;
uniform sampler2D u_image;
uniform vec2 u_view;
uniform vec3 u_camera;
uniform float u_time;
uniform float u_wind;
uniform float u_surf;
uniform vec4 u_coast[32];
uniform vec2 u_pointer;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float surf(vec2 p,float d,float t,float offset){
 float cycle=fract(t*.115+offset);
 float front=145.-cycle*172.+sin(p.y*.023+t*.23)*7.+sin(p.y*.071-t*.4)*3.;
 float edge=d-front;
 float n=noise(vec2(p.y*.16,edge*.2+t*.3));
 float fade=smoothstep(0.,.12,cycle)*(1.-smoothstep(.72,1.,cycle));
 float patches=smoothstep(.18,.72,noise(vec2(p.y*.042,t*.13+offset*7.)));
 float lip=exp(-pow(edge/(2.+n*3.),2.))*(.24+patches*.45);
 float lace=exp(-abs(edge-9.)/15.)*smoothstep(.38,.68,noise(p*.19+vec2(t*.3,0.)))*(.16+patches*.20);
 return (lip+lace)*fade;
}
float coast(float y){
 float q=clamp(y/${WORLD.height.toFixed(1)}*${shoreSegments.length.toFixed(1)},0.,${(shoreSegments.length-.0001).toFixed(4)}),i=floor(q),u=fract(q);
 vec4 k=vec4(0.);
 ${shoreSegments.map((k,i)=>`if(i==${i.toFixed(1)})k=u_coast[${i}];`).join('\n ')}
 return k.x+u*(k.y+u*(k.z+u*k.w));
}
void main(){
 vec2 screen=vec2(gl_FragCoord.x,u_view.y-gl_FragCoord.y);
 vec2 p=(screen-u_camera.yz)/u_camera.x;
 float d=p.x-coast(p.y);
 float wet=smoothstep(-8.,55.,d);
 float t=u_time;
 vec2 flow=vec2(sin(p.y*.025+t*.57)+sin((p.x+p.y)*.013-t*.36),cos(p.x*.024-t*.43)+sin(p.y*.017+t*.41));
 float swell=sin(p.x*.020+p.y*.009+t*.8)+.45*sin(p.x*.031-p.y*.016+t*1.05);
 vec2 q=p+(flow*(1.1+u_wind*1.8)+vec2(1.,.32)*swell*(2.+u_wind*3.))*wet;
 vec2 uv=clamp(q/vec2(${WORLD.width.toFixed(1)},${WORLD.height.toFixed(1)}),vec2(.001),vec2(.999));
 vec3 color=texture2D(u_image,uv).rgb;
 float brightness=dot(color,vec3(.299,.587,.114));
 float water=wet*(1.-smoothstep(.73,.92,brightness));
 float caustic=sin(p.x*.038+sin(p.y*.029+t*.18)*2.4+t*.28)*sin(p.y*.044+sin(p.x*.021-t*.13)*2.1-t*.2);
 color+=vec3(.3,.9,.9)*pow(max(0.,caustic),9.)*.045*water;
 // Broad travelling swells are visible across the bay, under the finer water texture.
 float waveLight=cos(p.x*.020+p.y*.009+t*.8);
 color+=vec3(.34,.65,.63)*waveLight*(.034+u_wind*.022)*water;
 float crest=pow(max(0.,sin(p.x*.020+p.y*.009+t*.8)),24.);
 float broken=smoothstep(.42,.72,noise(p*.015+vec2(t*.035,0.)));
 color=mix(color,vec3(.80,.98,.94),crest*broken*water*(.10+u_wind*.12));
 // Two offset breakers travel toward the actual coastline and dissolve into lace.
 float breaker=(surf(p,d,t,0.)+surf(p,d,t,.5))*smoothstep(-12.,6.,d)*(1.-smoothstep(150.,190.,d));
 color=mix(color,vec3(.96,1.,.91),clamp(breaker*(.74+u_wind*.3)*u_surf,0.,.85));
 // A shallow sheet reaches the sand, slows at its high point, then drains away.
 float tide=sin(t*.72+sin(p.y*.006)*.18);
 float runup=-7.-(tide*.5+.5)*(15.+u_wind*12.);
 float sand=smoothstep(-48.,-30.,d)*(1.-smoothstep(4.,20.,d));
 float sheet=smoothstep(runup-3.,runup+9.,d)*sand*u_surf;
 color=mix(color,color*vec3(.93,.94,.90)+vec3(.005,.018,.013),sheet*.53);
 float swashEdge=exp(-pow((d-runup)/(1.7+noise(p*.18)*2.),2.))*sand;
 float bubbling=.55+.45*noise(p*.24+vec2(t*.8,0.));
 color=mix(color,vec3(1.,1.,.94),swashEdge*bubbling*(.35+.25*max(0.,cos(t*.72)))*u_surf);
 float glimmer=pow(max(0.,sin(p.x*.12+t*.42)*sin(p.y*.115-t*.33)),30.);
 color+=vec3(.65,.9,1.)*glimmer*.055*water;
 gl_FragColor=vec4(color,1.);
}`;

export async function createOcean(canvas) {
  const gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power'});
  if(!gl) { canvas.hidden=true; return {resize(){},draw(){},available:false}; }
  function compile(type,source) {
    const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const program=gl.createProgram();
  gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const image=new Image();image.src='assets/coast-hd.webp';await image.decode();
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);
  const uniforms={};for(const n of ['view','camera','time','wind','surf']) uniforms[n]=gl.getUniformLocation(program,'u_'+n);
  gl.uniform1f(uniforms.surf,1);
  const coastUniform=gl.getUniformLocation(program,'u_coast[0]');
  gl.uniform4fv(coastUniform,new Float32Array(shoreSegments.flat()));
  let c,dpr=1;
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();canvas.hidden=true;});
  return {
    available:true,
    setScene(image,surf=1){gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);gl.uniform4fv(coastUniform,new Float32Array(shoreSegments.flat()));gl.uniform1f(uniforms.surf,surf);},
    resize(cam){c=cam;dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(c.w*dpr);canvas.height=Math.round(c.h*dpr);gl.viewport(0,0,canvas.width,canvas.height);},
    draw(time,wind){if(!c||gl.isContextLost())return;gl.uniform2f(uniforms.view,canvas.width,canvas.height);gl.uniform3f(uniforms.camera,c.scale*dpr,c.x*dpr,c.y*dpr);gl.uniform1f(uniforms.time,time);gl.uniform1f(uniforms.wind,wind);gl.drawArrays(gl.TRIANGLES,0,6);canvas.hidden=false;}
  };
}

export class SeaLife {
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.rings=[];this.foam=[];this.c=null;}
  resize(c){this.c=c;const dpr=Math.min(devicePixelRatio||1,1.5);this.canvas.width=Math.round(c.w*dpr);this.canvas.height=Math.round(c.h*dpr);this.ctx.setTransform(dpr,0,0,dpr,0,0);}
  ripple(x,y,power=1){this.rings.push({x,y,age:0,power});if(this.rings.length>30)this.rings.shift();}
  wake(x,y,vx,vy){if(this.foam.length>180)return;for(let i=0;i<2;i++)this.foam.push({x:x+(Math.random()-.5)*22,y:y+(Math.random()-.5)*7,vx:-vx*.08+(Math.random()-.5)*3,vy:-vy*.08+2,age:0,size:1+Math.random()*2});}
  draw(t,dt,wind,reduced=false){
    const {ctx,c}=this;if(!c)return;ctx.clearRect(0,0,c.w,c.h);
    for(let i=this.foam.length-1;i>=0;i--){const p=this.foam[i];p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.age>2.3){this.foam.splice(i,1);continue;}ctx.fillStyle=`rgba(235,255,251,${(1-p.age/2.3)*.48})`;ctx.beginPath();ctx.ellipse(p.x,p.y,p.size+p.age*1.4,p.size*.5,0,0,Math.PI*2);ctx.fill();}
    for(let i=this.rings.length-1;i>=0;i--){const r=this.rings[i];r.age+=dt;if(r.age>2.2){this.rings.splice(i,1);continue;}for(let j=0;j<2;j++){let a=r.age-j*.24;if(a<=0)continue;const radius=12+a*42*r.power;ctx.strokeStyle=`rgba(240,255,247,${Math.max(0,1-a/2)*.52})`;ctx.lineWidth=1.5-a*.4;ctx.beginPath();ctx.ellipse(r.x,r.y,radius,radius*.43,-.1,0,Math.PI*2);ctx.stroke();}}
    if(reduced)return;
    // Tiny fish occupy the shallows. Their shadows remain deliberately subtle.
    for(let school=0;school<2;school++){
      const baseY=c.h*(school?.74:.48)+Math.sin(t*.08+school)*22;
      const baseX=shoreX(baseY,c)+110+school*70+Math.sin(t*.045+school*2)*45;
      for(let i=0;i<6;i++){const x=baseX+Math.sin(i*2.8)*23+i*9,y=baseY+i*8+Math.sin(t*1.5+i)*3;ctx.save();ctx.translate(x,y);ctx.rotate(-.45+Math.sin(t*.16)*.3);ctx.fillStyle='rgba(13,107,129,.22)';ctx.beginPath();ctx.ellipse(0,0,6,1.8,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(4,0);ctx.lineTo(9,-2.5);ctx.lineTo(9,2.5);ctx.closePath();ctx.fill();ctx.restore();}
    }
    for(let i=0;i<5;i++){
      const x=((c.w*(.36+i*.171)+t*(3+i*.4)*(1+wind*.3))%(c.w+180))-50;
      const y=c.h*(.16+(i*.173)% .62)+Math.sin(t*.13+i*2)*23;
      const size=(i%2?13:17)*(c.w<700?.72:1),flap=Math.sin(t*1.8+i*1.7)*.24;
      this.gull(x-15,y+36,size*.85,flap,.09,true);
      this.gull(x,y,size,flap,.94,false);
    }
  }
  gull(x,y,s,flap,alpha,shadow){
    const ctx=this.ctx;ctx.save();ctx.translate(x,y);ctx.rotate(-.18);ctx.globalAlpha=alpha;ctx.fillStyle=shadow?'#0b5874':'#fffdf0';
    ctx.beginPath();ctx.moveTo(0,2);ctx.bezierCurveTo(-s*.3,-s*(.5+flap),-s*.7,-s*.5,-s,-s*.15);ctx.bezierCurveTo(-s*.65,-s*.22,-s*.35,-s*.1,0,s*.2);ctx.bezierCurveTo(s*.38,-s*.1,s*.7,-s*.4,s,-s*.15);ctx.bezierCurveTo(s*.7,-s*.6,s*.3,-s*(.5+flap),0,2);ctx.fill();
    ctx.beginPath();ctx.ellipse(0,2,2,5,-.35,0,Math.PI*2);ctx.fill();if(!shadow){ctx.fillStyle='#efbd78';ctx.beginPath();ctx.moveTo(-1,-2);ctx.lineTo(-3,-6);ctx.lineTo(1,-3);ctx.fill();}ctx.restore();
  }
}
