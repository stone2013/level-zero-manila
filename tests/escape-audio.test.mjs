import test from 'node:test';import assert from 'node:assert/strict';
import {GameAudio} from '../dist/audio.js';import {FakeAudioContext} from './audio-harness.mjs';
class StereoContext extends FakeAudioContext{
 constructor(){super();this.panners=[]}
 createStereoPanner(){const p={pan:{value:0},connect(to){this.target=to;return to},disconnect(){this.disconnected=true}};this.panners.push(p);return p}
}
test('escape footsteps use relative stereo position, stop during dark/loading and cancel at a fully closed door',async()=>{
 const context=new StereoContext(),audio=new GameAudio({createContext:()=>context});await audio.unlock();
 const game={player:{x:0,z:0,yaw:0},door:1,entered:false,changed:false,loops:0,escape:{phase:'chase',monster:{x:4,z:4,active:true}}};
 for(let i=0;i<10;i++)audio.update(.05,game);
 const voice=[...audio.voices].find(v=>v.kind==='pursuit');assert(voice);assert(voice.panner.pan.value>.6&&voice.panner.pan.value<.8);
 game.changed=true;game.escape.phase='finished';game.escape.monster.active=false;audio.update(.05,game);assert.equal([...audio.voices].filter(v=>v.kind==='pursuit').length,0);assert(voice.source.stopped);assert(voice.panner.disconnected);
 game.changed=false;game.escape.phase='blackout';audio.update(.05,game);assert.equal(audio.voices.size,0);assert.equal(audio.master.gain.value,0);
 audio.stop();
});
test('escape stereo fallback works where a browser has no StereoPannerNode',async()=>{
 const context=new FakeAudioContext(),audio=new GameAudio({createContext:()=>context});await audio.unlock();
 const game={player:{x:0,z:0,yaw:0},door:0,entered:false,changed:false,loops:0,escape:{phase:'chase',monster:{x:0,z:8,active:true}}};for(let i=0;i<10;i++)audio.update(.05,game);assert([...audio.voices].some(v=>v.kind==='pursuit'));audio.stop();assert.equal(audio.voices.size,0);
});
