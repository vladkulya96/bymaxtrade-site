"""Patch the 3D engine (film.js, or a single-file page that inlines it):
tiered Arabica shrubs (variant A), umbrella shade trees on the plantation, sharper phone rendering."""
import sys

NEW_PLANTS = r"""
  /* coffee shrubs: tiered Arabica — layered branch tiers narrowing upwards, cherries under the tier edges */
  var LEAF_C = [C('#4A5E2C'), C('#53672F'), C('#5A6E36'), C('#445726')];
  function lumpy(ws, hs, lobes, amp){
    var g = new T.SphereGeometry(1, ws, hs), p = g.attributes.position, v = new T.Vector3();
    for(var i=0;i<p.count;i++){ v.fromBufferAttribute(p, i); var th = Math.atan2(v.z, v.x), eq = 1 - Math.abs(v.y);
      var d = 1 + amp*Math.sin(th*lobes + 1.1)*eq + .05*Math.sin(v.x*5.1 + 1.3)*Math.sin(v.y*4.3 + .7);
      p.setXYZ(i, v.x*d, v.y*(1 + .05*Math.sin(th*3)), v.z*d); }
    g.computeVertexNormals(); return g;
  }
  var tierGeo = lumpy(LOWP ? 14 : 16, LOWP ? 6 : 7, 9, .16);
  function leafCol(R, t){ return LEAF_C[Math.floor(R()*LEAF_C.length)].clone().multiplyScalar(.86 + t*.18 + R()*.1); }
  function pushTier(p, e, sx, sy, sz, col){ q.setFromEuler(e); mtx.compose(p, q, sv.set(sx, sy, sz)); blobM.push(mtx.clone()); blobC.push(col); }
  function pushCherry(base, R, ripe, thr, far){
    for(var k=0;k<3;k++){
      mtx.compose(base.clone().add(V((R() - .5)*.1, (R() - .5)*.08, (R() - .5)*.1)), q.identity(), sv.setScalar(.1*(.85 + R()*.3)));
      if(far){ cherryFarM.push(mtx.clone()); cherryFarC.push(ripe); cherryFarThr.push(thr); }
      else { cherryM.push(mtx.clone()); cherryC.push(ripe); cherryThr.push(thr); }
    }
  }
  function shrub(R, x, y0, z, H, nTiers, nClusters, far){
    var W = H*.5; pushStick(V(x, y0, z), V(x, y0 + H*.92, z), .045);
    for(var k=0;k<nTiers;k++){
      var t = k/(nTiers - 1), y = y0 + H*(.24 + t*.6), r = W*(1.08 - t*.42)*(.88 + R()*.24), jx = (R() - .5)*W*.22, jz = (R() - .5)*W*.22;
      pushTier(V(x + jx, y, z + jz), new T.Euler((R() - .5)*.22, R()*6.28, (R() - .5)*.22), r*(.9 + R()*.2), r*.42*(1 + t*.5), r, leafCol(R, t));
      if(k < nTiers - 1) for(var c=0;c<nClusters;c++){
        var ca = R()*6.28, cr = r*(.78 + R()*.2);
        pushCherry(V(x + Math.cos(ca)*cr, y - r*.1, z + Math.sin(ca)*cr), R, CH_RIPE[Math.floor(R()*CH_RIPE.length)], R()*.55, far);
      }
    }
    pushTier(V(x, y0 + H*.94, z), new T.Euler(0, R()*6, 0), W*.32, W*.26, W*.32, leafCol(R, 1));
  }
  /* shade trees over the plantation: inga-like umbrella crowns on a tall trunk */
  function shadeTree(R, x, y0, z, H, mg){
    place(new T.CylinderGeometry(.12*H/8, .22*H/8, H*.72, 8), soft('#6B5A45'), x, y0 + H*.36, z, 0, 0, 0, mg);
    for(var i=0;i<4;i++){
      var r = H*(.34 - i*.06)*(.9 + R()*.2), a = R()*6.28, d = i ? H*.12 : 0;
      dummy.position.set(x + Math.cos(a)*d, y0 + H*(.7 + i*.07), z + Math.sin(a)*d); dummy.rotation.set((R() - .5)*.1, R()*3, (R() - .5)*.1); dummy.scale.set(r, r*.3, r); dummy.updateMatrix();
      mg.put(tierGeo, soft(i%2 ? '#5C7038' : '#4E6230'), dummy.matrix);
    }
  }
"""

def patch(s):
    reps = [
        # phones: render up to 2.5 device px per CSS px; the adaptive floor stays sharp (1.5)
        ("renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOWP ? 1 : 1.5));",
         "var PR0 = Math.min(window.devicePixelRatio || 1, LOWP ? 2.5 : 1.5), PRMIN = Math.min(PR0, LOWP ? 1.5 : .8);\n  renderer.setPixelRatio(PR0);"),
        ("renderer.shadowMap.type = LOWP ? T.PCFShadowMap : T.VSMShadowMap;",
         "renderer.shadowMap.type = LOWP ? T.PCFSoftShadowMap : T.VSMShadowMap;"),
        ("sun.shadow.mapSize.set(LOWP ? 1024 : 2048, LOWP ? 1024 : 2048);", "sun.shadow.mapSize.set(2048, 2048);"),
        ("new T.BoxGeometry(.95, .3, .62, LOWP ? 10 : 20, LOWP ? 3 : 5, LOWP ? 7 : 14)",
         "new T.BoxGeometry(.95, .3, .62, LOWP ? 14 : 20, LOWP ? 4 : 5, LOWP ? 10 : 14)"),
        ("var g = new T.SphereGeometry(1, LOWP ? 7 : 10, LOWP ? 5 : 7), p = g.attributes.position, v = new T.Vector3();",
         "var g = new T.SphereGeometry(1, 10, 7), p = g.attributes.position, v = new T.Vector3();"),
        ("cherries = new T.InstancedMesh((LOWP ? new T.OctahedronGeometry(1, 0) : new T.IcosahedronGeometry(1, 0)), cmat, cherryM.length);",
         "cherries = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), cmat, cherryM.length);"),
        ("cherriesFar = new T.InstancedMesh((LOWP ? new T.OctahedronGeometry(1, 0) : new T.IcosahedronGeometry(1, 0)), cmat, Math.max(1, cherryFarM.length));",
         "cherriesFar = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), cmat, Math.max(1, cherryFarM.length));"),
        ("if(fN > 70 && fEma > (LOWP ? 26 : 22) && qPR > (LOWP ? .55 : .8)){\n        qPR = Math.max(LOWP ? .55 : .8, qPR*.85);",
         "if(fN > 70 && fEma > (LOWP ? 30 : 22) && qPR > PRMIN){\n        qPR = Math.max(PRMIN, qPR*.9);"),
        # edge lines keep the same width in CSS pixels at any density
        ("'    vec2 t = 1.0 / res;',", "'    vec2 t = max(1.0, pr / 1.5) / res;',"),
        ("var bm = new T.InstancedMesh(blobGeo,", "var bm = new T.InstancedMesh(tierGeo,"),
        ("shrub(RR, sx, th(sx, szz), szz, 1.85 + RR()*.35, near ? 4 : 3, row < 16 ? (near ? 4 : 3) : 1, !near);",
         "shrub(RR, sx, th(sx, szz), szz, 1.95 + RR()*.35, near ? 5 : 4, row < 16 ? (near ? 4 : 3) : 1, !near);"),
    ]
    for a, b in reps:
        n = s.count(a)
        assert n == 1, (n, a[:70])
        s = s.replace(a, b)
    # plantation trees become umbrella shade trees (the Koper trees stay round)
    for key in ("[[-190,-82]", "[[-110,40]"):
        i = s.index(key); j = s.index("\n", i)
        line = s[i:j]; assert line.count("tree(RT,") == 1, line[:80]
        s = s[:i] + line.replace("tree(RT,", "shadeTree(RT,") + s[j:]
    # replace the old ball shrub with the tiered one
    i = s.index("  function shrub(R, x, y0, z, H, nBlobs, nClusters, far){"); j = s.index("  function tree(R, x, y0, z, H, mg){")
    s = s[:i] + NEW_PLANTS.lstrip("\n") + s[j:]
    return s

if __name__ == "__main__":
    for p in sys.argv[1:]:
        s = open(p, encoding="utf-8").read()
        out = patch(s)
        open(p, "w", encoding="utf-8").write(out)
        print("patched", p)
