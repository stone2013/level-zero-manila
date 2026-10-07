import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createSupplyModels } from '../../dist/assets/supplies/supply-models.js';

// Export the real shared Three.js model factory. No proxy geometry or restyling.
const directory = path.dirname(fileURLToPath(import.meta.url));
const factory = createSupplyModels();
const result = {
  source: 'dist/assets/supplies/supply-models.js',
  sourceSha256: createHash('sha256').update(fs.readFileSync(path.join(directory, '../../dist/assets/supplies/supply-models.js'))).digest('hex'),
  method: 'createSupplyModels().create(kind), original position/normal/color attributes',
  units: 'metres',
  coordinates: 'Three.js Y-up; Blender importer uses (x, -z, y)',
  exportedAt: new Date().toISOString(),
  stats: factory.stats(),
  models: {},
};
for (const kind of ['food', 'water']) {
  const group = factory.create(kind);
  group.updateMatrixWorld(true);
  const meshes = [];
  group.traverse(object => {
    if (!object.isMesh) return;
    const geometry = object.geometry;
    meshes.push({
      name: object.name,
      positions: Array.from(geometry.attributes.position.array),
      normals: Array.from(geometry.attributes.normal.array),
      colors: Array.from(geometry.attributes.color.array),
      indices: geometry.index ? Array.from(geometry.index.array) : null,
      matrixWorld: object.matrixWorld.toArray(),
    });
  });
  result.models[kind] = meshes;
}
fs.writeFileSync(path.join(directory, 'actual-geometry.json'), JSON.stringify(result));
fs.writeFileSync(path.join(directory, 'geometry-stats.json'), JSON.stringify(result.stats, null, 2) + '\n');
console.log(JSON.stringify(result.stats, null, 2));
factory.dispose();
