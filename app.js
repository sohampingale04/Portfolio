/* ==========================================================================
   app.js  (vanilla JS, no dependencies)

   1.  Config
   2.  Utilities: noise, easing, spring
   3.  State and DOM references
   4.  Building the nodes
   5.  Layout and measurement
   6.  Camera: drag, momentum, glide
   7.  Node behaviour: hover, focus, open (fold out), close
   8.  Input: pointer, wheel, keyboard, minimap
   9.  Rendering: world, drift, links, octahedron, minimap
   10. Intro sequence
   11. Main loop and boot
   ========================================================================== */
(() => {
  'use strict';

  const SITE = window.SITE;
  if (!SITE || !Array.isArray(SITE.nodes)) { console.error('content.js did not load.'); return; }


  /* 1. CONFIG ============================================================== */
  const CONFIG = {
    friction: 2.6,            // momentum decay per second. Higher stops sooner, lower glides longer.
    maxFlick: 4200,           // px/s cap on release velocity
    dragThreshold: 6,         // px of movement before a press becomes a drag
    glideOmega: 4.4,          // spring stiffness for camera glides (critically damped: never overshoots)
    wheelPan: 1,              // multiplier for wheel / trackpad panning
    mobileBreakpoint: 760,

    drift: {
      node: 12,               // px amplitude per node
      hub: 6,
      camera: 7,
      speed: 0.055,           // noise-lattice units per second (smaller is slower)
      interval: 1000 / 30     // drift is recomputed at ~30 Hz, the camera runs at display rate
    },

    links: {
      gap: 9,                 // px between a card edge and the end of its line
      samples: 64,            // segments per curve
      drawMs: 1900,           // ring-one line draw time
      branchMs: 1500,         // ring-two line draw time
      width: 1
    },

    fold: { margin: 28, settleMs: 1100 },
    minimapPadding: 260
  };

  const COPPER = '184,122,93';
  const BRONZE = '154,139,115';
  const EMBER  = '232,168,128';


  /* 2. UTILITIES =========================================================== */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mod = (n, m) => ((n % m) + m) % m;
  const smooth = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
  const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* Seeded 2D gradient noise (Perlin). Output is roughly in [-1, 1]. */
  const noise = (() => {
    const perm = new Uint8Array(512);
    let s = 1337;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (a, b, t) => a + (b - a) * t;
    const grad = (h, x, y) => {
      switch (h & 3) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; default: return -x - y; }
    };
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const X = xi & 255, Y = yi & 255;
      const u = fade(xf), v = fade(yf);
      const aa = perm[perm[X] + Y],     ab = perm[perm[X] + Y + 1];
      const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
      return lerp(
        lerp(grad(aa, xf, yf),     grad(ba, xf - 1, yf),     u),
        lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
        v
      );
    };
  })();
  /* Two octaves: a slow wander with a little finer texture, like Brownian motion */
  const fbm = (x, y) => (noise(x, y) + 0.5 * noise(x * 2.1 + 7.7, y + 1.9)) / 1.5;

  /* Exact critically damped spring step. Stable at any dt, never bounces. */
  const springOut = { x: 0, v: 0 };
  function spring(x, v, target, omega, dt) {
    const dx = x - target;
    const e = Math.exp(-omega * dt);
    const t = (v + omega * dx) * dt;
    springOut.x = target + (dx + t) * e;
    springOut.v = (v - omega * t) * e;
    return springOut;
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));


  /* 3. STATE AND DOM ======================================================= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const viewport = $('#viewport');
  const world = $('#world');
  const gridEl = $('#grid');
  const linksCanvas = $('#links');
  const hubEl = $('#hub');
  const hubBody = $('.hub__body');
  const octaCanvas = $('#octa');
  const miniWrap = $('#minimap');
  const miniCanvas = $('#minimap-canvas');
  const homeBtn = $('#home');
  const live = $('#live');

  const linksCtx = linksCanvas.getContext('2d');
  const octaCtx = octaCanvas.getContext('2d');
  const miniCtx = miniCanvas.getContext('2d');

  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reduceMQ.matches;

  const state = {
    vw: 0, vh: 0, dpr: 1, scale: 1,
    input: 'pointer',          // 'pointer' | 'keyboard'
    hover: null,               // node being lit
    active: null,              // node opening or open
    opening: null,             // node waiting for the camera to arrive
    openingSince: 0,
    ready: false,
    time: 0, last: 0, lastDrift: 0, accDt: 0,
    lastRx: NaN, lastRy: NaN,
    forceUntil: 0
  };

  const cam = {
    x: 0, y: 0, vx: 0, vy: 0,      // logical position (world point at screen centre) and velocity
    tx: null, ty: null,            // glide target
    follow: null,                  // entity the glide tracks
    dragging: false,
    dx: 0, dy: 0, driftW: 1,       // drift offset and its weight
    rx: 0, ry: 0,                  // rendered position (logical + drift)
    speed: 0
  };

  /* Entities: the hub plus every node. x,y are base positions, dx,dy the current drift. */
  const hub = { id: 'hub', kind: 'hub', el: hubEl, x: 0, y: 0, dx: 0, dy: 0, w: 1, amp: CONFIG.drift.hub, seed: 0.7, hw: 300, hh: 120 };
  const nodes = SITE.nodes.map((d, i) => ({
    ...d, kind: 'node', index: i,
    ox: d.x, oy: d.y,
    x: d.x, y: d.y, dx: 0, dy: 0, w: 1,
    amp: CONFIG.drift.node, seed: i * 7.31 + 1.7,
    hw: 150, hh: 90,
    open: false, needsScroll: false, cleanup: 0, settle: 0
  }));
  const byId = new Map(nodes.map(n => [n.id, n]));
  const entities = [hub, ...nodes];

  /* Links: parent to child, each with its own gentle curvature */
  const links = nodes.map((n, i) => ({
    from: n.parent && byId.get(n.parent) ? byId.get(n.parent) : hub,
    to: n,
    curve: (i % 2 ? 1 : -1) * (0.06 + 0.02 * (i % 3)),
    start: 0, dur: CONFIG.links.drawMs,
    hot: 0, dim: 1
  }));

  const mini = { w: 176, h: 126, cx: 0, cy: 0, scale: 0.05, scrubbing: false, id: null };
  const OCT = { w: 220, h: 220, spin: 0 };


  /* 4. BUILDING THE NODES ================================================== */
  const GLYPHS = {
    ledger:   '<path d="M4 6h16M4 12h16M4 18h10"/>',
    prism:    '<path d="M12 3l9 16H3z M12 3v16"/>',
    lattice:  '<path d="M12 3l8 9-8 9-8-9z M4 12h16"/>',
    curve:    '<path d="M3 18c5 0 4-12 9-12s4 12 9 12"/>',
    stack:    '<path d="M12 3l9 4.5-9 4.5-9-4.5z M3 12l9 4.5 9-4.5 M3 16.5l9 4.5 9-4.5"/>',
    arch:     '<path d="M4 20V10a8 8 0 0116 0v10 M4 20h16"/>',
    quill:    '<path d="M4 20l1-4L16 5l3 3L8 19z M13 8l3 3"/>',
    compass:  '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    envelope: '<path d="M3 6h18v12H3z M3 7l9 6 9-6"/>'
  };
  const CLOSE_ICON = '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M1 1l10 10M11 1L1 11"/></svg>';

  function entryHTML(it) {
    const external = it.href && /^https?:/i.test(it.href);
    const title = it.href
      ? `<a class="entry__link" href="${esc(it.href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(it.title)}</a>`
      : esc(it.title);
    return `<li>
      <div class="entry__head"><h3 class="entry__title">${title}</h3>${it.meta ? `<span class="entry__meta">${esc(it.meta)}</span>` : ''}</div>
      ${it.text ? `<p class="entry__text">${esc(it.text)}</p>` : ''}
    </li>`;
  }

  function sheetHTML(n) {
    const parts = [];
    if (n.lead) parts.push(`<p class="sheet__lead">${esc(n.lead)}</p>`);
    if (n.items && n.items.length) parts.push(`<ul class="sheet__list">${n.items.map(entryHTML).join('')}</ul>`);
    if (n.note) parts.push(`<p class="sheet__note">${esc(n.note)}</p>`);
    const total = parts.length;
    return `<h2 class="sr-only">${esc(n.title)}</h2>` +
      parts.map((html, i) => `<div class="sheet__part" style="--i:${i};--r:${total - 1 - i}">${html}</div>`).join('');
  }

  function buildNodes() {
    const frag = document.createDocumentFragment();
    for (const n of nodes) {
      const el = document.createElement('article');
      el.className = 'node';
      el.dataset.id = n.id;
      el.setAttribute('aria-labelledby', `${n.id}-title`);
      el.innerHTML = `
        <div class="node__card">
          <button class="node__face" type="button" aria-expanded="false" aria-controls="${n.id}-panel">
            <svg class="node__glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${GLYPHS[n.glyph] || GLYPHS.prism}</svg>
            <span class="node__title" id="${n.id}-title">${esc(n.title)}</span>
            <span class="node__plus" aria-hidden="true"></span>
            <span class="node__summary">${esc(n.summary)}</span>
          </button>
          <button class="node__close" type="button" aria-label="Close ${esc(n.title)}">${CLOSE_ICON}</button>
          <div class="node__fold" id="${n.id}-panel" role="region" aria-labelledby="${n.id}-title">
            <div class="node__sheet">${sheetHTML(n)}</div>
          </div>
        </div>`;
      n.el = el;
      n.card = $('.node__card', el);
      n.face = $('.node__face', el);
      n.close = $('.node__close', el);
      n.fold = $('.node__fold', el);
      n.sheet = $('.node__sheet', el);

      n.fold.addEventListener('transitionend', e => {
        if (e.target === n.fold && e.propertyName === 'height') settleOpen(n);
      });
      frag.appendChild(el);
    }
    world.appendChild(frag);
  }


  /* 5. LAYOUT AND MEASUREMENT ============================================== */
  const sizeCanvas = (c, w, h) => { c.width = Math.round(w * state.dpr); c.height = Math.round(h * state.dpr); };

  function layout() {
    state.vw = window.innerWidth;
    state.vh = window.innerHeight;
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.scale = state.vw < CONFIG.mobileBreakpoint ? 0.62 : state.vw < 1100 ? 0.8 : 1;

    sizeCanvas(linksCanvas, state.vw, state.vh);

    for (const n of nodes) {
      n.x = n.ox * state.scale;
      n.y = n.oy * state.scale;
      if (!n.open) { n.hw = n.card.offsetWidth / 2; n.hh = n.card.offsetHeight / 2; }
    }
    hub.hw = hubBody.offsetWidth / 2 + 16;
    hub.hh = hubBody.offsetHeight / 2 + 16;

    OCT.w = octaCanvas.clientWidth || 220;
    OCT.h = octaCanvas.clientHeight || 220;
    sizeCanvas(octaCanvas, OCT.w, OCT.h);

    const r = miniCanvas.getBoundingClientRect();
    mini.w = r.width || 176;
    mini.h = r.height || 126;
    sizeCanvas(miniCanvas, mini.w, mini.h);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of entities) {
      minX = Math.min(minX, e.x - e.hw); maxX = Math.max(maxX, e.x + e.hw);
      minY = Math.min(minY, e.y - e.hh); maxY = Math.max(maxY, e.y + e.hh);
    }
    const pad = CONFIG.minimapPadding;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    mini.cx = (minX + maxX) / 2;
    mini.cy = (minY + maxY) / 2;
    mini.scale = Math.min(mini.w / (maxX - minX), mini.h / (maxY - minY));

    if (state.active && state.active.open) refit(state.active);
    positionEntities();
    state.forceUntil = performance.now() + 400;
    state.lastRx = NaN;
    if (reduced) drawOcta(0);
  }

  function positionEntities() {
    for (const e of entities) {
      e.el.style.transform = `translate3d(${(e.x + e.dx).toFixed(2)}px, ${(e.y + e.dy).toFixed(2)}px, 0)`;
    }
  }


  /* 6. CAMERA ============================================================== */
  function glideTo(x, y, follow = null) {
    cam.follow = follow;
    if (reduced) {
      cam.x = x; cam.y = y; cam.vx = cam.vy = 0; cam.tx = cam.ty = null;
      return;
    }
    cam.tx = x; cam.ty = y;
  }

  function cancelGlide() { cam.tx = cam.ty = null; cam.follow = null; }

  function goHome() {
    if (state.active) closeNode(state.active, { refocus: false });
    glideTo(hub.x + hub.dx, hub.y + hub.dy);
    announce('Returned to the centre of the map');
  }

  function updateCamera(dt) {
    if (cam.dragging) return;

    if (cam.follow) {
      cam.tx = cam.follow.x + cam.follow.dx;
      cam.ty = cam.follow.y + cam.follow.dy;
    }

    if (cam.tx !== null) {
      const o = CONFIG.glideOmega;
      let s = spring(cam.x, cam.vx, cam.tx, o, dt); cam.x = s.x; cam.vx = s.v;
      s = spring(cam.y, cam.vy, cam.ty, o, dt);     cam.y = s.x; cam.vy = s.v;
      if (!cam.follow && Math.hypot(cam.x - cam.tx, cam.y - cam.ty) < 0.25 && Math.hypot(cam.vx, cam.vy) < 2) {
        cam.x = cam.tx; cam.y = cam.ty; cam.tx = cam.ty = null; cam.vx = cam.vy = 0;
      }
      return;
    }

    /* Momentum: exponential deceleration, integrated exactly so it is frame-rate independent */
    const speed = Math.hypot(cam.vx, cam.vy);
    if (speed > 1.5) {
      const k = CONFIG.friction;
      const decay = Math.exp(-k * dt);
      cam.x += cam.vx * (1 - decay) / k;
      cam.y += cam.vy * (1 - decay) / k;
      cam.vx *= decay;
      cam.vy *= decay;
    } else {
      cam.vx = cam.vy = 0;
    }
  }


  /* 7. NODE BEHAVIOUR ====================================================== */
  const nodeFrom = el => {
    const art = el && el.closest ? el.closest('.node') : null;
    return art ? byId.get(art.dataset.id) : null;
  };

  function announce(msg) {
    live.textContent = '';
    window.setTimeout(() => { live.textContent = msg; }, 30);
  }

  function setHover(n) {
    if (state.hover === n) return;
    if (state.hover) state.hover.el.classList.remove('is-hover');
    state.hover = n;
    if (n) n.el.classList.add('is-hover');
    document.body.classList.toggle('has-hover', !!n && !state.active);
    state.forceUntil = performance.now() + 900;
  }

  /* Space the fold may occupy: whatever the viewport leaves after the card face */
  function foldTarget(n) {
    const spare = state.vh - n.face.offsetHeight - 2 * CONFIG.fold.margin - (state.vw < CONFIG.mobileBreakpoint ? 36 : 0);
    const maxH = Math.max(140, spare);
    const natural = n.sheet.offsetHeight;
    return { h: Math.round(Math.min(natural, maxH)), scroll: natural > maxH };
  }

  function refit(n) {
    const t = foldTarget(n);
    n.fold.style.height = t.h + 'px';
    n.needsScroll = t.scroll;
    n.fold.classList.toggle('is-scrollable', t.scroll);
  }

  function settleOpen(n) {
    if (!n.open) return;
    window.clearTimeout(n.settle);
    if (n.needsScroll) n.fold.classList.add('is-scrollable');
  }

  function openNode(n) {
    if (state.active === n) return;
    if (state.active) closeNode(state.active, { refocus: false });

    window.clearTimeout(n.cleanup);
    state.active = n;
    state.opening = n;
    state.openingSince = performance.now();
    n.el.classList.add('is-active');
    document.body.classList.add('has-active');
    document.body.classList.remove('has-hover');
    state.forceUntil = performance.now() + 1600;

    /* Step 1: pan so the node sits at the centre of the screen. Step 2 (expand) runs when the camera arrives. */
    if (reduced) {
      cam.x = n.x; cam.y = n.y; cam.vx = cam.vy = 0; cam.tx = cam.ty = null; cam.follow = null;
      expand(n);
    } else {
      cam.vx *= 0.4; cam.vy *= 0.4;
      glideTo(n.x + n.dx, n.y + n.dy, n);
    }
  }

  /* Step 2: widen the card and unfold its sheet, part by part */
  function expand(n) {
    if (state.active !== n) return;
    state.opening = null;
    const t = foldTarget(n);
    n.open = true;
    n.needsScroll = t.scroll;
    n.el.classList.add('is-open');
    n.face.setAttribute('aria-expanded', 'true');
    n.fold.style.height = t.h + 'px';
    n.settle = window.setTimeout(() => settleOpen(n), CONFIG.fold.settleMs);
    n.close.focus({ preventScroll: true });
    announce(`${n.title} opened. Press Escape to close.`);
  }

  /* Reverse of expand: parts fold shut (last first), the card narrows, the fold collapses */
  function closeNode(n, { refocus = false } = {}) {
    if (!n.el.classList.contains('is-active')) return;
    if (state.opening === n) state.opening = null;

    const wasOpen = n.open;
    n.open = false;
    window.clearTimeout(n.settle);
    n.fold.classList.remove('is-scrollable');
    n.fold.scrollTop = 0;
    n.fold.style.height = '0px';
    n.el.classList.remove('is-open');
    n.face.setAttribute('aria-expanded', 'false');

    if (state.active === n) {
      state.active = null;
      cam.follow = null;
      cam.tx = cam.ty = null;      // spring velocity carries on as momentum, so there is no jolt
      document.body.classList.remove('has-active');
    }

    n.cleanup = window.setTimeout(() => {
      if (state.active !== n) n.el.classList.remove('is-active');
      /* re-measure the closed size so lines attach to the true card edge */
      n.hw = n.card.offsetWidth / 2; n.hh = n.card.offsetHeight / 2;
    }, reduced ? 20 : 1100);

    state.forceUntil = performance.now() + 1400;
    if (wasOpen) announce(`${n.title} closed`);
    if (refocus) n.face.focus({ preventScroll: true });
  }

  /* Used by the frame loop: has the camera arrived? */
  function checkOpening(now) {
    const n = state.opening;
    if (!n) return;
    const dist = Math.hypot(cam.x - (n.x + n.dx), cam.y - (n.y + n.dy));
    const sp = Math.hypot(cam.vx, cam.vy);
    if ((dist < 6 && sp < 60) || now - state.openingSince > 1600) expand(n);
  }

  /* Closest node in a direction, for arrow-key navigation */
  function neighbour(from, dir) {
    let best = null, bestScore = Infinity;
    for (const n of nodes) {
      if (n === from) continue;
      const vx = n.x - from.x, vy = n.y - from.y;
      const len = Math.hypot(vx, vy) || 1;
      const cos = (vx * dir[0] + vy * dir[1]) / len;
      if (cos < 0.35) continue;
      const score = len * (1 + 1.6 * (1 - cos));
      if (score < bestScore) { bestScore = score; best = n; }
    }
    return best;
  }


  /* 8. INPUT =============================================================== */
  const drag = { id: null, sx: 0, sy: 0, lx: 0, ly: 0, started: false, samples: [], suppress: false };

  viewport.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.minimap')) return;
    if (e.target.closest('.node.is-open .node__card')) return;     // reading, selecting, scrolling
    state.input = 'pointer';
    drag.id = e.pointerId;
    drag.sx = drag.lx = e.clientX;
    drag.sy = drag.ly = e.clientY;
    drag.started = false;
    drag.suppress = false;
    drag.samples = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }];
  });

  viewport.addEventListener('pointermove', e => {
    if (e.pointerId !== drag.id) return;

    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < CONFIG.dragThreshold) return;
      drag.started = true;
      cam.dragging = true;
      cancelGlide();
      cam.vx = cam.vy = 0;
      try { viewport.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      viewport.classList.add('is-dragging');
      document.body.classList.add('has-moved');
      if (state.active) closeNode(state.active, { refocus: false });
      setHover(null);
    }

    cam.x -= e.clientX - drag.lx;
    cam.y -= e.clientY - drag.ly;
    drag.lx = e.clientX;
    drag.ly = e.clientY;

    drag.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    while (drag.samples.length > 2 && e.timeStamp - drag.samples[0].t > 100) drag.samples.shift();
  });

  function endDrag(e) {
    if (e.pointerId !== drag.id) return;
    drag.id = null;
    if (!drag.started) return;

    cam.dragging = false;
    viewport.classList.remove('is-dragging');
    try { viewport.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }

    /* Release velocity from the last ~100 ms of movement. If the pointer rested before release, no flick. */
    const s = drag.samples;
    const last = s[s.length - 1];
    const first = s[0];
    if (reduced || s.length < 2 || e.timeStamp - last.t > 90) {
      cam.vx = cam.vy = 0;
    } else {
      const dt = Math.max(last.t - first.t, 16) / 1000;
      cam.vx = clamp(-(last.x - first.x) / dt, -CONFIG.maxFlick, CONFIG.maxFlick);
      cam.vy = clamp(-(last.y - first.y) / dt, -CONFIG.maxFlick, CONFIG.maxFlick);
    }
    drag.suppress = true;      // swallow the click that follows a drag
  }
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  /* Click handling. Capture phase so a drag never opens the card it ended on,
     and so a click on empty canvas can close the open card. */
  viewport.addEventListener('click', e => {
    if (drag.suppress) { drag.suppress = false; e.stopPropagation(); e.preventDefault(); return; }
    if (state.active && !e.target.closest('.node, .minimap')) closeNode(state.active, { refocus: false });
  }, true);

  world.addEventListener('click', e => {
    const n = nodeFrom(e.target);
    if (!n) return;
    if (e.target.closest('.node__close')) { closeNode(n, { refocus: true }); return; }
    if (e.target.closest('.node__face')) {
      if (state.active === n) closeNode(n, { refocus: true });
      else openNode(n);
    }
  });

  /* Hover (mouse only). Touch has no hover, and drags clear it. */
  world.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse' || cam.dragging) return;
    const n = nodeFrom(e.target);
    if (n) setHover(n);
  });
  world.addEventListener('pointerout', e => {
    if (e.pointerType !== 'mouse') return;
    const from = nodeFrom(e.target);
    if (from && nodeFrom(e.relatedTarget) !== from) setHover(null);
  });

  /* Keyboard focus lights a node and pans to it */
  world.addEventListener('focusin', e => {
    const n = nodeFrom(e.target);
    if (!n || state.input !== 'keyboard') return;
    setHover(n);
    if (state.active === n) return;                       // focus moving inside the open card
    if (state.active) closeNode(state.active, { refocus: false });
    glideTo(n.x + n.dx, n.y + n.dy);
  });
  world.addEventListener('focusout', e => {
    if (state.input !== 'keyboard') return;
    const n = nodeFrom(e.target);
    if (n && nodeFrom(e.relatedTarget) !== n) setHover(null);
  });

  /* Wheel and trackpad pan the canvas, unless the pointer is over an open card */
  viewport.addEventListener('wheel', e => {
    if (e.ctrlKey) return;
    if (e.target.closest('.node.is-open .node__card')) return;
    e.preventDefault();
    const k = (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? state.vh : 1) * CONFIG.wheelPan;
    cancelGlide();
    cam.x += e.deltaX * k;
    cam.y += e.deltaY * k;
    cam.vx = cam.vy = 0;
    document.body.classList.add('has-moved');
    if (state.active) closeNode(state.active, { refocus: false });
  }, { passive: false });

  /* Keyboard: Escape closes, Home recentres, arrows hop between nodes (or nudge the camera) */
  document.addEventListener('keydown', e => {
    state.input = 'keyboard';

    if (e.key === 'Escape') {
      if (state.active) { const n = state.active; closeNode(n, { refocus: true }); e.preventDefault(); }
      return;
    }
    if (e.key === 'Home') { e.preventDefault(); goHome(); return; }

    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const dir = dirs[e.key];
    if (!dir) return;
    if (e.target.closest && e.target.closest('.node__fold')) return;   // let the open card scroll
    if (e.target.closest && e.target.closest('.minimap')) return;

    const from = nodeFrom(document.activeElement);
    if (from) {
      const next = neighbour(from, dir);
      if (next) { e.preventDefault(); next.face.focus({ preventScroll: true }); }
    } else {
      e.preventDefault();
      const bx = cam.tx !== null ? cam.tx : cam.x;
      const by = cam.ty !== null ? cam.ty : cam.y;
      glideTo(bx + dir[0] * 180, by + dir[1] * 180);
      document.body.classList.add('has-moved');
    }
  });

  /* Minimap: press or drag to travel there */
  function miniToWorld(e) {
    const r = miniCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - r.width / 2) / mini.scale + mini.cx,
      y: (e.clientY - r.top - r.height / 2) / mini.scale + mini.cy
    };
  }
  miniCanvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    state.input = 'pointer';
    mini.scrubbing = true;
    mini.id = e.pointerId;
    try { miniCanvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    if (state.active) closeNode(state.active, { refocus: false });
    const p = miniToWorld(e);
    glideTo(p.x, p.y);
    document.body.classList.add('has-moved');
  });
  miniCanvas.addEventListener('pointermove', e => {
    if (!mini.scrubbing || e.pointerId !== mini.id) return;
    const p = miniToWorld(e);
    glideTo(p.x, p.y);
  });
  const endScrub = e => { if (e.pointerId === mini.id) { mini.scrubbing = false; mini.id = null; } };
  miniCanvas.addEventListener('pointerup', endScrub);
  miniCanvas.addEventListener('pointercancel', endScrub);
  homeBtn.addEventListener('click', goHome);

  /* Safety net: if anything ever scrolls the viewport, put it back */
  viewport.addEventListener('scroll', () => { viewport.scrollLeft = 0; viewport.scrollTop = 0; });

  window.addEventListener('resize', () => {
    window.cancelAnimationFrame(layout.raf);
    layout.raf = window.requestAnimationFrame(layout);
  });

  const onMotionChange = () => {
    reduced = reduceMQ.matches;
    if (reduced) {
      for (const e of entities) { e.dx = e.dy = 0; }
      cam.dx = cam.dy = 0;
      positionEntities();
      drawOcta(0);
    }
    state.forceUntil = performance.now() + 400;
  };
  if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onMotionChange);
  else if (reduceMQ.addListener) reduceMQ.addListener(onMotionChange);


  /* 9. RENDERING =========================================================== */

  /* 9a. Drift: slow noise offsets for every node, the hub and the camera. Runs at ~30 Hz. */
  function updateDrift(t, dt) {
    const D = CONFIG.drift;
    const on = !reduced;
    const s = t * D.speed;

    cam.driftW = smooth(cam.driftW, (state.active || cam.dragging) ? 0 : 1, 2.2, dt);
    cam.dx = on ? fbm(s * 0.9, 91.3) * D.camera * cam.driftW : 0;
    cam.dy = on ? fbm(s * 0.9 + 37, 53.1) * D.camera * cam.driftW : 0;

    for (const e of entities) {
      e.w = smooth(e.w, state.active === e ? 0 : 1, 2.5, dt);     // the open card holds perfectly still
      e.dx = on ? fbm(s, e.seed) * e.amp * e.w : 0;
      e.dy = on ? fbm(s + 19.7, e.seed + 3.3) * e.amp * e.w : 0;
      e.el.style.transform = `translate3d(${(e.x + e.dx).toFixed(2)}px, ${(e.y + e.dy).toFixed(2)}px, 0)`;
    }
  }

  /* 9b. Camera transform: one translate3d moves the whole world; the dot field moves at half speed */
  function applyCamera() {
    world.style.transform = `translate3d(${(state.vw / 2 - cam.rx).toFixed(2)}px, ${(state.vh / 2 - cam.ry).toFixed(2)}px, 0)`;
    const g = 72;
    gridEl.style.transform = `translate3d(${(mod(-cam.rx * 0.5, g) - g).toFixed(2)}px, ${(mod(-cam.ry * 0.5, g) - g).toFixed(2)}px, 0)`;
  }

  /* 9c. Lines. Cubic curves between card edges, drawn progressively from the centre outward. */
  function edgePoint(e, tx, ty, gap, out) {
    const cx = e.x + e.dx, cy = e.y + e.dy;
    let dx = tx - cx, dy = ty - cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const t = Math.min(dx ? e.hw / Math.abs(dx) : Infinity, dy ? e.hh / Math.abs(dy) : Infinity);
    out.x = cx + dx * (t + gap);
    out.y = cy + dy * (t + gap);
  }

  const P0 = { x: 0, y: 0 }, P3 = { x: 0, y: 0 };
  const bez = (a, b, c, d, t) => {
    const u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  };

  function drawLinks(now, dt) {
    const ctx = linksCtx;
    const { vw, vh } = state;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    if (!state.ready) return false;

    const ox = vw / 2 - cam.rx;
    const oy = vh / 2 - cam.ry;
    const focus = state.active || state.hover;
    let animating = false;

    for (const L of links) {
      const raw = (now - L.start) / L.dur;
      const p = reduced ? 1 : easeInOutCubic(clamp(raw, 0, 1));
      if (!reduced && raw < 1) animating = true;
      if (p <= 0) continue;

      const a = L.from, b = L.to;
      const isHot = !!focus && (L.to === focus || L.from === focus);
      L.hot = smooth(L.hot, isHot ? 1 : 0, 7, dt);
      L.dim = smooth(L.dim, focus && !isHot ? (state.active ? 0.22 : 0.5) : 1, 6, dt);
      if (Math.abs(L.hot - (isHot ? 1 : 0)) > 0.01 || Math.abs(L.dim - 1) > 0.01) animating = true;

      edgePoint(a, b.x + b.dx, b.y + b.dy, CONFIG.links.gap, P0);
      edgePoint(b, a.x + a.dx, a.y + a.dy, CONFIG.links.gap, P3);

      const dx = P3.x - P0.x, dy = P3.y - P0.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const k = len * L.curve;
      const x1 = P0.x + dx * 0.35 + nx * k,        y1 = P0.y + dy * 0.35 + ny * k;
      const x2 = P0.x + dx * 0.7  + nx * k * 0.55, y2 = P0.y + dy * 0.7  + ny * k * 0.55;

      const n = CONFIG.links.samples;
      const steps = Math.max(2, Math.ceil(n * p));
      ctx.beginPath();
      ctx.moveTo(P0.x + ox, P0.y + oy);
      let hx = P0.x, hy = P0.y;
      for (let i = 1; i <= steps; i++) {
        const t = Math.min(i / n, p);
        hx = bez(P0.x, x1, x2, P3.x, t);
        hy = bez(P0.y, y1, y2, P3.y, t);
        ctx.lineTo(hx + ox, hy + oy);
      }

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (L.hot > 0.01) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = `rgba(${COPPER},${0.1 * L.hot})`;
        ctx.stroke();
      }
      ctx.lineWidth = CONFIG.links.width;
      ctx.strokeStyle = L.hot > 0.01
        ? `rgba(${COPPER},${(0.42 + 0.4 * L.hot) * L.dim})`
        : `rgba(${BRONZE},${0.42 * L.dim})`;
      ctx.stroke();

      /* Sockets at both ends once the line reaches them */
      const aStart = clamp((p - 0.02) * 30, 0, 1);
      const aEnd = clamp((p - 0.96) * 25, 0, 1);
      ctx.fillStyle = `rgba(${BRONZE},${0.8 * L.dim * aStart})`;
      ctx.beginPath(); ctx.arc(P0.x + ox, P0.y + oy, 2.1, 0, Math.PI * 2); ctx.fill();
      if (aEnd > 0) {
        ctx.fillStyle = `rgba(${BRONZE},${0.85 * L.dim * aEnd})`;
        ctx.beginPath(); ctx.arc(P3.x + ox, P3.y + oy, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(${BRONZE},${0.3 * L.dim * aEnd})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(P3.x + ox, P3.y + oy, 5, 0, Math.PI * 2); ctx.stroke();
      }

      /* A small ember at the drawing head while the line is still travelling */
      if (!reduced && p < 0.995) {
        const fade = 1 - Math.pow(p, 4);
        ctx.fillStyle = `rgba(${EMBER},${0.14 * fade})`;
        ctx.beginPath(); ctx.arc(hx + ox, hy + oy, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(${EMBER},${0.9 * fade})`;
        ctx.beginPath(); ctx.arc(hx + ox, hy + oy, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    return animating;
  }

  /* 9d. Hub octahedron: wireframe, an inner counter-rotating copy, and a slow dial of ticks */
  const OCT_V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const OCT_E = [];
  for (let i = 0; i < 6; i++) {
    for (let j = i + 1; j < 6; j++) {
      const a = OCT_V[i], b = OCT_V[j];
      if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] === 0) OCT_E.push([i, j]);   // 12 edges
    }
  }
  const proj = Array.from({ length: 6 }, () => [0, 0, 0]);

  function projectOct(scale, yaw, pitch, roll) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    for (let i = 0; i < 6; i++) {
      const v = OCT_V[i];
      const x = v[0] * scale, y = v[1] * scale, z = v[2] * scale;
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;          // yaw
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;         // pitch
      const x3 = x1 * cr - y2 * sr, y3 = x1 * sr + y2 * cr;       // roll
      const f = 3.4 / (3.4 - z2);                                 // gentle perspective
      proj[i][0] = x3 * f; proj[i][1] = y3 * f; proj[i][2] = z2;
    }
  }

  function strokeOct(ctx, cx, cy, R, rgb, base) {
    ctx.lineWidth = 1;
    for (const [i, j] of OCT_E) {
      const a = proj[i], b = proj[j];
      const depth = (a[2] + b[2]) / 2;
      const alpha = clamp(0.42 + 0.3 * depth, 0.14, 0.9) * base;
      ctx.strokeStyle = `rgba(${rgb},${alpha})`;
      ctx.beginPath();
      ctx.moveTo(cx + a[0] * R, cy + a[1] * R);
      ctx.lineTo(cx + b[0] * R, cy + b[1] * R);
      ctx.stroke();
    }
  }

  function drawOcta(dt) {
    const ctx = octaCtx;
    const w = OCT.w, h = OCT.h;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2, R = w * 0.3;
    /* Slow yaw. A little extra spin while the camera is moving ties the two together. */
    if (!reduced) OCT.spin += dt * (0.13 + Math.min(cam.speed, 2400) * 0.00028);
    const yaw = OCT.spin;
    const pitch = 0.55 + (reduced ? 0 : 0.12 * Math.sin(state.time * 0.11));
    const roll = 0.2;

    /* Dial */
    const ticks = 60, rd = w * 0.44, rot = -OCT.spin * 0.12;
    ctx.lineWidth = 1;
    for (let i = 0; i < ticks; i++) {
      const a = rot + (i / ticks) * Math.PI * 2;
      const long = i % 5 === 0;
      const r0 = rd - (long ? 9 : 5);
      ctx.strokeStyle = `rgba(${BRONZE},${long ? 0.4 : 0.2})`;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * rd, cy + Math.sin(a) * rd);
      ctx.stroke();
    }

    /* Inner, counter-rotating */
    projectOct(0.5, -yaw * 1.4 + 0.6, pitch + 0.25, -roll);
    strokeOct(ctx, cx, cy, R, BRONZE, 0.7);

    /* Outer */
    projectOct(1, yaw, pitch, roll);
    strokeOct(ctx, cx, cy, R, COPPER, 1);
    for (let i = 0; i < 6; i++) {
      const p = proj[i];
      const a = clamp(0.5 + 0.35 * p[2], 0.2, 0.95);
      ctx.fillStyle = `rgba(245,242,235,${a})`;
      ctx.beginPath(); ctx.arc(cx + p[0] * R, cy + p[1] * R, 1.8, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* 9e. Minimap: constellation of nodes, a faint viewport frame and a warm glowing dot */
  function drawMini(now) {
    const ctx = miniCtx;
    const { w, h } = mini;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const mx = x => (x - mini.cx) * mini.scale + w / 2;
    const my = y => (y - mini.cy) * mini.scale + h / 2;

    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${BRONZE},0.22)`;
    ctx.beginPath();
    for (const L of links) {
      ctx.moveTo(mx(L.from.x + L.from.dx), my(L.from.y + L.from.dy));
      ctx.lineTo(mx(L.to.x + L.to.dx), my(L.to.y + L.to.dy));
    }
    ctx.stroke();

    /* hub */
    ctx.strokeStyle = `rgba(${BRONZE},0.8)`;
    ctx.beginPath(); ctx.arc(mx(hub.x), my(hub.y), 3.4, 0, Math.PI * 2); ctx.stroke();

    /* nodes */
    for (const n of nodes) {
      const lit = n === state.active || n === state.hover;
      ctx.fillStyle = lit ? `rgba(${COPPER},1)` : `rgba(${BRONZE},0.75)`;
      ctx.beginPath(); ctx.arc(mx(n.x + n.dx), my(n.y + n.dy), lit ? 2.6 : 1.8, 0, Math.PI * 2); ctx.fill();
    }

    /* viewport frame */
    const fw = state.vw * mini.scale, fh = state.vh * mini.scale;
    ctx.strokeStyle = `rgba(${BRONZE},0.28)`;
    ctx.strokeRect(mx(cam.rx) - fw / 2 + 0.5, my(cam.ry) - fh / 2 + 0.5, fw, fh);

    /* camera dot, pinned to the edge (and dimmer) if the camera has wandered off the map */
    let dx = mx(cam.rx), dy = my(cam.ry);
    const inside = dx >= 6 && dx <= w - 6 && dy >= 6 && dy <= h - 6;
    dx = clamp(dx, 6, w - 6); dy = clamp(dy, 6, h - 6);
    const breathe = reduced ? 0 : Math.sin(now / 900) * 1.5;
    const gr = 12 + breathe;
    const g = ctx.createRadialGradient(dx, dy, 0, dx, dy, gr);
    g.addColorStop(0, `rgba(${EMBER},${inside ? 0.95 : 0.5})`);
    g.addColorStop(0.25, `rgba(${EMBER},${inside ? 0.35 : 0.18})`);
    g.addColorStop(1, `rgba(${EMBER},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(dx, dy, gr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = inside ? '#F0B896' : `rgba(${EMBER},0.6)`;
    ctx.beginPath(); ctx.arc(dx, dy, 2.3, 0, Math.PI * 2); ctx.fill();
  }


  /* 10. INTRO SEQUENCE ===================================================== */
  /* Lines draw outward from the hub; each card fades in as its line arrives.
     Ring-two lines wait for their parent's line, so growth reads as branching. */
  function startIntro() {
    if (state.ready) return;
    const now = performance.now();
    state.ready = true;
    document.body.classList.add('is-ready');

    const ringOne = links.filter(L => L.from === hub);
    ringOne.forEach((L, i) => {
      L.dur = CONFIG.links.drawMs;
      L.start = reduced ? now : now + 600 + i * 150;
    });
    links.filter(L => L.from !== hub).forEach(L => {
      const parent = links.find(P => P.to === L.from);
      L.dur = CONFIG.links.branchMs;
      L.start = reduced ? now : (parent ? parent.start + parent.dur * 0.7 : now) + 120;
    });

    for (const L of links) {
      const delay = reduced ? 0 : Math.max(0, L.start + L.dur * 0.8 - now);
      L.to.el.style.transitionDelay = `${Math.round(delay)}ms`;
      L.to.el.classList.add('is-revealed');
    }
    state.forceUntil = now + 6000;
  }


  /* 11. MAIN LOOP AND BOOT ================================================= */
  function frame(ts) {
    const dt = Math.min(Math.max((ts - state.last) / 1000, 0.001), 0.05);
    state.last = ts;
    state.time = ts / 1000;
    state.accDt += dt;

    const px = cam.x, py = cam.y;
    updateCamera(dt);
    cam.speed = smooth(cam.speed, Math.hypot(cam.x - px, cam.y - py) / dt, 8, dt);

    let driftTick = false;
    if (ts - state.lastDrift >= CONFIG.drift.interval) {
      const ddt = Math.min((ts - state.lastDrift) / 1000, 0.1);
      state.lastDrift = ts;
      driftTick = true;
      updateDrift(state.time, ddt);
    }

    checkOpening(ts);

    cam.rx = cam.x + cam.dx;
    cam.ry = cam.y + cam.dy;
    const moved = cam.rx !== state.lastRx || cam.ry !== state.lastRy;
    if (moved) {
      applyCamera();
      state.lastRx = cam.rx;
      state.lastRy = cam.ry;
    }

    /* Lines and minimap redraw when something they depend on changed */
    const forced = ts < state.forceUntil;
    if (moved || driftTick || forced) {
      const animating = drawLinks(ts, state.accDt);
      state.accDt = 0;
      if (animating) state.forceUntil = Math.max(state.forceUntil, ts + 120);
      drawMini(ts);
    }

    /* Octahedron: only while the hub is anywhere near the screen */
    if (!reduced) {
      const sx = state.vw / 2 + (hub.x + hub.dx - cam.rx);
      const sy = state.vh / 2 + (hub.y + hub.dy - cam.ry);
      if (Math.abs(sx - state.vw / 2) < state.vw / 2 + 260 && Math.abs(sy - state.vh / 2) < state.vh / 2 + 260) drawOcta(dt);
    }

    window.requestAnimationFrame(frame);
  }

  function boot() {
    buildNodes();
    layout();
    cam.rx = cam.x; cam.ry = cam.y;
    applyCamera();
    drawOcta(0);
    state.last = performance.now();
    window.requestAnimationFrame(frame);

    /* Measure again once fonts have settled (card heights depend on them), then play the intro */
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    Promise.race([fontsReady, new Promise(r => window.setTimeout(r, 1400))]).then(() => {
      layout();
      startIntro();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
