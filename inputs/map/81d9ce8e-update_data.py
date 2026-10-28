import re

p = '/home/claude/index.html'
html = open(p, encoding='utf-8').read()

new_map = open('/home/claude/mapgen/origin_map.svg', encoding='utf-8').read().strip()

# ---------- 1. swap in the rebuilt map ----------
old = re.search(r'<svg id="origin-map".*?</svg>', html, re.S)
assert old, 'origin-map not found'
html = html[:old.start()] + new_map + html[old.end():]

# ---------- 2. real offer list, country prefix stripped (the modal title carries it) ----------
DATA = """var ORIGIN_DATA = {
  'Brazil':      { si:'Brazilija',  items:[
      'SANTOS FC 17/18 SCR',
      'SANTOS GC 17/18 SCR',
      'SANTOS GC 14/16 SCR',
      'SANTOS DECAF',
      'ROBUSTA CONILON 4/5 SCR 14, 16, 18'] },
  'Colombia':    { si:'Kolumbija',  items:[
      'SUPREMO 17/18 SCR',
      'EXCELSO',
      'DECAF',
      'STOCKLOT DEFECT BEANS'] },
  'Peru':        { si:'Peru',       items:[
      'ARABICA GR. 1',
      'ARABICA DEFECT BEANS'] },
  'Guatemala':   { si:'Gvatemala',  items:[] },
  'Honduras':    { si:'Honduras',   items:['ARABICA SHG'] },
  'El Salvador': { si:'Salvador',   items:['ARABICA SHG'] },
  'Mexico':      { si:'Mehika',     items:['ARABICA SHG'] },
  'Ethiopia':    { si:'Etiopija',   items:[
      'YIRGACHEFFE GR 1, GR 2, GR 4',
      'SIDAMO GR 2, GR 4',
      'DJIMMAH GR 4, GR 5',
      'DJIMMAH UNDERGRADE'] },
  'Uganda':      { si:'Uganda',     items:[
      'ROBUSTA SCR 18',
      'ROBUSTA SCR 15',
      'ROBUSTA UNDERGRADE / LOWGRADE'] },
  'Rwanda':      { si:'Ruanda',     items:[
      'ARABICA',
      'ARABICA DEFECT BEANS'] },
  'Cameroon':    { si:'Kamerun',    items:['ROBUSTA GR. 2, GR. 3'] },
  'Guinea':      { si:'Gvineja',    items:['ROBUSTA SCREEN 14/15'] },
  'Vietnam':     { si:'Vietnam',    items:[
      'ROBUSTA GR 1 WET-POLISHED SCR 18',
      'ROBUSTA GR 1 WET-POLISHED SCR 16',
      'ROBUSTA GR 2 SCR 13, 5%'] },
  'India':       { si:'Indija',     items:[
      'ARABICA MONSOONED MALABAR A',
      'ARABICA PLANTATION A',
      'ROBUSTA CHERRY A, AA SCR 18'] },
  'Indonesia':   { si:'Indonezija', items:['ROBUSTA EK1 80 DEF'] }
};"""

od = re.search(r'var ORIGIN_DATA = \{.*?\n\};', html, re.S)
assert od, 'ORIGIN_DATA not found'
html = html[:od.start()] + DATA + html[od.end():]

# ---------- 3. offer lines are trade designations: keep them legible in caps ----------
html = html.replace(
  ".origin-list li{padding:11px 0;border-bottom:1px solid rgba(43,29,18,0.14);font-size:0.97rem;color:var(--espresso);}",
  ".origin-list li{padding:11px 0;border-bottom:1px solid rgba(43,29,18,0.14);\n"
  "    font-size:0.92rem;letter-spacing:0.02em;color:var(--espresso);}")

# ---------- 4. an origin with no listed grades must not open an empty box ----------
html = html.replace(
'''    (rec.items || []).forEach(function(it){
      var li = document.createElement('li');
      li.textContent = it;
      listEl.appendChild(li);
    });''',
'''    var items = rec.items || [];
    if(items.length){
      items.forEach(function(it){
        var li = document.createElement('li');
        li.textContent = it;
        listEl.appendChild(li);
      });
    } else {
      var li = document.createElement('li');
      li.textContent = isSI()
        ? 'Kakovosti in razpoložljivost na zahtevo.'
        : 'Qualities and availability on request.';
      listEl.appendChild(li);
    }''')

open(p, 'w', encoding='utf-8').write(html)
print('ok, size', len(html))
print('countries in data:', html.count("si:'"))
for probe in ['SANTOS FC 17/18 SCR', 'YIRGACHEFFE', 'ROBUSTA SCREEN 14/15', 'Kakovosti in razpoložljivost']:
    print(probe, '->', html.count(probe))
