// Local, asset-free game audio. Mid-range texture remains present on small speakers.
// No audio context is created before a start/resume or gameplay gesture.
const CUE_SECONDS={hum:2,step:.22,pursuit:.26,door:.48,latch:.19,flicker:.18};
const TAU=2*Math.PI;
export function synthesizeCue(kind,sampleRate=48000){
 if(!Object.hasOwn(CUE_SECONDS,kind))throw new Error('Unknown audio cue');
 const seconds=CUE_SECONDS[kind],data=new Float32Array(Math.ceil(seconds*sampleRate));
 let random=7261,low=0,phase=0;
 for(let i=0;i<data.length;i++){
  const t=i/sampleRate,u=t/seconds;
  random=(Math.imul(random,1664525)+1013904223)>>>0;
  const white=random/2147483648-1;low+=.16*(white-low);const texture=white-low;
  const edge=Math.min(1,t/.008,(seconds-t)/.025);
  if(kind==='hum'){
   // Whole-number cycles make the loop continuous; the subtle higher partials
   // avoid relying entirely on a 60 Hz tone that small speakers may attenuate.
   data[i]=.016*Math.sin(TAU*120*t)+.008*Math.sin(TAU*240*t)+.003*Math.sin(TAU*600*t);
  }else if(kind==='step'||kind==='pursuit'){
   const distant=kind==='pursuit';phase+=TAU*(distant?135-55*u:185-85*u)/sampleRate;
   data[i]=edge*Math.exp(-t*(distant?17:20))*(Math.sin(phase)*(distant?.16:.2)+texture*(distant?.055:.095));
  }else if(kind==='door'){
   phase+=TAU*(260+85*Math.sin(t*12)+25*Math.sin(t*39))/sampleRate;
   data[i]=edge*Math.sin(Math.PI*u)*(.075*Math.sin(phase)+.026*Math.sin(phase*2)+.022*low);
  }else if(kind==='latch'){
   data[i]=edge*Math.exp(-t*28)*(.2*Math.sin(TAU*270*t)+.1*texture);
  }else{
   data[i]=edge*Math.exp(-t*24)*(.075*Math.sin(TAU*720*t)+.035*texture);
  }
 }
 return data;
}

export class GameAudio{
 constructor({createContext=()=>new(globalThis.AudioContext||globalThis.webkitAudioContext)(),canPlay=()=>true,onError=()=>{}}={}){
  this.createContext=createContext;this.canPlay=canPlay;this.onError=onError;
  this.enabled=true;this.unlocked=false;this.context=null;this.master=null;this.hum=null;
  this.buffers=new Map();this.voices=new Set();this.generation=0;this.errorReported=false;
  this.resetTracking();
 }
 resetTracking(){this.position=null;this.stride=0;this.pursuitClock=0;this.previousDoor=null;this.previousLoops=null}
 setEnabled(enabled){this.enabled=Boolean(enabled);if(!this.enabled){this.unlocked=false;this.stop()}}
 // Invoke synchronously from the input event, before fullscreen consumes activation.
 // Promise completion never plays a queued cue or revives paused/background audio.
 unlock(){
  if(!this.enabled)return Promise.resolve(false);
  const generation=++this.generation;
  try{
   if(!this.context||this.context.state==='closed'){
    this.context=this.createContext();this.unlocked=false;this.buffers.clear();
    this.master=this.context.createGain();this.master.gain.value=0;this.master.connect(this.context.destination);
    const context=this.context;
    context.addEventListener?.('statechange',()=>{if(this.context===context&&context.state!=='running'&&(this.unlocked||this.voices.size)){this.unlocked=false;this.stop()}});
   }
   const finish=()=>{
    if(generation!==this.generation||!this.enabled||this.context.state!=='running')return false;
    this.unlocked=true;this.errorReported=false;this.sync();return true;
   };
   if(this.context.state==='running')return Promise.resolve(finish());
   return Promise.resolve(this.context.resume()).then(finish,error=>this.fail(error,generation));
  }catch(error){return Promise.resolve(this.fail(error,generation))}
 }
 fail(error,generation){
  if(generation!==this.generation)return false;
  this.unlocked=false;this.stop();
  if(!this.errorReported){this.errorReported=true;this.onError(error)}
  return false;
 }
 ready(){return this.enabled&&this.unlocked&&this.context?.state==='running'&&this.canPlay()}
 buffer(kind){
  if(!this.buffers.has(kind)){
   const data=synthesizeCue(kind,this.context.sampleRate),buffer=this.context.createBuffer(1,data.length,this.context.sampleRate);
   buffer.getChannelData(0).set(data);this.buffers.set(kind,buffer);
  }
  return this.buffers.get(kind);
 }
 source(kind,volume=1,loop=false){
  if(!this.ready())return null;
  const source=this.context.createBufferSource(),gain=this.context.createGain();
  source.buffer=this.buffer(kind);source.loop=loop;gain.gain.value=volume;
  source.connect(gain).connect(this.master);
  const voice={source,gain,kind};this.voices.add(voice);
  source.onended=()=>{this.voices.delete(voice);source.disconnect();gain.disconnect()};
  source.start();return voice;
 }
 sync(){
  if(!this.ready()){if(this.hum||this.voices.size)this.stop();return false}
  if(!this.hum){
   const now=this.context.currentTime;this.master.gain.cancelScheduledValues(now);
   this.master.gain.setValueAtTime(0,now);this.master.gain.linearRampToValueAtTime(.8,now+.16);
   this.hum=this.source('hum',1,true);
  }
  return true;
 }
 stop(){
  ++this.generation;
  if(this.master){const now=this.context.currentTime;this.master.gain.cancelScheduledValues(now);this.master.gain.setValueAtTime(0,now)}
  for(const voice of this.voices){voice.source.onended=null;try{voice.source.stop()}catch{}voice.source.disconnect();voice.gain.disconnect()}
  this.voices.clear();this.hum=null;this.resetTracking();
 }
 cue(kind,volume=1){if(this.sync()&&this.voices.size<10)return this.source(kind,Math.min(1,Math.max(0,volume)))}
 door(){this.cue('door')}
 reset(){this.stop()}
 update(dt,game){
  if(!this.sync())return;
  const p=game.player;
  if(this.position){
   const distance=Math.hypot(p.x-this.position.x,p.z-this.position.z);
   // Teleports/folds and collisions must not generate a backlog of footfalls.
   if(distance>.001&&distance<1){this.stride+=distance;if(this.stride>=.82){this.cue('step');this.stride%=.82}}
  }
  this.position={x:p.x,z:p.z};
  if(game.entered&&!game.changed){
   this.pursuitClock+=Math.min(.05,Math.max(0,dt));
   const closeness=Math.min(1,Math.max(0,game.approach)/45);
   if(this.pursuitClock>=1.22-.4*closeness){this.cue('pursuit',.55+.35*closeness);this.pursuitClock=0}
  }else this.pursuitClock=0;
  if(this.previousDoor!==null&&this.previousDoor!==game.door&&(game.door===0||game.door===1))this.cue('latch',game.door===0?1:.55);
  if(this.previousLoops!==null&&game.loops!==this.previousLoops)this.cue('flicker',.6);
  this.previousDoor=game.door;this.previousLoops=game.loops;
 }
}
