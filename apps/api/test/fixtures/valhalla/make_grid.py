"""Synthetic Tel Aviv-ish grid: 8x8 nodes ~200 m apart, named streets, mixed maxspeed."""
import sys
import osmium
from osmium.osm.mutable import Node, Way

LAT0, LNG0, D_LAT, D_LNG, N = 32.070, 34.770, 0.0018, 0.0021, 8
w = osmium.SimpleWriter(sys.argv[1] if len(sys.argv) > 1 else 'grid.osm.pbf')
nid = lambda r, c: 1 + r * N + c
for r in range(N):
    for c in range(N):
        w.add_node(Node(id=nid(r, c), location=(LNG0 + c * D_LNG, LAT0 + r * D_LAT), version=1, changeset=1, timestamp='2026-01-01T00:00:00Z', uid=1, user='x'))
wid = 1000
EW = ['Herzl St', 'Jabotinsky St', 'Rothschild Blvd', 'Haim Ozer St', 'Baron Hirsch St', 'Ahad Haam St', 'Bialik St', 'Weizmann St']
NS = ['Allenby St', 'Ibn Gabirol St', 'Dizengoff St', 'King George St', 'Ben Yehuda St', 'Hayarkon St', 'Arlozorov St', 'Namir Rd']
for r in range(N):  # east-west
    tags = {'highway': 'primary' if r == 3 else 'residential', 'name': EW[r], 'maxspeed': '70' if r == 3 else ('30' if r % 2 else '50')}
    w.add_way(Way(id=wid, nodes=[nid(r, c) for c in range(N)], tags=tags, version=1, changeset=1, timestamp='2026-01-01T00:00:00Z', uid=1, user='x')); wid += 1
for c in range(N):  # north-south
    tags = {'highway': 'secondary' if c == 4 else 'residential', 'name': NS[c], 'maxspeed': '50'}
    if c == 7: tags['toll'] = 'yes'
    w.add_way(Way(id=wid, nodes=[nid(r, c) for r in range(N)], tags=tags, version=1, changeset=1, timestamp='2026-01-01T00:00:00Z', uid=1, user='x')); wid += 1
w.close()
print('ok')
