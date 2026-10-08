import * as THREE from './vendor/three.module.min.js';

// A solid, hunched warehouse lurker. It faces local -Z, matching danger.yaw.
// Every geometry and material belongs to this instance; the zone owns disposal.
export function createLevelOneEntityVisual() {
  const root = new THREE.Group();
  root.name = 'level-one-lurker';
  root.visible = false;
  const materials = [];
  function mesh(parent, name, geometry, position, scale, highlight = false) {
    const material = new THREE.MeshLambertMaterial({
      color: highlight ? 0xd4c091 : 0x363a37,
      emissive: highlight ? 0x9b8050 : 0x303730,
      emissiveIntensity: highlight ? .48 : .16,
      flatShading: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const part = new THREE.Mesh(geometry, material);
    part.name = name;
    part.position.set(...position);
    part.scale.set(...scale);
    part.castShadow = false;
    part.receiveShadow = false;
    parent.add(part);
    materials.push(material);
    return part;
  }
  const torso = new THREE.Group();
  torso.name = 'hunched-body';
  torso.position.y = 1.15;
  root.add(torso);
  mesh(torso, 'narrow-waist', new THREE.CylinderGeometry(.19, .14, .48, 5), [0,.18,.04], [1,1,1]);
  const back = mesh(torso, 'arched-shoulders', new THREE.SphereGeometry(1, 7, 4), [0,.66,.02], [.43,.49,.27]);
  back.rotation.x = -.22;
  mesh(torso, 'forward-neck', new THREE.CylinderGeometry(.095,.14,.29,5), [0,.84,-.26], [1,1,1]);
  const head = mesh(torso, 'lowered-faceless-head', new THREE.SphereGeometry(1,6,4), [0,.91,-.36], [.18,.25,.19]);
  head.rotation.x = .2;
  mesh(torso, 'single-ivory-eye-slit', new THREE.BoxGeometry(.205,.024,.018), [0,.94,-.542], [1,1,1], true);
  // Narrow warm planes disclose the shoulder outline without introducing a light.
  for (const side of [-1,1]) {
    const seam = mesh(torso, `shoulder-edge-${side}`, new THREE.BoxGeometry(.026,.26,.022), [side*.343,.75,-.155], [1,1,1], true);
    seam.rotation.z = side*.38;
  }
  const arms = [], legs = [];
  for (const side of [-1,1]) {
    const arm = new THREE.Group();
    arm.name = `long-arm-${side}`;
    arm.position.set(side*.37,.73,-.01);
    torso.add(arm);
    mesh(arm, 'upper-arm', new THREE.CylinderGeometry(.085,.065,.64,5), [side*.035,-.31,-.025], [1,1,1]);
    const forearm = mesh(arm, 'long-forearm', new THREE.CylinderGeometry(.065,.042,.78,5), [side*.06,-1,-.1], [1,1,1]);
    forearm.rotation.x = .16;
    mesh(arm, 'tapered-hand', new THREE.ConeGeometry(.068,.24,5), [side*.06,-1.48,-.165], [1,1,1]);
    arms.push(arm);
    const leg = new THREE.Group();
    leg.name = `leg-${side}`;
    leg.position.set(side*.135,1.17,.045);
    root.add(leg);
    mesh(leg, 'long-shin', new THREE.CylinderGeometry(.095,.06,1.05,5), [0,-.55,0], [1,1,1]);
    mesh(leg, 'flat-foot', new THREE.BoxGeometry(.15,.12,.31), [0,-1.11,-.075], [1,1,1]);
    legs.push(leg);
  }
  root.userData.levelOneVisual = {torso, arms, legs, materials};
  return root;
}

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = value => Math.max(0, Math.min(1, value));
export function updateLevelOneEntityVisual(root, danger, elapsed = 0) {
  const parts = root.userData.levelOneVisual;
  if (!parts) return;
  root.visible = Boolean(danger?.active);
  if (!root.visible) return;
  root.position.set(finite(danger.x), 0, finite(danger.z));
  root.rotation.set(0, -finite(danger.yaw), 0);
  const arrival = clamp(1 - finite(danger.grace) / 2);
  const fade = arrival * arrival * (3 - 2 * arrival);
  const proximity = clamp(finite(danger.proximity));
  const time = finite(elapsed);
  const breath = Math.sin(time * 1.7);
  const gait = Math.sin(time * 2.8);
  parts.torso.position.y = 1.15 + breath * .014;
  parts.torso.rotation.set(.025 + breath*.015, 0, gait*.018);
  parts.arms.forEach((arm, index) => {
    const side = index === 0 ? -1 : 1;
    arm.rotation.set(side*gait*.095 - .06, 0, side*(.065 + breath*.012));
  });
  parts.legs.forEach((leg, index) => {
    // A restrained shuffle keeps the ground envelope stable while time is frozen.
    leg.position.z = .045 + (index === 0 ? -1 : 1)*gait*.045;
    leg.rotation.y = (index === 0 ? -1 : 1)*.055;
  });
  for (const material of parts.materials) {
    material.opacity = fade;
    material.depthWrite = fade >= .999;
    const highlight = material.color.getHex() === 0xd4c091;
    material.emissiveIntensity = highlight ? .48 + proximity*.15 : .16 + proximity*.035;
  }
}
