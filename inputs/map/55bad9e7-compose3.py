import json

d = json.load(open('/home/claude/mapgen/data3.json'))

ESP = '#2B1D12'; ESPS = '#5B4C3A'; OLIVE = '#6E7A45'; OLIVED = '#4A5030'
OX = '#7A2A2A'; PARCH = '#C8B8A8'; PAPER = '#F6F2EA'

hub = d['hub']
f = d['eFrame']
fx, fy, fw, fh = f['x'], f['y'], f['w'], f['h']

# faint belt for context
belt = ''.join(
    f'<path d="{p}" fill="{OLIVE}" fill-opacity="0.16" stroke="{OLIVED}" stroke-width="0.4" stroke-opacity="0.35"/>'
    for p in d['beltPaths'])

# subtle flow arcs (no labels — countries carry the names now)
flows = []
for (ox, oy) in d['flowFrom']:
    cx = ox + (hub[0] - ox) * 0.5
    flows.append(
        f'<path d="M{ox:.0f},{oy:.0f} Q{cx:.0f},{oy:.0f} {hub[0]:.0f},{hub[1]:.0f}" fill="none" '
        f'stroke="{OLIVED}" stroke-width="1.1" stroke-dasharray="5 7" stroke-opacity="0.45"/>')

# interactive origin countries
origins = []
for name, o in d['originPaths'].items():
    safe = name.replace('"', '&quot;').replace("'", '&#39;')
    origins.append(
        f'<path class="origin" data-origin="{safe}" tabindex="0" role="button" '
        f'aria-label="{safe}" d="{o["d"]}"/>')

# Europe inset
sec = []
for s in d['ports']['secondary']:
    x, y = s['at']
    sec.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.2" fill="none" stroke="{ESPS}" stroke-width="1.2"/>')
    sec.append(f'<text x="{x + s["dx"]:.1f}" y="{y + s["dy"]:.1f}" text-anchor="{s["anchor"]}" '
               f'font-family="Karla, sans-serif" font-size="12.5" fill="{ESPS}">{s["n"]}</text>')

pri = ''.join(f'<circle cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="3.4" fill="{OX}"/>' for p in d['ports']['adriatic'])
ax_, ay_ = d['ports']['cluster']

svg = f'''<svg id="origin-map" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1040 640" role="img" aria-label="Interactive world map of coffee origins BY MAXTRADE sources from, with European ports of arrival">
<rect width="1040" height="640" fill="{PAPER}"/>
<path d="{d['wLand']}" fill="{PARCH}" stroke="{ESP}" stroke-width="0.5" stroke-opacity="0.4"/>
{belt}
{''.join(flows)}
<g id="origin-layer">{''.join(origins)}</g>
<circle cx="{hub[0]:.0f}" cy="{hub[1]:.0f}" r="5.5" fill="{OX}"/>
<circle cx="{hub[0]:.0f}" cy="{hub[1]:.0f}" r="12" fill="none" stroke="{OX}" stroke-width="1" stroke-opacity="0.55"/>
<rect x="{fx}" y="{fy}" width="{fw}" height="{fh}" rx="6" fill="{PAPER}" stroke="{PARCH}" stroke-width="1.2"/>
<path d="{d['eLand']}" fill="{PARCH}" stroke="{ESP}" stroke-width="0.45" stroke-opacity="0.5" clip-path="url(#eclip)"/>
<text class="lang-en" x="{fx + 16}" y="{fy + 24}" font-family="Fraunces, serif" font-weight="600" font-size="15" fill="{ESP}">European ports</text>
<text class="lang-si" x="{fx + 16}" y="{fy + 24}" font-family="Fraunces, serif" font-weight="600" font-size="15" fill="{ESP}">Evropska pristanišča</text>
{''.join(sec)}
{pri}
<circle cx="{ax_:.1f}" cy="{ay_:.1f}" r="12" fill="none" stroke="{OX}" stroke-width="1.3"/>
<path d="M{ax_:.1f},{ay_ + 12:.1f} L{ax_ - 6:.1f},{fy + fh - 40:.1f}" stroke="{OX}" stroke-width="0.9"/>
<text x="{ax_ - 10:.1f}" y="{fy + fh - 24:.1f}" text-anchor="middle" font-family="Fraunces, serif" font-weight="600" font-size="13.5" fill="{OX}">Trieste · Koper · Rijeka</text>
<defs><clipPath id="eclip"><rect x="{fx}" y="{fy}" width="{fw}" height="{fh}" rx="6"/></clipPath></defs>
<g font-family="Karla, sans-serif" font-size="12.5" fill="{ESPS}">
  <rect x="40" y="586" width="11" height="11" rx="2" fill="{OLIVE}" fill-opacity="0.72" stroke="{OLIVED}" stroke-width="0.6"/>
  <text class="lang-en" x="59" y="596">Origins we source from</text>
  <text class="lang-si" x="59" y="596">Države, iz katerih nabavljamo</text>
  <rect x="260" y="586" width="11" height="11" rx="2" fill="{OLIVE}" fill-opacity="0.16" stroke="{OLIVED}" stroke-width="0.5" stroke-opacity="0.4"/>
  <text class="lang-en" x="279" y="596">Other coffee-growing countries</text>
  <text class="lang-si" x="279" y="596">Druge države pridelovalke kave</text>
  <circle cx="46" cy="616" r="3.4" fill="{OX}"/>
  <text class="lang-en" x="59" y="620">Adriatic ports</text>
  <text class="lang-si" x="59" y="620">Jadranska pristanišča</text>
  <circle cx="266" cy="616" r="3.2" fill="none" stroke="{ESPS}" stroke-width="1.2"/>
  <text class="lang-en" x="279" y="620">Also in regular use</text>
  <text class="lang-si" x="279" y="620">Redno v uporabi</text>
</g>
</svg>'''

open('/home/claude/mapgen/origin_map.svg', 'w').write(svg)
print('written', len(svg), 'chars;', len(d['originPaths']), 'interactive countries')
