import re

p = '/home/claude/index.html'
html = open(p, encoding='utf-8').read()
new_map = open('/home/claude/mapgen/origin_map.svg', encoding='utf-8').read().strip()

def swap(old, new, count=1):
    global html
    assert html.count(old) >= 1, 'NOT FOUND: ' + old[:80]
    html = html.replace(old, new, count)

# ---------- 1. replace the old static map ----------
old_map = re.search(r'<svg xmlns="http://www\.w3\.org/2000/svg" viewBox="0 0 1100 620".*?</svg>', html, re.S)
assert old_map, 'old map not found'
html = html[:old_map.start()] + new_map + html[old_map.end():]

# ---------- 2. CSS ----------
swap('  .prose{max-width:760px;}', '''  .prose{max-width:760px;}
  .map-plate{position:relative;}
  #origin-map .origin{fill:var(--olive);fill-opacity:.72;stroke:var(--olive-dark);stroke-width:.6;
    cursor:pointer;transition:fill-opacity .15s ease;}
  #origin-map .origin:hover,#origin-map .origin:focus,#origin-map .origin.on{fill-opacity:1;stroke-width:1.2;outline:none;}
  #origin-map .origin:focus-visible{stroke:var(--oxblood);stroke-width:1.6;}
  .map-tip{
    position:absolute;z-index:6;pointer-events:none;opacity:0;transform:translate(-50%,-120%);
    background:var(--espresso);color:var(--cream);padding:7px 13px;border-radius:4px;
    font-size:0.86rem;white-space:nowrap;transition:opacity .12s ease;
  }
  .map-tip.show{opacity:1;}
  .map-tip b{font-family:'Fraunces',serif;font-weight:600;display:block;font-size:0.95rem;}
  .map-tip span{color:var(--parchment);font-size:0.78rem;}
  .map-hint{margin-top:14px;font-size:0.88rem;color:var(--espresso-soft);}
  .origin-list{list-style:none;padding:0;margin:0;}
  .origin-list li{padding:11px 0;border-bottom:1px solid rgba(43,29,18,0.14);font-size:0.97rem;color:var(--espresso);}
  .origin-list li:last-child{border-bottom:0;}
  .origin-foot{margin-top:22px;padding-top:16px;border-top:1px solid rgba(43,29,18,0.18);
    font-size:0.9rem;color:var(--espresso-soft);}''')

# ---------- 3. tooltip + hint inside the map plate ----------
swap('</svg>\n    </div>\n  </div>\n</section>', '''</svg>
      <div class="map-tip" id="map-tip" aria-hidden="true"></div>
    </div>
    <p class="map-hint">
      <span class="lang-en">Select a highlighted country to see the qualities we supply from that origin.</span>
      <span class="lang-si">Izberite označeno državo za pregled kakovosti, ki jih dobavljamo iz tega porekla.</span>
    </p>
  </div>
</section>''')

# ---------- 4. origin modal ----------
swap('<a class="wa-float"', '''<div class="modal" id="origin-modal" role="dialog" aria-modal="true" aria-labelledby="origin-title">
  <div class="modal-back" data-oclose></div>
  <div class="modal-card">
    <button class="modal-close" data-oclose aria-label="Close">&times;</button>
    <h3 id="origin-title"></h3>
    <ul class="origin-list" id="origin-items"></ul>
    <p class="origin-foot">
      <span class="lang-en">Availability, crop year and pricing on request — other qualities from this origin can be sourced to order.</span>
      <span class="lang-si">Razpoložljivost, letina in cene na zahtevo — iz tega porekla lahko po naročilu zagotovimo tudi druge kakovosti.</span>
    </p>
  </div>
</div>

<a class="wa-float"''')

# ---------- 5. data + behaviour ----------
DATA_JS = '''<script>
/* =====================================================================
   Origins shown on the map. Country name must match the map exactly.
   "items" = qualities offered from that origin — edit freely.
   ===================================================================== */
var ORIGIN_DATA = {
  'Brazil':          { si:'Brazilija',        items:['Santos NY 2/3 scr 17/18','Cerrado NY 2 scr 17/18','Mogiana scr 17/18'] },
  'Colombia':        { si:'Kolumbija',        items:['Excelso EP','Supremo scr 18'] },
  'Peru':            { si:'Peru',             items:['Grade 1 MCM','Organic Grade 1'] },
  'Honduras':        { si:'Honduras',         items:['SHG EP','HG EP'] },
  'Guatemala':       { si:'Gvatemala',        items:['SHB EP','HB EP'] },
  'Nicaragua':       { si:'Nikaragva',        items:['SHG EP'] },
  'Costa Rica':      { si:'Kostarika',        items:['SHB EP'] },
  'El Salvador':     { si:'Salvador',         items:['SHG EP'] },
  'Mexico':          { si:'Mehika',           items:['Altura HG EP'] },
  'Ethiopia':        { si:'Etiopija',         items:['Sidamo Grade 4','Djimmah Grade 5','Yirgacheffe Grade 2'] },
  'Uganda':          { si:'Uganda',           items:['Robusta scr 18','Bugisu AA'] },
  'Kenya':           { si:'Kenija',           items:['AA','AB'] },
  'Tanzania':        { si:'Tanzanija',        items:['AA','AB'] },
  'Rwanda':          { si:'Ruanda',           items:['Fully Washed A'] },
  'Burundi':         { si:'Burundi',          items:['Fully Washed A'] },
  "Côte d'Ivoire":   { si:'Slonokoščena obala', items:['Robusta Grade 2'] },
  'Cameroon':        { si:'Kamerun',          items:['Robusta Grade 1'] },
  'Dem. Rep. Congo': { si:'Demokratična republika Kongo', items:['Kivu AB'] },
  'Vietnam':         { si:'Vietnam',          items:['Robusta Grade 1 scr 18','Robusta Grade 2 scr 13'] },
  'India':           { si:'Indija',           items:['Cherry AB','Parchment AA','Robusta Kaapi Royale'] },
  'Indonesia':       { si:'Indonezija',       items:['Sumatra Mandheling G1','Java Robusta EK-1'] },
  'Papua New Guinea':{ si:'Papua Nova Gvineja', items:['AA','Y-Grade'] }
};
</script>
<script>
(function(){
  var svg   = document.getElementById('origin-map');
  var plate = svg ? svg.closest('.map-plate') : null;
  var tip   = document.getElementById('map-tip');
  var modal = document.getElementById('origin-modal');
  if(!svg || !plate || !tip || !modal) return;

  var titleEl = document.getElementById('origin-title');
  var listEl  = document.getElementById('origin-items');
  var isSI    = function(){ return document.body.classList.contains('si'); };

  function label(key){
    var rec = ORIGIN_DATA[key];
    if(!rec) return key;
    return (isSI() && rec.si) ? rec.si : key;
  }

  function showTip(el, ev){
    var key = el.getAttribute('data-origin');
    var rec = ORIGIN_DATA[key];
    var n   = rec && rec.items ? rec.items.length : 0;
    var word = isSI()
      ? (n === 1 ? 'kakovost' : (n === 2 ? 'kakovosti' : (n < 5 ? 'kakovosti' : 'kakovosti')))
      : (n === 1 ? 'quality' : 'qualities');
    tip.innerHTML = '<b>' + label(key) + '</b>' + (n ? '<span>' + n + ' ' + word + '</span>' : '');
    var r = plate.getBoundingClientRect();
    var x = (ev && ev.clientX !== undefined) ? ev.clientX - r.left : 0;
    var y = (ev && ev.clientY !== undefined) ? ev.clientY - r.top  : 0;
    if(!ev || ev.clientX === undefined){
      var b = el.getBoundingClientRect();
      x = b.left + b.width / 2 - r.left;
      y = b.top - r.top;
    }
    tip.style.left = x + 'px';
    tip.style.top  = y + 'px';
    tip.classList.add('show');
  }
  function hideTip(){ tip.classList.remove('show'); }

  function openOrigin(key){
    var rec = ORIGIN_DATA[key];
    if(!rec) return;
    titleEl.textContent = label(key);
    listEl.innerHTML = '';
    (rec.items || []).forEach(function(it){
      var li = document.createElement('li');
      li.textContent = it;
      listEl.appendChild(li);
    });
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeOrigin(){
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  svg.querySelectorAll('.origin').forEach(function(el){
    el.addEventListener('mouseenter', function(ev){ showTip(el, ev); });
    el.addEventListener('mousemove',  function(ev){ showTip(el, ev); });
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('focus',      function(){ showTip(el, null); });
    el.addEventListener('blur',       hideTip);
    el.addEventListener('click',      function(){ hideTip(); openOrigin(el.getAttribute('data-origin')); });
    el.addEventListener('keydown',    function(ev){
      if(ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); openOrigin(el.getAttribute('data-origin')); }
    });
  });

  modal.querySelectorAll('[data-oclose]').forEach(function(x){ x.addEventListener('click', closeOrigin); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeOrigin(); });
})();
</script>
</body>'''

assert html.count('</body>') == 1
html = html.replace('</body>', DATA_JS, 1)

open(p, 'w', encoding='utf-8').write(html)
print('ok, size', len(html))
for probe in ['origin-map', 'ORIGIN_DATA', 'map-tip', 'origin-modal', 'class="origin"']:
    print(probe, '->', html.count(probe))
