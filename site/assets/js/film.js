/* BY MAXTRADE — the 3D voyage (scene, camera, scroll film). No texts here: see the MTL block at the top of index.html. */
var MXROOT = (window.MTL && window.MTL.root) || '';   /* path prefix to the site root: '' on the Slovenian page, '../' on /en/ */
(function(){
  'use strict';
  var STYLE = 1;          /* composite look: 2 = mix (soft volume + ink), 1 = engraving */
  var cv = document.getElementById('world'), loadingEl = document.getElementById('filmLoading');
  var HASH = location.hash || '', FM = /film=([\d.]+)/.exec(HASH), SNAP = !!FM;
  var reduce = false;   /* the voyage is driven by the reader's own scroll */
  function done(){ loadingEl.classList.add('done'); }
  if(!window.THREE){ done(); return; }
  var T = window.THREE, renderer;
  var LOWP = window.innerWidth < 760 || (!!(window.matchMedia && matchMedia('(pointer:coarse)').matches) && Math.min(window.innerWidth, window.innerHeight) < 820);
  try { renderer = new T.WebGLRenderer({canvas:cv, antialias:false, powerPreference:'high-performance'}); } catch(e){ done(); return; }

  var PR0 = Math.min(window.devicePixelRatio || 1, LOWP ? 2.5 : 1.5), PRMIN = Math.min(PR0, LOWP ? 1.5 : .8);
  renderer.setPixelRatio(PR0);
  renderer.outputEncoding = T.LinearEncoding;     /* the composite pass applies the tone curve */
  renderer.toneMapping = T.NoToneMapping;
  renderer.physicallyCorrectLights = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = LOWP ? T.PCFSoftShadowMap : T.VSMShadowMap;       /* blurred, soft-edged shadows */
  renderer.shadowMap.autoUpdate = false;
  var ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  /* ---------------------------------------------------------------- helpers */
  function rng(seed){ return function(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function clamp(v,a,b){ return v < a ? a : v > b ? b : v; }
  function lerp(a,b,t){ return a + (b-a)*t; }
  function smooth(a,b,x){ var t = clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); }
  function ease(t){ t = clamp(t,0,1); return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }
  function C(hex){ return new T.Color(hex).convertSRGBToLinear(); }
  function V(x,y,z){ return new T.Vector3(x,y,z); }
  function noise2(seed, P){
    var R = rng(seed), g = new Float32Array(P*P); for(var i=0;i<g.length;i++) g[i] = R();
    return function(x,y){
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      var x0 = ((xi % P) + P) % P, y0 = ((yi % P) + P) % P, x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
      var u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf), a = g[y0*P+x0], b = g[y0*P+x1], c = g[y1*P+x0], d = g[y1*P+x1];
      return a + (b-a)*u + (c-a)*v + (a-b-c+d)*u*v;
    };
  }
  function fbm(n, x, y, oct){ var s = 0, amp = .5, f = 1, norm = 0; for(var o=0;o<oct;o++){ s += amp*n(x*f, y*f); norm += amp; amp *= .5; f *= 2; } return s/norm; }
  function canvasOf(w,h){ var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function texOf(c, srgb, rx, ry){ var t = new T.CanvasTexture(c); if(srgb) t.encoding = T.sRGBEncoding; t.anisotropy = ANISO; if(rx){ t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry || rx); } return t; }
  var matCache = {};
  function soft(hex, o){
    var k = hex + JSON.stringify(o || {}); if(matCache[k]) return matCache[k];
    var p = {color:C(hex), roughness:.85, metalness:0}; if(o) for(var j in o) p[j] = o[j];
    return (matCache[k] = new T.MeshStandardMaterial(p));
  }
  function rbox(w, h, d, r){
    r = Math.min(r, w/2 - .001, h/2 - .001, d/2 - .001);
    if(r <= .002) return new T.BoxGeometry(w, h, d);
    var s = new T.Shape(), x = -w/2 + r, y = -h/2 + r, W = w - 2*r, H = h - 2*r;
    s.moveTo(x, y); s.lineTo(x + W, y); s.lineTo(x + W, y + H); s.lineTo(x, y + H); s.lineTo(x, y);
    var g = new T.ExtrudeGeometry(s, {depth:Math.max(.0005, d - 2*r), bevelEnabled:true, bevelThickness:r, bevelSize:r, bevelSegments:2, curveSegments:2});
    g.translate(0, 0, -(d - 2*r)/2); return g;
  }
  function add(m, parent, cast, recv){ m.castShadow = cast !== false; m.receiveShadow = recv !== false; parent.add(m); return m; }
  function mergeList(list){
    var n = 0; list.forEach(function(g){ n += g.attributes.position.count; });
    var pos = new Float32Array(n*3), nor = new Float32Array(n*3), uv = new Float32Array(n*2), o = 0;
    list.forEach(function(g){ pos.set(g.attributes.position.array, o*3); nor.set(g.attributes.normal.array, o*3); if(g.attributes.uv) uv.set(g.attributes.uv.array, o*2); o += g.attributes.position.count; });
    var mg = new T.BufferGeometry(); mg.setAttribute('position', new T.BufferAttribute(pos, 3)); mg.setAttribute('normal', new T.BufferAttribute(nor, 3)); mg.setAttribute('uv', new T.BufferAttribute(uv, 2));
    return mg;
  }
  function Merger(){ this.isMerger = true; this.bins = {}; this.mats = {}; }
  Merger.prototype.put = function(geo, mat, m4){ var g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m4); (this.bins[mat.uuid] = this.bins[mat.uuid] || []).push(g); this.mats[mat.uuid] = mat; };
  Merger.prototype.flush = function(parent, cast, recv){ for(var id in this.bins) add(new T.Mesh(mergeList(this.bins[id]), this.mats[id]), parent, cast, recv); this.bins = {}; return parent; };
  Merger.prototype.single = function(){ var all = []; for(var id in this.bins) all = all.concat(this.bins[id]); return mergeList(all); };
  var dummy = new T.Object3D();
  function place(geo, mat, x, y, z, rx, ry, rz, parent, cast){
    if(parent.isMerger){ dummy.position.set(x, y, z); dummy.rotation.set(rx || 0, ry || 0, rz || 0); dummy.scale.set(1,1,1); dummy.updateMatrix(); parent.put(geo, mat, dummy.matrix); return null; }
    var m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0); return add(m, parent, cast);
  }
  function mbox(w,h,d,r,mat,x,y,z,parent,cast,ry){ return place(rbox(w,h,d,r), mat, x, y, z, 0, ry || 0, 0, parent, cast); }
  function strut(a, b, t, mat, parent){
    var d = new T.Vector3().subVectors(b, a), geo = rbox(t, t, d.length(), t*.25);
    dummy.position.copy(a).addScaledVector(d, .5); dummy.rotation.set(0,0,0); dummy.scale.set(1,1,1); dummy.lookAt(b); dummy.updateMatrix();
    if(parent.isMerger){ parent.put(geo, mat, dummy.matrix); return null; }
    var m = new T.Mesh(geo, mat); m.applyMatrix4(dummy.matrix); return add(m, parent);
  }
  var mtx = new T.Matrix4(), q = new T.Quaternion(), sv = new T.Vector3(), UP = V(0,1,0);

  /* palette */
  var P = {cream:'#EFE6D6', stone:'#DCD1BD', clay:'#CBBFAA', jute:'#C9A877', wood:'#D9BE91', soil:'#B58D63', olive:'#6E7A45', leaf:'#627239',
           ox:'#6E7A45', oxD:'#4A5030', green:'#7C8B4A', dark:'#3A2A1F', brown:'#5E4A3C', gold:'#C9A45C', taupe:'#C8B8A8', khaki:'#D8C6A2', slate:'#3F4A4C',
           umber:'#8C6A3C', moss:'#5B4C3A', glass:'#46504F', grass:'#9AA366', sand:'#E6D7B8', water:'#8FA39C', hill:'#A9AF7E', roof:'#B5553C'};

  /* logo image (the coffee branch from the brand mark) */
  var LOGO = new Image(); LOGO.src = MXROOT + 'assets/img/logo-mark.webp'; var LOGOF = new Image(); LOGOF.src = MXROOT + 'assets/img/logo-full.webp';
  function drawLogo(g, cx, cy, h){ if(!LOGO.complete || !LOGO.naturalWidth) return; var w = h*LOGO.naturalWidth/LOGO.naturalHeight; g.drawImage(LOGO, cx - w/2, cy - h/2, w, h); }

  /* ---------------------------------------------------------------- scene, light */
  var scene = new T.Scene();
  var camera = new T.PerspectiveCamera(30, 1, .5, 3000);
  var hemi = new T.HemisphereLight(C('#F4ECDD'), C('#B39A78'), .75); scene.add(hemi);
  var sun = new T.DirectionalLight(C('#FFF0DC'), 2.1); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 8; sun.shadow.bias = -.0006; sun.shadow.normalBias = .04;
  var scm = sun.shadow.camera; scm.near = 5; scm.far = 900;
  scene.add(sun); scene.add(sun.target);
  var SUN_DIR = V(-.48, .78, .4).normalize();

  var gOrigin = new T.Group(), gKoper = new T.Group(), gMap = new T.Group();
  scene.add(gOrigin); scene.add(gKoper); scene.add(gMap);
  var KX = 6000; gKoper.position.x = KX;
  var noEdge = [];   /* drawn in colour but kept out of the outline buffer */

  /* ---------------------------------------------------------------- textures */
  function sackPrint(alpha){
    var W = 512, H = 336, c = canvasOf(W, H), g = c.getContext('2d');
    paintSackPrint(g, W, H, alpha); return c;
  }
  function paintSackPrint(g, W, H, alpha){
    g.globalAlpha = 1; g.fillStyle = P.jute; g.fillRect(0, 0, W, H);
    if(alpha <= 0) return;
    g.globalAlpha = alpha;
    drawLogo(g, W/2, H*.27, H*.36);
    g.fillStyle = 'rgba(58,39,22,.9)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '54px \"IM Fell English SC\", Georgia, serif'; g.fillText('BY MAXTRADE', W/2, H*.6);
    g.fillRect(W*.27, H*.71, W*.46, 4);
    g.font = '28px \"EB Garamond\", Georgia, serif'; g.fillText((window.MTL || {}).sack || 'GREEN COFFEE  ·  60 KG', W/2, H*.82);
    g.globalAlpha = 1;
  }
  function roundel(g, cx, cy, r, ring){
    g.fillStyle = P.cream; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI*2); g.fill();
    g.strokeStyle = ring; g.lineWidth = r*.05; g.beginPath(); g.arc(cx, cy, r*.9, 0, Math.PI*2); g.stroke();
    drawLogo(g, cx, cy, r*1.25);
  }
  function containerDecal(){
    var c = canvasOf(1024, 420), g = c.getContext('2d');
    roundel(g, 190, 210, 165, P.oxD);
    g.fillStyle = P.cream; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.font = '128px \"IM Fell English SC\", Georgia, serif'; g.fillText('BY MAXTRADE', 390, 180);
    g.font = '46px \"EB Garamond\", Georgia, serif'; g.fillText((window.MTL || {}).cont || 'GREEN COFFEE  ·  KOPER', 396, 290);
    return texOf(c, true);
  }
  function roofDecal(){
    var c = canvasOf(1024, 1024), g = c.getContext('2d');
    roundel(g, 512, 430, 360, P.ox);
    g.fillStyle = P.cream; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '118px \"IM Fell English SC\", Georgia, serif'; g.fillText('BY MAXTRADE', 512, 900);
    return texOf(c, true);
  }
  function facadeSign(){
    var c = canvasOf(1024, 200), g = c.getContext('2d');
    drawLogo(g, 120, 100, 180);
    g.fillStyle = P.ox; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = '112px \"IM Fell English SC\", Georgia, serif'; g.fillText('BY MAXTRADE', 240, 108);
    return texOf(c, true);
  }
  function hullBands(){
    var c = canvasOf(8, 256), g = c.getContext('2d');
    for(var y=0;y<256;y++){ var hh = -3 + (1 - y/256)*12.4; g.fillStyle = hh < -1.15 ? P.slate : hh < -.85 ? P.cream : hh > 8.95 ? P.cream : P.brown; g.fillRect(0, y, 8, 1); }
    return texOf(c, true);
  }
  function windowsTex(){
    var c = canvasOf(256,256), g = c.getContext('2d'); g.fillStyle = P.cream; g.fillRect(0,0,256,256);
    g.fillStyle = '#4A4038'; for(var y=24;y<256;y+=36) for(var x=10;x<256;x+=24) g.fillRect(x, y, 14, 12);
    return texOf(c, true, 1, 1);
  }
  function waterNormal(){
    var S = 256, n = noise2(61, 16), n2 = noise2(62, 64), H = new Float32Array(S*S), c = canvasOf(S,S), g = c.getContext('2d'), im = g.createImageData(S,S), d = im.data;
    for(var y=0;y<S;y++) for(var x=0;x<S;x++){ var u = x/S, v = y/S; H[y*S+x] = Math.sin((u*6 + v*2 + fbm(n, u*16, v*16, 2)*1.2)*Math.PI*2)*.35 + Math.sin((u*-3 + v*7)*Math.PI*2)*.2 + fbm(n2, u*64, v*64, 2)*.5; }
    for(var y2=0;y2<S;y2++) for(var x2=0;x2<S;x2++){
      var dx = (H[y2*S+(x2+1)%S] - H[y2*S+(x2-1+S)%S])*2.2, dy = (H[((y2+1)%S)*S+x2] - H[((y2-1+S)%S)*S+x2])*2.2, l = Math.sqrt(dx*dx + dy*dy + 1), k = (y2*S+x2)*4;
      d[k] = (-dx/l*.5 + .5)*255; d[k+1] = (dy/l*.5 + .5)*255; d[k+2] = (1/l*.5 + .5)*255; d[k+3] = 255;
    }
    g.putImageData(im, 0, 0); return texOf(c, false, 600, 600);
  }

  /* ---------------------------------------------------------------- geometry builders */
  function corrugated(len, height, pitch, depth){
    var pos = [], uv = [], prof = [], n = Math.round(len/pitch), step = len/n;
    for(var i=0;i<n;i++){ var x0 = -len/2 + i*step; prof.push([x0, 0], [x0 + step*.24, 0], [x0 + step*.36, -depth], [x0 + step*.64, -depth], [x0 + step*.76, 0]); }
    prof.push([len/2, 0]);
    for(var k=0;k<prof.length-1;k++){
      var a = prof[k], b = prof[k+1];
      pos.push(a[0],0,a[1], b[0],0,b[1], b[0],height,b[1],  a[0],0,a[1], b[0],height,b[1], a[0],height,a[1]);
      var ua = a[0]/len + .5, ub = b[0]/len + .5; uv.push(ua,0, ub,0, ub,1,  ua,0, ub,1, ua,1);
    }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos,3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv,2)); g.computeVertexNormals(); return g;
  }
  /* our 20-foot container: long axis along z, doors at +z, origin at the bottom centre */
  function makeContainer(){
    var L = 6.058, H = 2.591, W = 2.438, grp = new T.Group(), mg = new Merger();
    var mPaint = soft(P.green, {roughness:.7}), mBar = soft(P.taupe, {roughness:.6});
    var side = corrugated(L - .34, H - .3, .278, .036);
    [-1,1].forEach(function(s){ place(side, mPaint, s*W/2, .16, 0, 0, s > 0 ? Math.PI/2 : -Math.PI/2, 0, mg); });
    var roofG = corrugated(L - .34, W - .22, .3, .014); roofG.translate(0, -(W - .22)/2, 0);
    dummy.position.set(0, H - .04, 0); dummy.rotation.set(-Math.PI/2, Math.PI/2, 0, 'YXZ'); dummy.scale.set(1,1,1); dummy.updateMatrix(); mg.put(roofG, mPaint, dummy.matrix);
    var rearG = corrugated(H - .3, W - .3, .28, .03); rearG.translate(0, -(W - .3)/2, 0);
    dummy.position.set(0, H/2, -L/2); dummy.rotation.set(0, Math.PI, Math.PI/2, 'YXZ'); dummy.updateMatrix(); mg.put(rearG, mPaint, dummy.matrix);
    dummy.rotation.order = 'XYZ';
    var doors = [];
    [-1,1].forEach(function(s){
      var pv = new T.Group(); pv.position.set(s*(W/2 - .09), 0, L/2 - .005); grp.add(pv); doors.push({g:pv, s:s});
      add(new T.Mesh(corrugated(W/2 - .07, H - .34, .32, .018), mPaint), pv).position.set(-s*(W/4 - .09), .17, 0);
      [.27, .78].forEach(function(o){ add(new T.Mesh(new T.CylinderGeometry(.022,.022,H - .3,8), mBar), pv).position.set(s*o - s*(W/2 - .09), H/2, .055); });
      add(new T.Mesh(rbox(W/2 - .1, H - .3, .03, .01), soft(P.dark)), pv).position.set(-s*(W/4 - .09), H/2, -.02);
    });
    grp.userData.doors = doors;
    [-1,1].forEach(function(sx){ [-1,1].forEach(function(sz){ mbox(.17, H - .02, .17, .03, mPaint, sx*(W/2 - .085), H/2, sz*(L/2 - .085), mg); }); });
    [-1,1].forEach(function(sx){ mbox(.14,.16,L - .34,.03,mPaint, sx*(W/2 - .05), .08, 0, mg); mbox(.12,.1,L - .34,.03,mPaint, sx*(W/2 - .05), H - .05, 0, mg); });
    [-1,1].forEach(function(sz){ mbox(W - .34,.17,.12,.03,mPaint, 0, H - .085, sz*(L/2 - .06), mg); mbox(W - .34,.14,.12,.03,mPaint, 0, .07, sz*(L/2 - .06), mg); });
    mg.flush(grp);
    var dm = new T.MeshStandardMaterial({map:containerDecal(), transparent:true, roughness:.75, depthWrite:false});
    [-1,1].forEach(function(s){ var p = new T.Mesh(new T.PlaneGeometry(5.0, 2.05), dm); p.rotation.y = s > 0 ? Math.PI/2 : -Math.PI/2; p.position.set(s*(W/2 + .035), 1.32, 0); p.renderOrder = 2; grp.add(p); noEdge.push(p); });
    return grp;
  }
  function sackGeometry(seed){
    var g = new T.BoxGeometry(.95, .3, .62, LOWP ? 14 : 20, LOWP ? 4 : 5, LOWP ? 10 : 14), p = g.attributes.position, n = noise2(seed, 32);
    for(var i=0;i<p.count;i++){
      var x = p.getX(i), y = p.getY(i), z = p.getZ(i), u = x/.475, w = z/.31, v = y/.15;
      var edge = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(u), 5))) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(w), 5)));
      var th = .13*(.3 + .7*edge), yy = v > 0 ? v*th : v*th*.42;
      var wr = (fbm(n, (u + 1)*4, (w + 1)*3, 2) - .5)*.03*edge; yy += v > 0 ? wr : wr*.3;
      var ear = Math.pow(Math.abs(u*w), 3), bulge = 1 + .035*edge*(1 - Math.abs(v));
      p.setXYZ(i, x*(1 + .05*ear)*bulge, yy + .13*.42*.98, z*(1 + .07*ear)*bulge);
    }
    g.computeVertexNormals(); return g;
  }
  var SACK_H = .168;
  var palletGeo = null;
  function palletGeometry(mWood){
    if(palletGeo) return palletGeo;
    var mg = new Merger();
    [-.43, 0, .43].forEach(function(z){ mbox(1.2,.024,.145,.008,mWood,0,.012,z,mg); });
    [-.53, 0, .53].forEach(function(x){ [-.43, 0, .43].forEach(function(z){ mbox(.145,.078,.1,.014,mWood,x,.063,z,mg); }); });
    [-.53, 0, .53].forEach(function(x){ mbox(1.0,.024,.145,.008,mWood,x,.114,0,mg,true,Math.PI/2); });
    [-.44,-.29,-.145,0,.145,.29,.44].forEach(function(z,i){ mbox(1.2,.024,i%3===0 ? .145 : .1,.008,mWood,0,.138,z,mg); });
    return (palletGeo = mg.single());
  }
  function pallets(parent, mWood, list, y){
    var im = new T.InstancedMesh(palletGeometry(mWood), mWood, list.length);
    list.forEach(function(p, i){ mtx.compose(V(p[0], y || 0, p[1]), q.setFromEuler(new T.Euler(0, p[2] || 0, 0)), sv.set(1,1,1)); im.setMatrixAt(i, mtx); });
    return add(im, parent);
  }
  function makeTruck(){
    /* origin at the container centre; container bottom at y 1.45; tractor in front (+x) */
    var g = new T.Group(), mg = new Merger(), cab = soft(P.cream), band = soft(P.olive), dk = soft(P.dark), mid = soft(P.moss), gl = soft(P.glass, {roughness:.35});
    /* container chassis (trailer) */
    [-.55, .55].forEach(function(z){ mbox(7.0, .26, .22, .05, dk, -.1, 1.2, z, mg); });
    for(var cx = -3.2; cx <= 3.1; cx += 1.05) mbox(.14, .14, 2.3, .03, dk, cx, 1.36, 0, mg);
    mbox(.24, .3, 2.44, .06, dk, -3.45, 1.1, 0, mg);                     /* rear bumper */
    [-1.05, 1.05].forEach(function(z){ mbox(.08, .12, .26, .02, soft('#C9A45C'), -3.58, 1.12, z, mg); });
    [-.9, .9].forEach(function(z){ mbox(.12, .95, .12, .03, dk, 1.9, .62, z, mg); });   /* landing legs */
    var wg = new T.CylinderGeometry(.5, .5, .38, 18); wg.rotateX(Math.PI/2);
    var hub = new T.CylinderGeometry(.24, .24, .4, 12); hub.rotateX(Math.PI/2);
    function wheel(x, z){ place(wg, dk, x, .5, z, 0, 0, 0, mg); place(hub, mid, x, .5, z + (z > 0 ? .02 : -.02), 0, 0, 0, mg); }
    [-2.55, -1.45].forEach(function(x){ [-1.02, 1.02].forEach(function(z){ wheel(x, z); }); });
    mbox(2.2, .1, .5, .03, mid, -2, 1.02, 1.1, mg); mbox(2.2, .1, .5, .03, mid, -2, 1.02, -1.1, mg);   /* mudguards */
    /* tractor: frame, fuel tanks, wheels */
    [-.5, .5].forEach(function(z){ mbox(4.1, .3, .2, .05, dk, 5.0, .95, z, mg); });
    mbox(1.0, .14, 1.4, .05, mid, 3.75, 1.16, 0, mg);                       /* fifth wheel */
    var tank = new T.CylinderGeometry(.3, .3, 1.1, 14); tank.rotateZ(Math.PI/2);
    [-1.0, 1.0].forEach(function(z){ place(tank, soft(P.taupe), 5.1, .85, z, 0, 0, 0, mg); });
    [4.4, 6.35].forEach(function(x){ [-1.02, 1.02].forEach(function(z){ wheel(x, z); }); });
    /* cab-over: side profile extruded across the width, sloped windscreen, rounded edges */
    var pr = new T.Shape(); pr.moveTo(4.85, 1.2); pr.lineTo(6.95, 1.2); pr.lineTo(7.02, 2.35); pr.lineTo(6.9, 3.5); pr.quadraticCurveTo(6.86, 3.72, 6.62, 3.74); pr.lineTo(4.85, 3.74); pr.lineTo(4.85, 1.2);
    var cg = new T.ExtrudeGeometry(pr, {depth:2.2, bevelEnabled:true, bevelThickness:.1, bevelSize:.1, bevelSegments:3, curveSegments:6}); cg.translate(0, 0, -1.1);
    place(cg, cab, 0, 0, 0, 0, 0, 0, mg);
    place(rbox(.05, 1.0, 2.05, .02), gl, 7.03, 2.95, 0, 0, 0, .1, mg);           /* windscreen */
    [-1, 1].forEach(function(s){ place(rbox(.95, .78, .04, .02), gl, 6.25, 3.0, s*1.215, 0, 0, 0, mg); });   /* side windows */
    mbox(2.3, .32, 2.44, .08, band, 5.92, 1.42, 0, mg);                          /* brand band */
    mbox(.1, .55, 1.7, .03, mid, 7.1, 1.85, 0, mg);                               /* grille */
    mbox(.26, .34, 2.44, .08, dk, 7.12, 1.08, 0, mg);                             /* bumper */
    [-.85, .85].forEach(function(z){ mbox(.06, .16, .34, .03, soft('#F3EADB'), 7.2, 1.36, z, mg); });   /* headlights */
    place(rbox(1.7, .45, 2.1, .2), cab, 5.55, 4.0, 0, 0, 0, -.22, mg);             /* roof deflector */
    mbox(.3, .12, 2.2, .05, mid, 6.95, 3.62, 0, mg);                               /* sun visor */
    [-1, 1].forEach(function(s){ mbox(.05, .05, .32, .02, dk, 6.8, 3.05, s*1.36, mg); mbox(.08, .42, .14, .03, dk, 6.8, 2.85, s*1.52, mg); });   /* mirrors */
    [-1, 1].forEach(function(s){ mbox(.5, .06, .22, .02, mid, 6.1, .78, s*1.18, mg); });   /* steps */
    mg.flush(g);
    var lg = canvasOf(256,256), lc = lg.getContext('2d'); roundel(lc, 128, 128, 120, P.oxD);
    var lm = new T.MeshStandardMaterial({map:texOf(lg, true), transparent:true, roughness:.8, depthWrite:false});
    [-1,1].forEach(function(s){ var p = new T.Mesh(new T.PlaneGeometry(.62,.62), lm); p.position.set(5.75, 2.25, s*1.215); if(s < 0) p.rotation.y = Math.PI; g.add(p); noEdge.push(p); });
    return g;
  }
  /* ship-to-shore crane, boom along z; returns the moving rig */
  var CR = {LX:8.5, LZ0:-4.4, LZ1:21, TOP:40};
  function makeCrane(rig){
    var g = new T.Group(), A = soft(P.cream, {roughness:.7}), dk = soft(P.dark), gold = soft(P.gold), G = new Merger();
    var LXs = [-CR.LX, CR.LX], LZs = [CR.LZ0, CR.LZ1];
    var wg = new T.CylinderGeometry(.36,.36,.5,12); wg.rotateX(Math.PI/2);
    LXs.forEach(function(lx){ LZs.forEach(function(lz){
      mbox(1.4, CR.TOP - 2.4, 1.4, .25, A, lx, 2.4 + (CR.TOP - 2.4)/2, lz, G);
      mbox(5.4, 1.2, 1.3, .3, gold, lx, 1.35, lz, G);
      mbox(2.2, .9, 1.7, .2, A, lx, 2.3, lz, G);
      for(var wx=-2; wx<=2; wx+=1.33) place(wg, dk, lx + wx, .4, lz, 0, 0, 0, G);
    }); });
    LZs.forEach(function(lz){ mbox(2*CR.LX + 1.4, 2.2, 1.5, .3, A, 0, 14.5, lz, G); mbox(2*CR.LX + 1.4, 2.4, 1.6, .3, A, 0, CR.TOP - 1, lz, G); });
    LXs.forEach(function(lx){ mbox(1.5, 2.0, CR.LZ1 - CR.LZ0, .3, A, lx, CR.TOP - 1, (CR.LZ0 + CR.LZ1)/2, G); strut(V(lx, 3.4, CR.LZ0 + .7), V(lx, 13.4, CR.LZ1 - .7), .45, A, G); });
    var BZ0 = CR.LZ1 + 16, BZ1 = CR.LZ0 - 44;
    [-2, 2].forEach(function(bx){ mbox(1.4, 3, BZ0 - BZ1, .35, A, bx, CR.TOP + 1.5, (BZ0 + BZ1)/2, G); });
    for(var cz = BZ1 + 3; cz < BZ0; cz += 8) mbox(4, .5, .5, .1, A, 0, CR.TOP + 2.8, cz, G);
    [-2, 2].forEach(function(bx){
      var apex = V(bx, CR.TOP + 19, CR.LZ0 + 4);
      strut(V(bx, CR.TOP + 3, CR.LZ0), apex, .9, A, G); strut(V(bx, CR.TOP + 3, CR.LZ1), apex, .9, A, G);
      strut(apex, V(bx, CR.TOP + 3, BZ1 + 2), .22, A, G); strut(apex, V(bx, CR.TOP + 3, BZ1 + 22), .22, A, G); strut(apex, V(bx, CR.TOP + 3, BZ0 - 1), .22, A, G);
    });
    mbox(5.4, .8, .8, .2, A, 0, CR.TOP + 19, CR.LZ0 + 4, G);
    mbox(9, 5, 12, .6, A, 0, CR.TOP + 5.6, CR.LZ1 + 9, G);
    mbox(9.2, .5, 12.2, .2, soft(P.dark), 0, CR.TOP + 8.35, CR.LZ1 + 9, G);
    G.flush(g);
    var out = {g:g};
    if(rig){
      var trolley = new T.Group(); g.add(trolley);
      mbox(3.4, 2.2, 6, .3, A, 0, CR.TOP + 1.2, 0, trolley);
      mbox(2.4, 2.2, 2.6, .4, A, 0, CR.TOP - 1.7, 2.2, trolley);
      mbox(2.44, .9, 2.64, .1, soft(P.glass, {roughness:.4}), 0, CR.TOP - 1.5, 2.2, trolley);
      var spreader = mbox(6.1, .5, 2.5, .18, gold, 0, 27, 0, g);
      var cables = [[-1.2,-.6],[-1.2,.6],[1.2,-.6],[1.2,.6]].map(function(o){ var cb = new T.Mesh(new T.CylinderGeometry(.04,.04,1,6), dk); cb.castShadow = false; g.add(cb); return {m:cb, ox:o[0], oz:o[1]}; });
      out.trolley = trolley; out.spreader = spreader; out.cables = cables;
    }
    return out;
  }
  function setRig(r, tz, sy){
    r.trolley.position.z = tz; r.spreader.position.set(0, sy, tz);
    r.cables.forEach(function(c){ var len = CR.TOP - .6 - sy; c.m.position.set(c.ox, sy + len/2, tz + c.oz); c.m.scale.y = Math.max(.01, len); });
  }

  /* coffee shrubs (soft lumpy crowns) and cherries that ripen with scroll */
  var blobM = [], blobC = [], stickM = [], cherryM = [], cherryC = [], cherryThr = [], cherryFarM = [], cherryFarC = [], cherryFarThr = [];
  var BLOB_C = [C('#627239'), C('#687840'), C('#6E7A45'), C('#5E6E36')];
  var CH_RIPE = [C('#9E2A22'), C('#B3302A'), C('#A8382A'), C('#8E2420'), C('#C8622A')], CH_GREEN = C('#7E9A3A'), CH_YELLOW = C('#D9B13B');
  var blobGeo = (function(){
    var g = new T.SphereGeometry(1, 10, 7), p = g.attributes.position, v = new T.Vector3();
    for(var i=0;i<p.count;i++){ v.fromBufferAttribute(p, i); var d = 1 + .07*Math.sin(v.x*5.1 + 1.3)*Math.sin(v.y*4.3 + .7) + .05*Math.sin(v.z*6.2 + v.x*2.1); v.multiplyScalar(d); p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals(); return g;
  })();
  function pushStick(a, b, r){ var d = new T.Vector3().subVectors(b, a), l = d.length(); q.setFromUnitVectors(UP, d.clone().normalize()); mtx.compose(a.clone().addScaledVector(d, .5), q, sv.set(r, l, r)); stickM.push(mtx.clone()); }
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
  function tree(R, x, y0, z, H, mg){
    place(new T.CylinderGeometry(.18*H/8, .26*H/8, H*.5, 8), soft('#6B5A45'), x, y0 + H*.25, z, 0, 0, 0, mg);
    for(var i=0;i<4;i++){
      var r = H*(.26 - i*.03)*(.9 + R()*.2), a = R()*6.28;
      dummy.position.set(x + Math.cos(a)*H*.12, y0 + H*(.55 + i*.12), z + Math.sin(a)*H*.12); dummy.rotation.set(0, R()*3, 0); dummy.scale.set(r, r*.85, r); dummy.updateMatrix();
      mg.put(blobGeo, soft(i%2 ? '#6E7A45' : '#5E6E36'), dummy.matrix);
    }
  }
  var cherries = null, cherriesFar = null, lastRipe = -1, tmpC = new T.Color();
  function flushPlants(parent){
    var bm = new T.InstancedMesh(tierGeo, new T.MeshStandardMaterial({color:0xffffff, roughness:.86, metalness:0}), blobM.length);
    blobM.forEach(function(m,i){ bm.setMatrixAt(i, m); bm.setColorAt(i, blobC[i]); }); add(bm, parent);
    var cmat = new T.MeshStandardMaterial({color:0xffffff, roughness:.45, metalness:0});
    cherries = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), cmat, cherryM.length);
    cherryM.forEach(function(m,i){ cherries.setMatrixAt(i, m); cherries.setColorAt(i, CH_GREEN); }); add(cherries, parent, false); noEdge.push(cherries);
    cherriesFar = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), cmat, Math.max(1, cherryFarM.length));
    cherryFarM.forEach(function(m,i){ cherriesFar.setMatrixAt(i, m); cherriesFar.setColorAt(i, CH_GREEN); }); add(cherriesFar, parent, false); noEdge.push(cherriesFar);
    var wm = new T.InstancedMesh(new T.CylinderGeometry(.8, 1, 1, 8), soft('#6B5A45'), stickM.length);
    stickM.forEach(function(m,i){ wm.setMatrixAt(i, m); }); add(wm, parent);
  }
  function ripenSet(im, cols, thr, r){
    for(var i=0;i<cols.length;i++){
      var l = smooth(thr[i], thr[i] + .4, r);
      if(l < .5) tmpC.copy(CH_GREEN).lerp(CH_YELLOW, l*2); else tmpC.copy(CH_YELLOW).lerp(cols[i], (l - .5)*2);
      im.setColorAt(i, tmpC);
    }
    if(im.instanceColor) im.instanceColor.needsUpdate = true;
  }
  function ripen(r){ if(Math.abs(r - lastRipe) < .003) return; lastRipe = r; ripenSet(cherries, cherryC, cherryThr, r); ripenSet(cherriesFar, cherryFarC, cherryFarThr, r); }

  /* the ship: lofted hull with its bow at +x, waterline at y = 0 of the group */
  var DECK = 9.4, HB = 12.5, XS = -75, XB = 72;
  function bowTip(y){ return XB + (y + 3)*.28; }
  function hb(x, y){ var t = clamp((bowTip(y) - x)/36, 0, 1), f = 1 - Math.pow(1 - t, 2.4); return HB*f*(1 + .05*(1 - t)*((y + 3)/12.4)); }
  var SLOT = {x:0, z:1.25, y:DECK + .9 + 3*2.6};
  function makeShip(){
    var g = new T.Group();
    var hullGeo = (function(){
      var NX = 80, NY = 12, pos = [], uv = [], idx = [];
      for(var side=-1; side<=1; side+=2){
        var base = pos.length/3;
        for(var i=0;i<=NX;i++){
          var t = i/NX, x = XS + (1 - Math.pow(1 - t, 1.6))*(XB + 4 - XS);
          for(var j=0;j<=NY;j++){ var y = -3 + j/NY*(DECK + 3), xx = Math.min(x, bowTip(y)), w = hb(xx, y); pos.push(xx, y, side*w); uv.push((xx - XS)/(XB - XS), j/NY); }
        }
        for(var i2=0;i2<NX;i2++) for(var j2=0;j2<NY;j2++){ var a = base + i2*(NY+1) + j2, b = a + NY + 1, c = a + 1, d = b + 1; if(side < 0) idx.push(a, b, c, c, b, d); else idx.push(a, c, b, c, d, b); }
      }
      var ge = new T.BufferGeometry(); ge.setAttribute('position', new T.Float32BufferAttribute(pos,3)); ge.setAttribute('uv', new T.Float32BufferAttribute(uv,2)); ge.setIndex(idx); ge.computeVertexNormals(); return ge;
    })();
    add(new T.Mesh(hullGeo, new T.MeshStandardMaterial({map:hullBands(), roughness:.78, metalness:0, side:T.DoubleSide})), g);
    var tr = mbox(.5, DECK + 2.6, 2*HB - .2, .2, soft(P.brown), XS + .2, (DECK - 3)/2 + .2, 0, g);   /* transom */
    var ds = new T.Shape(); ds.moveTo(XS, -hb(XS, DECK));
    for(var k=0;k<=50;k++){ var xd = XS + k/50*(bowTip(DECK) - XS); ds.lineTo(xd, -hb(xd, DECK)); }
    for(var k2=50;k2>=0;k2--){ var xe = XS + k2/50*(bowTip(DECK) - XS); ds.lineTo(xe, hb(xe, DECK)); }
    var dg = new T.ShapeGeometry(ds); dg.rotateX(Math.PI/2); dg.translate(0, DECK, 0);
    add(new T.Mesh(dg, soft(P.brown, {side:T.DoubleSide})), g, false);
    /* bulwark rail around the bow */
    [-1,1].forEach(function(s){ var pts = []; for(var rx=36; rx<bowTip(DECK) - .5; rx+=1.5) pts.push(V(rx, DECK + 1.0, s*(hb(rx, DECK) - .1))); pts.push(V(bowTip(DECK) - .3, DECK + 1.0, 0)); add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 60, .06, 6, false), soft(P.cream)), g); });
    mbox(.4, 2.6, 22, .15, soft(P.cream), 58, DECK + 1.3, 0, g);     /* breakwater */
    add(new T.Mesh(new T.CylinderGeometry(.18,.26,11,10), soft(P.cream)), g).position.set(64, DECK + 5.5, 0);
    [-3, 3].forEach(function(z){ var dr = add(new T.Mesh(new T.CylinderGeometry(.6,.6,1.6,16), soft(P.dark)), g); dr.rotation.x = Math.PI/2; dr.position.set(67, DECK + .8, z); });
    /* accommodation aft */
    var acc = mbox(9, 16, 22, .6, new T.MeshStandardMaterial({map:windowsTex(), roughness:.8}), XS + 9, DECK + 8, 0, g);
    acc.material.map.repeat.set(1/6, 1/8);
    mbox(9.4, .6, 23, .2, soft(P.dark), XS + 9, DECK + 16.3, 0, g);
    mbox(3, 6, 3.4, .4, soft(P.moss), XS + 7, DECK + 19, 0, g);
    /* hatch covers and container stacks; our slot stays free */
    var DCOL = ['#8A8F86','#C8B8A8','#5B4C3A','#D8C6A2','#3F4A4C','#8C6A3C','#A9A28A','#9C7B57'], RS = rng(91), inst = DCOL.map(function(){ return []; }), HM = new Merger();
    for(var bi=-8; bi<=8; bi++){
      var bx = bi*6.45; if(bx < XS + 16) continue;
      var lim = hb(bx + 3.2, DECK) - .6;
      mbox(6.2, .9, 2*lim, .2, soft(P.moss), bx, DECK + .45, 0, HM);
      for(var r=0;r<10;r++){
        var rz = (r - 4.5)*2.5; if(Math.abs(rz) + 1.22 > lim) continue;
        var tiers = bi === 0 && r === 5 ? 3 : 1 + Math.floor(RS()*4);
        for(var t=0;t<tiers;t++) inst[Math.floor(RS()*DCOL.length)].push([bx, DECK + .9 + 1.295 + t*2.6, rz]);
      }
    }
    HM.flush(g);
    var dGeo = rbox(6.06, 2.59, 2.44, .14);
    DCOL.forEach(function(col, k){ var list = inst[k]; if(!list.length) return; var im = new T.InstancedMesh(dGeo, soft(col, {roughness:.8}), list.length); list.forEach(function(p,j){ mtx.makeTranslation(p[0], p[1], p[2]); im.setMatrixAt(j, mtx); }); add(im, g); });
    /* wake behind the stern */
    var wc = canvasOf(256,512), wg2 = wc.getContext('2d');
    var cg = wg2.createLinearGradient(0,512,0,0); cg.addColorStop(0,'rgba(246,242,232,.95)'); cg.addColorStop(.45,'rgba(246,242,232,.35)'); cg.addColorStop(1,'rgba(246,242,232,0)');
    wg2.fillStyle = cg; wg2.beginPath(); wg2.moveTo(96,512); wg2.quadraticCurveTo(128,500,160,512); wg2.lineTo(200,0); wg2.lineTo(56,0); wg2.fill();   /* a soft foam trail, widening behind the stern */
    var wakeMat = new T.MeshBasicMaterial({map:texOf(wc, true), transparent:true, opacity:0, depthWrite:false});
    var wake = new T.Mesh(new T.PlaneGeometry(44, 120), wakeMat); wake.rotation.x = -Math.PI/2; wake.rotation.z = Math.PI/2; wake.position.set(XS - 60, .08, 0); g.add(wake); noEdge.push(wake);
    return {g:g, wakeMat:wakeMat};
  }

  /* quay builder (shared by both ports): deck at y 0, water side at z < -6 */
  function makeQuay(parent, x0, x1, z1){
    var wallMat = soft(P.clay), deckMat = soft('#DCD1BD', {roughness:.92});
    var q = new T.Mesh(new T.BoxGeometry(x1 - x0, 3.2, z1 + 6), [wallMat, wallMat, deckMat, wallMat, wallMat, wallMat]);
    q.position.set((x0 + x1)/2, -1.6, (z1 - 6)/2); add(q, parent, false);
    mbox(x1 - x0, .32, .5, .14, soft(P.cream), (x0 + x1)/2, .16, -5.78, parent);
    mbox(x1 - x0, .01, .14, 0, soft(P.gold), (x0 + x1)/2, .005, -3.2, parent, false);
    var dm = new Merger(); for(var dx = x0 + 2; dx < x1 - 2; dx += 5) mbox(2.6, .01, .12, 0, soft(P.cream), dx, .005, 6.5, dm); dm.flush(parent, false);
    [CR.LZ0, CR.LZ1].forEach(function(rz){ mbox(x1 - x0, .05, .55, 0, soft(P.clay), (x0 + x1)/2, .006, rz, parent, false); mbox(x1 - x0, .07, .1, .03, soft(P.moss), (x0 + x1)/2, .035, rz, parent); });
    var mg = new Merger(), fen = new T.CylinderGeometry(.42,.42,1.6,12);
    for(var fx = x0 + 3; fx < x1 - 2; fx += 7) place(fen, soft(P.dark), fx, -1.05, -6.15, 0, 0, 0, mg);
    var bol = new T.LatheGeometry([V(0,0,0),V(.26,0,0),V(.25,.08,0),V(.18,.12,0),V(.16,.45,0),V(.24,.55,0),V(.26,.62,0),V(.2,.68,0),V(0,.69,0)], 12);
    for(var bx = x0 + 6; bx < x1 - 4; bx += 12) place(bol, soft(P.dark), bx, 0, -5.2, 0, 0, 0, mg);
    mg.flush(parent);
  }
  function yardStacks(parent, xs, zs, seed, skip){
    var R = rng(seed), cols = ['#8A8F86','#C8B8A8','#5B4C3A','#D8C6A2','#3F4A4C','#8C6A3C','#A9A28A'], inst = cols.map(function(){ return []; });
    for(var x = xs[0]; x <= xs[1]; x += 6.7) for(var z = zs[0]; z <= zs[1]; z += 2.75){ if(R() < (skip || .15)) continue; var n = 1 + Math.floor(R()*3); for(var l=0;l<n;l++) inst[Math.floor(R()*cols.length)].push([x, 1.295 + l*2.6, z]); }
    var geo = rbox(6.06, 2.59, 2.44, .14);
    cols.forEach(function(c, k){ var list = inst[k]; if(!list.length) return; var im = new T.InstancedMesh(geo, soft(c, {roughness:.8}), list.length); list.forEach(function(p,j){ mtx.makeTranslation(p[0], p[1], p[2]); im.setMatrixAt(j, mtx); }); add(im, parent); });
  }
  function mast(parent, x, z){
    add(new T.Mesh(new T.CylinderGeometry(.18,.32,28,10), soft(P.cream)), parent).position.set(x, 14, z);
    var cr = add(new T.Mesh(new T.TorusGeometry(1.2,.1,8,20), soft(P.cream)), parent); cr.rotation.x = Math.PI/2; cr.position.set(x, 28, z);
  }

  function tapestryTex(){
    var c = canvasOf(1280, 960), g = c.getContext('2d'), R = rng(5); g.scale(2, 2);
    g.fillStyle = '#E8DEC8'; g.fillRect(0, 0, 640, 480);
    for(var y=0;y<480;y+=3){ g.fillStyle = 'rgba(120,96,60,' + (.025 + R()*.025).toFixed(3) + ')'; g.fillRect(0, y, 640, 1); }
    for(var x=0;x<640;x+=3){ g.fillStyle = 'rgba(120,96,60,' + (.015 + R()*.02).toFixed(3) + ')'; g.fillRect(x, 0, 1, 480); }
    g.strokeStyle = P.olive; g.lineWidth = 14; g.strokeRect(22, 22, 596, 436); g.lineWidth = 3; g.strokeRect(44, 44, 552, 392);
    if(LOGOF.complete && LOGOF.naturalWidth){ var lh = 372, lw = lh*LOGOF.naturalWidth/LOGOF.naturalHeight; g.drawImage(LOGOF, 320 - lw/2, 240 - lh/2, lw, lh); }
    return texOf(c, true);
  }
  var proc = null;
  function loadedPallet(woodM, juteM, sg, parent){
    var grp = new T.Group(), mg = new Merger();
    dummy.position.set(0,0,0); dummy.rotation.set(0,0,0); dummy.scale.set(1,1,1); dummy.updateMatrix(); mg.put(palletGeo, woodM, dummy.matrix);
    for(var l=0;l<5;l++){ var y = .149 + l*SACK_H;
      var spots = l % 2 === 0 ? [[0, -.3, 0], [0, .3, Math.PI]] : [[-.31, 0, Math.PI/2], [.31, 0, -Math.PI/2]];
      spots.forEach(function(sp){ dummy.position.set(sp[0], y, sp[1]); dummy.rotation.set(0, sp[2], 0); dummy.updateMatrix(); mg.put(sg, juteM, dummy.matrix); });
    }
    dummy.rotation.set(0,0,0);
    mg.flush(grp); parent.add(grp); return grp;
  }
  function buildProcess(woodM, juteM, sg){
    var y0 = .2, CVX = 97.4, CZ0 = 11.2, CZ1 = 21.4, CH = .95, mg = new Merger(), frame = soft(P.slate), belt = soft(P.dark), rail = soft(P.taupe);
    mbox(.9, .12, CZ1 - CZ0, .04, belt, CVX, y0 + CH, (CZ0 + CZ1)/2, mg);
    [-1, 1].forEach(function(s){ mbox(.07, .2, CZ1 - CZ0, .02, rail, CVX + s*.5, y0 + CH + .1, (CZ0 + CZ1)/2, mg); });
    for(var z = CZ0 + .4; z < CZ1; z += 2.4) [-1, 1].forEach(function(s){ mbox(.08, CH, .08, .02, frame, CVX + s*.42, y0 + CH/2, z, mg); });
    mbox(1.6, .1, 1.6, .03, frame, CVX, y0 + .05, CZ1 + 1.1, mg);   /* palletizing spot */
    mg.flush(gKoper);
    var conv = new T.InstancedMesh(sg, juteM, 8); add(conv, gKoper);
    var stationSacks = new T.InstancedMesh(sg, juteM, 10); add(stationSacks, gKoper);
    var stationPallet = new T.Mesh(palletGeo, woodM); stationPallet.position.set(CVX, y0 + .1, CZ1 + 1.1); add(stationPallet, gKoper);
    /* forklift: forward is +z in its own frame, fork centre 1.65 m ahead of the body */
    var fk = new T.Group(), fm = new Merger(), body = soft(P.gold), dk = soft(P.dark), mid = soft(P.moss);
    mbox(1.15, .7, 1.9, .14, body, 0, .65, 0, fm); mbox(1.15, .55, .5, .14, mid, 0, .95, -.8, fm);
    [[-.5,.55],[.5,.55],[-.5,-.6],[.5,-.6]].forEach(function(o){ mbox(.06, 1.25, .06, .02, dk, o[0], 1.6, o[1], fm); });
    mbox(1.1, .06, 1.25, .02, dk, 0, 2.24, 0, fm); mbox(.5, .45, .5, .1, dk, 0, 1.1, -.15, fm);
    var fw = new T.CylinderGeometry(.3, .3, .24, 14); fw.rotateZ(Math.PI/2);
    [[-.5,.6],[.5,.6],[-.5,-.6],[.5,-.6]].forEach(function(o){ place(fw, dk, o[0], .3, o[1], 0, 0, 0, fm); });
    [-.32, .32].forEach(function(x){ mbox(.08, 2.3, .1, .02, dk, x, 1.25, 1.0, fm); });
    fm.flush(fk);
    var carriage = new T.Group(); fk.add(carriage); var cm = new Merger();
    mbox(.9, .5, .06, .02, mid, 0, .3, 1.08, cm); [-.25, .25].forEach(function(x){ mbox(.1, .05, 1.1, .02, dk, x, .06, 1.65, cm); });
    cm.flush(carriage);
    add(fk, gKoper);
    var carried = loadedPallet(woodM, juteM, sg, gKoper);
    var slots = []; for(var i=0;i<6;i++){ var lp = loadedPallet(woodM, juteM, sg, gKoper); lp.position.set(99.2 + i*1.42, y0, 27.2); lp.visible = false; slots.push(lp); }
    proc = {conv:conv, CVX:CVX, CZ0:CZ0, CZ1:CZ1, CH:CH, y0:y0, st:stationSacks, sp:stationPallet, fk:fk, car:carriage, carried:carried, slots:slots};
  }
  /* forklift loop: wait, pick the full pallet, turn, set it down in the next free slot, come back */
  var FKK = [[0, 102.2, 22.5, -1.5708, .08, 0],[.38, 102.2, 22.5, -1.5708, .08, 0],[.48, 99.05, 22.5, -1.5708, .08, 0],[.53, 99.05, 22.5, -1.5708, .5, 1],
             [.63, 101.4, 23.8, -.79, .5, 1],[.73, -1, 24.5, 0, .5, 1],[.79, -1, 25.55, 0, .5, 1],[.84, -1, 25.55, 0, .1, 0],[.9, -1, 24.2, 0, .1, 0],[1, 102.2, 22.5, -1.5708, .08, 0]];
  /* forklifts drive like vehicles: along smooth curves, the body always on the tangent, reversing where a driver would */
  var HX = -Math.PI/2, HZ = 0, HPX = Math.PI/2;
  function hv(h){ return [Math.sin(h), Math.cos(h)]; }
  function fkPose(segs, u){
    var s = segs[segs.length - 1];
    for(var i=0;i<segs.length;i++){ if(u < segs[i].u1){ s = segs[i]; break; } }
    var t = ease(clamp((u - s.u0)/(s.u1 - s.u0), 0, 1)), p0 = s.p0, p1 = s.p1 || s.p0, fh = lerp(s.f0, s.f1 === undefined ? s.f0 : s.f1, t);
    var L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    if(L < .01) return {x:p0[0], z:p0[1], yaw:s.h0, fh:fh};
    var d = s.d || 1, k = s.k || Math.min(L*.45, Math.max(.8, L*.42)), a = hv(s.h0), b = hv(s.h1 === undefined ? s.h0 : s.h1);
    var c1 = [p0[0] + d*k*a[0], p0[1] + d*k*a[1]], c2 = [p1[0] - d*k*b[0], p1[1] - d*k*b[1]], m = 1 - t;
    var x = m*m*m*p0[0] + 3*m*m*t*c1[0] + 3*m*t*t*c2[0] + t*t*t*p1[0], z = m*m*m*p0[1] + 3*m*m*t*c1[1] + 3*m*t*t*c2[1] + t*t*t*p1[1];
    var dx = 3*m*m*(c1[0] - p0[0]) + 6*m*t*(c2[0] - c1[0]) + 3*t*t*(p1[0] - c2[0]), dz = 3*m*m*(c1[1] - p0[1]) + 6*m*t*(c2[1] - c1[1]) + 3*t*t*(p1[1] - c2[1]);
    var yaw = Math.hypot(dx, dz) < 1e-4 ? (t < .5 ? s.h0 : (s.h1 === undefined ? s.h0 : s.h1)) : Math.atan2(d*dx, d*dz);
    return {x:x, z:z, yaw:yaw, fh:fh};
  }
  function process(time, active){
    if(!proc) return;
    var P_ = 11, cyc = Math.floor(time/P_), u = (time % P_)/P_, slotN = cyc % 7, sx = 99.2 + Math.min(slotN, 5)*1.42;
    /* conveyor: sacks ride from the container doors to the palletizing spot */
    for(var i=0;i<8;i++){
      var f = active ? ((time*.13 + i/8) % 1) : i/8, z = lerp(proc.CZ0 + .3, proc.CZ1 - .2, f);
      mtx.compose(sv.set(proc.CVX, proc.y0 + proc.CH + .06, z), q.setFromEuler(new T.Euler(0, Math.PI/2 + i*.3, 0)), new T.Vector3(1,1,1)); proc.conv.setMatrixAt(i, mtx);
    }
    proc.conv.instanceMatrix.needsUpdate = true;
    /* station stack grows between picks */
    var fill = ((u - .55 + 1) % 1)/.83, n = Math.min(10, Math.floor(fill*10.5)), carrying = u >= .53 && u < .84;
    for(var j=0;j<10;j++){
      var l = Math.floor(j/2), side = j % 2, yy = proc.y0 + .1 + .149 + l*SACK_H, sp = l % 2 === 0 ? [0, side ? .3 : -.3, side ? Math.PI : 0] : [side ? .31 : -.31, 0, side ? -Math.PI/2 : Math.PI/2];
      var vis = j < n && !(u >= .53 && u < .55);
      mtx.compose(sv.set(proc.CVX + sp[0], yy, proc.CZ1 + 1.1 + sp[1]), q.setFromEuler(new T.Euler(0, sp[2], 0)), new T.Vector3(vis ? 1 : .001, vis ? 1 : .001, vis ? 1 : .001)); proc.st.setMatrixAt(j, mtx);
    }
    proc.st.instanceMatrix.needsUpdate = true;
    proc.sp.visible = !carrying;
    /* forklift path: wait by the station, creep in, lift, back out, swing round in reverse, drive to the slot, set down, reverse away */
    var sxp = cyc > 0 ? 99.2 + Math.min((cyc - 1) % 7, 5)*1.42 : 101.0, sxk = sxp + 1.5;
    var FK = [
      {u0:0,   u1:.14, p0:[sxk, 22.5], p1:[100.4, 22.5], h0:HX, h1:HX, f0:.08},
      {u0:.14, u1:.43, p0:[100.4, 22.5], h0:HX, f0:.08},
      {u0:.43, u1:.48, p0:[100.4, 22.5], p1:[99.05, 22.5], h0:HX, h1:HX, f0:.08},
      {u0:.48, u1:.53, p0:[99.05, 22.5], h0:HX, f0:.08, f1:.5},
      {u0:.53, u1:.59, p0:[99.05, 22.5], p1:[101.0, 22.5], h0:HX, h1:HX, d:-1, f0:.5},
      {u0:.59, u1:.68, p0:[101.0, 22.5], p1:[102.7, 20.8], h0:HX, h1:HZ, d:-1, k:1.1, f0:.5},
      {u0:.68, u1:.80, p0:[102.7, 20.8], p1:[sx, 25.55], h0:HZ, h1:HZ, f0:.5},
      {u0:.80, u1:.84, p0:[sx, 25.55], h0:HZ, f0:.5, f1:.1},
      {u0:.84, u1:1.0, p0:[sx, 25.55], p1:[sx + 1.5, 22.5], h0:HZ, h1:HX, d:-1, k:1.4, f0:.1, f1:.08}
    ];
    var po = fkPose(FK, u), fx = po.x, fz = po.z, yaw = po.yaw, fh = po.fh;
    proc.fk.position.set(fx, proc.y0, fz); proc.fk.rotation.y = yaw; proc.car.position.y = fh;
    proc.carried.visible = carrying;
    if(carrying){ proc.carried.position.set(fx + Math.sin(yaw)*1.65, proc.y0 + fh, fz + Math.cos(yaw)*1.65); proc.carried.rotation.y = yaw; }
    var placed = slotN + (u >= .84 ? 1 : 0);
    proc.slots.forEach(function(sl, i){ sl.visible = i < Math.min(placed, 6); });
  }

  /* ---------------------------------------------------------------- build the world */
  var groundO, crowd, kcrowd, loader2, truckO2, shedRoofG, tapestry, ship, wakeMat, ours, truckO, truckK, craneO, craneK, plate, heroTop, heroCanvas, heroTex, roofGroup, roofMats = [], kSacks, kSackTop, kXf = [], kJit = [];
  var OCX = 40, KCX = 30;                       /* crane x at the origin quay and in Koper (local) */
  var SHIP_Z = -20.2, LANE = 9;
  function build(){
    /* ---------------- origin: terrain with the plantation slope, road, shed */
    var tn = noise2(81, 64);
    function th(x, z){
      var hill = smooth(6, -110, z)*smooth(-30, -80, x)*30*(.75 + .5*fbm(tn, x*.012, z*.012, 3));
      var und = (fbm(tn, x*.04 + 9, z*.04 + 9, 3) - .5)*1.6;
      var h = hill + und*smooth(14, -6, z) + und*.35;
      h *= 1 - (1 - smooth(1.5, 6, Math.abs(z - LANE)))*smooth(-200, -150, x);       /* road bed flattened */
      h *= smooth(0, 4, Math.max(Math.abs(x + 111) - 23, Math.abs(z + .6) - 6.6))*smooth(0, 4, Math.max(Math.abs(x + 70) - 13, Math.abs(z + 3.4) - 8.4));
      h *= 1 - smooth(-36, -27, x);
      var shore = smooth(-5.5, -16, z)*smooth(-95, -45, x);
      return lerp(h, -4, shore);
    }
    var tg = new T.PlaneGeometry(440, 400, 150, 140); tg.rotateX(-Math.PI/2); tg.translate(-240, 0, -60);
    var tp = tg.attributes.position, tcol = new Float32Array(tp.count*3), cSoil = C(P.soil), cGrass = C(P.grass), cSand = C(P.sand), tc = new T.Color();
    for(var i=0;i<tp.count;i++){
      var x = tp.getX(i), z = tp.getZ(i), y = th(x, z); tp.setY(i, y);
      var inRows = smooth(-206, -197, x)*smooth(-80, -89, x)*smooth(-6, -10.5, z)*smooth(-78, -72, z);
      var rowD = Math.abs(((z + 12) % 2.8 + 2.8) % 2.8 - 1.4)/1.4;
      var grass = lerp(1, smooth(.45, .95, rowD)*.7, inRows) + (fbm(tn, x*.05, z*.05, 2) - .5)*.4;
      tc.copy(cSoil).lerp(cGrass, clamp(grass, 0, 1)).lerp(cSand, smooth(.6, -1.5, y));
      tcol[i*3] = tc.r; tcol[i*3+1] = tc.g; tcol[i*3+2] = tc.b;
    }
    tg.setAttribute('color', new T.BufferAttribute(tcol, 3)); tg.computeVertexNormals();
    add(new T.Mesh(tg, new T.MeshStandardMaterial({vertexColors:true, roughness:.92, metalness:0})), gOrigin, false);
    var road = new T.Mesh(new T.PlaneGeometry(200, 7), soft(P.sand)); road.rotation.x = -Math.PI/2; road.position.set(-125, .06, LANE); add(road, gOrigin, false);

    /* plantation rows */
    var RR = rng(611);
    for(var row=0; row<22; row++){
      var rz = -12 - row*2.8, near = row < 6;
      for(var px = -196 + (row % 2)*.85; px < -88; px += 1.7){
        var sx = px + (RR() - .5)*.35, szz = rz + (RR() - .5)*.3;
        shrub(RR, sx, th(sx, szz), szz, 1.95 + RR()*.35, near ? 5 : 4, row < 16 ? (near ? 4 : 3) : 1, !near);
      }
    }
    flushPlants(gOrigin);
    var RT = rng(77), TM = new Merger();
    [[-190,-82],[-160,-84],[-130,-80],[-110,-86],[-175,-92],[-212,-40],[-216,-20],[-200,-6],[-82,-30]].forEach(function(p){ shadeTree(RT, p[0], th(p[0], p[1]), p[1], 9 + RT()*4, TM); });
    [[-110,40],[-140,44],[-170,36],[-30,58],[-80,62]].forEach(function(p){ shadeTree(RT, p[0], th(p[0], p[1]), p[1], 8 + RT()*3, TM); });

    /* the beneficio: a whitewashed packing house with arches, a veranda, an ochre tile roof and olive shutters */
    groundO = th;
    var woodM = soft(P.wood), juteM = soft(P.jute, {roughness:.95}), printTex = texOf(sackPrint(1), true), printM = new T.MeshStandardMaterial({map:printTex, roughness:.95});
    var sackGeos = [sackGeometry(301), sackGeometry(302), sackGeometry(303)], RP = rng(311);
    function sack(parent, x, y, z, ry, mat3){
      var mats = [juteM, juteM, mat3 || juteM, juteM, juteM, juteM];
      var m = new T.Mesh(sackGeos[Math.floor(RP()*3)], mats); m.position.set(x, y, z); m.rotation.y = ry + (RP() - .5)*.06; return add(m, parent);
    }
    var whiteM = soft('#EEE7D8', {roughness:.95}), beamM = soft('#6B5A45'), shutM = soft('#55602F'), glassM = soft(P.glass, {roughness:.4}), metalM = soft('#5B5E57', {roughness:.6});
    var FL = .25;                                             /* floor top */
    mbox(22, FL, 14.4, .05, soft(P.stone), -70, FL/2, -3.4, gOrigin, false);
    mbox(20, 4.2, .35, .05, whiteM, -70, FL + 2.1, -9.83, gOrigin);                     /* back wall */
    [-80, -60].forEach(function(wx, k){
      mbox(.35, 4.2, 10, .05, whiteM, wx, FL + 2.1, -5, gOrigin);                         /* side walls */
      var ox = wx + (k ? .2 : -.2);
      [-7, -3].forEach(function(wz){
        mbox(.08, 1.4, 1.1, .02, glassM, ox, FL + 2.2, wz, gOrigin);
        mbox(.1, 1.45, .55, .02, shutM, ox, FL + 2.2, wz - .85, gOrigin);
        mbox(.1, 1.45, .55, .02, shutM, ox, FL + 2.2, wz + .85, gOrigin);
      });
    });
    /* front wall with four arches */
    var fs = new T.Shape(); fs.moveTo(-10, 0); fs.lineTo(10, 0); fs.lineTo(10, 4.2); fs.lineTo(-10, 4.2); fs.lineTo(-10, 0);
    [-7.5, -2.5, 2.5, 7.5].forEach(function(cx){ var hp = new T.Path(); hp.moveTo(cx - 1.25, .3); hp.lineTo(cx + 1.25, .3); hp.lineTo(cx + 1.25, 2.2); hp.absarc(cx, 2.2, 1.25, 0, Math.PI, false); hp.lineTo(cx - 1.25, .3); fs.holes.push(hp); });
    var fw = new T.Mesh(new T.ExtrudeGeometry(fs, {depth:.35, bevelEnabled:false, curveSegments:10}), whiteM); fw.position.set(-70, FL, -.35); add(fw, gOrigin);
    /* gable ends */
    var gs = new T.Shape(); gs.moveTo(0, 0); gs.lineTo(10, 0); gs.lineTo(5, 1.95); gs.lineTo(0, 0);
    [-80.17, -59.83].forEach(function(gx){ var gm = new T.Mesh(new T.ExtrudeGeometry(gs, {depth:.35, bevelEnabled:false}), whiteM); gm.rotation.y = Math.PI/2; gm.position.set(gx - .17, FL + 4.2, 0); add(gm, gOrigin); });
    /* veranda posts and beam */
    for(var vp=0; vp<6; vp++){ mbox(.3, 3.55, .3, .05, beamM, -79.6 + vp*3.84, FL + 1.78, 3.25, gOrigin); }
    mbox(20.6, .3, .32, .05, beamM, -70, FL + 3.6, 3.25, gOrigin);
    /* ochre tile roof — never red: red belongs to the coffee cherries alone */
    function roofTiles(){
      var c = canvasOf(256, 256), g = c.getContext('2d'), R = rng(91);
      g.fillStyle = '#BC8C50'; g.fillRect(0, 0, 256, 256);
      for(var r=0; r<8; r++){
        var y = r*32;
        g.fillStyle = '#9A6E3A'; g.fillRect(0, y + 26, 256, 6);
        for(var x = (r % 2)*12; x < 256; x += 24){ g.fillStyle = 'rgba(120,84,40,.55)'; g.fillRect(x, y, 2, 26); g.fillStyle = 'rgba(255,236,200,' + (.08 + R()*.12).toFixed(2) + ')'; g.fillRect(x + 4, y + 3, 14, 20); }
      }
      return c;
    }
    var tileM = new T.MeshStandardMaterial({map:texOf(roofTiles(), true, 7, 3), roughness:.9});
    shedRoofG = new T.Group(); gOrigin.add(shedRoofG); shedRoofG.userData.mat = tileM;
    function slope(z0, y0, z1, y1){ var len = Math.hypot(z1 - z0, y1 - y0), m = new T.Mesh(new T.BoxGeometry(22.6, .2, len), tileM); m.position.set(-70, (y0 + y1)/2, (z0 + z1)/2); m.rotation.x = Math.atan2(-(y1 - y0), z1 - z0); add(m, shedRoofG); }
    slope(-5, FL + 6.25, 4.0, FL + 3.75);
    slope(-5, FL + 6.25, -10.9, FL + 3.95);
    var ridge = new T.Mesh(new T.CylinderGeometry(.2, .2, 22.8, 8), soft('#9A6E3A')); ridge.rotation.z = Math.PI/2; ridge.position.set(-70, FL + 6.3, -5); add(ridge, shedRoofG);
    /* inside and on the veranda: sacks on pallets, a scale, crates; a coffee dryer by the east wall */
    var shedLow = [], shedTop = [], shedPal = [];
    [[-77,-7.5,5],[-75.4,-7.5,5],[-73.8,-7.5,4],[-77,-5.6,4],[-75.4,-5.6,5],[-66,-7.6,5],[-64.4,-7.6,4],[-66,-5.7,3],[-78.2,1.6,4],[-76.6,1.6,3],[-67.4,1.6,3]].forEach(function(p){
      var x = p[0], z = p[1], layers = p[2]; shedPal.push([x, z]);
      for(var l=0; l<layers; l++){
        var y = FL + .149 + l*SACK_H, list = l === layers - 1 ? shedTop : shedLow;
        if(l % 2 === 0){ list.push([x, y, z - .3, 0]); list.push([x, y, z + .3, Math.PI]); }
        else { list.push([x - .31, y, z, Math.PI/2]); list.push([x + .31, y, z, -Math.PI/2]); }
      }
    });
    pallets(gOrigin, woodM, shedPal, FL);
    function sackInst(parent, geo, mat, list){ var im = new T.InstancedMesh(geo, mat, list.length); list.forEach(function(s, i){ mtx.compose(V(s[0], s[1], s[2]), q.setFromEuler(new T.Euler(0, s[3] + (RP() - .5)*.06, 0)), sv.set(1,1,1)); im.setMatrixAt(i, mtx); }); return add(im, parent); }
    sackInst(gOrigin, sackGeos[0], juteM, shedLow);
    sackInst(gOrigin, sackGeos[1], [juteM, juteM, printM, juteM, juteM, juteM], shedTop);
    mbox(1.1, .14, 1.1, .03, soft(P.slate), -71.6, FL + .07, 1.8, gOrigin);
    mbox(.08, 1.1, .08, .02, soft(P.slate), -71.6, FL + .6, 1.25, gOrigin);
    mbox(.5, .4, .12, .04, soft('#E8E2D4'), -71.6, FL + 1.3, 1.25, gOrigin);
    sack(gOrigin, -71.6, FL + .14, 1.85, 0);
    [[-62.6, FL + .4, 1.4],[-61.7, FL + .4, 1.4],[-62.15, FL + 1.2, 1.4],[-62.6, FL + .4, 2.3]].forEach(function(b){ mbox(.8, .8, .8, .05, woodM, b[0], b[1], b[2], gOrigin); });
    [-6.6, -3.4].forEach(function(sz){ mbox(.3, 1.4, .3, .04, beamM, -57.6, .7, sz, gOrigin); });
    var drum = new T.Mesh(new T.CylinderGeometry(1.05, 1.05, 3.6, 18), metalM); drum.rotation.x = Math.PI/2; drum.position.set(-57.6, 2.2, -5); add(drum, gOrigin);
    mbox(1.3, 1.1, 1.3, .06, soft('#7A6B5A'), -57.6, .55, -2.4, gOrigin);
    place(new T.CylinderGeometry(.14, .14, 3.2, 8), metalM, -57.6, 2.6, -2.4, 0, 0, 0, gOrigin);

    /* three drying patios: fresh red cherries, darkening cherries, dry parchment coffee */
    function patioTex(base, dots, seed){
      var c = canvasOf(512, 400), g = c.getContext('2d'), R = rng(seed);
      g.fillStyle = base; g.fillRect(0, 0, 512, 400);
      for(var i=0; i<5200; i++){ g.fillStyle = dots[Math.floor(R()*dots.length)]; g.beginPath(); g.arc(R()*512, R()*400, 1.2 + R()*2.2, 0, 6.283); g.fill(); }
      for(var k=0; k<9; k++){ g.strokeStyle = 'rgba(0,0,0,.06)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 20 + k*44); g.lineTo(512, 24 + k*44); g.stroke(); }   /* rake lines */
      return c;
    }
    [[-125, '#8E2B23', ['#A3362B','#7A221C','#B4473A','#9B3027','#6F8A3A'], 41],
     [-111, '#4D3123', ['#5E3D2A','#3E271B','#6B4A33','#56382A'], 42],
     [-97,  '#D2BC8C', ['#C4AA78','#DCC9A0','#B99B66','#E2D2AE'], 43]].forEach(function(pt){
      mbox(13.2, .3, 10.4, .06, soft('#E2D6BF'), pt[0], .15, -.6, gOrigin, false);
      var pm = new T.Mesh(new T.PlaneGeometry(12.4, 9.6), new T.MeshStandardMaterial({map:texOf(patioTex(pt[1], pt[2], pt[3]), true), roughness:.95}));
      pm.rotation.x = -Math.PI/2; pm.position.set(pt[0], .31, -.6); add(pm, gOrigin, false);
    });

    /* stamp table in front of the veranda: one sack receives the stencil (no close-up) */
    var tbX = -63.6, tbZ = 4.7;
    mbox(2.2, .08, 1.4, .03, woodM, tbX, .86, tbZ, gOrigin);
    [[-1,-.6],[1,-.6],[-1,.6],[1,.6]].forEach(function(o){ mbox(.08, .82, .08, .02, woodM, tbX + o[0]*.95, .41, tbZ + o[1]*.55, gOrigin); });
    heroCanvas = sackPrint(0); heroTex = texOf(heroCanvas, true);
    heroTop = new T.MeshStandardMaterial({map:heroTex, roughness:.95});
    var hero = sack(gOrigin, tbX, .9, tbZ, 0, heroTop); hero.rotation.y = 0;
    plate = new T.Group(); mbox(.92, .045, .64, .02, soft(P.dark), 0, 0, 0, plate); mbox(.5, .1, .3, .04, soft(P.wood), 0, .07, 0, plate); mbox(.08, .26, .08, .02, soft(P.wood), 0, .25, 0, plate); mbox(.36, .1, .1, .05, soft(P.dark), 0, .4, 0, plate);
    plate.position.set(tbX, 3.4, tbZ); gOrigin.add(plate);
    plate.traverse(function(o){ if(o.isMesh){ o.castShadow = true; } });

    /* people: farmers bring baskets of cherries to the patios, two rake the patios, loaders carry sacks into our container */
    var skinM = soft('#B08561'), trouserM = soft('#4A3F33'), strawM = soft('#D8C089'), basketM = soft('#9C7A45'), cherryFillM = soft('#A3362B');
    var gLeg = new T.CylinderGeometry(.15, .12, .85, 8), gBody = new T.CylinderGeometry(.17, .21, .68, 8), gHead = new T.SphereGeometry(.13, 10, 8),
        gBrim = new T.CylinderGeometry(.3, .3, .03, 12), gCrown = new T.CylinderGeometry(.12, .14, .13, 10), gBasket = new T.CylinderGeometry(.25, .18, .3, 10),
        gFill = new T.CylinderGeometry(.23, .23, .05, 10), gSack = new T.BoxGeometry(.64, .27, .42), gRake = new T.CylinderGeometry(.025, .025, 2, 6);
    function person(shirt, kind){
      var g = new T.Group(), m;
      m = new T.Mesh(gLeg, trouserM); m.position.y = .43; g.add(m);
      m = new T.Mesh(gBody, soft(shirt)); m.position.y = 1.19; g.add(m);
      m = new T.Mesh(gHead, skinM); m.position.y = 1.67; g.add(m);
      m = new T.Mesh(gBrim, strawM); m.position.y = 1.77; g.add(m);
      m = new T.Mesh(gCrown, strawM); m.position.y = 1.84; g.add(m);
      var load = null, fill = null;
      if(kind === 'basket'){ load = new T.Mesh(gBasket, basketM); load.position.set(.3, 1.28, 0); g.add(load); fill = new T.Mesh(gFill, cherryFillM); fill.position.set(.3, 1.44, 0); g.add(fill); }
      if(kind === 'sack'){ load = new T.Mesh(gSack, juteM); load.position.set(0, 1.63, .04); load.rotation.z = .16; g.add(load); }
      if(kind === 'rake'){ load = new T.Mesh(gRake, beamM); load.position.set(.32, .95, .2); load.rotation.set(.55, 0, .25); g.add(load); }
      g.traverse(function(o){ if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
      gOrigin.add(g); return {g:g, load:load, fill:fill, kind:kind};
    }
    crowd = [];
    var SH = ['#E9E4D6','#7D8B5A','#B9A27E','#E3DCCB','#5F6B48','#C9B79A','#8A7357'];
    for(var fi=0; fi<6; fi++){ var pf = person(SH[fi % SH.length], 'basket'); var fx = -129 + fi*6.6; pf.ax = fx; pf.az = -13.4; pf.bx = fx + 1.2; pf.bz = -4.6; pf.sp = .95 + fi*.04; pf.ph = fi*2.7; crowd.push(pf); }
    [[-123, 1.2],[-97.5, -2.2]].forEach(function(r, i){ var pr = person(SH[(i + 3) % SH.length], 'rake'); pr.ax = r[0]; pr.az = r[1]; pr.rake = true; pr.ph = i*1.7; crowd.push(pr); });
    for(var li=0; li<3; li++){ var pl = person(SH[(li + 1) % SH.length], 'sack'); pl.ax = -72.6 + li*.9; pl.az = 2.4; pl.bx = -74.3; pl.bz = 8.6 + li*.4; pl.sp = 1.05; pl.ph = li*2.2; pl.loader = true; crowd.push(pl); }

    /* a second container of ours is already leaving for the port */
    truckO2 = makeTruck(); truckO2.position.set(-50, 0, LANE); gOrigin.add(truckO2);
    var c2 = makeContainer(); c2.rotation.y = -Math.PI/2; truckO2.add(c2); c2.position.set(-.2, 1.45, 0);

    /* our container on the truck, parked by the shed */
    ours = makeContainer(); ours.rotation.y = -Math.PI/2;
    truckO = makeTruck(); truckO.position.set(-70, 0, LANE); gOrigin.add(truckO);
    truckO.add(ours); ours.position.set(-.2, 1.45, 0);

    /* ---------------- origin port */
    makeQuay(gOrigin, -25, 150, 46);
    yardStacks(gOrigin, [62, 140], [27, 42], 5, .18);
    yardStacks(gOrigin, [-18, 18], [28, 42], 6, .25);
    craneO = makeCrane(true); craneO.g.position.set(OCX, 0, 0); gOrigin.add(craneO.g);
    var cIdle = makeCrane(false); cIdle.g.position.set(-8, 0, 0); gOrigin.add(cIdle.g);
    mast(gOrigin, 10, 26); mast(gOrigin, 120, 24);
    var hinter = new T.Mesh(new T.PlaneGeometry(220, 160), soft(P.grass)); hinter.rotation.x = -Math.PI/2; hinter.position.set(60, -.02, 120); add(hinter, gOrigin, false);
    [[10,52],[30,56],[70,54],[110,58],[135,52]].forEach(function(p){ tree(RT, p[0], 0, p[1], 9, TM); });
    TM.flush(gOrigin);
    /* far hills on the horizon, seen while at sea */
    [[200,-900,180,1.6],[600,-1000,240,1.4],[1000,-900,200,1.8],[-300,-850,160,1.2]].forEach(function(h){ var m = new T.Mesh(blobGeo, soft(P.hill, {roughness:1})); m.scale.set(h[2]*h[3], h[2]*.18, h[2]); m.position.set(h[0], -6, h[1]); add(m, gOrigin, false, false); });

    /* ---------------- water and the ship (shared by both ports) */
    var water = new T.Mesh(new T.PlaneGeometry(9000, 9000), new T.MeshStandardMaterial({color:C(P.water), roughness:.38, metalness:0, normalMap:waterNormal(), normalScale:new T.Vector2(.14,.14)}));
    water.rotation.x = -Math.PI/2; water.position.set(3000, -2, -1000); water.receiveShadow = true; scene.add(water); waterMesh = water;
    var sh = makeShip(); ship = sh.g; wakeMat = sh.wakeMat; scene.add(ship);

    /* ---------------- Koper (built in the local frame of gKoper) */
    makeQuay(gKoper, -80, 210, 70);
    craneK = makeCrane(true); craneK.g.position.set(KCX, 0, 0); gKoper.add(craneK.g);
    var ck2 = makeCrane(false); ck2.g.position.set(-28, 0, 0); gKoper.add(ck2.g);
    yardStacks(gKoper, [-72, 8], [28, 60], 15, .16);
    mast(gKoper, 0, 24); mast(gKoper, 160, 30);
    truckK = makeTruck(); truckK.position.set(KCX, 0, LANE); gKoper.add(truckK);
    /* warehouse */
    var WX0 = 85, WX1 = 140, WZ0 = 4, WZ1 = 40, WH = 9, WCX = (WX0 + WX1)/2, WCZ = (WZ0 + WZ1)/2;
    var wall = soft(P.cream, {roughness:.9});
    mbox(WX1 - WX0, .2, WZ1 - WZ0, .05, soft(P.stone), WCX, .1, WCZ, gKoper, false);
    mbox(WX1 - WX0, WH, .6, .1, wall, WCX, WH/2, WZ0 + .3, gKoper);                      /* far wall */
    mbox(.6, WH, WZ1 - 14, .1, wall, WX0 + .3, WH/2, (14 + WZ1)/2, gKoper);              /* west wall with door gap z 4..14 */
    mbox(.6, 2.4, 10, .1, wall, WX0 + .3, WH - 1.2, 9, gKoper);
    mbox(WX1 - WX0, 1.2, .4, .1, wall, WCX, .6, WZ1 - .2, gKoper);                        /* low near walls */
    mbox(.4, 1.2, 31.45 - WZ0, .1, wall, WX1 - .2, .6, (WZ0 + 31.45)/2, gKoper); mbox(.4, 1.2, WZ1 - 38.55, .1, wall, WX1 - .2, .6, (38.55 + WZ1)/2, gKoper);
    /* the logo hangs inside as a woven tapestry on the far wall */
    tapestry = new T.Mesh(new T.PlaneGeometry(10, 7.4, 24, 6), new T.MeshStandardMaterial({map:tapestryTex(), roughness:.95, side:T.DoubleSide, opacity:.75, transparent:false}));
    tapestry.position.set(102, 5.0, WZ0 + .75); add(tapestry, gKoper, false); noEdge.push(tapestry); tapestry.userData.base = tapestry.geometry.attributes.position.array.slice();
    add(new T.Mesh(new T.CylinderGeometry(.08, .08, 11, 8), soft(P.dark)), gKoper).rotation.z = Math.PI/2;
    gKoper.children[gKoper.children.length - 1].position.set(102, 8.78, WZ0 + .75);
    roofGroup = new T.Group(); gKoper.add(roofGroup);
    var rM = new T.MeshStandardMaterial({color:C('#8A8F86'), roughness:.85, transparent:true, depthWrite:true}), rcM = new T.MeshStandardMaterial({color:C(P.cream), roughness:.85, transparent:true});
    roofMats.push(rM, rcM);
    mbox(WX1 - WX0 + 1.6, .5, WZ1 - WZ0 + 1.6, .2, rM, WCX, WH + .25, WCZ, roofGroup);
    for(var cx = WX0 + 9; cx < WX1; cx += 9) mbox(.5, WH, .5, .1, rcM, cx, WH/2, WZ1 - .2, roofGroup);
    for(var cz = WZ0 + 9; cz < WZ1; cz += 9) mbox(.5, WH, .5, .1, rcM, WX1 - .2, WH/2, cz, roofGroup);
    mbox(.5, WH, .5, .1, rcM, WX1 - .2, WH/2, WZ1 - .2, roofGroup);
    /* pallets inside; sacks appear layer by layer */
    var PAL = []; [107, 121].forEach(function(bx0){ for(var pj=0; pj<8; pj++) for(var pq=0; pq<8; pq++) PAL.push([bx0 + pq*1.42, 12.5 + pj*1.22]); });
    [0,1,2,3,4,5,6,7,8].forEach(function(i){ PAL.push([107 + i*1.42, 31.5]); PAL.push([107 + i*1.42, 32.72]); });
    pallets(gKoper, woodM, PAL, .2);
    buildProcess(woodM, juteM, sackGeos[2]);
    /* ---------------- v5: a fuller store — more sack pallets along the walls, big bags two high, people at work */
    (function(){
      var XP = [], i, j;
      for(i=0;i<9;i++){ XP.push([111 + i*1.42, 5.75]); XP.push([111 + i*1.42, 6.97]); }          /* along the far wall, right of the tapestry */
      for(j=0;j<18;j++){ XP.push([86.75, 15.8 + j*1.22, Math.PI/2]); XP.push([88.0, 15.8 + j*1.22, Math.PI/2]); }  /* along the west wall */
      for(j=0;j<15;j++) for(i=0;i<3;i++) XP.push([134.6 + i*1.42, 12.5 + j*1.22]);              /* along the east wall, up to the gate */
      for(j=0;j<4;j++) for(i=0;i<16;i++) XP.push([108.4 + i*1.42, 24.3 + j*1.22]);             /* a third block behind the two main ones */
      pallets(gKoper, woodM, XP, .2);
      var ALL = XP.concat(PAL);                                    /* the main blocks are stacked the same way */
      var SX = [], RS = rng(77), LAY = [];
      ALL.forEach(function(p, pi){
        var layers = 3 + Math.floor(RS()*3), rot = p[2] || 0, cs = Math.cos(rot), sn = Math.sin(rot); LAY.push(layers);
        for(var l=0;l<layers;l++){ var y = .349 + l*SACK_H;
          var sp = l % 2 === 0 ? [[0, -.3, 0], [0, .3, Math.PI]] : [[-.31, 0, Math.PI/2], [.31, 0, -Math.PI/2]];
          sp.forEach(function(s){ SX.push([p[0] + s[0]*cs + s[1]*sn, y, p[1] - s[0]*sn + s[1]*cs, s[2] + rot + (RS() - .5)*.08, pi, l]); });
        }
      });
      /* sacks buried inside a block are never seen: drop those with a layer above them and, on all four sides,
         a neighbouring stack at least two layers higher (one layer of margin for the gaps between pallets) */
      var NB = ALL.map(function(p, i){
        var nb = [0, 0, 0, 0];
        ALL.forEach(function(o, j){ if(i === j) return; var dx = o[0] - p[0], dz = o[1] - p[1];
          if(Math.abs(dz) < .3 && Math.abs(dx) < 1.6) nb[dx > 0 ? 0 : 1] = Math.max(nb[dx > 0 ? 0 : 1], LAY[j]);
          if(Math.abs(dx) < .3 && Math.abs(dz) < 1.4) nb[dz > 0 ? 2 : 3] = Math.max(nb[dz > 0 ? 2 : 3], LAY[j]); });
        return Math.min(nb[0], nb[1], nb[2], nb[3]);
      });
      SX = SX.filter(function(s){ var pi = s[4], l = s[5]; return !(l <= LAY[pi] - 2 && NB[pi] >= l + 2); });
      var sm = new T.InstancedMesh(sackGeos[0], juteM, SX.length);
      SX.forEach(function(s, k){ mtx.compose(sv.set(s[0], s[1], s[2]), q.setFromEuler(new T.Euler(0, s[3], 0)), new T.Vector3(1,1,1)); sm.setMatrixAt(k, mtx); });
      add(sm, gKoper);

      /* big bags: woven white sacks of about a tonne, on pallets, stacked two high along the far wall */
      var bg = new T.BoxGeometry(1.02, 1.0, .92, 6, 6, 6), bp = bg.attributes.position;
      for(i=0;i<bp.count;i++){ var x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i), b = 1 + .07*(1 - Math.pow(Math.abs(y)/.5, 2));
        var top = y > .45 ? .94 : 1; bp.setXYZ(i, x*b*top, y + .5, z*b*top); }
      bg.computeVertexNormals();
      var loopG = new T.TorusGeometry(.09, .022, 6, 10, Math.PI);
      var BB = []; for(i=0;i<9;i++){ BB.push([124.6 + i*1.42, 5.75]); BB.push([124.6 + i*1.42, 6.97]); }
      for(i=0;i<9;i++){ BB.push([107 + i*1.42, 35.2]); BB.push([107 + i*1.42, 36.5]); }
      for(j=0;j<5;j++) for(i=0;i<6;i++) BB.push([120.5 + i*1.42, 31.6 + j*1.3]);   /* two columns fewer: the gate forklift needs the lane */
      for(j=0;j<7;j++) for(i=0;i<4;i++) BB.push([90.4 + i*1.42, 29.4 + j*1.3]);
      var palB = []; BB.forEach(function(p){ palB.push([p[0], p[1]]); }); pallets(gKoper, woodM, palB, .2);
      var pal2 = new T.InstancedMesh(palletGeometry(woodM), woodM, BB.length);
      var bagM = new T.InstancedMesh(bg, soft('#ECE7DA', {roughness:.95}), BB.length*2), lpM = new T.InstancedMesh(loopG, soft('#C9B79A'), BB.length*8), RB = rng(91);
      BB.forEach(function(p, k){
        [0, 1].forEach(function(t){
          var y0 = t === 0 ? .349 : .349 + 1.0 + .149, ry = (RB() - .5)*.12;
          if(t === 1){ mtx.compose(sv.set(p[0], .349 + 1.0, p[1]), q.setFromEuler(new T.Euler(0, 0, 0)), new T.Vector3(1,1,1)); pal2.setMatrixAt(k, mtx); }
          mtx.compose(sv.set(p[0], y0, p[1]), q.setFromEuler(new T.Euler(0, ry, 0)), new T.Vector3(1, t === 0 ? .97 : .94 + RB()*.1, 1)); bagM.setMatrixAt(k*2 + t, mtx);
          [[-.42,-.36,0],[.42,-.36,0],[-.42,.36,Math.PI],[.42,.36,Math.PI]].forEach(function(o, m){
            mtx.compose(sv.set(p[0] + o[0], y0 + .99, p[1] + o[1]), q.setFromEuler(new T.Euler(0, o[2], 0)), new T.Vector3(1,1,1)); lpM.setMatrixAt(k*8 + t*4 + m, mtx);
          });
        });
      });
      add(pal2, gKoper); add(bagM, gKoper); add(lpM, gKoper);

      /* the loading gate in the east wall, a curtain-sided semi-trailer backed up to it, a second forklift loading it */
      (function(){
        var dk = soft(P.dark), wallM = soft(P.cream, {roughness:.9}), steel = soft('#8A8F86'), gZ0 = 31.7, gZ1 = 38.3, GX = 139.8;
        mbox(.5, 4.8, .5, .1, steel, GX, 2.4, gZ0, gKoper); mbox(.5, 4.8, .5, .1, steel, GX, 2.4, gZ1, gKoper);
        mbox(.7, .7, gZ1 - gZ0 + .5, .1, dk, GX, 4.95, (gZ0 + gZ1)/2, gKoper);                       /* rolled-up door in its box */
        mbox(.08, .08, gZ1 - gZ0 - .5, .02, soft('#C9A45C'), GX + .3, .25, (gZ0 + gZ1)/2, gKoper);    /* sill line */
        mbox(1.6, .14, gZ1 - gZ0, .05, soft(P.stone), GX + .8, .07, (gZ0 + gZ1)/2, gKoper, false);    /* apron */
        /* trailer: rear at x 140.7, body to the east, tractor beyond */
        var tr = new T.Group(); tr.position.set(140.7, 0, 35); gKoper.add(tr);
        var mg = new Merger(), canvasM = soft('#7D8B5A', {roughness:.95}), canvasD = soft('#5F6B48', {roughness:.95}), cab = soft(P.cream), band = soft(P.olive), gl = soft(P.glass, {roughness:.35});
        mbox(13.4, .3, .9, .05, dk, 6.7, 1.0, 0, mg);                                  /* chassis */
        mbox(13.4, .12, 2.5, .03, soft(P.wood), 6.7, 1.24, 0, mg);                     /* floor, top at 1.3 */
        mbox(.12, .22, 2.5, .03, soft('#C9A45C'), .06, 1.05, 0, mg);                   /* rear bumper */
        [-1, 1].forEach(function(s){
          mbox(12.9, 2.7, .05, .01, canvasM, 6.95, 2.65, s*1.24, mg);                  /* curtain sides */
          for(var rx = .7; rx < 13.3; rx += 1.3) mbox(.06, 2.7, .07, .01, canvasD, rx, 2.65, s*1.265, mg);   /* straps */
          mbox(.06, 2.7, 1.2, .01, canvasD, -.03, 2.65, s*1.25 + s*.6, mg, true, 0);  /* rear doors swung open */
        });
        mbox(.08, 2.7, 2.5, .02, canvasM, 13.36, 2.65, 0, mg);                         /* front wall */
        mbox(13.4, .08, 2.56, .02, canvasD, 6.7, 4.04, 0, mg);                         /* roof */
        mbox(.12, .9, .12, .03, dk, 10.6, .55, -.5, mg); mbox(.12, .9, .12, .03, dk, 10.6, .55, .5, mg);   /* landing legs */
        /* tractor */
        mbox(4.4, .3, .9, .05, dk, 15.4, .9, 0, mg);
        mbox(2.2, 2.6, 2.45, .25, cab, 16.6, 2.35, 0, mg); mbox(2.22, .35, 2.47, .08, band, 16.6, 1.55, 0, mg);
        mbox(.06, 1.0, 2.1, .03, gl, 17.72, 2.85, 0, mg); mbox(.25, .5, 2.4, .08, dk, 17.8, 1.15, 0, mg);
        mg.flush(tr);
        var wg = new T.CylinderGeometry(.5, .5, .36, 18); wg.rotateX(Math.PI/2);
        [1.3, 2.6, 3.9, 14.6, 16.9].forEach(function(x){ [-1.05, 1.05].forEach(function(z){ var w = new T.Mesh(wg, dk); w.position.set(x, .5, z); w.castShadow = true; tr.add(w); }); });
        /* pallets already in the trailer, from the front back */
        var tl = []; for(var k=0; k<10; k++){ var lp = loadedPallet(woodM, juteM, sackGeos[2], tr); lp.position.set(12.6 - Math.floor(k/2)*1.3, 1.3, k % 2 ? .6 : -.6); lp.visible = false; tl.push(lp); }
        /* the next pallet waits by the gate; a second forklift takes it into the trailer */
        var pick = loadedPallet(woodM, juteM, sackGeos[2], gKoper); pick.position.set(133.2, .2, 35);
        var stock = [[134.6, 32.6], [134.6, 37.4], [133.2, 32.6], [133.2, 37.4]].map(function(p){ var q2 = loadedPallet(woodM, juteM, sackGeos[2], gKoper); q2.position.set(p[0], .2, p[1]); return q2; });
        var fk = new T.Group(), fm = new Merger(), body = soft(P.gold), mid = soft(P.moss);
        mbox(1.15, .7, 1.9, .14, body, 0, .65, 0, fm); mbox(1.15, .55, .5, .14, mid, 0, .95, -.8, fm);
        [[-.5,.55],[.5,.55],[-.5,-.6],[.5,-.6]].forEach(function(o){ mbox(.06, 1.25, .06, .02, dk, o[0], 1.6, o[1], fm); });
        mbox(1.1, .06, 1.25, .02, dk, 0, 2.24, 0, fm); mbox(.5, .45, .5, .1, dk, 0, 1.1, -.15, fm);
        var fw = new T.CylinderGeometry(.3, .3, .24, 14); fw.rotateZ(Math.PI/2);
        [[-.5,.6],[.5,.6],[-.5,-.6],[.5,-.6]].forEach(function(o){ place(fw, dk, o[0], .3, o[1], 0, 0, 0, fm); });
        [-.32, .32].forEach(function(x){ mbox(.08, 2.3, .1, .02, dk, x, 1.25, 1.0, fm); });
        fm.flush(fk);
        var car = new T.Group(); fk.add(car); var cm = new Merger();
        mbox(.9, .5, .06, .02, mid, 0, .3, 1.08, cm); [-.25, .25].forEach(function(x){ mbox(.1, .05, 1.1, .02, dk, x, .06, 1.65, cm); });
        cm.flush(car);
        fk.rotation.y = Math.PI/2; add(fk, gKoper);
        var carried = loadedPallet(woodM, juteM, sackGeos[2], gKoper); carried.visible = false;
        loader2 = {fk:fk, car:car, carried:carried, pick:pick, tl:tl, tr:tr, stock:stock};
      })();

      /* people in the store: two unload our container onto the belt, one stacks the pallet,
         and by the open doors two men shake hands while a third holds a briefcase */
      var skin = soft('#B08561'), hair = soft('#3A2A1F'), trous = soft('#3A3530');
      var gLeg = new T.CylinderGeometry(.15, .12, .85, 8), gBody = new T.CylinderGeometry(.17, .21, .68, 8), gHead = new T.SphereGeometry(.13, 10, 8),
          gHair = new T.SphereGeometry(.135, 10, 6, 0, Math.PI*2, 0, Math.PI/2), gCap = new T.CylinderGeometry(.14, .145, .08, 10), gArm = new T.CylinderGeometry(.055, .05, .62, 6),
          gSack = new T.BoxGeometry(.64, .27, .42), gCase = new T.BoxGeometry(.44, .32, .1), gHand = new T.BoxGeometry(.12, .03, .03);
      function kperson(coat, opt){
        opt = opt || {};
        var g = new T.Group(), m;
        m = new T.Mesh(gLeg, trous); m.position.y = .43; g.add(m);
        m = new T.Mesh(gBody, soft(coat)); m.position.y = 1.19; g.add(m);
        m = new T.Mesh(gHead, skin); m.position.y = 1.67; g.add(m);
        m = new T.Mesh(opt.cap ? gCap : gHair, opt.cap ? soft(opt.cap) : hair); m.position.y = opt.cap ? 1.78 : 1.69; g.add(m);
        var arms = [];
        [-1, 1].forEach(function(s){                      /* s = -1 is the right arm when the figure faces +z */
          var a = new T.Group(); a.position.set(s*.23, 1.47, 0); g.add(a);
          var am = new T.Mesh(gArm, soft(coat)); am.position.y = -.31; a.add(am);
          var hd = new T.Mesh(new T.SphereGeometry(.055, 6, 5), skin); hd.position.y = -.63; a.add(hd);
          a.rotation.z = s*.08; arms.push(a);
        });
        var load = null;
        if(opt.sack){ load = new T.Mesh(gSack, juteM); load.position.set(0, 1.63, .04); load.rotation.z = .16; g.add(load); }
        if(opt.briefcase){ load = new T.Mesh(gCase, soft('#4A3424', {roughness:.6})); load.position.set(.27, .72, 0); load.rotation.y = Math.PI/2; g.add(load);
          var hl = new T.Mesh(gHand, soft('#2B1D12')); hl.position.set(.27, .9, 0); hl.rotation.y = Math.PI/2; g.add(hl); arms[1].rotation.z = .1; }
        g.traverse(function(o){ if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
        gKoper.add(g); return {g:g, arms:arms, load:load};
      }
      kcrowd = [];
      /* loaders: from the container doors to the head of the belt and back */
      [['#7D8B5A', 9.25, 0], ['#B9A27E', 8.35, 3.1]].forEach(function(d, n){
        var w = kperson(d[0], {cap:'#C9A45C', sack:true}); w.ax = 96.55; w.az = d[1]; w.bx = 96.45; w.bz = 12.2; w.sp = 1.0; w.ph = d[2]; w.walk = true; w.wait = n; kcrowd.push(w);
      });
      var st = kperson('#5F6B48', {cap:'#C9A45C'}); st.g.position.set(96.0, .2, 22.5); st.g.rotation.y = Math.PI/2;   /* on the far side of the stacking spot, clear of the forklift */ st.stack = true; kcrowd.push(st);
      /* the handshake: our side (olive) and a buyer (slate); a colleague of the buyer with a briefcase */
      var A = kperson('#4E5A2A'), B = kperson('#3F4A4C'), Cb = kperson('#2E241C', {briefcase:true});
      A.g.position.set(93.5, .2, 11.7); A.g.rotation.y = Math.PI/2;      /* faces +x */
      B.g.position.set(94.5, .2, 11.7); B.g.rotation.y = -Math.PI/2;    /* faces -x */
      Cb.g.position.set(95.1, .2, 13.1); Cb.g.rotation.y = -2.3;
      A.shake = B.shake = true; A.ph = 0; B.ph = 0; kcrowd.push(A, B, Cb);
      /* by the trailer a checker with a clipboard counts the pallets in */
      var ck = kperson('#C9B79A', {cap:'#4E5A2A'}); ck.g.position.set(141.3, 0, 37.6); ck.g.rotation.y = -2.2; ck.arms[1].rotation.x = -1.1; ck.check = true;
      var clip = new T.Mesh(new T.BoxGeometry(.32, .03, .42), soft('#F3EADB')); clip.position.set(.05, 1.12, .38); clip.rotation.x = -.6; ck.g.add(clip); kcrowd.push(ck);
    })();
    /* Koper hinterland: land, hills and the old town above the port */
    var land = new T.Mesh(new T.PlaneGeometry(700, 500), soft(P.grass)); land.rotation.x = -Math.PI/2; land.position.set(60, -.03, 320); add(land, gKoper, false);
    [[-120,330,90,1.5],[120,360,120,1.8],[320,320,90,1.4]].forEach(function(h){ var m = new T.Mesh(blobGeo, soft(P.hill, {roughness:1})); m.scale.set(h[2]*h[3], h[2]*.28, h[2]*.7); m.position.set(h[0], -8, h[1]); add(m, gKoper, false); });
    var RH = rng(23), houseG = rbox(6, 5, 5, .4), roofG = new T.ConeGeometry(4.6, 2.4, 4); roofG.rotateY(Math.PI/4); roofG.scale(1.05, 1, .9);
    var houses = new T.InstancedMesh(houseG, soft(P.cream), 60), roofs = new T.InstancedMesh(roofG, soft('#A08E78'), 60);
    for(var hi=0; hi<60; hi++){ var hx = -150 + RH()*300, hz = 90 + RH()*90; mtx.compose(V(hx, 2.5, hz), q.setFromEuler(new T.Euler(0, (RH() - .5)*.4, 0)), sv.set(1, .8 + RH()*.6, 1)); houses.setMatrixAt(hi, mtx); var hgt = 2.5 + 2.5*sv.y; mtx.compose(V(hx, hgt + 1.1, hz), q, sv.set(1, 1, 1)); roofs.setMatrixAt(hi, mtx); }
    add(houses, gKoper); add(roofs, gKoper);
    var TK = new Merger(); [[60,64],[-40,66],[150,62],[200,70],[100,90],[-90,80]].forEach(function(p){ tree(RT, p[0], 0, p[1], 10, TK); }); TK.flush(gKoper);

    /* ---------------- the route map (separate set, reached through the clouds) */
    buildMap();
  }

  /* ---------------------------------------------------------------- map */
  var MAPC = V(0, 0, -30000), LON0 = -95, LON1 = 140, LAT0 = -42, LAT1 = 62, LONC = (LON0 + LON1)/2, LATC = (LAT0 + LAT1)/2;
  function geo(lon, lat, y){ return V(MAPC.x + lon - LONC, y || 0, MAPC.z - (lat - LATC)); }
  var overMat, routes = [], kDot, kRings = [], labels = [], KOPER, pDots = [], portShow = 0, zoomK = 0;
  function buildMap(){
    var loader = new T.TextureLoader();
    var under = new T.Mesh(new T.PlaneGeometry(4000, 4000), new T.MeshBasicMaterial({color:C(P.cream)})); under.rotation.x = -Math.PI/2; under.position.set(MAPC.x, -.4, MAPC.z); gMap.add(under);
    var bt = loader.load(MXROOT + 'assets/img/map-base.png'); bt.encoding = T.sRGBEncoding; bt.anisotropy = ANISO;
    var base = new T.Mesh(new T.PlaneGeometry(LON1 - LON0, LAT1 - LAT0), new T.MeshBasicMaterial({map:bt})); base.rotation.x = -Math.PI/2; base.position.copy(MAPC); gMap.add(base);
    var ot = loader.load(MXROOT + 'assets/img/map-over.png'); ot.encoding = T.sRGBEncoding; ot.anisotropy = ANISO;
    overMat = new T.MeshBasicMaterial({map:ot, transparent:true, opacity:0, depthWrite:false});
    var over = new T.Mesh(new T.PlaneGeometry(LON1 - LON0, LAT1 - LAT0), overMat); over.rotation.x = -Math.PI/2; over.position.set(MAPC.x, .05, MAPC.z); gMap.add(over);
    KOPER = geo(13.73, 45.55, .3);
    /* sea lanes, drawn as light dashed lines that follow the real routes into the Adriatic */
    var MED = [[-5.6,35.95],[2,37.2],[10.5,37.6],[15.2,36.6],[18.6,38.6],[19.2,40.2],[17.2,42.0],[14.6,44.4],[13.73,45.55]];
    var SUEZ = [[43.4,12.6],[40.2,16.5],[37.2,21.5],[34.2,27.0],[32.55,29.9],[32.3,31.3],[28.5,33.5],[23.5,35.0],[18.6,38.6],[19.2,40.2],[17.2,42.0],[14.6,44.4],[13.73,45.55]];
    var ATL = [[-20,26],[-12,33.5]];
    var ROUTE = [
      ['Brazil', [-46.3,-23.9], [[-42,-23.5],[-36,-12],[-31,-2],[-24,12]].concat(ATL, MED)],
      ['Colombia', [-75.5,10.4], [[-71,13.5],[-63,16.5],[-52,22],[-36,27]].concat(ATL, MED)],
      ['Ethiopia', [43.1,11.6], [[43.3,12.0]].concat(SUEZ)],
      ['Uganda', [39.7,-4.05], [[43,-2],[49,5.5],[51,11.6],[46,12.2]].concat(SUEZ)],
      ['India', [76.2,9.9], [[72,11],[62,13],[52,13],[46,12.4]].concat(SUEZ)],
      ['Vietnam', [106.8,10.3], [[106.5,7.5],[104.5,2.5],[100.5,3.6],[97.5,6.2],[88,6.4],[80.5,5.4],[70,9.6],[60,13],[52,13],[46,12.4]].concat(SUEZ)],
      ['Indonesia', [105.3,-5.6], [[105.8,-3.5],[104.5,.2],[103.8,1.25],[100.5,3.6],[97.5,6.2],[88,6.4],[80.5,5.4],[70,9.6],[60,13],[52,13],[46,12.4]].concat(SUEZ)]
    ];
    var ink = C('#2B1D12'), olive = C('#55602F');
    var VS = 'attribute float along; varying float vS; void main(){ vS = along; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
    var FSR = 'uniform float uHead; uniform float uLen; uniform float uTime; uniform vec3 uCol; varying float vS;' +
              'void main(){ if(vS > uHead * uLen) discard;' +
              ' float fromEnd = uLen - vS; float dash = fract(fromEnd / 2.2 + uTime * .18);' +
              ' if(dash > .55) discard;' +
              ' gl_FragColor = vec4(uCol, .85); }';
    function ribbon(pts, w){
      var pos = [], al = [], idx = [], acc = 0;
      for(var i=0;i<pts.length;i++){
        var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.sqrt(dx*dx + dz*dz) || 1, nx = -dz/l*w/2, nz = dx/l*w/2;
        if(i > 0) acc += pts[i].distanceTo(pts[i - 1]);
        pos.push(pts[i].x + nx, .3, pts[i].z + nz, pts[i].x - nx, .3, pts[i].z - nz); al.push(acc, acc);
        if(i > 0){ var k = i*2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      }
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('along', new T.Float32BufferAttribute(al, 1)); g.setIndex(idx);
      return {g:g, len:acc};
    }
    function flat(geom, col, op){ var m = new T.Mesh(geom, new T.MeshBasicMaterial({color:col, transparent:true, opacity:op, depthWrite:false})); m.rotation.x = -Math.PI/2; gMap.add(m); return m; }
    var dotGeo = new T.CircleGeometry(1, 28), ringGeo = new T.RingGeometry(1, 1.25, 40);
    ROUTE.forEach(function(r){
      var ll = [r[1]].concat(r[2]), v3 = ll.map(function(p){ return geo(p[0], p[1], 0); });
      var curve = new T.CatmullRomCurve3(v3, false, 'centripetal', .5), pts = curve.getSpacedPoints(Math.max(80, Math.round(curve.getLength()*1.5)));
      var rb = ribbon(pts, .5);
      var mat = new T.ShaderMaterial({uniforms:{uHead:{value:0}, uLen:{value:rb.len}, uTime:{value:0}, uCol:{value:ink}}, vertexShader:VS, fragmentShader:FSR, transparent:true, depthWrite:false, side:T.DoubleSide});
      var mesh = new T.Mesh(rb.g, mat); gMap.add(mesh);
      var A = geo(r[1][0], r[1][1], .35);
      var dot = flat(dotGeo, C(P.cream), 0); dot.position.set(A.x, .4, A.z); dot.scale.setScalar(.85);
      var dotR = flat(new T.RingGeometry(.85, 1.2, 28), ink, 0); dotR.position.set(A.x, .41, A.z);
      routes.push({mat:mat, dot:dot, dotR:dotR, name:r[0], at:A});
    });
    /* lanes from the Atlantic trunk, up the Channel to Antwerp, on to Hamburg, and through the Danish straits into the Baltic (Gdańsk, Tallinn) */
    var NORTH = [
      [[-12,33.5],[-11,37.5],[-10,41.5],[-9.6,44.6],[-7,47.4],[-4.6,49.2],[-1.5,50.1],[0.8,50.4],[1.7,51.0],[3.0,51.6],[3.6,51.45],[4.4,51.22]],
      [[2.3,51.6],[3.4,52.6],[5.0,53.6],[7.0,54.1],[8.4,54.0],[9.4,53.7],[9.97,53.54]],
      [[6.4,54.4],[8.1,55.6],[8.3,57.4],[10.2,57.9],[11.6,57.0],[11.4,56.0],[10.9,55.2],[11.2,54.6],[12.6,54.8],[14.4,55.1],[16.6,54.9],[18.2,54.8],[18.66,54.37]],
      [[15.0,55.1],[17.4,56.3],[19.8,57.6],[21.6,58.7],[22.6,59.6],[24.0,59.7],[24.75,59.44]]
    ];
    NORTH.forEach(function(ll){
      var v3 = ll.map(function(p){ return geo(p[0], p[1], 0); });
      var curve = new T.CatmullRomCurve3(v3, false, 'centripetal', .5), pts = curve.getSpacedPoints(Math.max(60, Math.round(curve.getLength()*2.2)));
      var rb = ribbon(pts, .32);
      var mat = new T.ShaderMaterial({uniforms:{uHead:{value:0}, uLen:{value:rb.len}, uTime:{value:0}, uCol:{value:ink}}, vertexShader:VS, fragmentShader:FSR, transparent:true, depthWrite:false, side:T.DoubleSide});
      gMap.add(new T.Mesh(rb.g, mat));
      routes.push({mat:mat, dot:{material:{}}, dotR:{material:{}}, name:'', at:null, quiet:true});
    });
    var PORTS = [['Antwerp', 4.4, 51.22, -14, -26], ['Hamburg', 9.97, 53.54, 0, -42, 1], ['Gdańsk', 18.66, 54.37, 14, -26], ['Tallinn', 24.75, 59.44, 14, -26]];
    PORTS.forEach(function(p){
      var at = geo(p[1], p[2], .45), d = flat(dotGeo, ink, 1); d.position.set(at.x, .45, at.z); d.scale.setScalar(1.0); d.userData.s = 1.0; pDots.push(d);
      var rr = flat(ringGeo, olive, 0); rr.position.set(at.x, .44, at.z); kRings.push(rr);
    });
    kDot = flat(dotGeo, ink, 0); kDot.position.set(KOPER.x, .45, KOPER.z); kDot.scale.setScalar(1.25); kDot.userData.s = 1.25; pDots.push(kDot);
    var kr = flat(ringGeo, olive, 0); kr.position.set(KOPER.x, .44, KOPER.z); kRings.push(kr);
    var box = document.getElementById('labels');
    function addLabel(text, at, cls, dx, dy){ var el = document.createElement('span'); el.className = 'lbl' + (cls ? ' ' + cls : ''); el.textContent = text; box.appendChild(el); labels.push({el:el, at:at, dx:dx, dy:dy, koper:cls === 'koper', left:dx < 0}); }
    routes.forEach(function(a){ if(a.quiet) return; var left = /India|Uganda|Vietnam|Indonesia|Ethiopia/.test(a.name); addLabel(((window.MTL || {}).rt || {})[a.name] || a.name, a.at, '', left ? -14 : 14, -6); });
    var RT = (window.MTL || {}).rt || {};
    addLabel(RT['Trieste · Koper'] || 'Trieste · Koper', KOPER, 'koper', -16, -12);
    PORTS.forEach(function(p){ addLabel(RT[p[0]] || p[0], geo(p[1], p[2], .45), 'koper', p[3], p[4]); if(p[5]) labels[labels.length - 1].center = true; });
  }
  var pv = new T.Vector3();
  function placeLabels(show, sOrig){
    labels.forEach(function(l){
      var o = l.koper ? portShow : show*sOrig;
      if(o < .01){ if(l.on){ l.el.style.opacity = 0; l.on = false; } return; }
      pv.copy(l.at).project(camera);
      var x = (pv.x + 1)/2*W + l.dx, y = (1 - pv.y)/2*H + l.dy;
      l.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)' + (l.left ? ' translateX(-100%)' : (l.center ? ' translateX(-50%)' : ''));
      l.el.style.opacity = o.toFixed(3); l.on = true;
    });
  }

  /* ---------------------------------------------------------------- the story, driven by scroll position c (0 … 11) */
  var CUT1 = 5.62, CUT2 = 9.55, waterMesh;
  var LIFT = 27, ON_TRUCK = 1.45 + 2.591 + .25, ON_SHIP = SLOT.y - 2 + 2.591 + .25, SLOT_Z = SHIP_Z + SLOT.z;
  function craneCycle(c, t0, fromTz, fromY, toTz, toY){
    /* returns spreader state for one pick-and-place starting at t0 (span .6) */
    var tz = fromTz, sy = LIFT, st = 'before';
    if(c < t0){ }
    else if(c < t0 + .1){ sy = lerp(LIFT, fromY, ease(smooth(t0, t0 + .1, c))); }
    else if(c < t0 + .2){ sy = lerp(fromY, LIFT, ease(smooth(t0 + .1, t0 + .2, c))); st = 'held'; }
    else if(c < t0 + .38){ tz = lerp(fromTz, toTz, ease(smooth(t0 + .2, t0 + .38, c))); st = 'held'; }
    else if(c < t0 + .5){ tz = toTz; sy = lerp(LIFT, toY, ease(smooth(t0 + .38, t0 + .5, c))); st = 'held'; }
    else { tz = toTz; sy = lerp(toY, LIFT, ease(smooth(t0 + .5, t0 + .6, c))); st = 'after'; }
    return {tz:tz, sy:sy, st:st};
  }
  function hold(parent, x, y, z, ry){ if(ours.parent !== parent) parent.add(ours); ours.position.set(x, y, z); ours.rotation.set(0, ry, 0); }
  var shipState = {x:0, z:0}, heroA = -1;
  function story(c, dt, time){
    /* plantation */
    ripen(1);
    truckO2.position.x = lerp(-50, 16, ease(smooth(.1, 2.3, c))); truckO2.visible = c < 2.35;
    if(crowd && c < 2.7){
      for(var ci=0; ci<crowd.length; ci++){
        var pp = crowd[ci], px, pz, py, face, moving = false;
        if(pp.rake){ var sw = reduce ? 0 : Math.sin(time*.7 + pp.ph); px = pp.ax + sw*1.6; pz = pp.az; py = .3; face = Math.cos(time*.7 + pp.ph) > 0 ? Math.PI/2 : -Math.PI/2; moving = !reduce; }
        else {
          var ddx = pp.bx - pp.ax, ddz = pp.bz - pp.az, LL = Math.hypot(ddx, ddz), tw = LL/pp.sp, TT = 2*tw + 2, tt = reduce ? .3*tw : (time + pp.ph) % TT, s, go;
          if(tt < tw){ s = tt/tw; go = true; moving = true; } else if(tt < tw + 1){ s = 1; go = false; } else if(tt < 2*tw + 1){ s = 1 - (tt - tw - 1)/tw; go = false; moving = true; } else { s = 0; go = true; }
          px = pp.ax + ddx*s; pz = pp.az + ddz*s;
          face = go ? Math.atan2(ddx, ddz) : Math.atan2(-ddx, -ddz);
          var full = go && tt < tw;
          if(pp.fill) pp.fill.visible = full || tt >= 2*tw + 1;
          if(pp.loader && pp.load) pp.load.visible = full || tt >= 2*tw + 1;
          if(pp.loader) py = pz < 3.6 ? .25 : 0;
          else py = (pz > -5.8 && px > -131.6 && px < -90.4) ? .3 : groundO(px, pz);
        }
        if(moving) py += Math.abs(Math.sin(time*7 + pp.ph))*.05;
        pp.g.position.set(px, py, pz); pp.g.rotation.y = face;
      }
    }
    var down = smooth(1.72, 1.82, c) - smooth(1.88, 1.97, c);
    plate.position.y = lerp(3.4, .9 + .2 + .03, down);
    var pa = smooth(1.8, 1.86, c);
    if(heroA < 0 || Math.abs(pa - heroA) > .02){ paintSackPrint(heroCanvas.getContext('2d'), heroCanvas.width, heroCanvas.height, pa); heroTex.needsUpdate = true; heroA = pa; }

    /* origin truck: drives to the crane, leaves after the lift */
    truckO.position.x = lerp(-70, OCX, ease(smooth(2.42, 3.4, c))) + 80*ease(smooth(4.15, 4.6, c)); truckO.visible = c < 4.62;   /* leaves along the quay, out of the shot */
    /* origin crane: truck → ship */
    var k = craneCycle(c, 3.5, LANE, ON_TRUCK, SLOT_Z, ON_SHIP);
    setRig(craneO, k.tz, k.sy);
    /* Koper crane: ship → truck */
    var k2 = craneCycle(c, 6.42, SLOT_Z, ON_SHIP, LANE, ON_TRUCK);
    setRig(craneK, k2.tz, k2.sy);

    /* the ship: moored at the origin, departs, sails; after the clouds it arrives in Koper */
    var sx, sz, wk = 0;
    if(c < CUT1){
      var push = ease(smooth(4.25, 4.6, c)), go = smooth(4.4, 5.62, c);
      sx = OCX + 700*go*go; sz = SHIP_Z - 26*push; wk = smooth(4.3, 4.7, c);
      ship.position.set(sx, -2, sz);
    } else {
      var a = smooth(CUT1, 6.15, c), b = ease(smooth(5.95, 6.3, c));
      sx = KX + KCX - 520*(1 - a)*(1 - a); sz = lerp(SHIP_Z - 26, SHIP_Z, b); wk = 1 - smooth(5.95, 6.25, c);
      ship.position.set(sx, -2, sz);
    }
    wakeMat.opacity = .55*wk;
    shipState.x = sx; shipState.z = sz;

    /* who carries our container */
    if(c < 3.6) hold(truckO, -.2, 1.45, 0, -Math.PI/2);
    else if(k.st === 'held' && c < 4.2) hold(gOrigin, OCX, k.sy - .25 - 2.591, k.tz, -Math.PI/2);
    else if(c < 6.52) hold(ship, SLOT.x, SLOT.y, SLOT.z, -Math.PI/2);
    else if(k2.st === 'held') hold(gKoper, KCX, k2.sy - .25 - 2.591, k2.tz, -Math.PI/2);
    else hold(truckK, -.2, 1.45, 0, -Math.PI/2);

    /* Koper truck into the warehouse, roof lifts away, sacks are laid out, roof returns for the rise */
    truckK.position.x = lerp(KCX, 101, ease(smooth(7.1, 7.58, c)));
    var op = c < 3 ? 1 - smooth(2.05, 2.35, c) : smooth(7.58, 7.75, c) - smooth(8.45, 8.6, c);
    ours.userData.doors.forEach(function(d){ d.g.rotation.y = d.s*op*2.5; });
    var inStore = c > 7.3 && c < 8.8;
    process(time, inStore && !reduce);
    if(kcrowd && c > 6.9 && c < 8.8){
      var dOpen = c > 7.78;
      for(var kc=0; kc<kcrowd.length; kc++){
        var w = kcrowd[kc];
        if(w.walk){
          var kx, kz, kf, mov = false, carry = true;
          if(!dOpen || reduce){ kx = w.ax; kz = w.az; kf = Math.PI/2; carry = false;
            w.arms[w.wait ? 0 : 1].rotation.x = dOpen ? 0 : -1.25; }   /* one of them swings the doors open */
          else {
            w.arms[0].rotation.x = w.arms[1].rotation.x = 0;
            var LL = Math.hypot(w.bx - w.ax, w.bz - w.az), tw = LL/w.sp, TT = 2*tw + 1.4, tt = (time + w.ph) % TT, s2;
            if(tt < tw){ s2 = tt/tw; mov = true; } else if(tt < tw + .7){ s2 = 1; carry = false; } else if(tt < 2*tw + .7){ s2 = 1 - (tt - tw - .7)/tw; mov = true; carry = false; } else { s2 = 0; }
            kx = lerp(w.ax, w.bx, s2); kz = lerp(w.az, w.bz, s2);
            kf = tt < tw || tt >= 2*tw + .7 ? Math.atan2(w.bx - w.ax, w.bz - w.az) : Math.atan2(w.ax - w.bx, w.az - w.bz);
          }
          w.load.visible = carry;
          w.g.position.set(kx, .2 + (mov ? Math.abs(Math.sin(time*7 + w.ph))*.05 : 0), kz); w.g.rotation.y = kf;
        } else if(w.stack){
          var sw = reduce ? .5 : .5 + .5*Math.sin(time*2.2);
          w.arms[0].rotation.x = w.arms[1].rotation.x = -.35 - .75*sw;
        } else if(w.check){
          w.arms[0].rotation.x = reduce ? -.3 : -.3 - .25*Math.max(0, Math.sin(time*1.7));
        } else if(w.shake){
          var on = reduce ? 0 : ((time % 6) < 2.6 ? 1 : 0), hy = 1.1 + on*Math.sin(time*13)*.06;
          var dv = new T.Vector3(.23, hy - 1.47, .5).normalize();
          w.arms[0].quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), dv);
        }
      }
    }
    if(loader2 && c > 6.9 && c < 8.8){
      var L2 = loader2, P2 = 10, cyc2 = Math.floor(time/P2), u2 = (time % P2)/P2, carry2;
      /* straight in and out of the trailer: approach, lift at a standstill, drive up, raise, creep in, set down, back out, lower, reverse to the start */
      var FK2 = [
        {u0:0,   u1:.09, p0:[129.6, 35], p1:[131.55, 35], h0:HPX, h1:HPX, f0:.1},
        {u0:.09, u1:.15, p0:[131.55, 35], h0:HPX, f0:.1, f1:.45},
        {u0:.15, u1:.34, p0:[131.55, 35], p1:[137.7, 35], h0:HPX, h1:HPX, f0:.45},
        {u0:.34, u1:.42, p0:[137.7, 35], h0:HPX, f0:.45, f1:1.25},
        {u0:.42, u1:.49, p0:[137.7, 35], p1:[139.15, 35], h0:HPX, h1:HPX, f0:1.25},
        {u0:.49, u1:.53, p0:[139.15, 35], h0:HPX, f0:1.25, f1:1.13},
        {u0:.53, u1:.61, p0:[139.15, 35], p1:[137.7, 35], h0:HPX, h1:HPX, d:-1, f0:1.13},
        {u0:.61, u1:.68, p0:[137.7, 35], h0:HPX, f0:1.13, f1:.1},
        {u0:.68, u1:.9,  p0:[137.7, 35], p1:[129.6, 35], h0:HPX, h1:HPX, d:-1, f0:.1},
        {u0:.9,  u1:1,   p0:[129.6, 35], h0:HPX, f0:.1}
      ];
      var p2 = fkPose(FK2, u2), fx2 = p2.x, fh2 = p2.fh; carry2 = u2 >= .09 && u2 < .51;
      L2.fk.position.set(fx2, .2, 35); L2.car.position.y = fh2;
      L2.carried.visible = carry2; if(carry2) L2.carried.position.set(fx2 + 1.65, .2 + fh2, 35);
      L2.pick.visible = u2 < .09 || u2 >= .92;
      var nIn = (cyc2 % 11) + (u2 >= .51 ? 1 : 0); L2.tl.forEach(function(p, i){ p.visible = i < Math.min(nIn, 10); });
    }
    if(tapestry && inStore && !reduce){
      var ta = tapestry.geometry.attributes.position, base = tapestry.userData.base;
      for(var ti=0; ti<ta.count; ti++){ var tx = base[ti*3], ty = base[ti*3+1]; ta.array[ti*3+2] = Math.sin(tx*.9 + time*1.1)*.06*(1 - (ty + 3.7)/7.4)*.8 + Math.sin(tx*2.3 - time*.7)*.02; }
      ta.needsUpdate = true;
    }
    var rf = smooth(7.4, 7.62, c) - smooth(8.42, 8.7, c);
    roofMats.forEach(function(m){ if(m !== shedRoofG.userData.mat) m.opacity = 1 - rf; }); roofGroup.visible = rf < .995; roofGroup.userData.edge = rf < .4;
    var sf = 0;
    shedRoofG.userData.mat.opacity = 1 - sf; shedRoofG.visible = sf < .995; shedRoofG.userData.edge = sf < .4;

    /* map */
    var onMap = c >= CUT2, lit = smooth(9.62, 9.9, c);
    overMat.opacity = lit;
    /* Koper is lit from the first frame; the lanes then draw themselves in, all at once, and keep a slow dashed flow */
    var goal = c > 9.82 ? 1 : 0;
    arcK = smooth(9.72, 10.18, c);
    var hd = ease(arcK);
    routes.forEach(function(r){
      r.mat.uniforms.uHead.value = onMap ? hd*1.001 : 0; r.mat.uniforms.uTime.value = reduce ? 0 : time;
      r.dot.material.opacity = lit; r.dotR.material.opacity = lit;
    });
    kRings.forEach(function(r){ var pr = reduce ? .3 : ((time*.22) % 1); r.scale.setScalar((1.5 + pr*2.2)*(1 - .62*zoomK)); r.material.opacity = (1 - pr)*.55; });
    zoomK = onMap ? smooth(10.05, 10.5, c) : 0; portShow = onMap ? smooth(10.3, 10.55, c) : 0;
    pDots.forEach(function(d){ d.scale.setScalar(d.userData.s*(1 - .5*zoomK)); d.material.opacity = d === kDot ? 1 : lit; });
    placeLabels(onMap ? smooth(9.6, 9.85, c) : 0, lit*(1 - zoomK));
  }
  var lastOm = null, arcK = 0, lastFill = [-1, -1];
  function fillSacks(im, f, idx){
    if(Math.abs(f - lastFill[idx]) < .0005) return; lastFill[idx] = f;
    var list = im.userData.list, n = list.length;
    for(var i=0;i<n;i++){
      var s = list[i], kk = clamp((f - i/n*.88)/.12, 0, 1); kk = kk*kk*(3 - 2*kk);
      var scl = Math.max(.001, kk);
      mtx.compose(sv.set(s[0], s[1] + (1 - kk)*1.4, s[2]), q.setFromEuler(new T.Euler(0, s[3] + kJit[i % kJit.length], 0)), new T.Vector3(scl, scl, scl));
      im.setMatrixAt(i, mtx);
    }
    im.instanceMatrix.needsUpdate = true;
  }

  /* ---------------------------------------------------------------- camera path */
  function SHIPT(){ return [shipState.x, 8, shipState.z]; }
  function TRUCKO(){ return [truckO.position.x, 3, LANE]; }
  function TRUCKK(){ return [KX + truckK.position.x, 3, LANE]; }
  /* t: target, d: distance, y: yaw (0 = camera on +z looking -z), p: pitch */
  var KEYS_O = [
    {c:0,    t:[-102, 0, -4], d:104, y:-.62, p:.7},
    {c:1.2,  t:[-92, 0, -1],  d:94,  y:-.56, p:.7},
    {c:2.2,  t:[-76, 1, 4],   d:80,  y:-.42, p:.7},
    {c:2.9,  t:TRUCKO,        d:76,  y:-.05, p:.7},
    {c:3.45, t:[OCX, 6, 2],   d:84,  y:.35,  p:.7},
    {c:4.1,  t:[OCX, 8, -10], d:92,  y:.45,  p:.72},
    {c:4.6,  t:SHIPT,         d:120, y:.45,  p:.74},
    {c:5.1,  t:SHIPT,         d:150, y:.42,  p:.78},
    {c:CUT1, t:SHIPT,         d:165, y:.42,  p:.8}
  ];
  var KEYS_K = [
    {c:CUT1, t:SHIPT,              d:170, y:.42, p:.8},
    {c:5.98, t:SHIPT,              d:150, y:.42, p:.75},
    {c:6.32, t:[KX + KCX, 8, -8],  d:96,  y:.48, p:.7},
    {c:7.0,  t:[KX + KCX, 6, 2],   d:80,  y:.5,  p:.7},
    {c:7.42, t:TRUCKK,             d:76,  y:.42, p:.7},
    {c:7.85, t:[KX + 96, 1, 12],   d:42,  y:.42, p:.74},
    {c:8.4,  t:[KX + 121, 1, 26],  d:92,  y:.38, p:.8},
    {c:CUT2, t:[KX + 121, 1, 26],  d:92,  y:.38, p:.8}
  ];
  function EURT(){ var g = geo(mobile ? 14.6 : 13.5, mobile ? 52.5 : 52, 0); return [g.x, 0, g.z]; }
  function MAPT(){ var g = geo(mobile ? 18 : 17, mobile ? 14 : 13, 0); return [g.x, 0, g.z]; }
  var KEYS_M = [
    {c:CUT2, t:MAPT, d:720, y:0, p:1.35},
    {c:9.95, t:MAPT, d:400, y:0, p:1.02},
    {c:10.05, t:MAPT, d:400, y:0, p:1.02},
    {c:10.5, t:EURT, get d(){ return mobile ? 68 : 92; }, y:0, p:1.48},
    {c:11,   t:EURT, get d(){ return mobile ? 68 : 92; }, y:0, p:1.48}
  ];
  function val(v){ return typeof v === 'function' ? v() : v; }
  function interp(L, c){
    if(c <= L[0].c){ var f = L[0]; return {t:val(f.t), d:f.d, y:f.y, p:f.p}; }
    for(var i=0;i<L.length-1;i++){
      var a = L[i], b = L[i+1];
      if(c <= b.c){ var e = ease((c - a.c)/(b.c - a.c)), ta = val(a.t), tb = val(b.t);
        return {t:[lerp(ta[0],tb[0],e), lerp(ta[1],tb[1],e), lerp(ta[2],tb[2],e)], d:Math.exp(lerp(Math.log(a.d), Math.log(b.d), e)), y:lerp(a.y,b.y,e), p:lerp(a.p,b.p,e)}; }
    }
    var z = L[L.length-1]; return {t:val(z.t), d:z.d, y:z.y, p:z.p};
  }
  function camAt(c){ return c < CUT1 ? interp(KEYS_O, c) : c < CUT2 ? interp(KEYS_K, c) : interp(KEYS_M, c); }

  var W = 1, H = 1, mobile = false, TGT = new T.Vector3();
  function setCam(k, onMap){
    var dist = k.d*(onMap ? 1.69 : 4.0)*(mobile ? (onMap ? 1.25 : 1.45) : 1);
    TGT.set(k.t[0], k.t[1], k.t[2]);
    camera.fov = onMap ? (W < H ? 28 : 18) : (W < H ? 14 : 9);
    var cp = Math.cos(k.p);
    camera.position.set(TGT.x + dist*cp*Math.sin(k.y), TGT.y + dist*Math.sin(k.p), TGT.z + dist*cp*Math.cos(k.y));
    camera.near = Math.max(.15, dist*.035); camera.far = Math.max(1500, dist*25);
    camera.lookAt(TGT); camera.updateProjectionMatrix();
    /* lens shift: the subject sits right of the text on wide screens, above it on phones */
    if(mobile) camera.projectionMatrix.elements[9] = -.34 + .72*zoomK; else camera.projectionMatrix.elements[8] = -.24;   /* subject clear of the folio cards */
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    sun.position.copy(TGT).addScaledVector(SUN_DIR, 400); sun.target.position.copy(TGT); sun.target.updateMatrixWorld();
    var ext = clamp(dist*.24, 12, 160);
    if(Math.abs(scm.right - ext) > .5){ scm.left = -ext; scm.right = ext; scm.top = ext; scm.bottom = -ext; scm.updateProjectionMatrix(); }
    return dist;
  }

  /* ---------------------------------------------------------------- composite pass */
  var FS = [
    'uniform sampler2D tColor; uniform sampler2D tNormal; uniform sampler2D tDepth;',
    'uniform vec2 res; uniform float pr; uniform float near; uniform float far; uniform float mode; uniform float expo;',
    'uniform float fogA; uniform float fogB; uniform float cloud; uniform float cloudK; uniform float time;',
    'uniform vec3 paper; uniform vec3 ink;',
    'varying vec2 vUv;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }',
    'float fbm(vec2 p){ float s = 0.0, a = 0.5; for(int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }',
    'float linDepth(vec2 uv){ float z = texture2D(tDepth, uv).x * 2.0 - 1.0; return (2.0 * near * far) / (far + near - z * (far - near)); }',
    'vec3 nrm(vec2 uv){ return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }',
    'float hatch(float s, float cov){ float f = abs(fract(s + 0.5) - 0.5) * 2.0; float w = fwidth(s) * 1.1; return (1.0 - smoothstep(cov - w, cov + w, f)) * smoothstep(0.0, 0.06, cov); }',
    'vec2 rot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c*v.x - s*v.y, s*v.x + c*v.y); }',
    'vec3 filmic(vec3 x){ x *= expo; return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }',
    'void main(){',
    '  vec2 px = gl_FragCoord.xy / pr;',
    '  vec4 c = texture2D(tColor, vUv);',
    '  float isBg = 1.0 - step(0.5, c.a);',
    '  float grain = vnoise(px * 0.8) * 0.035 + vnoise(px * 0.11) * 0.018;',
    '  vec3 pap = paper * (1.0 - grain);',
    '  float wob = (vnoise(px * 0.035) - 0.5) * 1.2 + (vnoise(px * 0.23) - 0.5) * 0.2;',
    '  vec3 outc;',
    '  if(mode > 2.5){',
    '    outc = mix(pow(max(c.rgb, 0.0), vec3(0.4545)) * (1.0 - grain * 0.6), pap, isBg);',
    '  } else {',
    '    vec3 n = nrm(vUv); float d = linDepth(vUv);',
    '    vec3 col = pow(filmic(c.rgb), vec3(0.4545));',
    '    float L = dot(col, vec3(0.2126, 0.7152, 0.0722));',
    '    vec2 n2 = n.xy; float m = length(n2);',
    '    vec2 k1 = normalize(mix(vec2(0.7071, 0.7071), n2 / max(m, 1e-3), smoothstep(0.12, 0.5, m)));',
    '    vec2 k2 = rot(k1, 1.05);',
    '    vec2 t = max(1.0, pr / 1.5) / res;',
    '    float dl = linDepth(vUv - vec2(t.x, 0.0)), dr = linDepth(vUv + vec2(t.x, 0.0)), du = linDepth(vUv + vec2(0.0, t.y)), dd = linDepth(vUv - vec2(0.0, t.y));',
    '    float de = (abs(dl + dr - 2.0 * d) + abs(du + dd - 2.0 * d)) / max(d, 0.2);',
    '    vec3 nl = nrm(vUv - vec2(t.x, 0.0)), nr = nrm(vUv + vec2(t.x, 0.0)), nu = nrm(vUv + vec2(0.0, t.y)), nd = nrm(vUv - vec2(0.0, t.y));',
    '    float ne = length(nl - nr) + length(nu - nd);',
    '    float fogF = smoothstep(fogA, fogB, d) * (1.0 - isBg);',
    '    float edge = max(smoothstep(0.02, 0.06, de), smoothstep(0.6, 1.0, ne)) * (1.0 - isBg) * (1.0 - smoothstep(0.0, 0.7, fogF));',
    '    if(mode < 0.5){',
    '      outc = mix(col, pap, isBg);',
    '    } else if(mode < 1.5){',
    '      float Ls = clamp(L * 1.25, 0.0, 1.0), dark = 1.0 - Ls;',
    '      float h1 = hatch(dot(px, k1) / 4.4 + wob, clamp((dark - 0.28) * 1.25, 0.0, 0.72));',
    '      float h2 = hatch(dot(px, k2) / 4.75 + wob * 0.7, clamp((dark - 0.56) * 1.45, 0.0, 0.62));',
    '      float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));',
    '      float sat = (mx - mn) / max(mx, 1e-3); vec3 hue = col / max(mx, 0.02);',
    '      vec3 tint = mix(vec3(1.0), hue, (0.2 + 0.5 * smoothstep(0.2, 0.7, sat)) * (1.0 - isBg));',
    '      outc = mix(pap * tint, ink, max(max(h1, h2) * 0.9 * (1.0 - isBg), edge));',
    '    } else {',
    '      float dark = 1.0 - L;',
    '      float h1 = hatch(dot(px, k1) / 4.0 + wob, clamp((dark - 0.38) * 1.5, 0.0, 0.62));',
    '      float h2 = hatch(dot(px, k2) / 4.3 + wob * 0.7, clamp((dark - 0.62) * 1.6, 0.0, 0.5));',
    '      vec3 base = mix(col * (1.0 - grain * 0.6), pap, isBg);',
    '      vec3 shadeInk = mix(ink, col * 0.32, 0.45);',
    '      outc = mix(base, shadeInk, max(h1, h2) * 0.75 * (1.0 - isBg) * (1.0 - fogF));',
    '      outc = mix(outc, ink, edge * 0.92);',
    '    }',
    '    float clean = step(0.6, c.a) * (1.0 - step(0.9, c.a));',
    '    outc = mix(outc, col * (1.0 - grain * 0.4), clean);',
    '    outc = mix(outc, pap, fogF);',
    '    float skyCov = smoothstep(0.5, 1.0, vUv.y) * 0.2;',
    '    float skyL = hatch(px.y / 3.6 + (vnoise(px * 0.02) - 0.5) * 0.8, skyCov) * isBg;',
    '    outc = mix(outc, ink, skyL * 0.3);',
    '  }',
    '  if(cloud > 0.001){',
    '    vec2 qv = (vUv - 0.5) * vec2(res.x / res.y, 1.0);',
    '    vec2 cp = qv * (1.5 / (0.6 + cloudK * 1.8)) + vec2(cloudK * 0.9 + time * 0.012, cloudK * 0.3);',
    '    float f = fbm(cp) * 0.85 + (0.5 - length(qv) * 0.35) * 0.3 * (1.0 - cloudK);',
    '    float thr = 0.78 - cloud * 0.62;',
    '    float msk = smoothstep(thr, thr + 0.05, f);',
    '    float rim = (1.0 - smoothstep(0.0, fwidth(f) * 1.8, abs(f - thr - 0.012))) * (1.0 - smoothstep(0.75, 0.95, cloud));',
    '    float shade = smoothstep(thr + 0.2, thr + 0.02, f) * (0.6 + 0.4 * smoothstep(0.6, 0.2, vUv.y));',
    '    float hl = hatch(px.y / 3.4 + wob * 0.5, shade * 0.45);',
    '    vec3 cc = mix(pap * 1.015, ink, hl * 0.5);',
    '    outc = mix(outc, cc, msk);',
    '    outc = mix(outc, ink, rim * 0.6);',
    '    outc = mix(outc, pap, smoothstep(0.82, 1.0, cloud));',
    '  }',
    '  vec2 q = vUv - 0.5; outc *= 1.0 - dot(q, q) * 0.16;',
    '  gl_FragColor = vec4(outc, 1.0);',
    '}'
  ].join('\n');
  var rtColor, rtNormal, quad, quadScene, quadCam, normalMat;
  function setupPost(){
    var depthTex = new T.DepthTexture(); depthTex.type = renderer.capabilities.isWebGL2 ? T.UnsignedIntType : T.UnsignedShortType;
    rtColor = new T.WebGLRenderTarget(2, 2, {minFilter:T.LinearFilter, magFilter:T.LinearFilter, format:T.RGBAFormat, type:T.HalfFloatType});
    rtNormal = new T.WebGLRenderTarget(2, 2, {minFilter:T.NearestFilter, magFilter:T.NearestFilter, format:T.RGBAFormat, depthTexture:depthTex});
    normalMat = new T.MeshNormalMaterial();
    quadCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1); quadScene = new T.Scene();
    var mat = new T.ShaderMaterial({
      uniforms:{tColor:{value:rtColor.texture}, tNormal:{value:rtNormal.texture}, tDepth:{value:depthTex}, res:{value:new T.Vector2(2,2)}, pr:{value:1},
                near:{value:1}, far:{value:1000}, mode:{value:STYLE}, expo:{value:.95}, fogA:{value:200}, fogB:{value:900}, cloud:{value:0}, cloudK:{value:0}, time:{value:0},
                paper:{value:new T.Color(P.cream)}, ink:{value:new T.Color('#2B1D12')}},
      vertexShader:'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader:FS, depthTest:false, depthWrite:false
    });
    mat.extensions.derivatives = true;
    quad = new T.Mesh(new T.PlaneGeometry(2, 2), mat); quad.frustumCulled = false; quadScene.add(quad);
  }
  function resize(){
    W = cv.clientWidth || window.innerWidth; H = cv.clientHeight || window.innerHeight; mobile = W < 760 || W < H;
    var pr = renderer.getPixelRatio();
    renderer.setSize(W, H, false); camera.aspect = W/H; camera.fov = W < H ? 14 : 9; camera.updateProjectionMatrix();
    var RW = Math.round(W*pr), RH = Math.round(H*pr);
    rtColor.setSize(RW, RH); rtNormal.setSize(RW, RH); quad.material.uniforms.res.value.set(RW, RH); quad.material.uniforms.pr.value = pr;
  }

  /* ---------------------------------------------------------------- the voyage, driven by the reader's scroll
     The world stays pinned behind a run of folio cards. Scroll position u (0 … N-1, one screen per card)
     maps onto the story c; after the storage scene the map of sea lanes into our ports (the camera ends over Europe,
     with the ports named), and the run ends on a photograph of stored coffee. */
  var KU = [
    [0, 0], [1, 1.1], [2, 2.1], [3, 3.2], [4, 4.25], [5, 5.05], [5.4, 5.45],
    [5.4001, 5.62], [6, 6.7], [7, 7.45], [7.5, 7.85], [8, 8.4], [8.45, 8.4],
    [8.4501, 9.58], [8.95, 10.0], [9.45, 10.6], [10, 10.6]
  ];
  var CHS = [
    {n:'The plantation', u:0}, {n:'Port of origin', u:2.6}, {n:'At sea', u:4.6}, {n:'Koper · unloading', u:5.4},
    {n:'Transit storage', u:6.6}, {n:'Sea lanes to our ports', u:8.45}, {n:'Ready for delivery', u:9.75}
  ];
  var ROMAN = ['I','II','III','IV','V','VI','VII'];
  var MTL = window.MTL || {};
  if(MTL.ch && MTL.ch.length === CHS.length) CHS.forEach(function(c, i){ c.n = MTL.ch[i]; });
  function cOfU(u){
    if(u <= KU[0][0]) return KU[0][1];
    for(var i=0;i<KU.length-1;i++){ var a = KU[i], b = KU[i+1]; if(u <= b[0]) return lerp(a[1], b[1], (u - a[0])/(b[0] - a[0])); }
    return KU[KU.length-1][1];
  }
  function chOfU(u){ var k = 0; for(var i=0;i<CHS.length;i++) if(u >= CHS[i].u - .02) k = i; return k; }

  var journey = document.getElementById('journey'), stage = document.getElementById('stage');
  var panels = Array.prototype.slice.call(journey.querySelectorAll('.jp')), N = panels.length;
  var cartN = document.getElementById('jChN'), cartT = document.getElementById('jChT'), cart = document.getElementById('jCart');
  var jphoto = document.getElementById('jphoto'), jimg = jphoto.querySelector('img');
  var labelsBox = document.getElementById('labels');
  var rail = Array.prototype.slice.call(document.querySelectorAll('#jRail button'));
  var ph0 = 0, idleTick = 0, fEma = 16, fN = 0, qPR = renderer.getPixelRatio(), shN = 0;
  var uT = 0, uC = 0, visible = true, lastCh = -1, lastPh = -1, t0 = performance.now(), tPrev = t0;
  function vh(){ return stage.offsetHeight || window.innerHeight; }
  function measure(){ uT = clamp((window.scrollY - journey.offsetTop)/vh(), 0, N - 1); }
  if(FM){ uT = uC = clamp(parseFloat(FM[1]), 0, N - 1); }

  rail.forEach(function(b, i){
    b.addEventListener('click', function(){ window.scrollTo({top:journey.offsetTop + CHS[i].u*vh() + 2, behavior:'smooth'}); });
  });
  function chapterUI(ci){
    cartN.textContent = (MTL.chap || 'Chapter {n} of VII').replace('{n}', ROMAN[ci]); cartT.textContent = CHS[ci].n;
    rail.forEach(function(b, i){ b.classList.toggle('on', i === ci); b.classList.toggle('done', i < ci); if(i === ci) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  }

  function frame(now){
    requestAnimationFrame(frame);
    var raw = now - tPrev, dt = Math.min(.05, raw/1000); tPrev = now;
    var time = (now - t0)/1000;
    if(!visible && !SNAP) return;
    if(!FM) measure();
    /* phones: while the reader is not scrolling, redraw at half rate (people keep working, the battery is spared) */
    if(LOWP && !SNAP && uT === uC && ph0 >= 0){ idleTick ^= 1; if(idleTick){ tPrev = now - raw; return; } }
    uC = SNAP ? uT : uC + (uT - uC)*Math.min(1, dt*7);
    if(Math.abs(uT - uC) < .0004) uC = uT;
    /* adaptive resolution: if frames stay slow, draw fewer pixels (the engraving look hides it) */
    if(!SNAP){
      if(raw > 0 && raw < 200){ fEma += (raw - fEma)*.08; fN++; }
      if(fN > 70 && fEma > (LOWP ? 30 : 22) && qPR > PRMIN){
        qPR = Math.max(PRMIN, qPR*.9); renderer.setPixelRatio(qPR); resize(); fN = 0; fEma = 16;
      }
    }
    var cur = cOfU(uC), ci = chOfU(uC);
    if(ci !== lastCh){ lastCh = ci; chapterUI(ci); }

    gOrigin.visible = cur < CUT1; gKoper.visible = cur >= CUT1 && cur < CUT2; gMap.visible = cur >= CUT2;
    ship.visible = waterMesh.visible = cur < CUT2;
    story(cur, dt, time);
    if(waterMesh.material.normalMap){ waterMesh.material.normalMap.offset.x += dt*.004; }

    var onMap = cur >= CUT2, k = camAt(cur), dist = setCam(k, onMap);
    var u = quad.material.uniforms;
    u.near.value = camera.near; u.far.value = camera.far; u.time.value = time;
    u.mode.value = onMap ? 3 : STYLE;
    u.fogA.value = dist*1.4 + 40; u.fogB.value = dist*6 + 400;
    u.cloud.value = 0; u.cloudK.value = 0;

    /* the run ends on a photograph of stored coffee */
    var ph = smooth(9.62, 10.0, uC); ph0 = 1;
    if(Math.abs(ph - lastPh) > .0005){
      jphoto.style.opacity = ph.toFixed(3);
      jimg.style.transform = 'scale(' + (1.1 - .1*smooth(9.62, 10, uC)).toFixed(4) + ')';
      cart.style.opacity = (1 - ph).toFixed(3);
      labelsBox.style.opacity = clamp(1 - ph*3, 0, 1).toFixed(3);   /* the map names go before the photograph arrives */
      lastPh = ph;
    }

    /* folio cards drift and fade around the middle of the screen */
    var H0 = vh();
    panels.forEach(function(p, i){
      var d = uC - i, el = p.firstElementChild; if(!el) return;
      el.style.transform = 'translateY(' + (d*-46).toFixed(1) + 'px)';
      el.style.opacity = (1 - clamp(Math.abs(d)*1.5 - .35, 0, 1)).toFixed(3);
    });

    if(ph < .999){
      if(!LOWP || (shN++ % 3) === 0) renderer.shadowMap.needsUpdate = true;   /* phones: shadows every third frame */
      renderer.setRenderTarget(rtColor); renderer.setClearColor(0x000000, 0); renderer.render(scene, camera);
      noEdge.forEach(function(o){ o.userData.v = o.visible; o.visible = false; });
      var rv = roofGroup.visible, sv2 = shedRoofG.visible; if(!roofGroup.userData.edge) roofGroup.visible = false; if(!shedRoofG.userData.edge) shedRoofG.visible = false;
      scene.overrideMaterial = normalMat; renderer.setRenderTarget(rtNormal); renderer.setClearColor(0x8080ff, 1); renderer.render(scene, camera); scene.overrideMaterial = null;
      noEdge.forEach(function(o){ o.visible = o.userData.v; }); roofGroup.visible = rv; shedRoofG.visible = sv2;
      renderer.setRenderTarget(null); renderer.render(quadScene, quadCam);
    }
  }

  function start(){
    try { build(); } catch(e){ console.error(e); }
    setupPost(); resize();
    if(FM){ window.scrollTo(0, journey.offsetTop + uT*vh()); }
    requestAnimationFrame(function(n){ tPrev = n; frame(n); });
    setTimeout(done, 300);
  }
  var started = false, ready = 0;
  function go(){ if(started || ready < 3) return; started = true; setTimeout(start, 30); }
  function tick(){ ready++; go(); }
  [LOGO, LOGOF].forEach(function(im){ if(im.complete) tick(); else { im.onload = tick; im.onerror = tick; } });
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(tick); else tick();
  setTimeout(function(){ if(ready < 3){ ready = 3; go(); } }, 4000);

  if('IntersectionObserver' in window){
    new IntersectionObserver(function(es){ es.forEach(function(e){ visible = e.isIntersecting; }); }, {rootMargin:'200px 0px'}).observe(journey);
  }
  var rt;
  window.addEventListener('resize', function(){ clearTimeout(rt); rt = setTimeout(function(){ if(quad) resize(); if(!FM) measure(); }, 160); });

})();
