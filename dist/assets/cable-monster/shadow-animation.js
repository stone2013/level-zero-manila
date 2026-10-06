// Animation-only extension for the approved revision-2 cable-frame model.
// Forward = -Z, units = metres. Root locomotion speed is controlled by the game.
export const SHADOW_CLIPS = Object.freeze({
 walk: { duration: 1.5, loop: true, nominalStride: .56 },
 chase_run: { duration: .75, loop: true, nominalStride: 1.05 },
 jumpscare: { duration: 2.6, loop: false, rootMotion: 'optional -Z lunge' },
});
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const lerp=(a,b,t)=>a+(b-a)*t;
export function createShadowAnimator(THREE, root) {
 const mesh=root.children.find(x=>x.isSkinnedMesh);
 if(!mesh || root.userData.modelStats?.revision!==2) throw Error('Requires the approved V2 skinned mesh');
 const bones=mesh.skeleton.bones, b=Object.fromEntries(bones.map(x=>[x.name,x]));
 const rest=bones.map(x=>({position:x.position.clone(),quaternion:x.quaternion.clone(),scale:x.scale.clone()}));
 const rootRest={position:root.position.clone(),quaternion:root.quaternion.clone(),scale:root.scale.clone()};
 const contactVertices=[];for(let i=0;i<mesh.geometry.attributes.position.count;i++)if(mesh.geometry.attributes.position.getY(i)<.22)contactVertices.push(i);const contactPoint=new THREE.Vector3();
 function reset(){bones.forEach((x,i)=>{x.position.copy(rest[i].position);x.quaternion.copy(rest[i].quaternion);x.scale.copy(rest[i].scale)});root.position.copy(rootRest.position);root.quaternion.copy(rootRest.quaternion);root.scale.copy(rootRest.scale);root.updateMatrixWorld(true);mesh.skeleton.update()}
 function update(){root.updateMatrixWorld(true);mesh.skeleton.update()}
 // Sagittal two-link foot targeting: preserves the original crooked x shape.
 function leg(side, footZ, lift, hipHeight) {
  const hip=b[`hip.${side}`],knee=b[`knee.${side}`],ankle=b[`ankle.${side}`];
  const l1=Math.hypot(knee.position.y,knee.position.z),l2=Math.hypot(ankle.position.y,ankle.position.z);
  const beta1=Math.atan2(-knee.position.z,-knee.position.y),beta2=Math.atan2(-ankle.position.z,-ankle.position.y);
  const dy=hipHeight-(.073+lift),dz=-footZ,d=Math.min(l1+l2-.001,Math.hypot(dy,dz));
  const a=Math.atan2(dz,dy)+Math.acos(clamp((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1));
  const k=-Math.acos(clamp((d*d-l1*l1-l2*l2)/(2*l1*l2),-1,1));
  hip.rotation.x=a-beta1;knee.rotation.x=k+beta1-beta2;ankle.rotation.x=-(hip.rotation.x+knee.rotation.x);
 }
 function locomotion(clip,time){
  const run=clip==='chase_run',dur=SHADOW_CLIPS[clip].duration,p=((time/dur)%1+1)%1,tau=p*Math.PI*2;
  const stance=run?.48:.62,stride=run?.78:.43,height=run?.27:.12;
  b.pelvis.position.y=run?1.155+Math.pow(Math.sin(tau),2)*.048:1.18+Math.cos(tau*2)*.010;
  b.pelvis.rotation.z=Math.sin(tau)*(run?.025:.032);
  b.spine.rotation.x=run?-.135:-.035;b.spine.rotation.y=Math.sin(tau)*(run?.06:.032);
  b.shoulders.rotation.y=-Math.sin(tau)*(run?.085:.04);
  b.shoulders.rotation.z=-b.pelvis.rotation.z*.65;
  b.head.rotation.x=(run?.09:.025)+Math.sin(tau-.6)*.018;
  b.head.rotation.y=-Math.sin(tau-.4)*.036;b.head.rotation.z=Math.sin(tau-.65)*.026;
  for(const side of [-1,1]){
   const q=(p+(side===1?.5:0))%1;
   let z,lift;
   if(q<stance){z=lerp(-stride/2,stride/2,q/stance);lift=0}
   else{const s=(q-stance)/(1-stance);z=lerp(stride/2,-stride/2,smooth(s));lift=height*Math.sin(Math.PI*s)}
   leg(side,z,lift,b.pelvis.position.y-.06);
   const armPhase=Math.cos(q*Math.PI*2);
   b[`arm.${side}`].rotation.x=(run?.19:.025)-armPhase*(run?.57:.24);
   b[`arm.${side}`].rotation.z=side*(run?.035:.018);
   b[`elbow.${side}`].rotation.x=(run?.22:.07)+Math.max(0,armPhase)*(run?.22:.08);
   b[`wrist.${side}`].rotation.x=-.035+Math.sin(q*Math.PI*2-.55)*(run?.085:.045);
   b[`wrist.${side}`].rotation.z=side*.026;
  }
 }
 function jumpscare(time,rootMotion){
  const t=clamp(time,0,2.6);
  // 0-.5 stalk; .5-.85 anticipation; .85-1.28 strike; 1.28+ hold/recoil.
  const crouch=smooth((t-.34)/.42),strike=smooth((t-.83)/.45),settle=smooth((t-1.38)/.52);
  const c=crouch*(1-strike),reach=strike*(1-.09*settle);
  b.pelvis.position.y=1.18-.19*c+.03*Math.sin(Math.PI*strike)-.035*settle;
  b.pelvis.rotation.z=-.025*c+.038*reach;
  b.spine.rotation.x=-.035+.055*c-.25*reach;
  b.shoulders.rotation.x=.025*c-.055*reach;
  b.shoulders.rotation.y=.05*c-.09*reach;
  b.head.rotation.x=.025-.075*c+.18*reach;
  b.head.rotation.y=.035*c+.04*reach;
  b.head.rotation.z=-.06*c+.09*reach;
  for(const side of [-1,1]){
   const q=side===-1?1:-1;
   leg(side,lerp(q*.09,q*.22,strike),side===1?.12*Math.sin(Math.PI*strike):0,b.pelvis.position.y-.06);
   b[`arm.${side}`].rotation.x=-.09-.20*c+(side===-1?1.33:1.12)*reach;
   b[`arm.${side}`].rotation.z=side*(.018+.07*c+.12*reach);
   b[`elbow.${side}`].rotation.x=.06+.10*c+.16*reach;
   b[`wrist.${side}`].rotation.x=-.08*reach;
   b[`wrist.${side}`].rotation.z=side*.10*reach;
  }
  if(rootMotion) root.position.z=rootRest.position.z-1.60*strike;
 }
 function sample(name,time,{rootMotion=true}={}){
  if(!SHADOW_CLIPS[name])throw Error(`Unknown animation clip: ${name}`);
  if(!Number.isFinite(time))throw Error('Animation time must be finite');
  reset();if(name==='jumpscare')jumpscare(time,rootMotion);else locomotion(name,time);
  update();
  // Original asymmetric ankle cables and pelvis roll need a small ground fix.
  let minY=Infinity;for(const i of contactVertices){contactPoint.fromBufferAttribute(mesh.geometry.attributes.position,i);mesh.applyBoneTransform(i,contactPoint);minY=Math.min(minY,contactPoint.y)}
  if(minY<.006){b.pelvis.position.y+=.006-minY;update()}
  return root;
 }
 return {sample,reset,clips:SHADOW_CLIPS,mesh,bones};
}
