/* BY MAXTRADE — the enquiry form (checks, Web3Forms, WhatsApp link). Settings are in /config.js. */
/* contact: enquiry form + WhatsApp chat */
(function(){
  'use strict';
  var MTL = window.MTL || {};
  function MX(k, d){ return MTL[k] || d; }
  /* Web3Forms access key (free, from web3forms.com; requests arrive at the address it was registered with).
     While it is empty, the form opens the visitor's e-mail program with the request filled in. */
  var CFG = window.MXCFG || {};            /* site settings live in config.js (one file for both languages) */
  var W3F_KEY = CFG.key || '';
  var TO = CFG.to || 'export@maxtrade.si', ALSO = CFG.also || '', WA_NUM = CFG.wa || '38670247352', MAX = 600;
  var f = document.getElementById('enq'), go = document.getElementById('fGo'), st = document.getElementById('fSt');
  var co = document.getElementById('fCo'), ph = document.getElementById('fPh'), em = document.getElementById('fEm'), ms = document.getElementById('fMs'), hp = document.getElementById('fHp');
  var cnt = document.getElementById('fCnt'), wa = document.getElementById('waBtn');
  if(!f) return;

  function say(t){ st.textContent = t || ''; }
  function mark(inp, msg){ var box = inp.parentNode, e = box.querySelector('.err'); box.classList.toggle('bad', !!msg); e.textContent = msg || ''; inp.setAttribute('aria-invalid', msg ? 'true' : 'false'); return !msg; }
  function checks(){
    var c = co.value.trim(), p = ph.value.trim(), m = em.value.trim(), t = ms.value.trim(), digits = p.replace(/\D/g, '');
    return [
      [co, c.length < 2 ? MX('eCo', 'Please enter the company name.') : ''],
      [ph, (!/^[+\d][\d\s().\-]*$/.test(p) || digits.length < 7 || digits.length > 15) ? MX('ePh', 'Please enter a number with the country code, e.g. +386 70 247 352.') : ''],
      [em, !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m) ? MX('eEm', 'Please enter a valid e-mail address.') : ''],
      [ms, t.length < 10 ? MX('eMs', 'Please write a few words about what you need (at least 10 characters).') : '']
    ];
  }
  function one(i){ return checks().filter(function(x){ return x[0] === i; })[0][1]; }
  [co, ph, em, ms].forEach(function(i){
    i.addEventListener('blur', function(){ if(i.value.trim()) mark(i, one(i)); });
    i.addEventListener('input', function(){ if(i.parentNode.classList.contains('bad') && !one(i)) mark(i, ''); });
  });

  function count(){ var n = ms.value.length; cnt.textContent = n + ' / ' + MAX; cnt.classList.toggle('warn', n >= MAX - 60); }
  ms.addEventListener('input', count); count();

  /* the WhatsApp button always works; it carries what has been typed so far */
  function waText(){
    var c = co.value.trim(), t = ms.value.trim().replace(/\s+/g, ' ');
    var s = MX('waHi', 'Hello! ') + (c ? MX('waFrom', 'I am writing from ') + c + (/[.!?]$/.test(c) ? ' ' : '. ') : MX('waAsk', 'I would like to request information from BY MAXTRADE. '));
    if(t) s += t.slice(0, 320) + (t.length > 320 ? '…' : '');
    return s;
  }
  function waLink(){ wa.href = 'https://wa.me/' + WA_NUM + '?text=' + encodeURIComponent(waText()); }
  [co, ms].forEach(function(i){ i.addEventListener('input', waLink); }); waLink();

  function body(){ return MX('bCo', 'Company') + ': ' + co.value.trim() + '\n' + MX('bPh', 'Phone') + ': ' + ph.value.trim() + '\n' + MX('bEm', 'E-mail') + ': ' + em.value.trim() + '\n\n' + ms.value.trim(); }
  f.addEventListener('submit', function(e){
    e.preventDefault(); say('');
    if(hp.value){ say(MX('thx', 'Thank you.')); return; }              /* a robot filled the hidden field */
    var bad = null; checks().forEach(function(r){ if(!mark(r[0], r[1]) && !bad) bad = r[0]; });
    if(bad){ bad.focus(); say(MX('chk', 'Please check the marked fields.')); return; }
    var subject = MX('subj', 'Website request (EN)') + ' — ' + co.value.trim();
    if(!W3F_KEY){
      window.location.href = 'mailto:' + TO + (ALSO ? ',' + ALSO : '') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body());
      say(MX('mailOpen', 'Your e-mail program should open with the request ready to send. If it did not, write to {TO} or use WhatsApp.').replace('{TO}', TO));
      return;
    }
    go.disabled = true; say(MX('sending', 'Sending…'));
    fetch('https://api.web3forms.com/submit', {method:'POST', headers:{'Content-Type':'application/json', 'Accept':'application/json'},
      body: JSON.stringify({access_key:W3F_KEY, subject:subject, from_name:'maxtrade.si', name:co.value.trim(), email:em.value.trim(), phone:ph.value.trim(), message:ms.value.trim()})})
      .then(function(r){ return r.json(); })
      .then(function(j){
        if(j && j.success){ f.reset(); count(); waLink(); say(MX('sent', 'Thank you — your request has been sent. We will reply soon.')); }
        else throw new Error('rejected');
      })
      .catch(function(){ say(MX('fail', 'Sorry, the request could not be sent. Please write to {TO} or use WhatsApp.').replace('{TO}', TO)); })
      .then(function(){ go.disabled = false; });
  });
})();
