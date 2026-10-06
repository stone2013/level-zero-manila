// Approved V2 geometry and animation adapter. No network or glTF loader needed.
import {createShadowMesh} from './assets/cable-monster/shadow-model.js';
import {createShadowAnimator,SHADOW_CLIPS} from './assets/cable-monster/shadow-animation.js';

export const CABLE_MONSTER_CLIPS=Object.freeze({idle:{duration:0,loop:true},...SHADOW_CLIPS});

/**
 * World units are metres. Up +Y, facing -Z. Native height is about 3.05 m.
 * update(dt,{clip,speed,active}) uses seconds and a playback speed multiplier,
 * not metres/second. Position, rotation and scale remain owned by the game.
 * jumpscare is clamped at 2.6 s and never translates the root automatically.
 * update returns a reused status object: {clip,time,finished,active}.
 */
export function createCableMonster(THREE){
 const root=createShadowMesh(THREE);root.name='CableMonster_V2';root.visible=false;
 const animator=createShadowAnimator(THREE,root),mesh=animator.mesh,bones=animator.bones;
 const incoming=bones.map(b=>({position:b.position.clone(),quaternion:b.quaternion.clone(),scale:b.scale.clone()}));
 const worldPosition=new THREE.Vector3(),worldQuaternion=new THREE.Quaternion(),worldScale=new THREE.Vector3();
 const contactPoint=new THREE.Vector3(),contacts=[];
 for(let i=0;i<mesh.geometry.attributes.position.count;i++)if(mesh.geometry.attributes.position.getY(i)<.22)contacts.push(i);
 let clip='idle',time=0,blendElapsed=.12,disposed=false;
 const status={clip,time,finished:false,active:false};
 mesh.geometry.computeBoundingBox();
 root.userData.nativeBounds={min:mesh.geometry.boundingBox.min.toArray(),max:mesh.geometry.boundingBox.max.toArray(),forward:[0,0,-1],up:[0,1,0]};
 root.userData.animationState=status;
 function update(dt=0,options={}){
  if(disposed)return status;
  const active=options.active??true;
  const requested=options.clip??clip;
  if(!Object.hasOwn(CABLE_MONSTER_CLIPS,requested))throw new Error(`Unknown cable monster clip: ${requested}`);
  if(!Number.isFinite(dt)||dt<0)throw new Error('Cable monster dt must be finite and non-negative');
  const speed=options.speed??1;
  if(!Number.isFinite(speed)||speed<0)throw new Error('Cable monster speed must be finite and non-negative');
  root.visible=Boolean(active);status.active=Boolean(active);
  // Hiding freezes the current animation. Switching the requested clip while
  // hidden is remembered; it starts from zero when the creature is shown.
  if(requested!==clip){
   bones.forEach((b,i)=>{incoming[i].position.copy(b.position);incoming[i].quaternion.copy(b.quaternion);incoming[i].scale.copy(b.scale)});
   clip=requested;time=0;blendElapsed=0;
  }
  status.clip=clip;
  if(!active){status.time=time;status.finished=clip==='jumpscare'&&time>=SHADOW_CLIPS.jumpscare.duration;return status}
  const delta=Math.min(dt,.1),duration=CABLE_MONSTER_CLIPS[clip].duration;
  time+=delta*Math.min(speed,3);
  if(clip==='jumpscare')time=Math.min(time,duration);
  else if(duration>0)time%=duration;
  else time=0;
  worldPosition.copy(root.position);worldQuaternion.copy(root.quaternion);worldScale.copy(root.scale);
  if(clip==='idle')animator.reset();else animator.sample(clip,time,{rootMotion:false});
  // Short deterministic crossfade between poses, with no mixing of movement
  // or scene coordinates. Skeleton updates remain local until the final step.
  blendElapsed+=delta;
  if(blendElapsed<.12){const x=blendElapsed/.12,w=x*x*(3-2*x);bones.forEach((b,i)=>{b.position.lerpVectors(incoming[i].position,b.position,w);b.quaternion.slerp(incoming[i].quaternion,1-w);b.scale.lerpVectors(incoming[i].scale,b.scale,w)});
   root.updateMatrixWorld(true);mesh.skeleton.update();
   let minY=Infinity;for(const i of contacts){contactPoint.fromBufferAttribute(mesh.geometry.attributes.position,i);mesh.applyBoneTransform(i,contactPoint);minY=Math.min(minY,contactPoint.y)}
   if(minY<.006)bones[0].position.y+=.006-minY;
  }
  root.position.copy(worldPosition);root.quaternion.copy(worldQuaternion);root.scale.copy(worldScale);
  root.updateMatrixWorld(true);mesh.skeleton.update();
  status.time=time;status.finished=clip==='jumpscare'&&time>=duration;
  return status;
 }
 function dispose(){
  if(disposed)return;disposed=true;root.visible=false;status.active=false;
  root.removeFromParent();mesh.geometry.dispose();
  for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.dispose();
  mesh.skeleton.dispose();root.clear();
 }
 return {root,update,dispose};
}
