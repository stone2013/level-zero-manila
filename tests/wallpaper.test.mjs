import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../dist/vendor/three.module.min.js';
const source=fs.readFileSync('dist/app.js','utf8');
function materials(){
 const mat={wall:new THREE.MeshBasicMaterial({map:new THREE.Texture(),vertexColors:true}),floor:new THREE.MeshBasicMaterial(),ceiling:new THREE.MeshBasicMaterial()};
 const context={THREE,mat};vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('// WALLPAPER_FADE_BEGIN:'),source.indexOf('// WALLPAPER_FADE_END')),context);
 const shader={uniforms:{},fragmentShader:THREE.ShaderLib.basic.fragmentShader};mat.wall.onBeforeCompile(shader);
 return{mat,shader,contrast:vm.runInContext('WALLPAPER_CONTRAST',context),paper:shader.uniforms.wallpaperPaper.value};
}
test('wall-only shader halves albedo contrast before vertex lighting without another texture sample',()=>{
 const {mat,shader,contrast}=materials(),fragment=shader.fragmentShader;
 assert.equal(contrast,.5);assert.equal(shader.uniforms.wallpaperContrast.value,.5);
 assert.equal((fragment.match(/mix\( wallpaperPaper, sampledDiffuseColor\.rgb, wallpaperContrast \)/g)||[]).length,1);
 assert.equal((fragment.match(/texture2D\( map, vMapUv \)/g)||[]).length,1);
 assert(fragment.indexOf('mix( wallpaperPaper')<fragment.indexOf('diffuseColor *= sampledDiffuseColor;'));
 assert(fragment.indexOf('diffuseColor *= sampledDiffuseColor;')<fragment.indexOf('#include <color_fragment>'));
 assert(fragment.includes('#include <tonemapping_fragment>'));assert(fragment.includes('#include <colorspace_fragment>'));assert(fragment.includes('#include <fog_fragment>'));
 assert.equal(mat.wall.opacity,1);assert.equal(mat.wall.transparent,false);assert.equal(mat.wall.vertexColors,true);assert.equal(mat.wall.color.getHex(),0xffffff);
 assert.equal(mat.floor.onBeforeCompile,THREE.Material.prototype.onBeforeCompile);assert.equal(mat.ceiling.onBeforeCompile,THREE.Material.prototype.onBeforeCompile);
 assert.notEqual(mat.wall.customProgramCacheKey(),mat.floor.customProgramCacheKey());
 assert.equal(materials().mat.wall.customProgramCacheKey(),mat.wall.customProgramCacheKey());
});
test('sampled yellow paper is converted once from sRGB and is unchanged by the 50% mix',()=>{
 const {paper,contrast}=materials(),rgb=[153,122,33];assert.equal(paper.getHex(),0x997a21);
 const linear=c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4};
 for(const [i,c] of ['r','g','b'].entries()){
  assert(Math.abs(paper[c]-linear(rgb[i]))<1e-7);
  assert.equal(paper[c]+(paper[c]-paper[c])*contrast,paper[c]);
 }
 assert(source.includes('t.colorSpace=THREE.SRGBColorSpace'));assert(THREE.ColorManagement.enabled);
});
test('every channel difference from paper is exactly halved with bounded output, including baked light',()=>{
 const {paper,contrast}=materials();
 for(const rgb of [[0,0,0],[1,1,1],[.25,.16,.025],[paper.r,paper.g,paper.b],[.01,.002,.91]]){
  for(const [i,c] of ['r','g','b'].entries()){
   const result=paper[c]+(rgb[i]-paper[c])*contrast;
   assert(result>=0&&result<=1);assert(Math.abs((result-paper[c])-.5*(rgb[i]-paper[c]))<1e-15);
   for(const light of [.2,.55,.9])assert(Math.abs((result*light-paper[c]*light)-.5*(rgb[i]*light-paper[c]*light))<1e-15);
  }
 }
});
test('patch uses the pinned Three.js map shader and does not change alpha or light bake',()=>{
 const {shader}=materials();assert.equal((THREE.ShaderChunk.map_fragment.match(/diffuseColor \*= sampledDiffuseColor;/g)||[]).length,1);
 const unpatched=shader.fragmentShader.replace('uniform vec3 wallpaperPaper;\nuniform float wallpaperContrast;\n','').replace('sampledDiffuseColor.rgb = mix( wallpaperPaper, sampledDiffuseColor.rgb, wallpaperContrast );\n\t','');
 assert.equal(unpatched,THREE.ShaderLib.basic.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment));
 assert(!shader.fragmentShader.includes('sampledDiffuseColor.a ='));
});
