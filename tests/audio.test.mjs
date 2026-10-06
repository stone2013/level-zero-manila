import test from 'node:test';
import assert from 'node:assert/strict';
import {GameAudio,synthesizeCue} from '../dist/audio.js';
import {FakeAudioContext,gameState} from './audio-harness.mjs';
function setup(){const context=new FakeAudioContext(),errors=[],state={active:true};const audio=new GameAudio({createContext:()=>context,canPlay:()=>state.active,onError:e=>errors.push(e)});return{audio,context,errors,state}}
function energy(data){let sum=0,peak=0,difference=0;for(let i=0;i<data.length;i++){assert(Number.isFinite(data[i]));peak=Math.max(peak,Math.abs(data[i]));sum+=data[i]**2;if(i)difference+=(data[i]-data[i-1])**2}return{rms:Math.sqrt(sum/data.length),peak,difference:Math.sqrt(difference/data.length)}}
test('all six synthesized cues produce nonzero, bounded PCM at common device sample rates',()=>{
 for(const rate of [22050,44100,48000])for(const cue of ['hum','step','pursuit','door','latch','flicker']){
  const pcm=synthesizeCue(cue,rate),e=energy(pcm);assert(pcm.length>rate*.1);assert(e.rms>.008,`${cue}: ${e.rms}`);assert(e.peak<.31);assert(pcm[0]===0);
  if(cue!=='hum'){assert(e.difference>.001,`${cue} has mid/high transient content`);assert(Math.abs(pcm.at(-1))<.003)}
 }
 assert.throws(()=>synthesizeCue('unknown'));
});
test('construction stays silent; unlock resumes in the same call and fades one bounded hum',async()=>{
 const {audio,context}=setup();assert.equal(audio.context,null);const result=audio.unlock();assert.equal(context.resumeCalls,1);assert.equal(context.sources.length,0);
 assert.equal(await result,true);assert.equal(context.sources.length,1);assert.equal(audio.voices.size,1);assert(context.sources[0].loop);assert.equal(context.sources[0].target.target,audio.master);
 assert.deepEqual(audio.master.gain.events.at(-1),['ramp',.8,.16]);
 for(let i=0;i<6;i++)await audio.unlock();assert.equal(context.sources.length,1);assert.equal(context.resumeCalls,1);
});
test('resume rejection is caught, reported once, and cannot emit queued sounds',async()=>{
 const {audio,context,errors}=setup();context.resume=()=>Promise.reject(Error('denied'));
 assert.equal(await audio.unlock(),false);audio.door();audio.update(.05,gameState());assert.equal(context.sources.length,0);assert.equal(errors.length,1);
 assert.equal(await audio.unlock(),false);assert.equal(errors.length,1);
 context.resume=FakeAudioContext.prototype.resume;assert.equal(await audio.unlock(),true);audio.door();assert.equal(context.sources.length,2);assert.equal(audio.errorReported,false);
});
test('synchronous constructor/resume failures and unsupported Web Audio fail quietly',async()=>{
 for(const createContext of [()=>{throw Error('unsupported')},()=>Object.assign(new FakeAudioContext(),{resume(){throw Error('blocked')}})]){const errors=[];const audio=new GameAudio({createContext,onError:e=>errors.push(e)});assert.equal(await audio.unlock(),false);assert.equal(errors.length,1);audio.update(.05,gameState());assert.equal(audio.voices.size,0)}
});
test('late resume completion after pause, mute or background never starts audio',async()=>{
 for(const stop of ['pause','mute','background']){
  const {audio,context,state}=setup();let resolve;context.resume=()=>new Promise(r=>resolve=r);const pending=audio.unlock();
  if(stop==='mute')audio.setEnabled(false);else{state.active=false;audio.stop()}
  context.state='running';resolve();assert.equal(await pending,false);assert.equal(context.sources.length,0);assert.equal(audio.unlocked,false);
  state.active=true;audio.update(.05,gameState());assert.equal(context.sources.length,0);
 }
});
test('a stale rejected resume cannot silence a newer successful gesture',async()=>{
 const {audio,context,errors}=setup();let reject;context.resume=()=>new Promise((_,r)=>reject=r);const old=audio.unlock();context.state='running';await audio.unlock();reject(Error('stale'));assert.equal(await old,false);assert.equal(audio.voices.size,1);assert.equal(errors.length,0);
});
test('pause and mute immediately cancel active voices and master output, then resume cleanly',async()=>{
 const {audio,context,state}=setup();await audio.unlock();audio.door();assert.equal(audio.voices.size,2);
 state.active=false;audio.stop();assert.equal(audio.master.gain.value,0);assert.equal(audio.voices.size,0);assert(context.sources.every(s=>s.stopped&&s.disconnected));
 state.active=true;await audio.unlock();assert.equal(audio.voices.size,1);audio.setEnabled(false);assert.equal(audio.master.gain.value,0);assert.equal(audio.voices.size,0);assert.equal(await audio.unlock(),false);
 audio.setEnabled(true);await audio.unlock();assert.equal(audio.voices.size,1);
});
test('external interruption stops sound and requires another gesture to resume',async()=>{
 const {audio,context}=setup();await audio.unlock();context.stateChange('interrupted');assert.equal(audio.voices.size,0);assert.equal(audio.unlocked,false);
 context.stateChange('running');audio.update(.05,gameState());assert.equal(audio.voices.size,0);await audio.unlock();assert.equal(audio.voices.size,1);
});
test('only travelled distance makes footsteps; pursuit has its own cadence; door endpoints latch once',async()=>{
 const {audio,context}=setup();await audio.unlock();const game=gameState();audio.update(.05,game);
 for(let i=0;i<30;i++)audio.update(.05,game);assert.equal(context.sources.length,1);
 for(let i=0;i<10;i++){game.player.x+=.1;audio.update(.05,game)}assert.equal([...audio.voices].filter(v=>v.kind==='step').length,1);
 game.player.x+=10;audio.update(.05,game);assert.equal([...audio.voices].filter(v=>v.kind==='step').length,1);
 game.entered=true;for(let i=0;i<25;i++){game.player.x+=.03;audio.update(.05,game)}assert.equal([...audio.voices].filter(v=>v.kind==='pursuit').length,1);assert.equal([...audio.voices].filter(v=>v.kind==='step').length,2,'walking and pursuit have independent clocks');
 game.changed=true;for(let i=0;i<30;i++)audio.update(.05,game);assert.equal([...audio.voices].filter(v=>v.kind==='pursuit').length,1);
 audio.door();game.door=.5;audio.update(.05,game);game.door=1;audio.update(.05,game);audio.update(.05,game);assert.equal([...audio.voices].filter(v=>v.kind==='latch').length,1);
 game.loops++;audio.update(.05,game);assert.equal([...audio.voices].filter(v=>v.kind==='flicker').length,1);
});
test('repeated clicks are bounded, ended voices release nodes, and reset has no stale cadence',async()=>{
 const {audio,context}=setup();await audio.unlock();for(let i=0;i<50;i++)audio.door();assert.equal(audio.voices.size,10);
 const ended=context.sources[1];ended.onended();assert.equal(audio.voices.size,9);assert(ended.disconnected);audio.reset();assert.equal(audio.voices.size,0);
 audio.update(.05,gameState());assert.equal(audio.voices.size,1);assert.equal(audio.stride,0);assert.equal(audio.pursuitClock,0);
});
