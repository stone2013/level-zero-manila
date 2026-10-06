import {FakeAudioContext} from './audio-harness.mjs';
import {GameAudio} from '../dist/audio.js';
import {RenderChunkStream,RENDER_CELLS,RENDER_METRES} from '../dist/world.js';
import {seededLamps,createLightBake,doorSurroundFactor} from '../dist/lighting.js';
import fs from'node:fs';import vm from'node:vm';import * as THREE from'../dist/vendor/three.module.min.js';import{Game,SIZE,CELL}from'../dist/game.js';
const source=fs.readFileSync('dist/app.js','utf8').replace("import * as THREE from './vendor/three.module.min.js';",'').replace("import {Game,SIZE,CELL} from './game.js';",'').replace("import {GameAudio} from './audio.js';",'').replace("import {RenderChunkStream,RENDER_CELLS,RENDER_METRES} from './world.js';",'').replace("import {seededLamps,createLightBake,doorSurroundFactor} from './lighting.js';",'');
export function boot(options={}){
 const {width=844,height=390,coarse=true,mobile=true,standalone=false,lock,fullscreen,platform='',userAgent}=options;
 const nodes=new Map(),listeners={},canvas2d={fillRect(){},fillText(){}},captured=new Map();
 function on(target,n,fn){(listeners[target+':'+n]??=[]).push(fn)}
 function element(id){
  if(!nodes.has(id)){
   const classes=new Set();let nodeId=id;
   const node={hidden:id!=='menu',disabled:id==='continue',style:{},dataset:{},children:[],textContent:'',inert:false,isConnected:true,tabIndex:0,
    classList:{add(...v){v.forEach(x=>classes.add(x))},remove(...v){v.forEach(x=>classes.delete(x))},toggle(v,on){if(on===undefined)on=!classes.has(v);on?classes.add(v):classes.delete(v)},contains(v){return classes.has(v)}},
    addEventListener(n,fn){on(nodeId,n,fn)},setAttribute(n,v){this[n]=v},focus(){document.activeElement=this},append(...children){for(const child of children){child.parentElement=this;this.children.push(child)}},
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.isConnected=false},
    setPointerCapture(p){captured.set(p,nodeId)},releasePointerCapture(p){captured.delete(p)},getContext:()=>canvas2d,
    getBoundingClientRect(){
     if(nodeId==='backpack-card')return{left:80,top:20,right:760,bottom:370,width:680,height:350};
     if(nodeId==='inventory-grid')return{left:100,top:80,right:380,bottom:360,width:280,height:280};
     if(this.dataset.itemId){const x=parseInt(this.style.gridColumn)-1,y=parseInt(this.style.gridRow)-1,h=this.dataset.kind==='water'?140:70;return{left:100+x*70,top:80+y*70,right:170+x*70,bottom:80+y*70+h,width:70,height:h}}
     return{left:22,top:200,right:134,bottom:312,width:112,height:112};
    }};
   Object.defineProperty(node,'id',{get:()=>nodeId,set:v=>{nodes.delete(nodeId);nodeId=v;nodes.set(v,node)}});nodes.set(id,node);
  }
  return nodes.get(id);
 }
 let frame,rendered,now=0;const document={getElementById:element,createElement:()=>element('canvas-'+nodes.size),addEventListener(n,fn){on('document',n,fn)},exitPointerLock(){},hidden:false,documentElement:{}};
 if(fullscreen)document.documentElement.requestFullscreen=()=>fullscreen(document);
 class Renderer{constructor(){if(options.graphicsFailure)throw new Error("WebGLDisabled");this.shadowMap={};}setPixelRatio(v){this.ratio=v}setSize(w,h){this.width=w;this.height=h}render(scene,camera){rendered={scene,camera}}};class Loader{load(){return new THREE.Texture()}}
 const orientation={addEventListener(n,fn){on('orientation',n,fn)}};if(lock)orientation.lock=lock;
 const context={GameAudio,RenderChunkStream,RENDER_CELLS,RENDER_METRES,seededLamps,createLightBake,doorSurroundFactor,THREE:{...THREE,WebGLRenderer:Renderer,TextureLoader:Loader},Game:options.Game||Game,SIZE,CELL,document,window:{AudioContext:Object.hasOwn(options,'AudioContext')?options.AudioContext:FakeAudioContext,screen:{orientation},visualViewport:{addEventListener(n,fn){on('viewport',n,fn)}},addEventListener(n,fn){on('window',n,fn)}},navigator:{userAgent:userAgent??(mobile?'iPhone':'Desktop'),platform,maxTouchPoints:mobile?2:0},performance:{now:()=>now},crypto:{getRandomValues:a=>{a[0]=42;return a}},matchMedia:q=>({matches:q==='(pointer:coarse)'?coarse:q==='(any-hover: hover)'?!mobile:q==='(display-mode: standalone)'?standalone:false}),innerWidth:width,innerHeight:height,devicePixelRatio:3,requestAnimationFrame:fn=>frame=fn,setTimeout:fn=>fn(),console:options.graphicsFailure?{...console,error(){}}:console,AbortController};
 vm.createContext(context);vm.runInContext(options.sourceOverride||source,context);
 if(options.lightweightStreaming&&!options.graphicsFailure)vm.runInContext(`createRenderChunk=(x,z)=>{const group=new THREE.Group();group.userData.chunkKey=x+','+z;mazeGroup.add(group);return{value:group,iterator:(function*(){group.visible=true})()}};chunkStream.create=createRenderChunk`,context);
 function settle(){if(options.graphicsFailure)return;vm.runInContext('(()=>{let guard=0;while(worldLoading&&!viewOverflow&&guard++<100){chunkStream.process(Infinity,100000);updateStreamView()}})()',context)}
 if(options.autoLoad!==false&&!options.graphicsFailure){settle();for(const id of ['start','restart','again']){const original=element(id).onclick;element(id).onclick=(...args)=>{const result=original(...args);settle();return result}}}
 const dispatch=(target,n,event={})=>{for(const fn of listeners[target+':'+n]||[])fn(event)};
 return{context,element,listeners,captured,dispatch,settle,rotate(w,h){context.innerWidth=w;context.innerHeight=h;dispatch('window','resize')},frame:t=>{now=t;frame(t)},getRender:()=>rendered,eval:s=>vm.runInContext(s,context)}
}

// DOM/input-only suites can omit expensive world meshes. Rendering suites use boot.
export function bootControls(options={}){return boot({...options,lightweightStreaming:true})}
