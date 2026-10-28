  /* ---- shrub variants (dev: #bush=a|b|c, #trees=1) ---- */
  var BUSH = (/bush=([a-z0-9])/.exec(HASH) || [0, '0'])[1], NEWTREES = /trees=1/.test(HASH);
  var LEAF_C = [C('#4A5E2C'), C('#53672F'), C('#5A6E36'), C('#445726')];
  function lumpy(ws, hs, lobes, amp){
    var g = new T.SphereGeometry(1, ws, hs), p = g.attributes.position, v = new T.Vector3();
    for(var i=0;i<p.count;i++){ v.fromBufferAttribute(p, i); var th = Math.atan2(v.z, v.x), eq = 1 - Math.abs(v.y);
      var d = 1 + amp*Math.sin(th*lobes + 1.1)*eq + .05*Math.sin(v.x*5.1 + 1.3)*Math.sin(v.y*4.3 + .7);
      p.setXYZ(i, v.x*d, v.y*(1 + .05*Math.sin(th*3)), v.z*d); }
    g.computeVertexNormals(); return g;
  }
  var tierGeo = lumpy(LOWP ? 12 : 16, LOWP ? 5 : 7, 9, .16);
  var leafGeo = (function(){
    var list = [], n = 4;
    for(var i=0;i<n;i++){
      var g = new T.OctahedronGeometry(1, 0); g.scale(.5, .07, .2); g.translate(.5, 0, 0);
      g.rotateZ(-.25 - i*.06); g.rotateY((i - (n - 1)/2)*.55); g.translate(0, (i % 2)*.05, 0);
      list.push(g.toNonIndexed ? g.toNonIndexed() : g);
    }
    var tot = 0; list.forEach(function(g){ tot += g.attributes.position.count; });
    var pos = new Float32Array(tot*3), o = 0; list.forEach(function(g){ pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; });
    var m = new T.BufferGeometry(); m.setAttribute('position', new T.BufferAttribute(pos, 3)); m.computeVertexNormals(); return m;
  })();
  var plantGeo = BUSH === 'c' ? leafGeo : (BUSH === 'a' || BUSH === 'b') ? tierGeo : null;
  function pushPlant(p, r3, sx, sy, sz, col){ q.setFromEuler(r3); mtx.compose(p, q, sv.set(sx, sy, sz)); blobM.push(mtx.clone()); blobC.push(col); }
  function pushCherry(base, R, ripe, thr, far){
    for(var k=0;k<3;k++){
      mtx.compose(base.clone().add(V((R() - .5)*.1, (R() - .5)*.08, (R() - .5)*.1)), q.identity(), sv.setScalar(.1*(.85 + R()*.3)));
      if(far){ cherryFarM.push(mtx.clone()); cherryFarC.push(ripe); cherryFarThr.push(thr); }
      else { cherryM.push(mtx.clone()); cherryC.push(ripe); cherryThr.push(thr); }
    }
  }
  function leafCol(R, t){ return LEAF_C[Math.floor(R()*LEAF_C.length)].clone().multiplyScalar(.86 + t*.18 + R()*.1); }
  /* A: tiered Arabica — a pyramid of layered branch tiers */
  function shrubA(R, x, y0, z, H, nTiers, nClusters, far){
    var W = H*.56; pushStick(V(x, y0, z), V(x, y0 + H*.92, z), .045);
    for(var k=0;k<nTiers;k++){
      var t = k/(nTiers - 1), y = y0 + H*(.2 + t*.64), r = W*(1 - t*.6)*(.92 + R()*.16);
      pushPlant(V(x + (R() - .5)*.06, y, z + (R() - .5)*.06), new T.Euler((R() - .5)*.14, R()*6.28, (R() - .5)*.14), r, r*.36*(1 + t*.4), r, leafCol(R, t));
      if(k < nTiers - 1) for(var c=0;c<nClusters;c++){
        var ca = R()*6.28, cr = r*(.78 + R()*.2);
        pushCherry(V(x + Math.cos(ca)*cr, y - r*.1, z + Math.sin(ca)*cr), R, CH_RIPE[Math.floor(R()*CH_RIPE.length)], R()*.55, far);
      }
    }
    pushPlant(V(x, y0 + H*.97, z), new T.Euler(0, R()*6, 0), W*.2, W*.22, W*.2, leafCol(R, 1));
  }
  /* B: hedgerow — shrubs grown into continuous rows, as on modern plantations */
  function shrubB(R, x, y0, z, H, nBlobs, nClusters, far){
    var W = H*.46; pushStick(V(x, y0, z), V(x, y0 + H*.3, z), .05);
    pushPlant(V(x, y0 + H*.47, z), new T.Euler(0, (R() - .5)*.2, 0), 1.08, H*.47, W, leafCol(R, .4));
    for(var i=0;i<2;i++) pushPlant(V(x + (i - .5)*.8 + (R() - .5)*.2, y0 + H*(.86 + R()*.08), z + (R() - .5)*.2), new T.Euler(0, R()*6, 0), .5, .3, .48, leafCol(R, .9));
    for(var c=0;c<nClusters*2;c++){
      var side = R() < .5 ? -1 : 1, cx = x + (R() - .5)*1.6, cy = y0 + H*(.25 + R()*.5);
      pushCherry(V(cx, cy, z + side*W*.98), R, CH_RIPE[Math.floor(R()*CH_RIPE.length)], R()*.55, far);
    }
  }
  /* C: botanical — branches in tiers, each carrying drooping leaf sprays, cherries along the wood */
  function shrubC(R, x, y0, z, H, nTiers, nClusters, far){
    var W = H*.58; pushStick(V(x, y0, z), V(x, y0 + H*.95, z), .04);
    var nB = far ? 3 : 4, perB = far ? 1 : 2;
    for(var k=0;k<nTiers;k++){
      var t = k/(nTiers - 1), y = y0 + H*(.22 + t*.66), r = W*(1 - t*.55)*(.9 + R()*.2), a0 = R()*6.28;
      for(var b=0;b<nB;b++){
        var a = a0 + b*6.28/nB + (R() - .5)*.5;
        for(var j=0;j<perB;j++){
          var d = r*(perB === 1 ? .62 : (j ? .82 : .42)), dy = -d*.12;
          var s = H*(.2 + R()*.06)*(1 - t*.35);
          pushPlant(V(x + Math.cos(a)*d, y + dy, z + Math.sin(a)*d), new T.Euler(0, -a + (R() - .5)*.4, (R() - .5)*.25), s, s, s, leafCol(R, t));
        }
        if(k < nTiers - 1 && b < nClusters){
          var cd = r*(.3 + R()*.25);
          pushCherry(V(x + Math.cos(a)*cd, y - .08, z + Math.sin(a)*cd), R, CH_RIPE[Math.floor(R()*CH_RIPE.length)], R()*.55, far);
        }
      }
    }
    pushPlant(V(x, y0 + H*.98, z), new T.Euler(0, R()*6, Math.PI/2*.8), H*.16, H*.16, H*.16, leafCol(R, 1));
  }
  /* shade trees: inga-like umbrella crowns over the rows */
  function treeShade(R, x, y0, z, H, mg){
    place(new T.CylinderGeometry(.12*H/8, .22*H/8, H*.72, 8), soft('#6B5A45'), x, y0 + H*.36, z, 0, 0, 0, mg);
    for(var i=0;i<4;i++){
      var r = H*(.34 - i*.06)*(.9 + R()*.2), a = R()*6.28, d = i ? H*.12 : 0;
      dummy.position.set(x + Math.cos(a)*d, y0 + H*(.7 + i*.07), z + Math.sin(a)*d); dummy.rotation.set((R() - .5)*.1, R()*3, (R() - .5)*.1); dummy.scale.set(r, r*.3, r); dummy.updateMatrix();
      mg.put(tierGeo, soft(i%2 ? '#5C7038' : '#4E6230'), dummy.matrix);
    }
  }
