import test from 'node:test';
import assert from 'node:assert/strict';
import {GameAudio} from '../dist/audio.js';
import {FakeAudioContext,gameState} from './audio-harness.mjs';
import {Game} from '../dist/game.js';
class StereoContext extends FakeAudioContext{createStereoPanner(){return{pan:{value:0},connect(to){return to},disconnect(){this.disconnected=true}}}}
test('L1 approach is directional, warning cues once, darkness reduces hum and restoration cancels pursuit',async()=>{
 const context=new StereoContext(),audio=new GameAudio({createContext:()=>context}),g=gameState();g.zone='level1';g.level1={phase:'warning',danger:{active:true,x:5,z:0}};g.player={x:0,z:0,yaw:0};await audio.unlock();
 for(let i=0;i<19;i++)audio.update(.05,g);
 assert.equal([...audio.voices].filter(v=>v.kind==='flicker').length,1);const approach=[...audio.voices].find(v=>v.kind==='pursuit');assert(approach);assert.equal(approach.panner.pan.value,1);assert.equal(audio.hum.gain.gain.value,.6);
 g.level1.phase='dark';audio.update(.05,g);assert.equal(audio.hum.gain.gain.value,.12);
 g.level1.phase='lit';g.level1.danger.active=false;audio.update(.05,g);assert.equal(audio.hum.gain.gain.value,1);assert([...audio.voices].every(v=>v.kind!=='pursuit'));assert(approach.source.stopped);
});
test('navigation preparation changes neither playable state nor item identities',()=>{
 const g=new Game(7);g.start();g.transitionZone('level1');const before=g.snapshot(),items=[...g.items],danger=g.level1.danger;g.prepareLevelOne();assert.deepEqual(g.snapshot(),before);assert.strictEqual(g.level1.danger,danger);g.items.forEach((v,i)=>assert.strictEqual(v,items[i]));
});
