import {seededLamps,createLightBake,doorSurroundFactor} from '../dist/lighting.js';
import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';import * as THREE from'../dist/vendor/three.module.min.js';import{Game,SIZE,CELL}from'../dist/game.js';
const source=fs.readFileSync('dist/app.js','utf8').replace("import * as THREE from './vendor/three.module.min.js';",'').replace("import {Game,SIZE,CELL} from './game.js';",'').replace("import {seededLamps,createLightBake,doorSurroundFactor} from './lighting.js';",'');
function boot(options={}){
 const {width=844,height=390,coarse=true,mobile=true,standalone=false,lock,fullscreen,platform='',userAgent}=options;
 const nodes=new Map(),listeners={},canvas2d={fillRect(){},fillText(){}},captured=new Map();
 function on(target,n,fn){(listeners[target+':'+n]??=[]).push(fn)}
 function element(id){if(!nodes.has(id))nodes.set(id,{id,hidden:id!=='menu',disabled:id==='continue',style:{},textContent:'',inert:false,isConnected:true,classList:{add(){},remove(){}},addEventListener(n,fn){on(id,n,fn)},setAttribute(){},focus(){document.activeElement=this},setPointerCapture(p){captured.set(p,id)},releasePointerCapture(p){captured.delete(p)},getContext:()=>canvas2d,getBoundingClientRect:()=>({left:22,top:200,width:112,height:112})});return nodes.get(id)}
 let frame,rendered,now=0;const document={getElementById:element,createElement:()=>element('canvas-'+nodes.size),addEventListener(n,fn){on('document',n,fn)},exitPointerLock(){},hidden:false,documentElement:{}};
 if(fullscreen)document.documentElement.requestFullscreen=()=>fullscreen(document);
 class Renderer{constructor(){if(options.graphicsFailure)throw new Error("WebGLDisabled");this.shadowMap={};}setPixelRatio(v){this.ratio=v}setSize(w,h){this.width=w;this.height=h}render(scene,camera){rendered={scene,camera}}};class Loader{load(){return new THREE.Texture()}}
 const orientation={addEventListener(n,fn){on('orientation',n,fn)}};if(lock)orientation.lock=lock;
 const context={seededLamps,createLightBake,doorSurroundFactor,THREE:{...THREE,WebGLRenderer:Renderer,TextureLoader:Loader},Game,SIZE,CELL,document,window:{screen:{orientation},visualViewport:{addEventListener(n,fn){on('viewport',n,fn)}},addEventListener(n,fn){on('window',n,fn)}},navigator:{userAgent:userAgent??(mobile?'iPhone':'Desktop'),platform,maxTouchPoints:mobile?2:0},performance:{now:()=>now},crypto:{getRandomValues:a=>{a[0]=42;return a}},matchMedia:q=>({matches:q==='(pointer:coarse)'?coarse:q==='(any-hover: hover)'?!mobile:q==='(display-mode: standalone)'?standalone:false}),innerWidth:width,innerHeight:height,devicePixelRatio:3,requestAnimationFrame:fn=>frame=fn,setTimeout:fn=>fn(),console:options.graphicsFailure?{...console,error(){}}:console,AbortController};
 vm.createContext(context);vm.runInContext(source,context);
 const dispatch=(target,n,event={})=>{for(const fn of listeners[target+':'+n]||[])fn(event)};
 return{context,element,listeners,captured,dispatch,rotate(w,h){context.innerWidth=w;context.innerHeight=h;dispatch('window','resize')},frame:t=>{now=t;frame(t)},getRender:()=>rendered,eval:s=>vm.runInContext(s,context)}
}

const results=[];
const app=boot();
for(const seed of [0,5,42,305419896,3735928559]){
 const began=performance.now();app.eval(`game.reset(${seed});build()`);const buildMs=performance.now()-began;
 let triangles=0,drawUpper=0,meshes=0,lights=0,points=0,instances=0;
 app.eval('scene').traverse(o=>{if(o.isMesh){meshes++;drawUpper+=Array.isArray(o.material)?o.geometry.groups.length:1;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;if(o.isInstancedMesh)instances+=o.count}if(o.isLight)lights++;if(o.isPointLight)points++});
 const folds=app.eval('game.maze.folds');results.push({seed,routeCells:app.eval('game.maze.route.length'),wallCount:app.eval('game.walls.length'),uniqueGeometryTriangles:triangles,sceneDrawUpperBoundIncludingHiddenItemsAndExit:drawUpper,meshes,instances,realLights:lights,pointLights:points,mockedNodeBuildMs:Math.round(buildMs)});
 assert(triangles<30000);assert(drawUpper<110);assert.equal(lights,2);assert.equal(points,0);
}
const result={scope:'Actual Three.js scene data under Node; no WebGL rasterization or GPU/mobile FPS measurement',chunkMetres:15,wallVerticalSegments:4,results};
fs.writeFileSync('evidence/expanded-maze-scene-budget.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
