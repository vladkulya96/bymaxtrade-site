"""Port the safe improvements from the 25 Oct live artifact into the package and previews:
hidden-sack culling in the warehouse, shadows every third frame on phones, the resize fix, and the full company name in the footer."""
import sys

LIVE = '/tmp/claude-0/-home-claude/759bf9c6-b197-5a61-b59f-f649f1b09bf2/scratchpad/diff/live_film.js'
live = open(LIVE, encoding='utf-8').read()

def block(s, start, end_before):
    i = s.index(start); j = s.index(end_before, i)
    return i, j

def port(s):
    if 'LAY.push(layers)' not in s:
        a0 = '      var SX = [], RS = rng(77);'
        end = '      var sm = new T.InstancedMesh(sackGeos[0], juteM, SX.length);'
        li, lj = block(live, '      var SX = [], RS = rng(77), LAY = [];', end)
        assert s.count(a0) == 1 and s.count(end) == 1
        si, sj = block(s, a0, end)
        s = s[:si] + live[li:lj] + s[sj:]
    reps = [
        ("if(!LOWP || (shN++ & 1) === 0) renderer.shadowMap.needsUpdate = true;   /* phones: shadows every second frame */",
         "if(!LOWP || (shN++ % 3) === 0) renderer.shadowMap.needsUpdate = true;   /* phones: shadows every third frame */"),
        ("rt = setTimeout(function(){ if(quad) resize(); measure(); }, 160);",
         "rt = setTimeout(function(){ if(quad) resize(); if(!FM) measure(); }, 160);"),
    ]
    for a, b in reps:
        if b in s: continue
        assert s.count(a) == 1, a[:60]
        s = s.replace(a, b)
    s = s.replace('<p class="name">By Maxtrade d.o.o.</p>', '<p class="name">BY MAXTRADE d.o.o.</p>')
    return s

if __name__ == '__main__':
    for p in sys.argv[1:]:
        s = open(p, encoding='utf-8').read()
        out = port(s)
        open(p, 'w', encoding='utf-8').write(out)
        print('ported', p)
