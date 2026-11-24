/* PINGJOOR client bridge - injected into the user's panel page by the Windows app.
   The panel itself is NOT modified on the server. This script adds, client side only:
     1) a responsive DNS power control that lives INSIDE the panel header (falls back to a floating pill),
     2) country flags next to region names (Windows has no emoji flags, so flags are inline SVG).
   The best DNS is read from the key the panel already stores in localStorage (pp_dns_*) after each ping test. */
(function () {
  if (window.top !== window || window.__pjBridge) return;
  if (!/^https?:$/.test(location.protocol) || !/^\/u\/[^\/]+/.test(location.pathname)) return;
  window.__pjBridge = 1;

  /* v26: keep the panel invisible until the app has placed its controls (no visible re-layout after login) */
  var pjReady = false, pjT0 = Date.now(), pjStable = 0, pjLastSig = '';
  /* v28: the login page stays on screen while this panel loads behind it; we tell the app when everything is placed */
  function pjReveal() {
    if (pjReady) return;
    pjReady = true;
    send('ready');
  }
  function pjCheck() {
    if (pjReady) return;
    var age = Date.now() - pjT0, dk = document.getElementById('pjdock'), sig = '';
    try {
      var c = document.querySelector('#pjdock'), b = c ? c.getBoundingClientRect() : null;
      var sw = 0; try { sw = swapCards(); } catch (e) {}
      sig = sw + '|' + (chipHost ? chipHost.getAttribute('data-mode') : '') + '|' + (b ? Math.round(b.top) + ',' + Math.round(b.height) : '') + '|' + document.querySelectorAll('.pj-flag').length;
    } catch (e) {}
    if (sig === pjLastSig) pjStable++; else { pjStable = 0; pjLastSig = sig; }
    /* ready when the layout signature stayed the same for ~600 ms, but never wait longer than 5 s */
    if ((age > 700 && pjStable >= 6 && chipHost && chipHost.parentNode) || age > 5000) pjReveal();
  }
  setInterval(pjCheck, 100);

  var st = { dns: [], busy: false }, dismissed = '', askTm = null, host, root, layer, lastTop = null, lastKey = '';
  var chipHost, chipRoot, chipBtn, chipTx, backHost;

  function send(a, p) {
    var q = [];
    for (var k in (p || {})) q.push(k + '=' + encodeURIComponent(p[k]));
    q.push('_=' + Date.now());
    var u = 'pjapp://' + a + '?' + q.join('&');
    if (window.chrome && window.chrome.webview && window.chrome.webview.postMessage) window.chrome.webview.postMessage(u);
    else location.href = u;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

  /* ---------- read the best DNS the panel computed ---------- */
  try {
    var _si = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      var r = _si.apply(this, arguments);
      try {
        if (this === window.localStorage && typeof k === 'string' && k.indexOf('pp_dns_') === 0) onBest(JSON.parse(v));
      } catch (e) {}
      return r;
    };
  } catch (e) {}

  function onBest(hl) {
    var top = ((hl && hl.top) || []).filter(function (x) { return x && IPV4.test(x.ip || ''); }).slice(0, 2);
    if (!top.length) return;
    var key = top.map(function (x) { return x.ip; }).join(',');
    lastTop = top; lastKey = key;
    if (key === st.dns.join(',') || st.busy) return;
    clearTimeout(askTm);
    /* no question: the recommended DNS is applied automatically (Windows still asks admin rights once) */
    askTm = setTimeout(function () {
      if (st.busy || key === st.dns.join(',')) return;
      setBusy('در حال تنظیم خودکار DNS...');
      send('set', { d: top.map(function (x) { return x.ip; }).join(',') });
    }, 1600);
  }

  /* =====================================================================
     FLAGS  (inline SVG, 30x20 viewBox)
     ===================================================================== */
  function R(x, y, w, h, c) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + c + '"/>'; }
  function H(a) { var h = 20 / a.length, s = ''; for (var i = 0; i < a.length; i++) s += R(0, +(i * h).toFixed(3), 30, +(h + .05).toFixed(3), a[i]); return s; }
  function V(a) { var w = 30 / a.length, s = ''; for (var i = 0; i < a.length; i++) s += R(+(i * w).toFixed(3), 0, +(w + .05).toFixed(3), 20, a[i]); return s; }
  function star(cx, cy, r, rot, c) {
    var p = [], i, a, rr;
    for (i = 0; i < 10; i++) {
      a = (rot + i * 36) * Math.PI / 180; rr = i % 2 ? r * 0.382 : r;
      p.push((cx + rr * Math.cos(a)).toFixed(2) + ',' + (cy + rr * Math.sin(a)).toFixed(2));
    }
    return '<polygon points="' + p.join(' ') + '" fill="' + c + '"/>';
  }
  function circ(cx, cy, r, c) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + c + '"/>'; }
  function cross(cx, cy, th, bg, fg) {   /* nordic style cross: vertical bar at x=cx, horizontal bar at y=cy */
    return R(0, 0, 30, 20, bg) + R(cx - th / 2, 0, th, 20, fg) + R(0, cy - th / 2, 30, th, fg);
  }
  var SVG = {};
  SVG.TR = R(0, 0, 30, 20, '#e30a17') + circ(11.2, 10, 5, '#fff') + circ(12.6, 10, 4, '#e30a17') + star(16.4, 10, 2.9, 0, '#fff');
  SVG.NL = H(['#ae1c28', '#ffffff', '#21468b']);
  SVG.DE = H(['#000000', '#dd0000', '#ffce00']);
  SVG.FR = V(['#002395', '#ffffff', '#ed2939']);
  SVG.IT = V(['#009246', '#ffffff', '#ce2b37']);
  SVG.RU = H(['#ffffff', '#0039a6', '#d52b1e']);
  SVG.UA = H(['#0057b7', '#ffd700']);
  SVG.PL = H(['#ffffff', '#dc143c']);
  SVG.RO = V(['#002b7f', '#fcd116', '#ce1126']);
  SVG.BG = H(['#ffffff', '#00966e', '#d62612']);
  SVG.AM = H(['#d90012', '#0033a0', '#f2a800']);
  SVG.AZ = H(['#00b5e2', '#ef3340', '#509e2f']) + circ(14.2, 10, 2.9, '#fff') + circ(14.9, 10, 2.4, '#ef3340') + star(18.4, 10, 1.6, 0, '#fff');
  SVG.AE = R(0, 0, 30, 20, '#fff') + R(0, 0, 30, 6.67, '#00732f') + R(0, 13.33, 30, 6.67, '#000') + R(0, 0, 7.5, 20, '#ff0000');
  SVG.IR = H(['#239f40', '#ffffff', '#da0000']) + '<ellipse cx="15" cy="10" rx="2.4" ry="2.8" fill="none" stroke="#da0000" stroke-width="1.1"/>';
  SVG.IQ = H(['#ce1126', '#ffffff', '#000000']) + R(9.5, 8.6, 11, 2.8, '#007a3d');
  SVG.FI = cross(10.5, 10, 4, '#ffffff', '#003580');
  SVG.SE = cross(10.5, 10, 4, '#006aa7', '#fecc00');
  SVG.NO = R(0, 0, 30, 20, '#ba0c2f') + R(7.5, 0, 6, 20, '#fff') + R(0, 7, 30, 6, '#fff') + R(9, 0, 3, 20, '#00205b') + R(0, 8.5, 30, 3, '#00205b');
  SVG.DK = cross(11, 10, 3.4, '#c8102e', '#ffffff');
  SVG.CH = R(0, 0, 30, 20, '#d52b1e') + R(12.5, 4.5, 5, 11, '#fff') + R(9.5, 7.5, 11, 5, '#fff');
  SVG.AT = H(['#ed2939', '#ffffff', '#ed2939']);
  SVG.BE = V(['#000000', '#fdda24', '#ef3340']);
  SVG.IE = V(['#169b62', '#ffffff', '#ff883e']);
  SVG.ES = R(0, 0, 30, 20, '#c60b1e') + R(0, 5, 30, 10, '#ffc400');
  SVG.LT = H(['#fdb913', '#006a44', '#c1272d']);
  SVG.LV = R(0, 0, 30, 20, '#9e3039') + R(0, 8.4, 30, 3.2, '#ffffff');
  SVG.EE = H(['#0072ce', '#000000', '#ffffff']);
  SVG.CZ = R(0, 0, 30, 10, '#ffffff') + R(0, 10, 30, 10, '#d7141a') + '<polygon points="0,0 15,10 0,20" fill="#11457e"/>';
  SVG.HU = H(['#ce2939', '#ffffff', '#477050']);
  SVG.GR = R(0, 0, 30, 20, '#0d5eaf') + R(0, 2.2, 30, 2.2, '#fff') + R(0, 6.7, 30, 2.2, '#fff') + R(0, 11.1, 30, 2.2, '#fff') + R(0, 15.6, 30, 2.2, '#fff') + R(0, 0, 11, 11, '#0d5eaf') + R(4.4, 0, 2.2, 11, '#fff') + R(0, 4.4, 11, 2.2, '#fff');
  SVG.GE = R(0, 0, 30, 20, '#fff') + R(13, 0, 4, 20, '#ff0000') + R(0, 8, 30, 4, '#ff0000');
  SVG.JP = R(0, 0, 30, 20, '#fff') + circ(15, 10, 5.4, '#bc002d');
  SVG.CN = R(0, 0, 30, 20, '#de2910') + star(6, 6, 3.2, -90, '#ffde00');
  SVG.IN = H(['#ff9933', '#ffffff', '#138808']) + '<circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" stroke-width=".8"/>';
  SVG.KZ = R(0, 0, 30, 20, '#00afca') + circ(15, 9, 3.4, '#fec50c');
  SVG.QA = R(0, 0, 30, 20, '#8a1538') + '<polygon points="0,0 10,0 7,1.82 10,3.64 7,5.45 10,7.27 7,9.09 10,10.9 7,12.7 10,14.5 7,16.4 10,18.2 7,20 0,20" fill="#fff"/>';
  SVG.SA = R(0, 0, 30, 20, '#006c35') + R(8, 12.2, 14, 1.4, '#fff') + R(10, 6.5, 10, 2.2, '#fff');
  SVG.SG = H(['#ef3340', '#ffffff']) + circ(6, 5, 3, '#fff') + circ(7.1, 5, 2.7, '#ef3340');
  SVG.CA = V(['#d52b1e', '#ffffff', '#d52b1e']) + '<polygon points="15,4 16.4,7.6 19.4,6.6 18.4,11.2 20,10.6 19.4,13 15.6,13 15.6,16.4 14.4,16.4 14.4,13 10.6,13 10,10.6 11.6,11.2 10.6,6.6 13.6,7.6" fill="#d52b1e"/>';
  SVG.GB = R(0, 0, 30, 20, '#012169') +
    '<path d="M0,0L30,20M30,0L0,20" stroke="#fff" stroke-width="3.6"/><path d="M0,0L30,20M30,0L0,20" stroke="#c8102e" stroke-width="1.5"/>' +
    R(12, 0, 6, 20, '#fff') + R(0, 7, 30, 6, '#fff') + R(13, 0, 4, 20, '#c8102e') + R(0, 8, 30, 4, '#c8102e');
  (function () {
    var s = R(0, 0, 30, 20, '#fff'), i;
    for (i = 0; i < 7; i++) s += R(0, +(i * 20 / 13 * 2).toFixed(3), 30, +(20 / 13).toFixed(3), '#b22234');
    SVG.US = s + R(0, 0, 13.5, 10.8, '#3c3b6e');
    for (i = 0; i < 12; i++) SVG.US += circ(1.8 + (i % 4) * 3.3 + (Math.floor(i / 4) % 2 ? 0 : 0), 1.9 + Math.floor(i / 4) * 3.1, .55, '#fff');
  })();
  var GLOBE = '<rect width="30" height="20" fill="#25346e"/><circle cx="15" cy="10" r="6.4" fill="none" stroke="#9fb3ff" stroke-width="1"/><ellipse cx="15" cy="10" rx="2.8" ry="6.4" fill="none" stroke="#9fb3ff" stroke-width=".9"/><path d="M8.7 10h12.6" stroke="#9fb3ff" stroke-width=".9"/>';

  /* names (persian + english + common city names) -> ISO code */
  var NAMES = {
    TR: ['ترکیه', 'ترکیه', 'استانبول', 'آنکارا', 'ازمیر', 'turkey', 'türkiye', 'turkiye', 'istanbul', 'ankara'],
    NL: ['هلند', 'آمستردام', 'نیدرلند', 'netherlands', 'holland', 'amsterdam', 'the netherlands'],
    DE: ['آلمان', 'المان', 'فرانکفورت', 'برلین', 'germany', 'frankfurt', 'berlin', 'deutschland'],
    FR: ['فرانسه', 'پاریس', 'france', 'paris'],
    GB: ['انگلیس', 'انگلستان', 'بریتانیا', 'لندن', 'united kingdom', 'england', 'britain', 'london', 'uk'],
    US: ['آمریکا', 'امریکا', 'ایالات متحده', 'یو اس', 'united states', 'usa', 'america'],
    AE: ['امارات', 'دبی', 'ابوظبی', 'uae', 'dubai', 'emirates', 'abu dhabi'],
    FI: ['فنلاند', 'هلسینکی', 'finland', 'helsinki'],
    SE: ['سوئد', 'سوید', 'استکهلم', 'sweden', 'stockholm'],
    NO: ['نروژ', 'اسلو', 'norway', 'oslo'],
    DK: ['دانمارک', 'کپنهاگ', 'denmark', 'copenhagen'],
    CH: ['سوئیس', 'سوییس', 'زوریخ', 'switzerland', 'zurich'],
    AT: ['اتریش', 'وین', 'austria', 'vienna'],
    BE: ['بلژیک', 'بروکسل', 'belgium', 'brussels'],
    IE: ['ایرلند', 'دوبلین', 'ireland', 'dublin'],
    IT: ['ایتالیا', 'میلان', 'رم', 'italy', 'milan', 'rome'],
    ES: ['اسپانیا', 'مادرید', 'spain', 'madrid'],
    RU: ['روسیه', 'مسکو', 'russia', 'moscow'],
    UA: ['اوکراین', 'کی‌یف', 'کیف', 'ukraine', 'kyiv', 'kiev'],
    PL: ['لهستان', 'ورشو', 'poland', 'warsaw'],
    RO: ['رومانی', 'بخارست', 'romania', 'bucharest'],
    BG: ['بلغارستان', 'صوفیه', 'bulgaria', 'sofia'],
    AM: ['ارمنستان', 'ایروان', 'armenia', 'yerevan'],
    AZ: ['آذربایجان', 'باکو', 'azerbaijan', 'baku'],
    GE: ['گرجستان', 'تفلیس', 'georgia', 'tbilisi'],
    KZ: ['قزاقستان', 'kazakhstan'],
    LT: ['لیتوانی', 'lithuania'],
    LV: ['لتونی', 'latvia'],
    EE: ['استونی', 'estonia'],
    CZ: ['چک', 'جمهوری چک', 'پراگ', 'czech', 'czechia', 'prague'],
    HU: ['مجارستان', 'بوداپست', 'hungary', 'budapest'],
    GR: ['یونان', 'آتن', 'greece', 'athens'],
    IR: ['ایران', 'تهران', 'iran', 'tehran'],
    IQ: ['عراق', 'بغداد', 'iraq', 'baghdad'],
    QA: ['قطر', 'دوحه', 'qatar', 'doha'],
    SA: ['عربستان', 'ریاض', 'saudi arabia', 'saudi', 'riyadh'],
    JP: ['ژاپن', 'توکیو', 'japan', 'tokyo'],
    CN: ['چین', 'china'],
    IN: ['هند', 'india', 'mumbai'],
    SG: ['سنگاپور', 'singapore'],
    CA: ['کانادا', 'تورنتو', 'canada', 'toronto']
  };
  var NAME2CC = {}, NAMELIST = [];
  (function () {
    for (var cc in NAMES) NAMES[cc].forEach(function (n) { n = flagNorm(n); if (!NAME2CC[n]) { NAME2CC[n] = cc; NAMELIST.push(n); } });
    NAMELIST.sort(function (a, b) { return b.length - a.length; });
  })();
  function flagNorm(s) {
    return String(s).replace(/[‌‍‎‏ ]/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function rx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var FLAG_RX = new RegExp('^(?:(?:ریجن|منطقه|لوکیشن|سرور|region|server|location)\\s*[:：\\-–—·]?\\s*)?(' + NAMELIST.map(rx).join('|') + ')(?![\\u0600-\\u06ffa-z0-9])', 'i');
  function flagSvg(cc) {
    return '<svg viewBox="0 0 30 20" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">' + (SVG[cc] || GLOBE) + '</svg>';
  }
  var flagCssDone = false;
  function ensureFlagCss() {
    if (flagCssDone || !document.head) return;
    flagCssDone = true;
    var s = document.createElement('style'); s.id = '__pj_flag_css';
    s.textContent = '.pj-flag{display:inline-block;flex:none;width:22px;height:15px;margin-inline-end:8px;vertical-align:-3px;border-radius:3px;overflow:hidden;' +
      'box-shadow:0 0 0 1px rgba(255,255,255,.22),0 2px 5px rgba(0,0,0,.45);line-height:0}.pj-flag svg{display:block;width:100%;height:100%}';
    document.head.appendChild(s);
  }
  var SKIPTAG = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, OPTION: 1, SELECT: 1, NOSCRIPT: 1, TITLE: 1 };
  var RI_RX = /[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g;
  function riCc(s) { return String.fromCharCode(s.charCodeAt(1) - 0xDDE6 + 65) + String.fromCharCode(s.charCodeAt(3) - 0xDDE6 + 65); }
  function mkFlag(cc, src) {
    var f = document.createElement('span');
    f.className = 'pj-flag'; f.setAttribute('data-cc', cc); f.setAttribute('data-src', src); f.setAttribute('aria-hidden', 'true'); f.innerHTML = flagSvg(cc);
    return f;
  }
  function textNodes() {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n, list = [];
    while ((n = w.nextNode())) { var p = n.parentNode; if (p && !SKIPTAG[p.nodeName] && !(host && host.contains(p))) list.push(n); }
    return list;
  }
  function hasFlagNear(p, src) {
    var q = p, i, list, k;
    for (i = 0; i < 3 && q && q !== document.body; i++, q = q.parentNode) {
      if (i && (q.textContent || '').length > 48) break;      /* only look inside a single small row */
      list = q.querySelectorAll('.pj-flag');
      for (k = 0; k < list.length; k++) if (!src || list[k].getAttribute('data-src') === src) return list[k];
    }
    return null;
  }
  function scanFlags() {
    if (!document.body) return;
    ensureFlagCss();
    /* pass 1: emoji flags (Windows shows them as plain letters like "TR") -> real flag images */
    textNodes().forEach(function (n) {
      var v = n.nodeValue;
      if (!v || v.indexOf('\uD83C') < 0) return;
      RI_RX.lastIndex = 0;
      if (!RI_RX.test(v)) return;
      RI_RX.lastIndex = 0;
      var frag = document.createDocumentFragment(), last = 0, m;
      while ((m = RI_RX.exec(v))) {
        if (m.index > last) frag.appendChild(document.createTextNode(v.slice(last, m.index)));
        frag.appendChild(mkFlag(riCc(m[0]), 'emoji'));
        last = m.index + m[0].length;
      }
      if (last < v.length) frag.appendChild(document.createTextNode(v.slice(last)));
      n.parentNode.replaceChild(frag, n);
    });
    /* pass 2: no flag in the panel for this label -> add one by country name */
    textNodes().forEach(function (n) {
      var p = n.parentNode, prev = n.previousSibling;
      var mine = prev && prev.nodeType === 1 && prev.className === 'pj-flag' && prev.getAttribute('data-src') === 'name' ? prev : null;
      if (hasFlagNear(p, 'emoji')) { if (mine) mine.parentNode.removeChild(mine); return; }
      var t = flagNorm(n.nodeValue), m = (t.length && t.length <= 32) ? FLAG_RX.exec(t) : null;
      if (!m) { if (mine) mine.parentNode.removeChild(mine); return; }
      var cc = NAME2CC[m[1]];
      if (!cc) return;
      if (mine) { if (mine.getAttribute('data-cc') !== cc) { mine.setAttribute('data-cc', cc); mine.innerHTML = flagSvg(cc); } return; }
      if (hasFlagNear(p, 'name')) return;
      p.insertBefore(mkFlag(cc, 'name'), n);
    });
  }
  var flagTm = null;
  function scheduleFlags() { clearTimeout(flagTm); flagTm = setTimeout(function () { try { scanFlags(); } catch (e) {} }, 120); }

  /* =====================================================================
     DNS CONTROL  (shadow DOM so the panel's CSS can't touch it)
     ===================================================================== */
  var ICON = '<svg viewBox="0 0 24 24"><path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/></svg>';
  var FONT = 'Vazirmatn,IRANSansX,IRANSans,Shabnam,"Segoe UI Variable Text","Segoe UI",Tahoma,sans-serif';

  var CHIP_CSS = '' +
    ':host{all:initial;display:inline-flex;flex:none;align-items:center;align-self:center;vertical-align:middle;position:relative;z-index:50;direction:rtl;font-family:' + FONT + ';font-size:14px;color:#eef2ff}' +
    ':host([data-mode=float]){position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483646}' +
    ':host([data-mode=dock]){display:block;position:relative;margin:12px 0 0;width:100%;max-width:100%;z-index:20}' +
    '*{box-sizing:border-box}' +
    '.chip{display:contents}' +
    ':host([data-mode=dock]) .chip{display:flex;flex-direction:column;gap:8px}' +
    '.rt{display:none;font-size:11px;color:#7d86a3;letter-spacing:.3px;padding:0 6px;margin-top:2px}:host([data-mode=dock]) .rt{display:block}' +
    /* the card (compact row in header / float; vertical card in the sidebar dock) */
    '.cd{display:flex;align-items:center;gap:10px;height:44px;padding:0 6px 0 14px;border-radius:15px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);transition:border-color .3s,background .3s,box-shadow .3s}' +
    '.cd.on{border-color:rgba(52,211,153,.4);background:rgba(16,185,129,.07)}' +
    ':host([data-mode=float]) .cd{background:rgba(10,16,40,.78);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);box-shadow:0 8px 24px -10px #000}' +
    ':host([data-mode=dock]) .cd{height:auto;flex-direction:column;justify-content:center;gap:3px;padding:8px 12px 7px;border-radius:20px;text-align:center;' +
    'background:radial-gradient(120% 90% at 50% 0%,rgba(61,107,255,.16),rgba(12,14,22,.96) 70%);border:1px solid rgba(150,176,255,.18);box-shadow:0 14px 34px -18px #000,inset 0 1px 0 rgba(255,255,255,.05)}' +
    ':host([data-mode=dock]) .cd.on{background:radial-gradient(120% 90% at 50% 0%,rgba(16,185,129,.2),rgba(10,16,18,.96) 70%);border-color:rgba(52,211,153,.38)}' +
    '.tx{all:unset;cursor:pointer;display:flex;flex-direction:column;justify-content:center;min-width:0;text-align:right;line-height:1.35;order:0}' +
    '.tx small{font-size:10.5px;color:#7d86a3;letter-spacing:.3px;white-space:nowrap}' +
    '.tx b{display:flex;align-items:center;gap:6px;font-size:13px;color:#c9d1ee;font-weight:800;white-space:nowrap}' +
    '.tx b::before{content:"";width:7px;height:7px;border-radius:50%;background:#4b5368;transition:all .3s}' +
    '.cd.on .tx b{color:#6ee7b7}.cd.on .tx b::before{background:#34d399;box-shadow:0 0 8px #34d399}' +
    ':host([data-mode=dock]) .tx{order:1;align-items:center;text-align:center}:host([data-mode=dock]) .tx b{font-size:14px;justify-content:center;max-width:100%;overflow:hidden;text-overflow:ellipsis}' +
    '.pw{all:unset;box-sizing:border-box;position:relative;cursor:pointer;flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:#8ea0d8;border:2px solid transparent;order:1;' +
    'background:linear-gradient(#10131c,#10131c) padding-box,conic-gradient(from 200deg,#3a4a8f,#6f8cff,#3a4a8f) border-box;transition:transform .2s,color .25s,box-shadow .25s}' +
    ':host([data-mode=dock]) .tx{display:none!important}:host([data-mode=dock]:not([data-size=s])) .cd{height:178px;min-height:0;box-sizing:border-box;overflow:hidden}:host([data-mode=dock]) .pw{order:0;width:84px;height:84px;border-width:3px;box-shadow:0 0 24px -8px rgba(111,140,255,.55)}' +
    ':host([data-mode=dock][data-size=s]) .pw{width:56px;height:56px;border-width:2px}:host([data-mode=dock][data-size=s]) .pw svg{width:26px;height:26px}:host([data-mode=dock][data-size=s]) .cd{padding:10px 10px 8px;gap:4px;border-radius:16px}:host([data-mode=dock][data-size=s]) .ips,:host([data-mode=dock][data-size=s]) .rt{display:none!important}' +
    '.pw:hover{transform:scale(1.07);color:#c5d2ff}.pw:active{transform:scale(.94)}.pw:focus-visible{outline:2px solid #7b9cff;outline-offset:3px}' +
    '.pw svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}' +
    ':host([data-mode=dock]) .pw svg{width:36px;height:36px;stroke-width:2.3}' +
    '.cd.on .pw{color:#6ee7b7;background:linear-gradient(#0c1a17,#0c1a17) padding-box,conic-gradient(from 200deg,#10b981,#a7f3d0,#10b981) border-box;box-shadow:0 0 22px -2px rgba(52,211,153,.6)}' +
    '.cd.on .pw::after{content:"";position:absolute;inset:-6px;border-radius:50%;border:1px solid rgba(52,211,153,.55);animation:rg 2.2s ease-out infinite}' +
    '.cd.busy .pw{pointer-events:none;color:#c5d2ff}.cd.busy .pw::before{content:"";position:absolute;inset:-7px;border-radius:50%;border:3px solid transparent;border-top-color:#7b9cff;border-right-color:rgba(123,156,255,.35);animation:sp .85s linear infinite;filter:drop-shadow(0 0 6px rgba(111,140,255,.8))}.cd.busy .pw svg{animation:pu 1.2s ease-in-out infinite}@keyframes pu{50%{opacity:.45}}' +
    '@keyframes rg{0%{transform:scale(.88);opacity:.9}100%{transform:scale(1.22);opacity:0}}@keyframes sp{to{transform:rotate(360deg)}}' +
    '.ips,.lk{display:none}:host([data-mode=dock]) .lk{display:none!important}' +
    ':host([data-mode=dock]) .ips{order:2;margin-top:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;height:46px;flex:none;overflow:hidden}.ips:empty{display:none!important}.ips .ph{font-size:11px;line-height:1.7;color:#7d86a3;text-align:center;padding:0 6px}' +
    '.ips code{direction:ltr;font:600 11px Consolas,monospace;color:#9aa6cf;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);padding:2px 7px;border-radius:99px;white-space:nowrap}' +
    ':host([data-mode=dock]) .lk{all:unset;box-sizing:border-box;order:3;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;font:600 11.5px/1.4 ' + FONT + ';color:#c3cdf2;padding:6px 12px;margin-top:0;padding:4px 12px;border-radius:10px;border:1px solid rgba(150,176,255,.3);background:rgba(255,255,255,.06);transition:background .2s,border-color .2s}:host([data-mode=dock]) .lk:hover{background:rgba(111,140,255,.2);border-color:rgba(150,176,255,.55);color:#fff}.lk svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
    '@media(max-width:760px){:host(:not([data-mode=dock])) .tx small{display:none}:host(:not([data-mode=dock])) .cd{height:42px;padding:0 4px 0 10px;gap:8px}}' +
    '@media(max-width:520px){:host(:not([data-mode=dock])) .tx{display:none}:host(:not([data-mode=dock])) .cd{padding:0 3px;border-radius:50%;height:42px;width:42px;justify-content:center}}';
  var OVL_CSS = '' +
    ':host{all:initial}*{box-sizing:border-box}' +
    /* every message (dialogs + toasts) is a compact card that drops in at the TOP of the page: no full-screen dim, panel stays usable */
    '.w{position:fixed;top:0;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 12px 0;pointer-events:none;z-index:2147483647;direction:rtl;font-family:' + FONT + ';font-size:14px;color:#eef2ff}' +
    '.ips{margin-top:2px}' +
    '.sc{display:none}' +
    '.sc.on{display:flex;position:fixed;inset:0;align-items:center;justify-content:center;padding:18px;pointer-events:auto;background:radial-gradient(120% 90% at 50% 40%,rgba(12,20,52,.5),rgba(3,5,14,.72));-webkit-backdrop-filter:blur(12px) saturate(1.15);backdrop-filter:blur(12px) saturate(1.15);animation:fd .22s ease both}' +
    '@keyframes fd{from{opacity:0}to{opacity:1}}@keyframes pp{from{opacity:0;transform:translateY(10px) scale(.95)}to{opacity:1;transform:none}}' +
    '.sc .card{animation:pp .28s cubic-bezier(.2,.8,.2,1) both;box-shadow:0 30px 80px -20px #000,0 0 0 1px rgba(150,176,255,.12)}' +
    '@keyframes dn{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}' +
    '.card{pointer-events:auto;width:min(460px,100%);padding:14px 16px;border-radius:18px;border:1px solid rgba(150,176,255,.3);background:linear-gradient(160deg,rgba(40,70,170,.7),rgba(12,18,46,.96) 66%);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);box-shadow:0 18px 44px -14px #000;animation:dn .25s ease both}' +
    'h3{margin:0 0 2px;font-size:15px;line-height:1.6}p{margin:0 0 8px;color:#aab6e6;font-size:12.5px;line-height:1.8}' +
    '.dr{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 12px;margin:6px 0;border-radius:12px;border:1px solid rgba(150,176,255,.2);background:rgba(255,255,255,.06)}' +
    '.dr b{direction:ltr;font-size:14px}.dr small{color:#9fb3ff;direction:ltr}.dr em{font-style:normal;color:#aab6e6;font-size:11.5px;display:block}' +
    '.row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}' +
    'button{font:inherit;border:0;border-radius:12px;padding:8px 14px;min-height:38px;cursor:pointer;color:#fff;font-weight:700;font-size:13px;flex:1;min-width:110px}' +
    '.pr{background:linear-gradient(135deg,#3d6bff,#7b9cff);box-shadow:0 14px 30px -12px rgba(61,107,255,.85)}' +
    '.gh{background:rgba(255,255,255,.08);border:1px solid rgba(150,176,255,.26)}.rd{background:rgba(255,93,108,.16);border:1px solid rgba(255,93,108,.4);color:#ffb3bb}' +
    'button:disabled{opacity:.55;cursor:default}' +
    '.toast{display:none;pointer-events:none;max-width:min(100%,460px);padding:9px 16px;border-radius:14px;background:rgba(14,22,54,.96);border:1px solid rgba(150,176,255,.3);box-shadow:0 14px 34px -14px #000;font-size:12.5px;line-height:1.8;text-align:center}.toast.on{display:flex;align-items:center;gap:9px;animation:dn .25s ease both}' +
    '.toast .ti{flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center}.toast .ti svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.toast .tt{font-weight:600}' +
    '.toast.ok{background:linear-gradient(135deg,rgba(7,46,34,.97),rgba(5,26,22,.97));border-color:rgba(52,211,153,.6);color:#b9f7de;box-shadow:0 14px 34px -14px #000,0 0 22px -6px rgba(16,185,129,.55)}.toast.ok .ti{background:rgba(16,185,129,.22);color:#34d399}' +
    '.toast.err{background:linear-gradient(135deg,rgba(62,12,20,.97),rgba(32,8,14,.97));border-color:rgba(248,113,113,.65);color:#ffd0d4;box-shadow:0 14px 34px -14px #000,0 0 22px -6px rgba(239,68,68,.55)}.toast.err .ti{background:rgba(239,68,68,.22);color:#f87171}' +
    '.toast.warn{background:linear-gradient(135deg,rgba(60,42,6,.97),rgba(32,22,5,.97));border-color:rgba(251,191,36,.6);color:#ffe9b0;box-shadow:0 14px 34px -14px #000,0 0 22px -6px rgba(245,158,11,.5)}.toast.warn .ti{background:rgba(245,158,11,.22);color:#fbbf24}' +
    '.note{margin-top:8px;font-size:11px;color:#8ea0d8;line-height:1.8}';

  function build() {
    /* overlay host: dialogs + toast */
    host = document.createElement('div');
    host.id = '__pj_app';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>' + OVL_CSS + '</style><div class=w><div class=sc id=layer></div><div class=toast id=toast></div></div>';
    document.documentElement.appendChild(host);
    layer = root.getElementById('layer');
    layer.addEventListener('click', function (e) { if (e.target === layer && !st.busy) hide(); });

    /* the power control + country selector */
    chipHost = document.createElement('div');
    chipHost.id = '__pj_chip';
    chipRoot = chipHost.attachShadow({ mode: 'open' });
    chipRoot.innerHTML = '<style>' + CHIP_CSS + '</style><div class=chip id=chip><div class=cd id=cd>' +
      '<button class=tx id=tx type=button><small>DNS سیستم</small><b id=dt>خاموش</b></button>' +
      '<button class=pw id=pw type=button title="DNS" aria-label="DNS">' + ICON + '</button>' +
      '<div class=ips id=ips></div><button class=lk id=lk type=button><svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>تغییر لینک پنل</button></div></div>';
    chipBtn = chipRoot.getElementById('pw'); chipTx = chipRoot.getElementById('tx');
    chipBtn.onclick = power;
    chipTx.onclick = showMenu;
    chipRoot.getElementById('lk').onclick = function () { send('change'); };
    document.documentElement.appendChild(chipHost);
    chipHost.setAttribute('data-mode', 'float');

    /* back button (= "change panel link"), sits right next to the panel's theme (light/dark) button */
    backHost = document.createElement('div');
    backHost.id = '__pj_back';
    var br = backHost.attachShadow({ mode: 'open' });
    br.innerHTML = '<style>' + BACK_CSS + '</style><button class=bk id=bk type=button title="برگشت (تغییر لینک پنل)" aria-label="برگشت"><svg viewBox="0 0 24 24"><path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/></svg></button>';
    br.getElementById('bk').onclick = function () { send('change'); };
    document.documentElement.appendChild(backHost); backLoop();

    scanFlags();
    place(); window.addEventListener('resize', place); setInterval(place, 1000);
    hideGoBtn(); render(); send('status');
    try { new MutationObserver(function () { scheduleFlags(); }).observe(document.documentElement, { childList: true, subtree: true, characterData: true }); } catch (e) {}
  }

  /* every link that leaves the panel (ads, Telegram...) opens in the system browser */
  document.addEventListener('click', function (e) {
    try {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || !/^https?:/i.test(a.href)) return;
      var u = new URL(a.href);
      if (u.origin === location.origin && a.target !== '_blank') return;
      if (u.origin === location.origin && /^\/u\//.test(u.pathname)) return;
      e.preventDefault(); e.stopPropagation();
      send('open', { u: a.href });
    } catch (x) {}
  }, true);
  function hideGoBtn() {
    if (document.getElementById('__pj_nogo') || !document.head) return;
    var x = document.createElement('style'); x.id = '__pj_nogo';
    x.textContent = '#gpGo{display:none!important}';
    document.head.appendChild(x);
  }
  setInterval(function () { try { hideGoBtn(); } catch (e) {} }, 2000);
  function power() {
    if (st.busy) return;
    if (st.dns.length) { setBusy('در حال حذف DNS...'); send('clear'); }
    else startTest();
  }
  function startTest() {
    var g = document.getElementById('gpGo');
    if (!g) { toast('صفحه‌ی پنل هنوز آماده نیست'); return; }
    if (g.disabled) return;
    lastTop = null; st.test = true; render();
    /* not registered yet? register this IP first (same as the panel's own auto-register), then run the test */
    try {
      if (window.OK && !window.REGD && typeof window.autoReg === 'function') {
        window.autoReg().then(function () { runGo(); }, function () { runGo(); });
        return;
      }
    } catch (e) {}
    runGo();
  }
  function runGo() {
    var g = document.getElementById('gpGo');
    if (!g) { st.test = false; render(); return; }
    if (g.disabled) { st.test = false; render(); return; }
    g.click();
    clearInterval(startTest.t);
    var n = 0;
    startTest.t = setInterval(function () {
      n++;
      var b = document.getElementById('gpGo');
      if ((n > 4 && (!b || !b.disabled)) || n > 240) { clearInterval(startTest.t); st.test = false; render(); }
    }, 500);
  }
  window.__pjPower = power;

  function ours(e) { return e === host || e === chipHost || e === backHost || (host && host.contains(e)) || (chipHost && chipHost.contains(e) && e.getAttribute && e.getAttribute('slot') !== 'region' && !(e.closest && e.closest('[slot=region]'))); }
  function rectOf(e) { return e.getBoundingClientRect(); }
  function hasAction(e) { return !!e.querySelector('button,a,[role=button],svg'); }

  /* ---------- sidebar: the big empty area under the menu ---------- */
  function navRow(label) {
    var w = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) {
      if (n.nodeValue.trim() === label && n.parentNode && !(host && host.contains(n.parentNode)) && !(chipHost && chipHost.contains(n.parentNode))) {
        var e = n.parentNode;
        for (var i = 0; i < 5 && e.parentNode; i++) {
          var r = rectOf(e);
          if (r.width >= 120 && r.height >= 28) return e;
          e = e.parentNode;
        }
      }
    }
    return null;
  }
  function findSidebar() {
    var a = navRow('خانه'), b = navRow('راهنما'), vw = window.innerWidth, vh = window.innerHeight;
    if (!a || !b) return null;
    var nb = rectOf(b), e = b, r;
    while (e.parentElement && e.parentElement !== document.body) {
      e = e.parentElement; r = rectOf(e);
      if (r.width > vw * 0.5) return null;
      if (e.contains(a) && r.height >= vh * 0.5 && r.width >= 150) {
        var rbx = e.querySelector('.pj-flag'), hold = b, rr = rbx ? rbx.parentNode : null;
        while (hold.parentNode && hold.parentNode !== e && !(rr && hold.parentNode.contains(rr))) hold = hold.parentNode;
        return { el: e, navBottom: nb.bottom, rect: r, holder: hold };
      }
    }
    return null;
  }
  /* the panel's own country/region box = common ancestor of the flags that sit inside the sidebar */
  var regionHome = null;
  function findRegionBox(sb) {
    var flags = sb.el.querySelectorAll('.pj-flag'), i, anc = null, p;
    if (!flags.length) return null;
    function chain(x) { var c = []; while (x && x !== sb.el) { c.push(x); x = x.parentNode; } return c; }
    for (i = 0; i < flags.length; i++) {
      p = flags[i].parentNode;
      if (!anc) { anc = chain(p); continue; }
      var cc = chain(p); anc = anc.filter(function (x) { return cc.indexOf(x) >= 0; });
    }
    if (!anc || !anc.length) return null;
    var box = anc[0];
    if (flags.length === 1) box = box.parentNode && box.parentNode !== sb.el && box.parentNode.children.length === 1 ? box.parentNode : box;
    var t = box.textContent || '';
    if (/خانه|راهنما|تست پینگ/.test(t) || box === sb.el) return null;
    return box;
  }
  function returnRegion() {
    var b = chipHost.querySelector('[slot=region]');
    if (!b) return;
    b.removeAttribute('slot');
    if (regionHome && regionHome.parent && regionHome.parent.isConnected) regionHome.parent.insertBefore(b, regionHome.next && regionHome.next.parentNode === regionHome.parent ? regionHome.next : null);
    else document.body.appendChild(b);
    regionHome = null;
  }

  /* ---------- header (compact fallback when the sidebar is hidden / too short) ---------- */
  function findHeader() {
    var vw = window.innerWidth, i, e, r, c, best = null, bestScore = 1e9;
    var cands = document.querySelectorAll('header,[role=banner],[class*=topbar i],[class*=top-bar i],[class*=header i],[class*=appbar i],[class*=navbar i],[class*=toolbar i],[class*=topnav i]');
    for (i = 0; i < cands.length; i++) {
      e = cands[i]; if (ours(e)) continue;
      r = rectOf(e);
      if (r.width < vw * 0.36 || r.height < 34 || r.height > 130 || r.top < -2 || r.top > 160) continue;
      if (!hasAction(e)) continue;
      c = r.top + (e.tagName === 'HEADER' ? -50 : 0) + (130 - r.height) * 0.01;
      if (c < bestScore) { bestScore = c; best = e; }
    }
    if (best) return { box: best, anchor: themeAnchor(best) };
    var btns = document.querySelectorAll('button,[role=button],a'), tb = null, tt = 1e9;
    for (i = 0; i < btns.length; i++) {
      e = btns[i]; if (ours(e)) continue;
      r = rectOf(e);
      if (r.top < 0 || r.top > 150 || r.width < 28 || r.width > 80 || r.height < 28 || r.height > 80) continue;
      if (e.textContent.trim() !== '' || !e.querySelector('svg,img')) continue;
      if (r.top < tt) { tt = r.top; tb = e; }
    }
    if (!tb) return null;
    c = tb;
    while (c.parentElement && c.parentElement !== document.body && c.parentElement !== document.documentElement) {
      var p = c.parentElement, pr = rectOf(p);
      if (pr.height > 130) break;
      c = p;
      if (pr.width >= vw * 0.36) break;
    }
    if (c === tb) c = tb.parentElement;
    if (!c || c === document.body || rectOf(c).height > 130) return null;
    return { box: c, anchor: themeAnchor(c, tb) };
  }
  function themeAnchor(box, btn) {
    var kids = box.children, i, k, r;
    if (btn) { var x = btn; while (x && x.parentNode !== box) x = x.parentNode; if (x && x.parentNode === box) return x; }
    for (i = 0; i < kids.length; i++) {
      k = kids[i]; if (ours(k)) continue;
      r = rectOf(k);
      if (r.width >= 28 && r.width <= 80 && r.height >= 28 && r.height <= 80 && k.textContent.trim() === '' && k.querySelector('svg,img')) return k;
    }
    return null;
  }
  var BACK_CSS = ':host{all:initial;position:fixed;top:12px;left:12px;z-index:40;display:block;--s:36px}' +
    '.bk{all:unset;box-sizing:border-box;cursor:pointer;width:var(--s);height:var(--s);border-radius:50%;display:grid;place-items:center;color:#c5d2ff;border:2px solid transparent;' +
    'background:linear-gradient(#10131c,#10131c) padding-box,conic-gradient(from 200deg,#3a4a8f,#6f8cff,#3a4a8f) border-box;box-shadow:0 6px 18px -8px rgba(111,140,255,.6);transition:transform .2s,color .2s,box-shadow .2s}' +
    '.bk:hover{transform:scale(1.08);color:#fff;box-shadow:0 8px 22px -6px rgba(111,140,255,.85)}.bk:active{transform:scale(.94)}.bk:focus-visible{outline:2px solid #7b9cff;outline-offset:3px}' +
    '.bk svg{width:52%;height:52%;stroke:currentColor;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}';
  /* floats (position:fixed) right next to the panel's theme button, so the panel's own header layout is never touched */
  var lastBack = '', themeEl = null, themeShift = 0, lastBaseL = 0;
  function unshiftTheme() { if (themeEl) { try { themeEl.style.translate = ''; } catch (e) {} } themeEl = null; themeShift = 0; }
  /* back button takes the place of the panel's theme button, the theme button moves one slot to the right (translate only: panel layout untouched) */
  function placeBack() {
    if (!backHost) return;
    var h = null, r = null, t, l, s, key, want = 0;
    try { h = findHeader(); } catch (e) { h = null; }
    var an = h && h.anchor ? h.anchor : null;
    if (themeEl && themeEl !== an) unshiftTheme();
    if (an) { r = rectOf(an); if (r.width < 20 || r.height < 20) r = null; }
    if (r) {
      if (backHost.style.display === 'none') backHost.style.display = '';
      s = Math.max(32, Math.min(44, Math.round(Math.min(r.width, r.height))));
      var baseL = r.left - themeShift; lastBaseL = baseL;
      want = s + 10;
      if (baseL + want + r.width > window.innerWidth - 6) { want = 0; l = Math.round(r.right + 10); }
      else l = Math.round(baseL);
      t = Math.round(r.top + (r.height - s) / 2);
      if (want !== themeShift) { try { an.style.translate = want ? want + 'px 0' : ''; themeEl = an; themeShift = want; } catch (e) {} }
    } else {
      /* v26: header scrolled out of view -> the back button is simply not shown (it stays up with the header) */
      unshiftTheme();
      if (backHost.style.display !== 'none') backHost.style.display = 'none';
      return;
      s = 36; t = 16;
      var sbEl = document.querySelector('.sb'), sbR = null, wide = window.matchMedia && window.matchMedia('(min-width:861px)').matches;
      try { sbR = sbEl && wide ? rectOf(sbEl) : null; } catch (e) { sbR = null; }
      l = Math.max(Math.round(lastBaseL || 0), sbR && sbR.width > 0 ? Math.round(sbR.right + 16) : 12);
    }
    if (l + s > window.innerWidth - 6) l = Math.max(6, Math.round(r ? r.left - 10 - s : 12));
    key = s + ',' + t + ',' + l;
    if (key === lastBack) return;
    lastBack = key;
    backHost.style.setProperty('--s', s + 'px'); backHost.style.top = t + 'px'; backHost.style.left = l + 'px';
  }
  function setMode(m) { if (chipHost.getAttribute('data-mode') !== m) chipHost.setAttribute('data-mode', m); }

  /* panel v14.177+: the sidebar is [banner] -> <div id=pjdock> -> [region]. The power card simply lives in #pjdock
     (no guessing of the sidebar from menu texts), and the card shrinks on short windows. Narrow window = panel hides the sidebar -> header mode. */
  function placeDock() {
    var dk = document.getElementById('pjdock');
    if (!dk || !window.matchMedia || !window.matchMedia('(min-width:861px)').matches) return false;
    var cs = window.getComputedStyle(dk.parentNode);
    if (cs && cs.display === 'none') return false;
    if (chipHost.parentNode !== dk) { returnRegion(); dk.appendChild(chipHost); }
    setMode('dock');
    if (chipHost.style.margin !== '0px') chipHost.style.margin = '0';
    var sz = window.innerHeight < 640 ? 's' : 'm';
    if (chipHost.getAttribute('data-size') !== sz) chipHost.setAttribute('data-size', sz);
    hideOwnStatus();
    return true;
  }

  function markRows(box) {
    var cur = box, i, flags, kids, k, f, x, seen;
    for (i = 0; i < 4; i++) {
      flags = cur.querySelectorAll('.pj-flag'); if (!flags.length) return;
      seen = [];
      for (k = 0; k < flags.length; k++) { x = flags[k]; while (x.parentNode && x.parentNode !== cur) x = x.parentNode; if (x.parentNode === cur && seen.indexOf(x) < 0) seen.push(x); }
      if (seen.length >= 2 || flags.length === 1) break;
      if (seen[0] && seen[0] !== flags[0] && seen[0].nodeType === 1) cur = seen[0]; else break;
    }
    cur.classList.add('pj-rbox');
    flags = cur.querySelectorAll('.pj-flag');
    for (k = 0; k < flags.length; k++) { x = flags[k]; while (x.parentNode && x.parentNode !== cur) x = x.parentNode; if (x.parentNode === cur) x.classList.add('pj-row'); }
  }

  /* v27: swap the two top cards of the panel: game card (image + name + ping) to the right, "connection is ready" to the left */
  function textEl(rxp) {
    var w = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) {
      var p = n.parentNode;
      if (!p || SKIPTAG[p.nodeName] || (host && host.contains(p)) || (chipHost && chipHost.contains(p))) continue;
      if (rxp.test(n.nodeValue)) return p;
    }
    return null;
  }
  function swapCards() {
    var a = textEl(/اتصال شما آماده/), b = textEl(/بازی انتخاب/);
    if (!a || !b) return 0;
    var P = a.parentElement, ca = a, cb = b, i, k, ra, rb, ord;
    while (P && !P.contains(b)) P = P.parentElement;
    if (!P || P === document.body || P === document.documentElement) return 0;
    while (ca.parentElement !== P) ca = ca.parentElement;
    while (cb.parentElement !== P) cb = cb.parentElement;
    if (ca === cb) return 0;
    ra = ca.getBoundingClientRect(); rb = cb.getBoundingClientRect();
    if (ra.width < 40 || rb.width < 40) return 1;
    var sameRow = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) > 20;
    if (sameRow && ra.left > rb.left) {          /* "connection ready" is on the right now -> swap */
      var kids = P.children, oa, ob;
      for (i = 0; i < kids.length; i++) if (!kids[i].style.order) kids[i].style.order = String(i);
      oa = ca.style.order; ob = cb.style.order; ca.style.order = ob; cb.style.order = oa;
      try {
        var sa = getComputedStyle(ca), sb = getComputedStyle(cb);
        var ga = [sa.gridColumnStart, sa.gridColumnEnd], gb = [sb.gridColumnStart, sb.gridColumnEnd];
        if (ga[0] !== 'auto' || gb[0] !== 'auto') {
          ca.style.gridColumnStart = gb[0]; ca.style.gridColumnEnd = gb[1];
          cb.style.gridColumnStart = ga[0]; cb.style.gridColumnEnd = ga[1];
        }
      } catch (e) {}
    }
    return 1;
  }
  function place() { placeMain(); try { placeBack(); } catch (e) {} try { swapCards(); } catch (e) {} }
  function backLoop() { try { placeBack(); } catch (e) {} requestAnimationFrame(backLoop); }
  function placeMain() {
    if (!chipHost) return;
    var sb = null, h = null;
    try { if (placeDock()) return; } catch (e) {}
    try { var d0 = document.getElementById('pjdock'); if (d0 && d0.style.marginTop) d0.style.marginTop = ''; } catch (e) {}
    if (chipHost.style.margin) chipHost.style.margin = '';
    try { sb = findSidebar(); } catch (e) { sb = null; }
    if (sb) {
      var box = null; try { box = findRegionBox(sb); } catch (e) { box = null; }
      var rh = box ? Math.min(rectOf(box).height + 16, 160) : 0;
      var room = sb.rect.bottom - sb.navBottom - 16 - rh;
      var big = room >= 215, small = room >= 130;
      if (big || small) {
        if (chipHost.parentNode !== sb.holder.parentNode || chipHost.previousSibling !== sb.holder) sb.holder.parentNode.insertBefore(chipHost, sb.holder.nextSibling);
        setMode('dock');
        if (chipHost.getAttribute('data-size') !== (big ? 'm' : 's')) chipHost.setAttribute('data-size', big ? 'm' : 's');
        /* pin power card (+ the panel's own region box that follows it) to the bottom of the sidebar */
        try {
          var cont = chipHost.parentNode, mb = 0, ci, cr;
          for (ci = 0; ci < cont.children.length; ci++) { cr = rectOf(cont.children[ci]); if (cr.height > 0 && cr.bottom > mb) mb = cr.bottom; }
          var gp = Math.round(sb.rect.bottom - 14 - mb), cm = parseFloat(chipHost.style.marginTop) || 12, nm = Math.max(12, cm + gp);
          if (Math.abs(nm - cm) > 2) chipHost.style.marginTop = nm + 'px';
        } catch (e) {}
        hideOwnStatus(); return;
      }
    }
    returnRegion(); chipHost.style.marginTop = '';
    try { h = findHeader(); } catch (e) { h = null; }
    if (h) {
      if (chipHost.parentNode !== h.box || (h.anchor && chipHost.nextSibling !== h.anchor)) {
        if (h.anchor && h.anchor.parentNode === h.box) h.box.insertBefore(chipHost, h.anchor); else h.box.appendChild(chipHost);
      }
      setMode('header');
    } else {
      if (chipHost.parentNode !== document.documentElement) document.documentElement.appendChild(chipHost);
      setMode('float');
    }
    hideOwnStatus();
  }

  /* hide the panel's own bottom "connection active" status box (cosmetic, client side only) */
  function hideOwnStatus() {
    var w = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, null), n, hit = null, i;
    while ((n = w.nextNode())) { if (/DNS\s*شخصی\s*شما/.test(n.nodeValue) && !(host && host.contains(n.parentNode)) && !(chipHost && chipHost.contains(n.parentNode))) { hit = n.parentNode; break; } }
    if (!hit) return;
    for (i = 0; i < 4 && hit.parentNode; i++) {
      var t = hit.parentNode.textContent || '';
      if (/ترکیه|هلند|خانه|راهنما/.test(t) || t.length > 90) break;
      hit = hit.parentNode;
    }
    if (hit.style && hit.style.display !== 'none') hit.style.display = 'none';
  }

  function render() {
    var on = st.dns.length > 0, c = chipRoot.getElementById('cd');
    c.className = 'cd' + (on ? ' on' : '') + ((st.busy || st.test) ? ' busy' : '');
    chipRoot.getElementById('dt').textContent = (st.busy || st.test) ? (st.test ? 'در حال اتصال...' : (st.op === 'off' ? 'در حال قطع...' : 'در حال اتصال...')) : (on ? 'روشن' : 'خاموش');
    chipRoot.getElementById('ips').innerHTML = on ? st.dns.slice(0, 2).map(function (ip) { return '<code>' + esc(ip) + '</code>'; }).join('') : '';
    var tip = on ? 'DNS روشن: ' + st.dns.join(' , ') + ' (کلیک = خاموش کردن)' : 'DNS خاموش (کلیک = روشن کردن)';
    chipBtn.title = tip; chipBtn.setAttribute('aria-label', tip);
  }
  function hide() { layer.className = 'sc'; layer.innerHTML = ''; }
  function toast(t, kind) {
    var e = root.getElementById('toast');
    t = String(t).replace(/\s*✓\s*$/, '');
    if (!kind) kind = /انجام نشد|خطا|ناموفق|ناموفق/.test(t) ? 'err' : (/هنوز آماده|دریافت نشد/.test(t) ? 'warn' : (/موفق|حذف شد|برگشت|ثبت شد/.test(t) ? 'ok' : ''));
    var ic = kind === 'ok' ? '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
      : kind === 'err' ? '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'
      : kind === 'warn' ? '<svg viewBox="0 0 24 24"><path d="M12 6v7M12 17.5v.5"/></svg>' : '';
    e.innerHTML = (ic ? '<span class=ti>' + ic + '</span>' : '') + '<span class=tt>' + esc(t) + '</span>';
    e.className = 'toast on ' + kind;
    clearTimeout(toast.t); toast.t = setTimeout(function () { e.className = 'toast'; }, kind === 'err' ? 5600 : 4200);
  }

  function listHtml(arr) {
    return arr.map(function (x, i) {
      var ms = (typeof x.t === 'number') ? '<small>' + Math.round(x.t) + ' ms</small>' : '';
      return '<div class=dr><div><em>' + (i ? 'Secondary' : 'Primary') + (x.name ? ' · ' + esc(x.name) : '') + '</em><b>' + esc(x.ip) + '</b></div>' + ms + '</div>';
    }).join('');
  }

  function showAsk(top, key) {
    if (st.busy) return;
    var repl = st.dns.length > 0;
    layer.innerHTML = '<div class=card><h3>' + (repl ? 'DNS بهتری پیدا شد' : 'DNS بهینه پیدا شد') + '</h3>' +
      '<p>' + (repl ? 'DNS فعلی با DNS جدید جایگزین شود؟' : 'می‌خواهید DNSها خودکار روی این سیستم تنظیم شوند؟') + '</p>' +
      listHtml(top) +
      '<div class=row><button class="pr" id=yes>' + (repl ? 'جایگزین کن' : 'فعال کن') + '</button><button class="gh" id=no>الان نه</button></div>' +
      '<div class=note>ویندوز یک‌بار تایید دسترسی ادمین می‌خواهد. هر وقت خواستید با دکمه‌ی پاور می‌توانید DNS را غیرفعال و حذف کنید.</div></div>';
    layer.className = 'sc on';
    root.getElementById('no').onclick = function () { dismissed = key; hide(); };
    root.getElementById('yes').onclick = function () {
      setBusy('در حال تنظیم DNS...');
      send('set', { d: top.map(function (x) { return x.ip; }).join(',') });
    };
  }
  function showMenu() {
    var on = st.dns.length > 0;
    layer.innerHTML = '<div class=card><h3>PINGJOOR</h3>' +
      '<p>' + (on ? 'DNS زیر روی سیستم شما تنظیم شده است.' : 'DNS خودکار فعال نیست. با دکمه‌ی پاور تست انجام می‌شود و DNS بهینه خودکار تنظیم می‌شود.') + '</p>' +
      (on ? listHtml(st.dns.map(function (ip) { return { ip: ip }; })) : '') +
      '<div class=row>' + (on ? '<button class="rd" id=off>غیرفعال‌سازی و حذف DNS</button>' : '') +
      '<button class="gh" id=chg>تغییر لینک پنل</button><button class="gh" id=cls>بستن</button></div></div>';
    layer.className = 'sc on';
    root.getElementById('cls').onclick = hide;
    root.getElementById('chg').onclick = function () { send('change'); };
    var off = root.getElementById('off');
    if (off) off.onclick = function () { setBusy('در حال حذف DNS...'); send('clear'); };
  }
  function setBusy(t) {
    st.busy = true; render();
    st.op = /حذف/.test(t) ? 'off' : 'on';   /* v27: no dialog - the power button itself spins while Windows applies the change */
    render();
    clearTimeout(setBusy.t);
    setBusy.t = setTimeout(function () { if (st.busy) { st.busy = false; render(); hide(); toast('پاسخی از ویندوز دریافت نشد'); } }, 90000);
  }

  window.__pjStatus = function (s) {
    st.dns = (s && s.dns) || []; render();
  };
  window.__pjResult = function (r) {
    clearTimeout(setBusy.t); st.busy = false; hide();
    if (r && r.ok) {
      st.dns = r.dns || []; render();
      toast(r.op === 'set' ? 'DNS با موفقیت روی سیستم تنظیم شد ✓' : 'DNS حذف شد و تنظیمات شبکه به حالت خودکار برگشت ✓');
    } else {
      render();
      toast('انجام نشد: ' + ((r && r.msg) || 'خطای نامشخص'));
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();

/* v22+: pro scrollbar - black track, blue thumb (WebView2 = Chromium) */
(function () {
  function add() {
    if (document.getElementById('__pj_sb') || !document.head) return;
    var st = document.createElement('style'); st.id = '__pj_sb';
    st.textContent = 'html::-webkit-scrollbar,body::-webkit-scrollbar,*::-webkit-scrollbar{width:10px;height:10px;background:#05070d}' +
      '*::-webkit-scrollbar-track{background:#05070d;border-radius:10px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}' +
      '*::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#5c9cff,#2c64f5);border-radius:10px;border:2px solid #05070d;min-height:42px}' +
      '*::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,#8fc3ff,#3d7bff)}' +
      '*::-webkit-scrollbar-thumb:active{background:#2c64f5}' +
      '*::-webkit-scrollbar-button{display:none;width:0;height:0}*::-webkit-scrollbar-corner{background:#05070d}';
    document.head.appendChild(st);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
  setInterval(add, 2000);
})();
