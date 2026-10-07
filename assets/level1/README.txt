Original approved static Level 1 asset pack, copied for offline runtime use.
GLB images are embedded; no texture CDN, decoder CDN or runtime external URLs.
14 GLBs: hub, hall and 12 reusable modules. No character or monster assets.

The renderer preserves glTF materials, image maps, normals, UVs and transforms
using official Three.js r180 GLTFLoader. Runtime geometry edits remove the
original solid north hall wall/closed refuge door so the playable extension
is visibly connected. Matching concrete modules rebuild the portal sides,
refuge, continuation, pipe passage and visible boundaries. The hub adds a
separate eighth active Level 1 door, leaving reference doors inactive.

CPU/resource/ray alignment evidence: audit/zone-assets-evidence.json in source.
No browser FPS or real-device mobile performance is claimed by those tests.
