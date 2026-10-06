import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,bootControls} from './app-harness.mjs';

// The actual application and, where noted, real Three.js geometry run here.
// Renderer calls are mocked: these are buffer-lifecycle checks, not GPU images.
const read=(app,expression)=>JSON.parse(app.eval(`JSON.stringify(${expression})`));
function recordRendererCalls(app){
 app.eval(`globalThis.resizeCalls=[];
  const originalRatio=renderer.setPixelRatio.bind(renderer),originalSize=renderer.setSize.bind(renderer),originalRender=renderer.render.bind(renderer);
  renderer.setPixelRatio=value=>{resizeCalls.push(['ratio',value]);originalRatio(value)};
  renderer.setSize=(width,height,style)=>{resizeCalls.push(['size',width,height,style]);originalSize(width,height,style)};
  renderer.render=(scene,camera)=>{resizeCalls.push(['render',camera.aspect]);originalRender(scene,camera)};`);
}
function freezeBuilds(app){app.eval('globalThis.resizeProcess=chunkStream.process;chunkStream.process=()=>0')}
function finishBuilds(app){app.eval('chunkStream.process=resizeProcess');app.settle()}
function assertFinalResize(app,width,height){
 const calls=read(app,'resizeCalls');
 assert.deepEqual(calls.map(call=>call[0]),['ratio','size','render']);
 assert.equal(calls[0][1],app.eval(`pixelRatio(${width},${height},devicePixelRatio,coarse,renderScale)`));
 assert.deepEqual(calls[1],['size',width,height,false]);
 assert.equal(calls[2][1],width/height);
 assert.equal(app.eval('pendingRendererSize'),null);
}

test('initial buffer size waits for the first complete world presentation',()=>{
 const app=bootControls({autoLoad:false});recordRendererCalls(app);freezeBuilds(app);
 assert.equal(app.eval('renderer.width'),undefined);assert.equal(app.eval('renderer.ratio'),undefined);
 assert.equal(app.eval('pendingRendererSize.width'),844);assert.equal(app.eval('camera.aspect'),844/390);
 app.frame(100);assert.equal(app.eval('worldLoading'),true);assert.deepEqual(read(app,'resizeCalls'),[]);
 assert.equal(app.element('world').style.visibility,'hidden');
 finishBuilds(app);assert.deepEqual(read(app,'resizeCalls'),[]);app.frame(116);
 assertFinalResize(app,844,390);assert.equal(app.element('world').style.visibility,'visible');
});

test('cold real-geometry resize keeps the previous buffer until a complete resized view renders',()=>{
 const app=boot();app.frame(100);recordRendererCalls(app);freezeBuilds(app);
 const prior=read(app,'({width:renderer.width,height:renderer.height,ratio:renderer.ratio})');
 app.rotate(1600,400);app.eval('updateStreamView()');
 assert.equal(app.eval('camera.aspect'),4);assert.equal(app.eval('worldLoading'),true);
 assert(app.eval('chunkStream.stats().pending')>0);assert.equal(app.eval('worldRendered'),true);
 app.frame(116);
 assert.deepEqual(read(app,'resizeCalls'),[]);
 assert.deepEqual(read(app,'({width:renderer.width,height:renderer.height,ratio:renderer.ratio})'),prior);
 assert.equal(app.element('world').style.visibility,'visible');
 finishBuilds(app);assert.equal(app.eval('worldLoading'),false);assert.deepEqual(read(app,'resizeCalls'),[]);
 app.frame(200);assertFinalResize(app,1600,400);
});

test('repeated resize and quality changes coalesce into only the latest render dimensions',()=>{
 const app=bootControls();app.frame(100);recordRendererCalls(app);
 app.rotate(1200,400);app.rotate(1000,400);app.element('quality-toggle').onclick();
 assert.deepEqual(read(app,'resizeCalls'),[]);assert.equal(app.eval('renderer.width'),844);
 assert.equal(app.eval('pendingRendererSize.width'),1000);assert.equal(app.eval('renderScale'),.75);
 assert.equal(app.eval('camera.aspect'),2.5);
 app.eval('updateStreamView()');app.settle();app.frame(200);assertFinalResize(app,1000,400);
 app.eval('resizeCalls.length=0');app.frame(400);assert.deepEqual(read(app,'resizeCalls'),[['render',2.5]]);
});

test('quality toggling during a throttled frame never clears the buffer without rendering',()=>{
 const app=bootControls();app.frame(100);recordRendererCalls(app);
 app.element('quality-toggle').onclick();app.frame(110);
 assert.equal(app.eval('worldLoading'),false);assert.deepEqual(read(app,'resizeCalls'),[]);
 assert(app.eval('pendingRendererSize'));app.frame(181);assertFinalResize(app,844,390);
});

test('portrait and hidden interruptions preserve the buffer and apply the final landscape size on return',()=>{
 const app=bootControls();app.frame(100);recordRendererCalls(app);
 app.rotate(390,844);app.frame(200);assert.equal(app.eval('orientationBlocked'),true);
 assert.deepEqual(read(app,'resizeCalls'),[]);assert.equal(app.eval('renderer.width'),844);
 app.context.document.hidden=true;app.rotate(1200,400);app.frame(300);
 assert.deepEqual(read(app,'resizeCalls'),[]);assert.equal(app.eval('pendingRendererSize.width'),1200);
 app.context.document.hidden=false;app.eval('updateStreamView()');app.settle();app.frame(400);
 assertFinalResize(app,1200,400);
});

test('graphics initialization failure keeps resize and quality controls safe without a renderer',()=>{
 const app=bootControls({graphicsFailure:true});
 assert.doesNotThrow(()=>{app.rotate(1200,400);app.element('quality-toggle').onclick()});
 assert.equal(app.eval('pendingRendererSize'),null);assert.equal(app.eval('graphicsReady'),false);
 assert.equal(app.element('start').disabled,true);
});
