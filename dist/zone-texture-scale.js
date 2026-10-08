import * as THREE from './vendor/three.module.min.js';

// These two pack materials are seamless surface swatches authored at 2m/tile.
// Deliberately exclude signs, labels, wood planks, and direction-sensitive metal.
export const WORLD_TEXTURE_METRES = Object.freeze({
 'Concrete warm aggregate': 2,
 'Blue textured paint': 2,
});

/** Bake world-aligned UVs after static zone assembly, including parent scales.
 * No shader changes, texture copies, extra draws, or per-frame work. This must
 * run before rendering, while the zone still owns its original geometries.
 * Static architecture must be remapped if subsequently moved or resized.
 */
export function applyWorldScaleTextures(root) {
 root.updateWorldMatrix(true, true);
 const replaced=new Set(), retained=new Set();
 let meshes=0,triangles=0;
 root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  // Reject mixed/atlas geometry rather than accidentally repeat a label.
  const metres=WORLD_TEXTURE_METRES[materials[0]?.name];
  if(!metres||materials.some(m=>WORLD_TEXTURE_METRES[m.name]!==metres||!m.map)){
   retained.add(mesh.geometry);return;
  }
  const original=mesh.geometry;
  const geometry=original.index?original.toNonIndexed():original.clone();
  const positions=geometry.getAttribute('position');
  const uv=new Float32Array(positions.count*2);
  // Keep UVs near zero even hundreds of metres from the entrance. Removing
  // whole tiles preserves global repeat phase without Float32 cancellation.
  const origin=new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
  const tileOrigin={x:Math.floor(origin.x/metres),y:Math.floor(origin.y/metres),z:Math.floor(origin.z/metres)};
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  const ab=new THREE.Vector3(),ac=new THREE.Vector3(),normal=new THREE.Vector3();
  for(let i=0;i<positions.count;i+=3){
   a.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
   b.fromBufferAttribute(positions,i+1).applyMatrix4(mesh.matrixWorld);
   c.fromBufferAttribute(positions,i+2).applyMatrix4(mesh.matrixWorld);
   normal.crossVectors(ab.subVectors(b,a),ac.subVectors(c,a));
   const ax=Math.abs(normal.x),ay=Math.abs(normal.y),az=Math.abs(normal.z);
   // Identical global axes on adjacent slabs avoid phase seams. Negative V
   // preserves the glTF swatch's vertical convention after Blender export.
   const axis=ay>=ax&&ay>=az?'y':ax>=az?'x':'z';
   for(const [k,p] of [a,b,c].entries()){
    const uAxis=axis==='x'?'z':'x',vAxis=axis==='y'?'z':'y';
    uv[(i+k)*2]=p[uAxis]/metres-tileOrigin[uAxis];
    uv[(i+k)*2+1]=-(p[vAxis]/metres-tileOrigin[vAxis]);
   }
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  mesh.geometry=geometry;mesh.userData.worldTextureMetres=metres;
  for(const material of materials){
   for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap','bumpMap']){
    const texture=material[key];if(!texture)continue;
    const changed=texture.wrapS!==THREE.RepeatWrapping||texture.wrapT!==THREE.RepeatWrapping;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.repeat.set(1,1);texture.offset.set(0,0);texture.rotation=0;
    if(changed)texture.needsUpdate=true;
   }
  }
  replaced.add(original);meshes++;triangles+=positions.count/3;
 });
 // Templates/clones can share a geometry. Dispose it only after every instance
 // has received a private UV buffer, and never while an excluded mesh uses it.
 for(const geometry of replaced)if(!retained.has(geometry))geometry.dispose();
 return {meshes,triangles};
}
