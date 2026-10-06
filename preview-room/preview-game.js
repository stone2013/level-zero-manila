// A fixed visual review room. The production simulation module stays byte-for-byte unchanged.
import {Game} from './game.js';
export const PREVIEW_HEIGHT=3.6;
export const PREVIEW_SPAWN=Object.freeze({x:2.1,z:6.8,yaw:1.15,pitch:-.015});
export const PREVIEW_LAMPS=Object.freeze([
 {x:3,z:6.3,y:3.545,power:8.8},
 {x:7.8,z:5.1,y:3.545,power:8.8},
 {x:3,z:2.1,y:3.545,power:7.8},
 {x:10.2,z:2.7,y:3.545,power:7.8}
]);
export class PreviewGame extends Game{
 reset(){
  super.reset(5);
  this.maze={...this.maze,seed:5,doorX:12,doorZ:4.2};
  this.player={...PREVIEW_SPAWN};
  this.walls=[
   {x:0,z:4.2,w:.16,d:8.4}, {x:6,z:0,w:12,d:.16},
   {x:6,z:8.4,w:12,d:.16}, {x:12,z:1.7,w:.16,d:3.4},
   {x:12,z:6.7,w:.16,d:3.4}, {x:6,z:2,w:.16,d:4},
   {x:15,z:1.7,w:6,d:.16}, {x:15,z:6.7,w:6,d:.16},
   {x:18,z:4.2,w:.16,d:5}
  ];
  this.obstacles=[{x:16.4,z:4.7,w:.8,d:2.7}];
  for(const item of this.items)if(item.kind==='water'){
   item.x=16.25;item.z=3.4+Number(item.id.slice(-1))*.5-.5;
  }
  return this;
 }
 start(){super.start();this.events=['固定房间样稿：先看灯下、墙角和遮挡后的层次。'];}
}
