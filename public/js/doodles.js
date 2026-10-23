// Crayon doodle creatures. Each page section gets a small resident that turns
// up when the section scrolls into view (a crab, a film-slate snail, a gull, a
// bouncy ball, a rubber duck and a mole in sunglasses), headings get a squiggle
// that draws in, and once the visitor is past the hero, Sandy the sand critter
// now and then peeks in from an edge of the screen.
//
// Everything is decoration: aria-hidden, pointer-events: none, and idle loops
// only run while their section is on screen. IntersectionObserver drives it
// all (no scroll handlers). Under prefers-reduced-motion the creatures are drawn
// still and Sandy stays home.
(function () {
  var sections = document.querySelectorAll('.sv[data-k]');
  if (!sections.length || document.querySelector('.doodle')) return;
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;

  var INK = 'stroke="var(--ink)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
  /** @param {number} cx @param {number} cy @param {number} r */
  function eye(cx, cy, r) {
    return '<g class="dd-eye"><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="var(--card)" ' + INK + '/>' +
      '<circle cx="' + (cx + r * 0.2) + '" cy="' + (cy + r * 0.1) + '" r="' + (r * 0.45) + '" fill="var(--ink)"/></g>';
  }
  /** @param {number} cx @param {number} cy */
  function cheek(cx, cy) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="5" ry="3" fill="var(--rose-deep)" opacity=".7"/>';
  }

  // name: [section key, where it sits, svg body]
  /** @type {Record<string, [string, string, string]>} */
  var CREATURES = {
    crab: ['roll', 'tl',
      '<path d="M30 66 l-12 9 M28 59 l-15 3 M70 66 l12 9 M72 59 l15 3 M42 47 l-2 -11 M58 47 l2 -11" fill="none" ' + INK + '/>' +
      '<path d="M28 55 Q18 48 18 38" fill="none" ' + INK + '/>' +
      '<path d="M18 38 c-8 -2 -10 -13 -3 -17 l4 7 l4 -6 c6 4 4 14 -5 16 z" fill="var(--rose)" ' + INK + '/>' +
      '<g class="dd-claw"><path d="M72 55 Q82 48 82 38" fill="none" ' + INK + '/>' +
      '<path d="M82 38 c8 -2 10 -13 3 -17 l-4 7 l-4 -6 c-6 4 -4 14 5 16 z" fill="var(--rose)" ' + INK + '/></g>' +
      '<ellipse cx="50" cy="61" rx="25" ry="16" fill="var(--rose)" ' + INK + '/>' +
      eye(40, 32, 5.5) + eye(60, 32, 5.5) + cheek(37, 64) + cheek(63, 64) +
      '<path d="M45 64 q5 4 10 0" fill="none" ' + INK + '/>'],
    snail: ['how', 'tr',
      '<path d="M8 86 Q6 72 20 70 L80 73 Q92 75 92 86 Z" fill="var(--peach)" ' + INK + '/>' +
      '<path d="M18 46 l-5 -14 M26 46 l4 -14" fill="none" ' + INK + '/>' +
      '<circle cx="22" cy="57" r="13" fill="var(--peach)" ' + INK + '/>' +
      eye(13, 30, 4.5) + eye(30, 30, 4.5) + cheek(17, 62) +
      '<path d="M20 62 q4 3 8 0" fill="none" ' + INK + '/>' +
      '<rect x="42" y="42" width="42" height="30" rx="3" fill="var(--lilac)" ' + INK + '/>' +
      '<path d="M48 54 h26 M48 62 h18" fill="none" stroke="var(--card)" stroke-width="3" stroke-linecap="round"/>' +
      '<g class="dd-clap"><rect x="42" y="31" width="42" height="10" rx="2" fill="var(--card)" ' + INK + '/>' +
      '<path d="M50 31 l-5 10 M60 31 l-5 10 M70 31 l-5 10 M80 31 l-5 10" fill="none" ' + INK + '/></g>'],
    gull: ['map', 'tl',
      '<path d="M30 58 l-14 -6 l4 12 z" fill="var(--card)" ' + INK + '/>' +
      '<g class="dd-wing dd-wing-b"><path d="M50 54 Q52 30 70 22 Q64 40 60 56" fill="var(--sky-wash)" ' + INK + '/></g>' +
      '<path d="M28 58 Q48 44 74 52 Q68 68 46 68 Q32 66 28 58 Z" fill="var(--card)" ' + INK + '/>' +
      '<circle cx="74" cy="46" r="11" fill="var(--card)" ' + INK + '/>' +
      '<path d="M84 44 l11 3 l-11 4 z" fill="var(--butter)" ' + INK + '/>' +
      '<circle cx="77" cy="43" r="2.4" fill="var(--ink)"/>' + cheek(73, 51) +
      '<g class="dd-wing"><path d="M46 56 Q38 32 18 28 Q32 44 38 60" fill="var(--card)" ' + INK + '/></g>'],
    ball: ['toys', 'tr',
      '<g class="dd-hop"><ellipse cx="40" cy="88" rx="7" ry="4" fill="var(--rose)" ' + INK + '/><ellipse cx="60" cy="88" rx="7" ry="4" fill="var(--rose)" ' + INK + '/>' +
      '<circle cx="50" cy="58" r="27" fill="var(--butter)" ' + INK + '/>' +
      '<path d="M24 62 Q50 72 76 62 L75 70 Q50 80 25 70 Z" fill="var(--sky)" ' + INK + '/>' +
      eye(41, 49, 5.5) + eye(59, 49, 5.5) + cheek(35, 58) + cheek(65, 58) +
      '<path d="M45 57 q5 5 10 0" fill="none" ' + INK + '/></g>'],
    duck: ['wish', 'br',
      '<g class="dd-bob"><path d="M24 64 l-12 -12 l18 4 z" fill="var(--butter)" ' + INK + '/>' +
      '<ellipse cx="50" cy="70" rx="28" ry="15" fill="var(--butter)" ' + INK + '/>' +
      '<circle cx="66" cy="46" r="13" fill="var(--butter)" ' + INK + '/>' +
      '<path d="M78 45 q11 -2 13 4 q-6 6 -13 2 z" fill="var(--peach)" ' + INK + '/>' +
      '<circle cx="69" cy="42" r="2.4" fill="var(--ink)"/>' + cheek(64, 51) +
      '<path d="M38 66 q10 10 22 0" fill="none" ' + INK + '/></g>' +
      '<path d="M2 88 q8 -5 16 0 t16 0 t16 0 t16 0 t16 0 t16 0" fill="none" stroke="var(--sky-ink)" stroke-width="3" stroke-linecap="round"/>'],
    mole: ['end', 'bl',
      '<g class="dd-up"><path d="M30 96 L30 58 Q30 34 50 34 Q70 34 70 58 L70 96 Z" fill="var(--lilac)" ' + INK + '/>' +
      '<path d="M35 53 h30" fill="none" ' + INK + '/>' +
      '<circle cx="42" cy="53" r="6.5" fill="var(--ink)"/><circle cx="58" cy="53" r="6.5" fill="var(--ink)"/>' +
      '<path d="M39 50 l3 -2" fill="none" stroke="var(--card)" stroke-width="2" stroke-linecap="round"/>' +
      '<ellipse cx="50" cy="64" rx="6" ry="4.5" fill="var(--rose)" ' + INK + '/>' +
      '<path d="M40 66 l-10 -1 M40 69 l-9 3 M60 66 l10 -1 M60 69 l9 3 M45 73 q5 3 10 0" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/>' +
      '<ellipse cx="35" cy="82" rx="8" ry="6" fill="var(--lilac)" ' + INK + '/><ellipse cx="65" cy="82" rx="8" ry="6" fill="var(--lilac)" ' + INK + '/></g>' +
      '<path d="M4 98 Q12 84 30 86 Q50 80 70 86 Q88 84 96 98 Z" fill="var(--sand)" ' + INK + '/>' +
      '<path d="M22 92 l2 -2 M48 90 l2 -2 M76 92 l2 -2" fill="none" stroke="var(--cocoa)" stroke-width="2.5" stroke-linecap="round"/>'],
  };

  var SANDY = '<svg viewBox="0 0 100 100" focusable="false"><g class="crayon">' +
    '<circle cx="31" cy="24" r="10" fill="var(--sand)" ' + INK + '/><circle cx="69" cy="24" r="10" fill="var(--sand)" ' + INK + '/>' +
    '<circle cx="31" cy="24" r="4.5" fill="var(--rose)"/><circle cx="69" cy="24" r="4.5" fill="var(--rose)"/>' +
    '<path d="M12 104 C 8 50, 26 20, 50 20 C 74 20, 92 50, 88 104 Z" fill="var(--sand)" ' + INK + '/>' +
    '<g class="dd-look">' + eye(40, 42, 8) + eye(60, 42, 8) + '</g>' + cheek(31, 54) + cheek(69, 54) +
    '<path d="M45 53 q5 5 10 0" fill="none" ' + INK + '/>' +
    '<ellipse cx="26" cy="64" rx="10" ry="7" fill="var(--sand)" ' + INK + '/>' +
    '<g class="dd-wave"><ellipse cx="74" cy="64" rx="10" ry="7" fill="var(--sand)" ' + INK + '/></g>' +
    '<path d="M22 63 l0 4 M27 62 l0 4 M70 63 l0 4 M75 62 l0 4" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/>' +
    '</g></svg>';

  var css = '.doodle{position:absolute;z-index:1;width:104px;height:104px;pointer-events:none}' +
    '.doodle svg{display:block;width:100%;height:100%;overflow:visible}' +
    '.doodle.tl{left:clamp(4px,3vw,40px);top:14px}.doodle.tr{right:clamp(4px,3vw,40px);top:14px}' +
    '.doodle.br{right:clamp(8px,6vw,80px);bottom:18px}.doodle.bl{left:clamp(8px,10vw,160px);bottom:44px;overflow:hidden}' +
    '.doodle .dd-claw,.doodle .dd-clap,.doodle .dd-wing,.doodle .dd-eye,.doodle .dd-hop,.doodle .dd-bob,.doodle .dd-up,.peeker .dd-wave,.peeker .dd-eye{transform-box:fill-box}' +
    '.doodle .dd-eye,.peeker .dd-eye{transform-origin:center}' +
    '.doodle .dd-claw{transform-origin:0% 100%}.doodle .dd-clap{transform-origin:0% 100%}.doodle .dd-wing{transform-origin:70% 100%}' +
    '.doodle .dd-hop,.doodle .dd-bob,.doodle .dd-up{transform-origin:50% 100%}' +
    '.dd-line{display:block;width:min(240px,55%);height:16px;margin:6px auto 0;overflow:visible}' +
    '@keyframes ddIn{from{opacity:0;transform:translate(var(--fx,0),var(--fy,24px)) rotate(var(--fr,-8deg)) scale(.7)}to{opacity:1;transform:none}}' +
    '@keyframes ddBlink{0%,92%,100%{transform:none}95%{transform:scaleY(.1)}}' +
    '@keyframes ddClaw{0%,100%{transform:rotate(0)}50%{transform:rotate(-24deg)}}' +
    '@keyframes ddClap{0%,80%,100%{transform:rotate(0)}86%{transform:rotate(-24deg)}}' +
    '@keyframes ddFlap{0%,100%{transform:rotate(0)}50%{transform:rotate(16deg) scaleY(.8)}}' +
    '@keyframes ddHop{0%,60%,100%{transform:none}70%{transform:scale(1.08,.9)}80%{transform:translateY(-14px) scale(.96,1.05)}90%{transform:scale(1.04,.95)}}' +
    '@keyframes ddBob{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-4px) rotate(3deg)}}' +
    '@keyframes ddUp{0%{transform:translateY(60%)}60%{transform:translateY(-6%)}100%{transform:none}}' +
    '@keyframes ddPeekAround{0%,100%{transform:translateX(0)}30%,45%{transform:translateX(-3px)}65%,80%{transform:translateX(3px)}}' +
    '@keyframes ddWave{0%,100%{transform:none}25%,75%{transform:translate(2px,-16px) rotate(-18deg)}50%{transform:translate(4px,-18px) rotate(14deg)}}' +
    '.doodle.on{animation:ddIn .9s cubic-bezier(.3,1.5,.5,1) both}' +
    '.doodle:not(.on){opacity:0}' +
    '.doodle.awake .dd-eye{animation:ddBlink 4.6s linear infinite}' +
    '.doodle.awake .dd-claw{animation:ddClaw 1.6s ease-in-out infinite}' +
    '.doodle.awake .dd-clap{animation:ddClap 3.2s ease-in-out infinite}' +
    '.doodle.awake .dd-wing{animation:ddFlap 1.4s ease-in-out infinite}' +
    '.doodle.awake .dd-wing-b{animation-delay:-.2s}' +
    '.doodle.awake .dd-hop{animation:ddHop 2.8s ease-in-out infinite}' +
    '.doodle.awake .dd-bob{animation:ddBob 3.4s ease-in-out infinite}' +
    '.doodle.on .dd-up{animation:ddUp 1s cubic-bezier(.3,1.4,.5,1) .2s both}' +
    '.peek-stage{position:fixed;inset:0;z-index:40;overflow:hidden;pointer-events:none}' +
    '.peeker{position:absolute;width:96px;height:96px;visibility:hidden;transition:visibility 0s .8s}' +
    '.peeker.out{visibility:visible;transition:none}' +
    '.peeker-body{width:100%;height:100%;transform:translateY(102%);transition:transform .7s cubic-bezier(.4,0,.6,1)}' +
    '.peeker.out .peeker-body{transform:translateY(36%);transition:transform .8s cubic-bezier(.3,1.5,.5,1)}' +
    '.peeker.out .dd-look{animation:ddPeekAround 2.4s ease-in-out .7s both}' +
    '.peeker.out .dd-wave{animation:ddWave 1.1s ease-in-out 1.2s 2 both;transform-origin:30% 100%}' +
    '.peeker.out .dd-eye{animation:ddBlink 2.2s linear .4s 1}' +
    '.peeker svg{display:block;width:100%;height:100%;overflow:visible}' +
    '.peeker[data-side="bottom"]{bottom:0}' +
    '.peeker[data-side="left"]{left:0;transform:rotate(90deg)}' +
    '.peeker[data-side="right"]{right:0;transform:rotate(-90deg)}' +
    // Narrower screens: smaller, and tucked up into the gap above the heading.
    '@media (max-width:1100px){.doodle{width:72px;height:72px}.doodle.tl,.doodle.tr{top:-22px}}' +
    '@media (max-width:600px){.doodle{width:56px;height:56px}.doodle.tl,.doodle.tr{top:-14px}.doodle.br{bottom:2px}.doodle.bl{bottom:40px}.peeker{width:72px;height:72px}}' +
    '@media (prefers-reduced-motion: reduce){.doodle,.doodle *,.dd-line *{animation:none !important;opacity:1 !important;stroke-dashoffset:0 !important}.peek-stage{display:none}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /** @type {HTMLElement[]} */
  var doodles = [];
  Object.keys(CREATURES).forEach(function (name) {
    var c = CREATURES[name];
    var sec = document.querySelector('.sv[data-k="' + c[0] + '"]');
    if (!sec) return;
    var d = document.createElement('div');
    d.className = 'doodle ' + c[1] + ' doodle-' + name;
    d.setAttribute('aria-hidden', 'true');
    d.innerHTML = '<svg viewBox="0 0 100 100" focusable="false"><g class="crayon">' + c[2] + '</g></svg>';
    // Each one arrives from its own side.
    /** @type {Record<string, string[]>} */
    var FROM = { tl: ['-36px', '-10px', '-10deg'], tr: ['36px', '-10px', '10deg'], br: ['40px', '0px', '6deg'], bl: ['0px', '0px', '0deg'] };
    var from = FROM[c[1]] || FROM.bl;
    d.style.setProperty('--fx', from[0]);
    d.style.setProperty('--fy', from[1]);
    d.style.setProperty('--fr', from[2]);
    sec.appendChild(d);
    doodles.push(d);
  });

  // A squiggle under each section heading, drawn in by the page's own
  // crayon draw-in (.d) when the section comes into view.
  document.querySelectorAll('section.sv > h2.toon').forEach(function (h) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'dd-line');
    svg.setAttribute('viewBox', '0 0 240 16');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.innerHTML = '<path class="d w4" pathLength="1" style="--del: .3s; --dur: .9s" d="M4 10 C 30 2, 50 14, 80 8 S 130 2, 160 9 S 210 14, 236 6"></path>';
    h.appendChild(svg);
  });

  if (still || !hasIO) {
    doodles.forEach(function (d) { d.classList.add('on'); });
    return;
  }

  // Arrive once, then idle only while on screen.
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      var d = /** @type {HTMLElement} */ (en.target);
      if (en.isIntersecting) d.classList.add('on');
      d.classList.toggle('awake', en.isIntersecting);
    });
  }, { threshold: 0.6 });
  doodles.forEach(function (d) { io.observe(d); });

  // Sandy peeks in now and then, only once the hero is out of view.
  var hero = document.querySelector('.hero');
  var heroVisible = !!hero, timer = 0, peeks = 0, MAX_PEEKS = 8;
  // ?doodle-debug: Sandy peeks right away (the e2e suite uses it).
  var first = /[?&]doodle-debug(&|=|$)/.test(location.search) ? [300, 400] : [7000, 12000];
  var stage = document.createElement('div');
  stage.className = 'peek-stage';
  stage.setAttribute('aria-hidden', 'true');
  var peeker = document.createElement('div');
  peeker.className = 'peeker';
  peeker.dataset.side = 'bottom';
  peeker.innerHTML = '<div class="peeker-body">' + SANDY + '</div>';
  stage.appendChild(peeker);
  document.body.appendChild(stage);

  /** @param {number} lo @param {number} hi */
  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  function ready() { return !heroVisible && !document.hidden && !calm.matches && peeks < MAX_PEEKS; }
  // Arm the next peek if none is pending: soon for the first, then every 30 to 50 seconds.
  function next() {
    if (timer || !ready()) return;
    timer = window.setTimeout(peek, peeks ? rand(28000, 50000) : rand(first[0], first[1]));
  }
  // Duck back out of sight and drop whatever was pending.
  function retract() {
    clearTimeout(timer);
    timer = 0;
    peeker.classList.remove('out');
  }
  function peek() {
    timer = 0;
    if (!ready()) return;
    var sides = ['bottom', 'left', 'right'];
    var side = sides[Math.floor(Math.random() * sides.length)];
    peeker.dataset.side = side;
    peeker.style.left = side === 'bottom' ? rand(12, 78).toFixed(1) + '%' : '';
    peeker.style.top = side === 'bottom' ? '' : rand(30, 70).toFixed(1) + '%';
    void peeker.offsetWidth;
    peeker.classList.add('out');
    peeks++;
    timer = window.setTimeout(function () {
      retract();
      next();
    }, 4200);
  }
  // The hero, a hidden tab or reduced motion send Sandy home; coming back re-arms it.
  /** @param {boolean} away */
  function settle(away) {
    if (away) retract();
    else next();
  }
  document.addEventListener('visibilitychange', function () { settle(document.hidden); });
  if (calm.addEventListener) calm.addEventListener('change', function () { settle(calm.matches); });
  else calm.addListener(function () { settle(calm.matches); });
  if (hero) {
    new IntersectionObserver(function (es) {
      heroVisible = es[es.length - 1].isIntersecting;
      settle(heroVisible);
    }).observe(hero);
  } else {
    next();
  }
})();
