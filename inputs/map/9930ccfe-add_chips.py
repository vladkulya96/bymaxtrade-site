p = '/home/claude/index.html'
html = open(p, encoding='utf-8').read()

def swap(old, new, count=1):
    global html
    assert html.count(old) >= 1, 'NOT FOUND: ' + old[:80]
    html = html.replace(old, new, count)

# ---------- CSS ----------
swap('  .map-hint{margin-top:14px;font-size:0.88rem;color:var(--espresso-soft);}',
'''  .map-hint{margin-top:14px;font-size:0.88rem;color:var(--espresso-soft);}
  .origin-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;padding:0;list-style:none;}
  .origin-chips button{
    font-family:'Karla',sans-serif;font-size:0.9rem;color:var(--espresso);
    background:transparent;border:1px solid rgba(43,29,18,0.28);border-radius:3px;
    padding:7px 14px;cursor:pointer;transition:background .15s ease,border-color .15s ease;
  }
  .origin-chips button:hover,.origin-chips button:focus-visible{
    background:rgba(110,122,69,0.16);border-color:var(--olive);outline:none;
  }
  @media (max-width:860px){
    .map-hint{display:none;}
    .origin-chips{margin-top:20px;}
  }''')

# ---------- markup ----------
swap('''    <p class="map-hint">
      <span class="lang-en">Select a highlighted country to see the qualities we supply from that origin.</span>
      <span class="lang-si">Izberite označeno državo za pregled kakovosti, ki jih dobavljamo iz tega porekla.</span>
    </p>''',
'''    <p class="map-hint">
      <span class="lang-en">Select a highlighted country to see the qualities we supply from that origin.</span>
      <span class="lang-si">Izberite označeno državo za pregled kakovosti, ki jih dobavljamo iz tega porekla.</span>
    </p>
    <p class="map-hint" style="display:none" data-chip-hint>
      <span class="lang-en">Select an origin to see the qualities we supply.</span>
      <span class="lang-si">Izberite poreklo za pregled kakovosti, ki jih dobavljamo.</span>
    </p>
    <ul class="origin-chips" id="origin-chips"></ul>''')

# ---------- behaviour: build chips, wire them to the same modal ----------
swap('''  modal.querySelectorAll('[data-oclose]').forEach(function(x){ x.addEventListener('click', closeOrigin); });''',
'''  /* country list under the map — the only workable target on a phone,
     where the smallest origins render barely a pixel wide */
  var chips = document.getElementById('origin-chips');
  if(chips){
    Object.keys(ORIGIN_DATA).forEach(function(key){
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-chip', key);
      btn.textContent = label(key);
      btn.addEventListener('click', function(){ openOrigin(key); });
      btn.addEventListener('mouseenter', function(){
        var c = svg.querySelector('[data-origin="' + key.replace(/"/g, '\\\\"') + '"]');
        if(c) c.classList.add('on');
      });
      btn.addEventListener('mouseleave', function(){
        var c = svg.querySelector('[data-origin="' + key.replace(/"/g, '\\\\"') + '"]');
        if(c) c.classList.remove('on');
      });
      li.appendChild(btn);
      chips.appendChild(li);
    });
  }

  /* chip captions and the hint line follow the language switch */
  function relabel(){
    if(chips){
      chips.querySelectorAll('[data-chip]').forEach(function(btn){
        btn.textContent = label(btn.getAttribute('data-chip'));
      });
    }
    var mapHint  = document.querySelector('.map-hint:not([data-chip-hint])');
    var chipHint = document.querySelector('[data-chip-hint]');
    var narrow   = window.matchMedia('(max-width:860px)').matches;
    if(mapHint)  mapHint.style.display  = narrow ? 'none' : '';
    if(chipHint) chipHint.style.display = narrow ? '' : 'none';
  }
  relabel();
  window.addEventListener('resize', relabel);
  document.querySelectorAll('.langs span[data-lang]').forEach(function(el){
    el.addEventListener('click', function(){ setTimeout(relabel, 0); });
  });

  modal.querySelectorAll('[data-oclose]').forEach(function(x){ x.addEventListener('click', closeOrigin); });''')

open(p, 'w', encoding='utf-8').write(html)
print('ok, size', len(html))
for probe in ['origin-chips', 'data-chip', 'relabel']:
    print(probe, '->', html.count(probe))
