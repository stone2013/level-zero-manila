# CPU layout previews

These images are Blender CPU renders of the assembled Three.js geometry, exported from the local candidate. They are not browser screenshots. Review lights are independent of the runtime hemisphere/directional lighting. Canvas-label text is not included in this offline export, although model lettering is preserved. Inspect runtime sign legibility on the target device.

To regenerate, run export-scene.mjs under Node, then Blender with render.py and hub or level1 as its final argument. Original pack textures must be present at the path configured in render.py. Generated intermediary hub.json/level1.json are excluded from the source ZIP because the script regenerates them from the included GLBs.
