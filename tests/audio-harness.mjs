export class FakeAudioContext{
 constructor(){this.state='suspended';this.currentTime=0;this.sampleRate=24000;this.destination={};this.sources=[];this.gains=[];this.listeners={};this.resumeCalls=0}
 addEventListener(name,fn){this.listeners[name]=fn}
 stateChange(state){this.state=state;this.listeners.statechange?.()}
 resume(){this.resumeCalls++;this.stateChange('running');return Promise.resolve()}
 createGain(){const param={value:0,events:[],cancelScheduledValues(t){this.events.push(['cancel',t])},setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t])},linearRampToValueAtTime(v,t){this.value=v;this.events.push(['ramp',v,t])}},node={gain:param,connect(target){this.target=target;return target},disconnect(){this.disconnected=true}};this.gains.push(node);return node}
 createBuffer(channels,length,sampleRate){const data=new Float32Array(length);return{length,sampleRate,getChannelData:()=>data}}
 createBufferSource(){const source={buffer:null,loop:false,started:false,stopped:false,connect(target){this.target=target;return target},disconnect(){this.disconnected=true},start(){this.started=true},stop(){this.stopped=true;this.onended?.()}};this.sources.push(source);return source}
}
export const gameState=()=>({player:{x:0,z:0},entered:false,changed:false,approach:0,door:0,loops:0});
export const flush=async()=>{await Promise.resolve();await Promise.resolve()};
