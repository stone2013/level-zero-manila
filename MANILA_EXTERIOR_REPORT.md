# Manila exterior wallpaper integration

The four targeted app.js changes generalize the existing doorway facade material split to all six Manila shell pieces. North, south and rear walls now use the approved wallpaper outside and retain their correct plain beige inward face. Outside UVs use the existing 1.40625 m world scale and exterior corridor lighting bake. Geometry dimensions/positions, collision, door, items and interior furniture are unchanged.

The isolated wallpaper candidate passed 219 aggregate tests against verified v1.6.2 main f6ec565b14848b84363ea39e0f5573e61713865c. Three new tests cover material faces/UVs, outer bake samples and stable state across rebuilds. The old interior-instance assertion now checks six per-face shells. Three lighting fixture snapshots were independently replayed against the old v1.6.1 pre-optimization implementation, with identical RGB values and counters.

This integration copies no route, gameplay, monster, event, version or service-worker changes. The full integrated suite must run after all other edits are complete. No GPU or phone visual validation is claimed.
