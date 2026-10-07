import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pngInfo = file => {
  const data = fs.readFileSync(file);
  assert.equal(data.toString('hex',0,8),'89504e470d0a1a0a');
  assert.equal(data.toString('ascii',12,16),'IHDR');
  return {width:data.readUInt32BE(16),height:data.readUInt32BE(20),depth:data[24],colorType:data[25]};
};

test('PWA icons have separate regular and maskable 192/512 entries with opaque PNG data',()=>{
  const manifest=JSON.parse(fs.readFileSync('dist/manifest.webmanifest','utf8'));
  assert.equal(manifest.icons.length,4);
  for(const purpose of ['any','maskable']) for(const size of [192,512]) {
    const icon=manifest.icons.find(icon=>icon.purpose===purpose&&icon.sizes===`${size}x${size}`);
    assert(icon, `${purpose} ${size} icon must exist`);
    assert.equal(icon.type,'image/png');
    assert.deepEqual(pngInfo('dist/'+icon.src),{width:size,height:size,depth:8,colorType:2});
  }
});

test('Apple touch and browser icons are local, correct-size and included in offline cache',()=>{
  const html=fs.readFileSync('dist/index.html','utf8'),sw=fs.readFileSync('dist/sw.js','utf8');
  for(const [filename,size] of [['apple-touch-icon.png',180],['favicon-32.png',32],['favicon-16.png',16]]) {
    assert(html.includes(`sizes="${size}x${size}" href="./icons/${filename}"`));
    assert.deepEqual(pngInfo('dist/icons/'+filename),{width:size,height:size,depth:8,colorType:2});
    assert(sw.includes(`'./icons/${filename}'`)||sw.includes(`"./icons/${filename}"`));
  }
  for(const filename of ['icon-192.png','icon-512.png','icon-maskable-192.png','icon-maskable-512.png','icon.svg']) assert(sw.includes(`'./icons/${filename}'`)||sw.includes(`"./icons/${filename}"`));
  assert(html.includes('type="image/svg+xml" sizes="any" href="./icons/icon.svg"'));
  assert(!html.includes('href="data:image/svg+xml'));
});

test('original vector doorway and light stay inside the maskable safe area',()=>{
  const source=fs.readFileSync('assets/source/level-zero-app-icon.svg','utf8');
  assert.equal(source,fs.readFileSync('dist/icons/icon.svg','utf8'));
  assert(!/<(?:image|text|script)\b/.test(source),'art must be standalone geometry, without raster links, text or scripts');
  const essentialCorners=[[175,166],[337,166],[337,393],[175,393],[204,134],[308,134],[308,150],[204,150]];
  for(const [x,y] of essentialCorners) assert(Math.hypot(x-256,y-256)<512*.4);
});
