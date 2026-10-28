/* BY MAXTRADE — page behaviour: header, menu, reveals, compass, drawings. */
/* page: header state, menu, reveals, compass, consulting drawings */
(function(){
  'use strict';
  var MTL = window.MTL || {};
  function MX(k, d){ return MTL[k] || d; }
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var top = document.getElementById('top'), hero = document.getElementById('about'), burger = document.getElementById('burger'), menu = document.getElementById('menu');
  var heroC = document.getElementById('heroCompass');
  var links = Array.prototype.slice.call(menu.querySelectorAll('a[data-sec]'));
  var secs = links.map(function(a){ return document.getElementById(a.getAttribute('data-sec')); });
  function onScroll(){
    var y = window.scrollY, hh = hero.offsetHeight;
    top.classList.toggle('over', y < hh - 90 && !top.classList.contains('open'));
    if(!reduce){
      heroC.style.transform = 'rotate(' + (y*.06).toFixed(2) + 'deg)';
    }
    var mid = window.innerHeight*.35, on = -1;
    secs.forEach(function(s, i){ if(s && s.getBoundingClientRect().top <= mid) on = i; });
    if(window.innerHeight + y >= document.documentElement.scrollHeight - 4) on = secs.length - 1;
    links.forEach(function(a, i){ a.classList.toggle('on', i === on); if(i === on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
  }
  window.addEventListener('scroll', onScroll, {passive:true}); onScroll();
  burger.addEventListener('click', function(){
    var open = !top.classList.contains('open'); top.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false'); burger.setAttribute('aria-label', open ? MX('menuClose', 'Close menu') : MX('menuOpen', 'Open menu')); onScroll();
  });
  links.forEach(function(a){ a.addEventListener('click', function(){ top.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', MX('menuOpen', 'Open menu')); }); });

  /* ink reveals */
  var rv = Array.prototype.slice.call(document.querySelectorAll('[data-reveal], .rule-draw'));
  if('IntersectionObserver' in window && !reduce){
    var io = new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } }); }, {rootMargin:'0px 0px -8% 0px'});
    rv.forEach(function(el){ io.observe(el); });
  } else rv.forEach(function(el){ el.classList.add('in'); });

  /* Prices Current: the quill draws the Arabica line, then the Robusta line follows */
  var sheet = document.getElementById('sheet'), bills = document.getElementById('bills'), quill = document.getElementById('quill'), pA = document.getElementById('pAra');
  function moveQuill(t){ var L = pA.getTotalLength(), p = pA.getPointAtLength(L*t); quill.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')'); }
  var qRun = 0;
  function drawSheet(){
    sheet.classList.remove('drawn'); void sheet.offsetWidth; sheet.classList.add('drawn');
    var t0 = performance.now(), D = 3400, my = ++qRun;
    (function step(now){ if(my !== qRun) return; var t = Math.min(1, (now - t0)/D), e = t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2; moveQuill(e); if(t < 1) requestAnimationFrame(step); })(t0);
  }
  if('IntersectionObserver' in window){
    var io2 = new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ if(e.target === sheet) drawSheet(); else e.target.classList.add('in'); io2.unobserve(e.target); } }); }, {threshold:.35});
    io2.observe(sheet); io2.observe(bills);
  } else { drawSheet(); bills.classList.add('in'); }
  if(/film=|snap/.test(location.hash)){ drawSheet(); bills.classList.add('in'); rv.forEach(function(el){ el.classList.add('in'); }); }

  /* the collage: three slides that take turns at the front; any slide can be brought forward */
  var col = document.getElementById('collage'), sls = Array.prototype.slice.call(col.querySelectorAll('.sl')), dots = Array.prototype.slice.call(col.querySelectorAll('.cdots button'));
  var order = [0, 1, 2], hold = false, seen = false, calSl = document.getElementById('calSl');
  Array.prototype.forEach.call(calSl.querySelectorAll('.bar'), function(b, i){ b.style.transitionDelay = (i*.09).toFixed(2) + 's'; });
  function growCal(){ calSl.classList.remove('grown'); void calSl.offsetWidth; calSl.classList.add('grown'); }
  function show(front){
    order = [front, (front + 1) % 3, (front + 2) % 3];
    order.forEach(function(si, pos){ sls[si].classList.remove('p0', 'p1', 'p2'); sls[si].classList.add('p' + pos); sls[si].setAttribute('aria-hidden', pos ? 'true' : 'false'); });
    dots.forEach(function(d, i){ d.classList.toggle('on', i === front); d.setAttribute('aria-selected', i === front ? 'true' : 'false'); });
    if(front === 0 && seen) drawSheet();
    if(front === 2) growCal();
  }
  sls.forEach(function(el, i){ el.addEventListener('click', function(){ if(order[0] !== i){ show(i); rest(); } }); });
  dots.forEach(function(d, i){ d.addEventListener('click', function(){ show(i); rest(); }); });
  var tm = null;
  function rest(){ clearInterval(tm); tm = setInterval(function(){ if(!hold && seen) show(order[1]); }, 6500); }
  col.addEventListener('mouseenter', function(){ hold = true; }); col.addEventListener('mouseleave', function(){ hold = false; });
  col.addEventListener('focusin', function(){ hold = true; }); col.addEventListener('focusout', function(){ hold = false; });
  if('IntersectionObserver' in window){ new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting && !seen){ seen = true; rest(); } }); }, {threshold:.3}).observe(col); } else { seen = true; rest(); }
})();
