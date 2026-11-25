'use strict';

/* ---------- drummer visualizer ----------
   A hand-drawn drummer (cut from a short animation) who plays whatever the pattern plays, in two layers:
   - hands: the animator's own footage. Every hit in it is listed (EV, below) with what was struck; each step jumps to
     a hit of the drum it needs and plays the animator's frames from that contact up to his next hit, spread over the
     time until the hands' next hit (through steps that strike nothing, so the swing toward the next stroke plays
     there instead of him freezing). So the in-betweens, alternating hands and rolls are his. A hit is picked to
     continue the footage where it can: the one right after the last hit used, one that came from the same drum, one
     that heads toward the drum the next hit needs, one with enough motion to fill the gap. The contact always lands
     on the step; nothing is delayed for an in-between. The next hit is picked a step early, so when his
     in-betweens head somewhere else, the end of the gap plays the drawings that lead into the next hit instead (its
     wind-up, as the animator drew it before that contact). On fast runs the hands alternate, even across drums
     (HAND, SIDE below).
   - kick: the foot, as the bass drum swelling for a moment (only the drum: the rest of the kit doesn't move with it)
   Stopped, he sways with his eyes closed (the animator's listening loop), one sway every two beats at our BPM.
   A kick doesn't take the hands away: amen kicks land with the ride on the 8ths, and one on an off-16th leaves the
   hands where they are. What each slice plays comes from the break's notation (slices[].hits, analysis.js).
   Now and then he uses his head: a snare in the last two beats of the pattern's 4th bar is a head-butt on the right
   drum, and he tosses his head back after it, as the animator drew it.
   Follows card.nowI / the ORIGINAL preview once per frame, like the waveform, so it shares the grid's timing.
   The sprite and the drawing ids come from tools/drummer (build.sh, drawings.js). */
(() => {
  const cv = $('#drummer');
  if (!cv) return;
  const g = cv.getContext('2d');
  const FW = 232,
    FH = 180,
    COLS = 16;
  // the footage from video frame F0, as drawing ids (sprite cells). It is drawn at 24 fps inside 30 fps video, so a
  // drawing repeats every fifth frame; the animator also reuses drawings for rolls.
  const F0 = 226;
  const SEQ = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 4, 5, 6, 3, 4, 4, 7, 8, 9, 10, 10, 11, 12, 13, 14, 14,
    15, 14, 15, 14, 14, 16, 17, 18, 19, 19, 20, 21, 22, 23, 23, 24, 25, 26, 19, 19, 27, 4, 7, 8, 8, 28, 29, 7, 8, 8,
    30, 31, 15, 14, 14, 32, 33, 34, 17, 17, 18, 19, 35, 36, 36, 22, 23, 37, 38, 38, 39, 2, 3, 40, 40, 37, 38, 41, 42,
    42, 43, 44, 9, 10, 10, 45, 46, 15, 14, 14, 47, 48, 15, 14, 14, 18, 17, 18, 19, 19, 35, 36, 22, 23, 23, 24, 49,
    50, 51, 51, 52, 4, 7, 8, 8, 53, 54, 14, 15, 15, 14, 15, 14, 55, 55, 56, 57, 58, 59, 59, 56, 60, 61, 59, 59, 56,
    62, 40, 37, 37, 63, 64, 58, 65, 65, 66, 67, 68, 69, 69, 68, 69, 65, 70, 70, 71, 72, 24, 73, 73, 50, 74, 55, 58,
    58, 1, 2, 75, 76, 76, 77, 78, 75, 76, 76, 77, 78, 77, 78, 78, 77, 78, 13, 14, 14, 79, 80, 81, 81, 81, 80, 82, 83,
    84, 84, 84, 84, 85, 85, 85, 86, 87, 85, 85, 85, 85, 84, 84, 88, 88, 83, 80, 81, 81, 81, 80, 82, 83, 84, 84, 84,
    84, 85, 89, 89, 87, 90, 91, 92, 92, 36, 93, 94, 59, 59, 56, 57, 58, 1, 1, 2, 59, 56, 57, 57, 58, 59, 56, 57, 57,
    58, 58, 1, 57, 57, 58, 58, 95, 96, 96, 97, 98, 99, 100, 100, 101, 102, 103, 104, 104, 60, 12, 59, 56, 56, 62, 40,
    37, 63, 63, 64, 58, 65, 66, 66, 105, 106, 13, 107, 107, 57, 58, 3, 108, 108, 109, 38, 110, 56, 56, 111, 112, 75,
    113, 113, 114, 76, 75, 113, 113, 114, 76, 59, 56, 56, 115, 42, 37, 63, 63, 115, 42, 116, 117, 117, 118, 10, 13,
    119, 119, 120, 14, 15, 107, 107, 120, 14, 121, 122, 122, 123, 19, 35, 91, 91, 124, 125, 15, 107, 107, 123, 19,
    121, 122, 122, 126, 36, 90, 91, 91,
  ];
  /* what each drawing shows, by id, labelled by eye:
     L  a stick on the left cymbal, tilting it        R  a stick on the right cymbal, tilting it (the ride)
     S  both hands on the left drum, stick cocked     T  a tap on the right drum (left arm curled or thrown up)
     X  the right stick on the right drum, left arm cocked up
     Y  arms crossed: the left stick over on the snare, right arm up (his runs alternate X Y X Y)
     B  both sticks flat on both drums
     U  both arms up                                  H  head down on the right drum       h  head thrown back
     W  a swing between hits                          Z  stopped, swaying with eyes closed I  waiting, no sticks
     D  a double: the left stick on the snare and the left cymbal at once, right arm cocked
     .  not used (a prop gag) */
  const KIND = 'ITTRWTTLLTTSWSWSXYXYLLRWXYXRRWSWTTXLDTTTWRWLDSWSWYXYRRSTTTTTSWRTTBUU..URWYYHhHhZZZZZZZZZZZLDLTTTZUUUUBUBUBUWWTTBUhHRLDTWSXYXSWL';
  const kindAt = f => KIND[SEQ[f - F0]];
  const cellAt = f => SEQ[f - F0];
  // the hits, in footage order: { f: contact frame, end: frame of his next hit (the in-betweens run up to it), k, pk, nk }
  const EV = (() => {
    const out = [];
    let prev = null;
    for (let f = F0; f < F0 + SEQ.length; f++) {
      const k = kindAt(f);
      if (!'LRSTXYBUHD'.includes(k)) {
        if (!'Wh'.includes(k)) prev = null; // a swing or a head toss is part of the motion; anything else breaks it
        continue;
      }
      if (prev === k && out.length && kindAt(f - 1) === k) continue; // the same hit, still on the drum
      out.push({ f, k });
      prev = k;
    }
    out.forEach((e, i) => {
      const nx = out[i + 1];
      let end = nx ? nx.f : Math.min(e.f + 3, F0 + SEQ.length); // the last hit: not past the end of the footage
      for (let f = e.f + 1; f < end; f++) if ('ZI.'.includes(kindAt(f))) end = f; // stop before he stops playing
      e.end = Math.max(e.f + 1, Math.min(end, e.f + 10));
      e.flow = !!nx && e.end === nx.f; // the footage runs straight on into his next hit
      /* the follow-through is the contact held, then his swings. Another drawing of a stroke is the next stroke of a
         roll on the same drum (a run of them counts as one hit, above): that's not this hit's to play, so it stops
         there, and what follows doesn't turn into a roll or a flourish nobody played */
      for (let f = e.f + 1; f < e.end; f++)
        if ('LRSTXYBUHD'.includes(kindAt(f)) && cellAt(f) !== cellAt(e.f)) {
          e.end = f;
          break;
        }
      e.i = i;
      e.pk = out[i - 1]?.k;
      e.nk = e.flow && nx.f === e.end ? nx.k : null; // where the in-betweens lead, if they run straight into it
    });
    return out;
  })();
  /* the drawings leading into each hit, for its wind-up after a hit it didn't follow in the footage: the swings (and
     head tosses) right before its contact, when the footage runs straight into it. Strokes before it (a roll's) aren't
     a wind-up, so a hit with none there has no wind-up. */
  const LEAD = EV.map(e => {
    const p = EV[e.i - 1],
      none = { cells: [], from: null };
    if (!p || !p.flow) return none;
    const swing = [];
    for (let f = e.f - 1; f > p.f && 'Wh'.includes(kindAt(f)); f--) swing.unshift(cellAt(f));
    const cells = swing.filter((c, j) => c !== swing[j - 1]).slice(-3);
    return cells.length ? { cells, from: null } : none;
  });
  /* the doubles (D) have no swings of their own: in the footage each sits between two strokes, a left-cymbal hit and
     whatever he plays next. A double is the snare pose with the cymbal added, so it borrows the snare's motion: the
     swing he most often draws into a snare hit as its wind-up, and the one he most often draws out of one as its
     recoil (both #14, the right arm raised) */
  {
    const most = list => {
      const n = {};
      list.forEach(c => (n[c] = (n[c] || 0) + 1));
      return +Object.keys(n).sort((a, b) => n[b] - n[a])[0];
    };
    const snares = EV.filter(e => e.k === 'S'),
      into = most(snares.flatMap(e => LEAD[e.i].cells.slice(-1))),
      out = most(snares.flatMap(e => {
        for (let f = e.f + 1; f < e.end; f++) if ('Wh'.includes(kindAt(f))) return [cellAt(f)];
        return [];
      }));
    for (const e of EV)
      if (e.k === 'D') {
        if (!LEAD[e.i].cells.length) LEAD[e.i] = { cells: [into], from: null };
        e.extra = [out];
        e.nk = null; // its own in-betweens don't play, so they don't lead anywhere
      }
  }
  // a hit's drawings: its own frames from the footage (contact on), then any it borrows (extra)
  const own = v => v.end - v.f,
    len = v => own(v) + (v.extra ? v.extra.length : 0),
    frameOf = (v, k) => (k < own(v) ? cellAt(v.f + k) : v.extra[k - own(v)]);
  const FRAME_MS = 1000 / 30, // a frame of the footage
    DRAW_MS = 1000 / 24; // one of his drawings

  /* one sway of the listening loop, as drawing ids (sprite cells). The animator's loop (frames 427-451) also bounces
     the bass drum on the beat (drawings 82 83 86 87 88); idle shouldn't look like a kick, so only the drawings with
     a still drum, going one way and back. */
  const SWAY = [80, 81, 81, 81, 80, 84, 84, 84, 84, 85, 85, 85, 85, 84, 84, 84, 84];

  const img = new Image();
  let ready = false;
  img.onload = () => {
    ready = true;
    shown = -1;
  };
  img.onerror = () => (cv.hidden = true); // no sprite: the waveform takes the whole row
  img.src = 'assets/drummer.webp';

  // which hits each hand role can use
  const WANT = { S: 'S', SR: 'D', g: 'TXY', h: 'R', crash: 'L', up: 'U', head: 'H' }; // SR: snare + ride at once
  /* which hand strikes in each kind of hit, by his drawings (l: the arm on screen left, r: on screen right): the left
     drum and left cymbal are always his left hand, the ride his right; on the right drum a tap is his left hand
     reaching across (right arm up), X his right (left arm cocked) and Y, crossed over onto the snare, his left again.
     The rest use both or neither. */
  const HAND = { S: 'l', L: 'l', T: 'l', R: 'r', X: 'r', Y: 'l' };
  /* On a fast run (hand hits less than an 8th apart) the hands alternate, as a drummer's would, even across drums; where
     he never drew that hand on that drum, the stroke lands within its reach: a right-hand snare on the right drum,
     a left-hand ride or crash on the left cymbal. Slower notes take the drum's own hand. Ghost runs and snare rolls
     can also cross over (Y): with the bonus for carrying on where his footage goes, they walk his crossed-stick runs,
     right drum, crossed, right drum, crossed, as he drew them. */
  const SIDE = {
    S: { l: 'SY', r: 'X' },
    g: { l: 'TY', r: 'X' },
    h: { l: 'L', r: 'R' },
    crash: { l: 'L', r: 'R' },
  };

  /* What a step plays, without side effects (also used to look one step ahead):
     { kick, hands: role or null (hold) } or null (nothing new: a continuation or a tail) */
  function plan(e, i) {
    if (!e || e.hc) return null;
    if (e.s < 0) return { kick: false, hands: 'up' };
    const h = slices[e.s % N].hits,
      /* the hands' part. Every snare in the amen lands with the ride. One played heavy, on a quarter-note beat of the
         pattern or turned up, shows as the snare alone (his snare pose: the snare is what you hear); elsewhere, and
         turned down, as the double, both drums at once */
      strong = i % 4 === 0 || (e.v || 0) > 0,
      p = {
        kick: h.kick,
        hands: h.snare ? (h.ride && !strong ? 'SR' : 'S') : h.ghost ? 'g' : h.crash ? 'crash' : h.ride ? 'h' : null,
      };
    if ((p.hands === 'S' || p.hands === 'SR') && i % (SPB * BARS) >= SPB * BARS - 8 && (e.x || 1) === 1)
      p.hands = 'head'; // now and then
    return p;
  }
  // the step after i, as tick() will play it (a loop region jumps back at its end)
  function nextOf(card, i) {
    if (!card) return { e: { s: (i + 1) % N }, i: i + 1 }; // the ORIGINAL preview: the next slice
    let j = (i + 1) % LEN;
    if (card.loop && Math.floor(i / SPB) === card.loop.b && i % SPB === SPB - 1) j = card.loop.a * SPB;
    return { e: card.steps[j], i: j };
  }
  // what the hands play next and how many steps away, looking past steps that hold (up to four ahead)
  function nextHands(card, i) {
    for (let k = 1, j = i; k <= 4; k++) {
      const nx = nextOf(card, j),
        np = plan(nx.e, nx.i);
      if (np?.hands) return { role: np.hands, dist: k, e: nx.e, i: nx.i };
      j = nx.i;
    }
    return { role: null, dist: 4 };
  }

  let last = null, // the last hit used
    recent = [], // and the few before it, so the same drawing doesn't come round every time
    pending = null, // the hands' next hit, picked a step early: { i, s, role, v, state (as it was before) }
    hand = null, // the hand of the last hit ('l' / 'r', null for both or none)
    handAt = -Infinity; // and when it struck (ms, performance.now)
  const state = () => ({ last, recent, hand, handAt });
  const restore = st => ({ last, recent, hand, handAt } = st);
  /* frames: how many footage frames the gap to the next hand hit will show (a hit with fewer just stops and waits);
     t: when the hit lands, and stepMs, to tell a fast run (the other hand's turn) from a slower note */
  function pick(role, nextRole, seed, frames, t, stepMs) {
    // under an 8th since the last hand hit is a run (the cut sits between the gaps that occur, 1.5 and 2 steps, so a
    // frame's jitter in when a step is seen can't flip it)
    const turn = SIDE[role] && hand && t - handAt < 1.75 * stepMs ? (hand === 'l' ? 'r' : 'l') : null,
      want = (turn && SIDE[role][turn]) || WANT[role] || 'TX',
      nextWant = nextRole ? WANT[nextRole] || '' : '';
    let cands = EV.filter(v => want.includes(v.k));
    if (!cands.length) cands = EV.filter(v => v.k === 'L');
    let best = -Infinity, // scores can go below zero (penalties), and there is always a best
      ties = [];
    for (const v of cands) {
      // continue the footage where possible
      const sc =
        (last && v.i === last.i + 1 ? 4 : 0) +
        (last && v.pk === last.k ? 2 : 0) +
        (v.nk && nextWant.includes(v.nk) ? 3 : 0) +
        (len(v) >= Math.min(frames, 5) ? 2 : len(v) < Math.min(frames, 5) / 2 ? -3 : 0) - // enough motion for the gap
        (recent.includes(v.i) ? 2.5 : 0);
      if (sc > best) {
        best = sc;
        ties = [v];
      } else if (sc === best) ties.push(v);
    }
    last = ties[(((seed % ties.length) + ties.length) % ties.length)]; // a rest's seed is -1
    recent = [last.i, ...recent].slice(0, 6);
    hand = HAND[last.k] || null;
    handAt = t;
    return last;
  }

  const KICK_MS = 110; // how long a kick's swell takes to settle
  // the bass drum in each drawing, as [cx, cy, rx, ry] in cell pixels (from tools/drummer/drums.js)
  const DRUM = [
    [116, 141, 31, 30], [115, 141, 35, 34], [115, 141, 33, 32], [116, 142, 31, 30], [116, 142, 31, 30],
    [115, 141, 35, 34], [115, 141, 33, 32], [116, 142, 31, 30], [116, 142, 31, 30], [116, 142, 31, 30],
    [116, 142, 31, 30], [116, 142, 31, 30], [116, 142, 31, 30], [116, 142, 31, 30], [116, 142, 31, 30],
    [116, 142, 31, 30], [116, 142, 31, 30], [116, 142, 31, 30], [116, 142, 31, 30], [116, 142, 31, 30],
    [115, 141, 35, 34], [115, 141, 33, 32], [116, 142, 31, 30], [116, 142, 31, 30], [116, 142, 31, 30],
    [116, 142, 31, 30], [116, 142, 31, 30], [116, 142, 31, 30], [115, 141, 35, 34], [115, 141, 33, 32],
    [115, 141, 35, 34], [116, 141, 33, 32], [116, 142, 31, 30], [116, 142, 31, 30], [116, 142, 31, 30],
    [116, 141, 31, 30], [116, 141, 31, 30], [116, 141, 31, 30], [116, 141, 31, 30], [115, 141, 35, 34],
    [116, 142, 31, 30], [116, 142, 31, 30], [116, 142, 31, 30], [116, 142, 31, 30], [116, 142, 31, 30],
    [115, 141, 35, 34], [115, 141, 33, 32], [115, 141, 35, 34], [115, 141, 33, 32], [116, 141, 31, 30],
    [115, 141, 35, 34], [115, 141, 33, 32], [116, 142, 31, 30], [116, 142, 31, 30], [116, 142, 31, 30],
    [116, 142, 31, 30], [115, 141, 35, 34], [115, 141, 33, 32], [116, 142, 31, 30], [116, 142, 31, 30],
    [115, 141, 33, 32], [116, 142, 31, 30], [115, 141, 33, 32], [115, 141, 35, 34], [115, 141, 33, 32],
    [116, 142, 31, 30], [115, 141, 35, 34], [115, 141, 33, 32], [116, 142, 31, 30], [116, 142, 31, 30],
    [116, 142, 31, 30], [115, 141, 35, 34], [115, 141, 33, 32], [116, 142, 31, 30], [115, 141, 33, 32],
    [116, 142, 31, 30], [116, 141, 31, 30], [115, 141, 35, 34], [115, 141, 33, 32], [116, 142, 31, 30],
    [116, 141, 31, 30], [116, 141, 31, 30], [115, 141, 35, 34], [115, 141, 33, 32], [116, 142, 31, 30],
    [116, 142, 31, 30], [115, 141, 35, 34], [115, 141, 33, 32], [115, 141, 35, 34], [115, 141, 35, 34],
    [116, 142, 31, 30], [115, 141, 35, 34], [115, 141, 33, 32], [115, 141, 35, 34], [115, 141, 33, 32],
    [116, 142, 31, 30], [115, 141, 35, 34], [115, 141, 33, 32], [116, 142, 31, 30], [116, 142, 31, 30],
    [115, 141, 35, 34], [115, 141, 33, 32], [116, 142, 31, 30], [116, 142, 31, 30], [115, 141, 35, 34],
    [115, 141, 33, 32], [116, 142, 31, 30], [115, 141, 35, 34], [115, 141, 35, 34], [116, 141, 33, 32],
    [116, 142, 31, 30], [115, 141, 33, 32], [116, 142, 31, 30], [115, 141, 35, 34], [115, 141, 33, 32],
    [115, 141, 33, 32], [116, 141, 31, 30], [115, 141, 35, 34], [115, 141, 33, 32], [115, 141, 35, 34],
    [115, 141, 33, 32], [116, 142, 31, 30], [115, 141, 35, 34], [116, 141, 33, 32], [116, 141, 33, 32],
    [116, 142, 31, 30], [116, 141, 33, 32]
  ];
  const KICK_GROW = 0.06; // how much the bass drum swells on a kick
  let hitKey = '',
    cur = null, // hands: { t0, hits: [{ t, dur, v, rev }] }  times in ms
    kick = null, // foot: { t0, hits: [t] }
    shown = -1;
  window.drummerLog = null; // set to [] to record each step's decision (debugging)

  // where a hit's frames are at time el: from frame a0 (0 = the contact) on to his next hit (or its first n frames,
  // before a wind-up), spread over its duration
  function idx(h, el) {
    const n = h.n || len(h.v),
      a0 = h.a0 || 0;
    return Math.min(n - 1, a0 + Math.floor(((el - h.t) / (h.dur - (h.wd || 0))) * (n - a0)));
  }
  /* end hit h's gap with the wind-up into nv, its next hit, unless his own in-betweens already lead there. The contact
     keeps at least a frame; with time to spare his follow-through plays whole first, else he stays on the drum. */
  function leadInto(h, nv) {
    if (!nv || h.rev || (nv.i === h.v.i + 1 && h.v.end === nv.f)) return;
    const L = LEAD[nv.i];
    if (!L.cells.length || (L.from && L.from !== h.v.k)) return;
    const avail = h.dur - FRAME_MS;
    if (avail < FRAME_MS) return;
    const m = Math.min(L.cells.length, Math.max(1, Math.floor(avail / DRAW_MS)));
    h.lead = L.cells.slice(-m);
    h.wd = Math.min(m * DRAW_MS, avail);
    const n = len(h.v),
      room = Math.floor((h.dur - h.wd) / FRAME_MS);
    let on = 1; // frames still on the drum
    while (on < own(h.v) && kindAt(h.v.f + on) === h.v.k) on++;
    h.n = room >= n ? n : Math.max(1, Math.min(on, room));
  }
  // nothing new for the hands this step: the last hit's follow-through carries on from where it is, through the step
  function hold(stepMs, now) {
    if (!cur) return;
    const el = now - cur.t0,
      h = cur.hits[cur.hits.length - 1];
    if (h.wd || el < h.t + h.dur) return; // still moving: it was already spread over this gap (a wind-up waits on its
    // last drawing for the hit it leads into)
    const k = idx(h, el);
    if (k < len(h.v) - 1) cur.hits.push({ t: el, dur: stepMs, v: h.v, rev: h.rev, a0: k });
  }

  function trigger(e, i, stepMs, now, card) {
    const p = plan(e, i);
    if (!p) {
      if (e && !e.hc) hold(stepMs, now); // a kick's tail (a half-speed continuation is already spanned)
      return;
    }
    const x = e.x || 1,
      at = k => (k * stepMs) / x,
      times = () => Array.from({ length: x }, (_, k) => at(k));
    if (p.kick) kick = { t0: now, hits: times() };
    if (!p.hands) {
      hold(stepMs, now);
      return;
    }
    // the hit picked for this step a step ago, if this is the step it was picked for (a changed pattern drops it)
    let pre = pending;
    pending = null;
    if (pre && !(pre.i === i && pre.s === e.s && pre.role === p.hands)) {
      restore(pre.state);
      pre = null;
    }
    const nh = nextHands(card, i),
      span = stepMs * (e.hlen || 1), // half speed: the motion spreads over the whole stretched hit
      // the last (or only) stroke's follow-through runs until the hands' next hit, through any steps that hold
      // (not when reversed: its frames run backwards onto the contact, which has to land with the step's transient)
      tail = span / x + (e.r ? 0 : stepMs * Math.max(0, nh.dist - (e.hlen || 1))),
      hits = [];
    // a roll on a backbeat (snare + ride): the double, then the snare rolls on
    const roleAt = k => (k > 0 && p.hands === 'SR' ? 'S' : p.hands);
    for (let k = 0; k < x; k++) {
      // retrigs: each sub-hit is a hit of its own; the next one along in the footage alternates the hands
      const lastSub = k === x - 1,
        dur = lastSub ? tail : span / x,
        v =
          k === 0 && pre
            ? pre.v
            : pick(roleAt(k), lastSub ? nh.role : roleAt(k + 1), e.s + k, Math.round(dur / FRAME_MS), now + at(k), stepMs);
      hits.push({ t: at(k), dur, v, rev: !!e.r });
    }
    // pick the next hand hit now, as its own step would (same arguments, same state), so this one can wind up into it
    const ne = nh.e;
    if (nh.role && !e.r && !ne.r) {
      const nx = ne.x || 1,
        nspan = stepMs * (ne.hlen || 1),
        nn = nx > 1 ? null : nextHands(card, nh.i),
        ndur = nx > 1 ? nspan / nx : nspan + stepMs * Math.max(0, nn.dist - (ne.hlen || 1));
      pending = { i: nh.i, s: ne.s, role: nh.role, state: state() };
      const nRole2 = nx > 1 ? (nh.role === 'SR' ? 'S' : nh.role) : nn.role; // as its own step will (roleAt)
      pending.v = pick(nh.role, nRole2, ne.s, Math.round(ndur / FRAME_MS), now + nh.dist * stepMs, stepMs);
      leadInto(hits[x - 1], pending.v);
    }
    cur = { t0: now, hits };
    window.drummerLog?.push({
      i,
      s: e.s,
      hands: p.hands,
      kick: p.kick,
      hits: hits.map(h => h.v.f + h.v.k),
      hand: hits.map(h => HAND[h.v.k] || '-').join(''),
      lead: hits[x - 1].lead?.join(',') || '',
    });
  }
  // 1 right on a hit, easing to 0
  function decay(layer, ms, now) {
    if (!layer) return 0;
    const el = now - layer.t0;
    let a = 0;
    for (const t of layer.hits) if (el >= t && el - t < ms) a = Math.max(a, 1 - (el - t) / ms);
    return a * a;
  }

  // play one step now, outside any pattern (the key's examples; for checking his drawings)
  let poke = null;
  window.drummerPoke = e => {
    const stepMs = step16() * 1000;
    poke = { e, stepMs, t0: performance.now(), ms: Math.max(700, 5 * stepMs) };
  };
  function frameNow(now) {
    let playing = false;
    if (sourcePreview) {
      playing = true;
      const i = sourcePreview.index;
      if (i >= 0 && 'src:' + i !== hitKey) {
        hitKey = 'src:' + i;
        trigger({ s: i, x: 1 }, i, (60 / S.src / 4) * 1000, now, null);
      }
    } else if (P) {
      playing = true;
      const card = P.shownCard || P.card,
        i = card.nowI;
      if (i != null && card.id + ':' + i !== hitKey) {
        hitKey = card.id + ':' + i;
        trigger(card.steps[i], i, step16() * 1000, now, card);
      }
    } else if (poke && now - poke.t0 < poke.ms) {
      // a step played on its own (a click in the key): fresh, as if it were the only step of a pattern
      playing = true;
      if (!poke.done) {
        poke.done = true;
        cur = kick = last = pending = hand = null;
        recent = [];
        trigger(poke.e, 0, poke.stepMs, now, { steps: [poke.e], loop: null });
      }
    }
    if (!playing) {
      hitKey = '';
      cur = kick = last = pending = hand = null;
      recent = [];
      // stopped: the listening sway, one sway per two beats
      const beats2 = (2 * 60000) / UI.out;
      return SWAY[Math.floor(((now % beats2) / beats2) * SWAY.length)];
    }
    if (!cur) return SWAY[0];
    const el = now - cur.t0;
    let h = cur.hits[0];
    for (const q of cur.hits) if (q.t <= el) h = q;
    // the wind-up into the next hit, at the end of the gap
    if (h.wd && el - h.t >= h.dur - h.wd) {
      const w = h.lead;
      return w[Math.min(w.length - 1, Math.floor(((el - h.t - (h.dur - h.wd)) / h.wd) * w.length))];
    }
    // the hit's frames, from the contact to his next hit, spread over the step (reversed: they land on the contact)
    const n = len(h.v),
      k = idx(h, el);
    return frameOf(h.v, h.rev ? n - 1 - k : k);
  }

  function draw(k, thump) {
    const dpr = devicePixelRatio || 1,
      W = cv.clientWidth,
      H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    const bg = getComputedStyle(cv).backgroundColor;
    g.fillStyle = bg;
    g.fillRect(0, 0, cv.width, cv.height);
    // multiply: the drawing's white paper drops out, its ink sits on ours
    g.globalCompositeOperation = 'multiply';
    const s = Math.min(cv.width / FW, cv.height / FH),
      w = FW * s,
      h = FH * s,
      x0 = (cv.width - w) / 2,
      y0 = (cv.height - h) / 2;
    const sx = (k % COLS) * FW,
      sy = Math.floor(k / COLS) * FH;
    g.drawImage(img, sx, sy, FW, FH, x0, y0, w, h);
    // kick: only the bass drum swells, down and out from its rim, where his body and the stands meet it (so they stay
    // put). Its oval is wiped, with room for the swell and its line, and the drum redrawn larger in it.
    if (thump > 0) {
      const [cx, cy, rx, ry] = DRUM[k],
        grow = 1 + KICK_GROW * thump,
        ex = x0 + cx * s,
        rim = y0 + (cy - ry) * s,
        pad = 3 * s;
      g.save();
      g.beginPath();
      g.ellipse(ex, rim + ry * s * grow, rx * s * grow + pad, ry * s * grow + pad, 0, 0, 2 * Math.PI);
      g.clip();
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = bg;
      g.fillRect(0, 0, cv.width, cv.height);
      g.globalCompositeOperation = 'multiply';
      g.translate(ex, rim);
      g.scale(grow, grow);
      g.translate(-ex, -rim);
      g.drawImage(img, sx, sy, FW, FH, x0, y0, w, h);
      g.restore();
    }
    g.globalCompositeOperation = 'source-over';
  }

  (function loop() {
    const now = performance.now(),
      k = frameNow(now),
      thump = decay(kick, KICK_MS, now),
      key = [k, thump.toFixed(2), cv.clientWidth, cv.clientHeight, devicePixelRatio].join('|');
    if (ready && !cv.hidden && key !== shown) {
      shown = key;
      draw(k, thump);
    }
    requestAnimationFrame(loop);
  })();
})();
