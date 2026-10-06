import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,CELL} from '../dist/game.js';
import {CHUNK_CELLS,DATA_CACHE_LIMIT} from '../dist/world.js';
const phone=g=>g.items.find(i=>i.id==='phone-1');
function start(){const g=new Game(42);g.start();return g}
function farCell(g,x,z){const cell=g.world.cell(x,z);assert(cell.active);g.player.x=(x+.5)*CELL;g.player.z=(z+.5)*CELL;assert(!g.collides(g.player.x,g.player.z));return cell}

test('phone battery and ground identity survive chunk eviction and recovery at far negative coordinates',()=>{
 const g=start(),original=phone(g);original.battery=31.875;farCell(g,-1114,1326);
 assert.equal(g.drop(original.id),original.id);assert.equal(original.area,'maze');const ledger=JSON.stringify(original);
 for(let n=0;n<60;n++)g.world.chunk(n*3+10,-n*5-30);
 assert(g.world.stats().resident<=DATA_CACHE_LIMIT);assert.equal(JSON.stringify(original),ledger);
 farCell(g,400,500);for(let n=0;n<50;n++)g.updateDevices(.05);
 assert.equal(JSON.stringify(original),ledger);farCell(g,-1114,1326);
 assert.equal(g.pickupItem(original.id),original.id);assert.equal(phone(g),original);assert.equal(original.battery,31.875);
 assert.equal(g.items.filter(i=>i.id===original.id).length,1);
});

test('old phone marker is retained atomically when returning to its streamed chunk with a full inventory',()=>{
 const g=start(),original=phone(g);original.battery=62.4;farCell(g,551,-335);assert(g.drop(original.id));
 for(const i of g.inventory())i.state='consumed';
 for(let n=0;n<16;n++)g.items.push({id:`capacity-${n}`,kind:'food',state:'inventory',gridX:n%4,gridY:Math.floor(n/4)});
 const before=JSON.stringify(original);for(let n=0;n<35;n++)g.world.chunk(n+200,n-200);
 assert.equal(g.pickupItem(original.id),undefined);assert.equal(JSON.stringify(original),before);
 const freed=g.inventory().at(-1);freed.state='consumed';assert.equal(g.pickupItem(original.id),original.id);
 assert.equal(phone(g),original);assert.equal(original.battery,62.4);assert.equal(g.inventory().length,16);
});

test('chunks east of the Manila landmark do not count as Manila or allow remote charging',()=>{
 const g=start(),original=phone(g);original.battery=10;
 farCell(g,2000,2000);assert.equal(g.inRoom(),false);assert.equal(g.nearCharger(),false);assert.equal(g.connectCharger(original.id),false);
 assert(g.drop(original.id));assert.equal(original.area,'maze');assert(g.pickupItem(original.id));
 for(let n=0;n<20;n++)g.updateDevices(.05);assert.equal(original.battery,10);assert.equal(g.chargingPhoneId,null);
});

test('leaving the room for streamed maze coordinates disconnects the precise phone before any charge',()=>{
 const g=start(),original=phone(g);original.battery=25;g.player.x=g.maze.doorX+3.6;g.player.z=g.maze.doorZ-.65;
 assert(g.connectCharger(original.id));g.updateDevices(.05);const charged=original.battery;assert(charged>25);
 farCell(g,-3000,2000);g.updateDevices(.05);assert.equal(g.chargingPhoneId,null);assert.equal(original.battery,charged);
});

test('a held phone survives procedural cache churn and original Manila connection progression',()=>{
 const g=start(),original=phone(g);original.battery=45.625;
 for(let n=0;n<DATA_CACHE_LIMIT*3;n++)g.world.chunk(n+2,Math.floor(n/2)-10);
 g.player.x=g.maze.doorX+2.1;g.player.z=g.maze.doorZ;g.door=g.doorTarget=0;g.update(.05);
 assert(g.changed);assert.equal(phone(g),original);assert.equal(original.battery,45.625);
 g.player.x=g.maze.doorX+3.6;g.player.z=g.maze.doorZ-.65;assert(g.nearCharger());assert(g.connectCharger(original.id));
 g.openInventory();g.openPhone(original.id);g.updateDevices(.05);assert(original.battery>45.625);assert.equal(g.chargingPhoneId,original.id);
});
