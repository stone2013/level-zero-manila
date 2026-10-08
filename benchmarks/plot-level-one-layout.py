from pathlib import Path
import os,json
os.environ.setdefault('MPLCONFIGDIR','/tmp/backrooms-matplotlib')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
root=Path(__file__).resolve().parents[1]
areas=json.loads((root/'assets/source/level-one/areas.json').read_text());metric=json.loads((root/'evidence/expansion/global-shortest-route.json').read_text());route=metric['route']
fig,axes=plt.subplots(1,6,figsize=(16,8),facecolor='#111919')
for ax,a in zip(axes,areas):
 ax.set_facecolor('#26302e');ax.set_aspect('equal');ax.set_xlim(-20,20);ax.set_ylim(-99,9)
 for w in a['walls']:ax.add_patch(Rectangle((w['x']-w['w']/2,w['z']-w['d']/2),w['w'],w['d'],color='#72807b'))
 for s in a['shelters']:ax.add_patch(Rectangle((s['minX'],s['minZ']),s['maxX']-s['minX'],s['maxZ']-s['minZ'],color='#61b393',alpha=.65))
 for p in a['props']:ax.add_patch(Rectangle((p['x']-p['w']/2,p['z']-p['d']/2),p['w'],p['d'],color='#c4bda4'if p['kind']=='column'else'#8c7960'))
 for c in a['crates']:ax.scatter(c['x'],c['z'],marker='s',s=18,c='#77b9ff'if c['kind']=='water'else'#c39463',zorder=5)
 ax.plot([p['x']for p in route],[p['z']-a['offsetZ']for p in route],c='#efc25c',lw=1.8)
 for l in a['loops']:
  r=l['safeRoute'];ax.plot([p['x']for p in r],[p['z']for p in r],c='#a9ffdc',lw=2)
 ax.set_title(a['name'].replace(' ','\n',1),color='white',fontsize=12)
 ax.tick_params(colors='#96aaa3',labelsize=8);ax.set_xticks([-18,0,18]);ax.set_yticks([-96,-60,-20,6]);ax.spines[['top','right','left','bottom']].set_color('#56625e')
fig.suptitle('LEVEL 1 EXPANSION | REVISED AUTHORED ROUTE',color='white',fontsize=20,y=.96)
fig.text(.05,.105,'Amber: independent pathfinding route   Mint: physical safe-room loops   Blue/brown: finite supplies   Pale squares: cover columns',color='#c6d8d0',fontsize=10)
fig.text(.05,.071,f'Six continuous sectors. Grid route with sightline simplification: {metric["smoothedDistance"]:.2f} m / 5:55 walking / 3:44 sprinting.',color='#c6d8d0',fontsize=11)
fig.text(.05,.037,'Design schematic, not game rendering. First-play 8–12 minutes remains unvalidated. No timed gates or reduced movement speed.',color='#a1b5ad',fontsize=10)
fig.subplots_adjust(left=.045,right=.985,bottom=.16,top=.85,wspace=.4)
fig.savefig(root/'evidence/expansion/six-sector-route-plan.png',dpi=120,facecolor=fig.get_facecolor())
