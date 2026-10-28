const fs = require('fs');
const { geoEquirectangular, geoPath } = require('d3-geo');
const { feature } = require('topojson-client');

const landTopo = JSON.parse(fs.readFileSync('./node_modules/world-atlas/land-110m.json'));
const land50Topo = JSON.parse(fs.readFileSync('./node_modules/world-atlas/land-50m.json'));
const ctyTopo = JSON.parse(fs.readFileSync('./node_modules/world-atlas/countries-110m.json'));

const land = feature(landTopo, landTopo.objects.land);
const land50 = feature(land50Topo, land50Topo.objects.land);
const countries = feature(ctyTopo, ctyTopo.objects.countries);

// Origins BY MAXTRADE sources from — CONFIRM THIS LIST
const ORIGINS = [
  'Brazil', 'Colombia', 'Peru', 'Honduras', 'Guatemala', 'Nicaragua',
  'Costa Rica', 'El Salvador', 'Mexico', 'Ethiopia', 'Uganda', 'Kenya',
  'Tanzania', 'Rwanda', 'Burundi', 'Côte d\'Ivoire', 'Cameroon',
  'Dem. Rep. Congo', 'Vietnam', 'India', 'Indonesia', 'Papua New Guinea'
];

// wider coffee belt, shown faint for context
const BELT = new Set([
  'Bolivia', 'Ecuador', 'Venezuela', 'Panama', 'Cuba', 'Jamaica',
  'Dominican Rep.', 'Haiti', 'Madagascar', 'Malawi', 'Zambia', 'Angola',
  'Togo', 'Ghana', 'Guinea', 'Laos', 'Thailand', 'Philippines',
  'Myanmar', 'China', 'Yemen', 'Timor-Leste'
]);

const W = 1040, H = 640;
const bbox = { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-92, -25], [128, 56]] } };
const projection = geoEquirectangular().fitExtent([[26, 28], [1014, 402]], bbox);
const path = geoPath(projection);

const originPaths = {};
const beltPaths = [];
const missing = [];

ORIGINS.forEach(n => {
  const f = countries.features.find(x => x.properties.name === n);
  if (!f) { missing.push(n); return; }
  const d = path(f);
  if (!d) { missing.push(n + ' (no geometry in view)'); return; }
  const c = path.centroid(f);
  originPaths[n] = { d, cx: c[0], cy: c[1] };
});

countries.features.forEach(f => {
  if (BELT.has(f.properties.name)) {
    const d = path(f);
    if (d) beltPaths.push(d);
  }
});

const pt = (lon, lat) => projection([lon, lat]);
const hub = pt(12.5, 46.5);

// Europe inset
const eBox = { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-2, 41], [30, 60.5]] } };
const eProj = geoEquirectangular().fitExtent([[606, 432], [1010, 618]], eBox);
const ePath = geoPath(eProj);
const ep = (lon, lat) => eProj([lon, lat]);

fs.writeFileSync('./data3.json', JSON.stringify({
  wLand: path(land),
  beltPaths,
  originPaths,
  hub,
  eLand: ePath(land50),
  eFrame: { x: 606, y: 432, w: 404, h: 186 },
  ports: {
    adriatic: [ep(13.77, 45.65), ep(13.73, 45.55), ep(14.44, 45.33)],
    cluster: ep(13.9, 45.5),
    secondary: [
      { n: 'Antwerp', at: ep(4.40, 51.22), anchor: 'end', dx: -9, dy: 3 },
      { n: 'Hamburg', at: ep(9.97, 53.55), anchor: 'end', dx: -9, dy: -4 },
      { n: 'Gdańsk', at: ep(18.65, 54.35), anchor: 'start', dx: 9, dy: 3 },
      { n: 'Tallinn', at: ep(24.75, 59.44), anchor: 'start', dx: 9, dy: 3 },
      { n: 'Genoa', at: ep(8.93, 44.41), anchor: 'end', dx: -9, dy: 5 }
    ]
  },
  flowFrom: [pt(-58, -12), pt(-88, 14), pt(36, 2), pt(100, 13)]
}));

console.log('origins mapped:', Object.keys(originPaths).length, '/', ORIGINS.length);
if (missing.length) console.log('MISSING:', missing);
console.log('belt shown faint:', beltPaths.length);
