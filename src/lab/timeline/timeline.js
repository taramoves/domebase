/* timeline — the chart.
   One horizontal axis, a dot per entry, and a hairline leader from each dot to a label carrying the
   year, what happened, who did it and where. Labels sit in four rows either side of the axis; the whole
   chart scrolls sideways. Black and hairlines only, the sheet's terms.

   The entries are the SAT dossier's, in its order. Where the dossier prints no year, the year is filled
   from our own records (work/db/model, read by work/timeline/check_db.py) or from the venue's or the
   work's own record on the web; every one of those years is listed against its source in
   work/timeline/SOURCE.md, and none of them is guessed. `recs` marks a work the database holds — the
   id and the title to search for — and the label's last line becomes the link into the database.

   Layout: a label wants about 252px, so the year scale (PX) and the four rows a side decide whether the
   entries of 2020-2024 can sit near their dots. At 90px a year they fan out from the cluster into the
   quieter axis either side of it, which is what the leaders are for. The year rules run every ten years,
   with the years between them ticked on the axis. */

(function () {
  const CHART = document.getElementById('chart');
  if (!CHART) return;

  /* ---------- the geometry ---------- */
  const Y0 = 1920, PX = 90, LEFT = 80;     /* a year in pixels: 1923 sits 350px in */
  const AXIS = 450;                        /* the axis, down from the top */
  const ROWH = 100, ROWS = 4, GAP = 26;    /* four label rows either side; GAP clears the axis */
  const LBL_W = 252, SLOT = 268, MAXRUN = 620;
  const CPL = 40;                          /* characters a line: set under the truth, so a label is
                                              only ever estimated taller than it draws */
  const AND = 2030;                        /* the axis runs a little past the last entry */
  const xAt = y => LEFT + (y - Y0) * PX;
  const END = xAt(AND) + 40;
  const WIDTH = END + 400;                 /* room for the last labels to fan past the axis */
  const H = AXIS + GAP + ROWS * ROWH + 42;
  const TOP = 8, BOT = H - 34;             /* the year rules' own labels */

  const E = [
    { y: 1923, what: 'the Model I, the first projection device for a geodesic dome',
      where: 'Deutsches Museum, Munich' },
    { y: 1957, ylab: 'late 1950s', what: 'VORTEX, experimental audiovisual concerts',
      who: 'Jordan Belson, Henry Jacobs', where: 'Morrison Planetarium, San Francisco' },
    { y: 1969, what: 'Rainbow Jam, a concert', where: 'planetarium, Salt Lake City' },
    { y: 2001, ylab: 'early 2000s', what: 'the Panoscope 360, built on anamorphosis',
      who: 'Luc Courchesne' },
    { y: 2003, ylab: '2003–2009',
      what: 'TOT [Open Territories], closing in the installation 4D-mix 3: motion detection, volumetric video, multi-channel sound' },
    { y: 2008, what: 'the Satmobile, an inflatable immersive dome', who: 'SAT',
      where: 'Quebec City, 400th anniversary' },
    { y: 2011, what: 'the Satosphere opens: 210° over a dance floor, 8 projectors, 93.5 channels',
      who: 'SAT', where: 'Montreal' },
    { y: 2015, what: 'NEST Immersion founded: mobile domes and immersive VJing tools',
      who: 'NEST Immersion', where: 'domes from 3 to 14 metres, and its own 360° software' },
    { y: 2018, what: 'Trajectories: sensing gloves drive a particle system in real time',
      who: 'Chikashi Miyama (JP/DE)', where: 'Satosphere, Montreal, in residence' },
    { y: 2018, what: 'Disorder: a dancer at the centre, 3D scans animated in real time',
      who: 'François Moncarey, Kevin Ramseier, Thomas Köppel (CH)' },
    { y: 2020, what: 'the FVL DOME: two domes given to digital art', who: 'C-Lab',
      where: 'Taipei, among the precursors of immersive telepresence' },
    { y: 2020, what: 'Reverie de Giverny, a 360° film of Monet\u2019s water lilies',
      who: 'Lynn Tomlinson' },
    { y: 2020, what: 'The Orchid and the Bee, a five-minute VR film cut for the dome',
      who: 'Frances Adair Mckenzie', where: 'National Film Board of Canada' },
    { y: 2021, what: 'an XR residency programme for indigenous artists', who: 'Wapikoni Mobile' },
    { y: 2021, what: 'Best of Earth, a cooperation of festivals', where: 'SAT joins in 2022' },
    { y: 2021, what: 'BEATS, a concert', where: 'MUTEK, Montreal' },
    { y: 2021, what: 'the dome of Plymouth Market Hall opens, on the Satosphere\u2019s model',
      who: 'Real Ideas', where: 'Plymouth, work for audiences with sensory processing disorders' },
    { y: 2021, what: 'Hubblo founded: a catalogue of immersive works and an 8m mobile dome',
      who: 'Hubblo', where: 'Montreal, distributing dome work internationally' },
    { y: 2021.5, ylab: '2021–2022', what: 'CLOUD BODIES, a choreographic performance made in residence',
      who: 'Allison Moore, Arthur Desmarteaux, Lucy Fandel', where: 'SAT, Montreal',
      recs: [['FM0207', 'Cloud Bodies']] },
    { y: 2022, what: 'the first artistic residency under a dome',
      who: 'Montreal Planetarium with the CAM', where: 'Montreal' },
    { y: 2022, what: 'Labyrinth takes the SAT Fest Excellence Award', who: 'Sergey Prokofyev',
      where: 'Satosphere, Montreal', recs: [['FM0606', 'Labyrinth']] },
    { y: 2022, what: 'Introduction to econometrics, a first immersive short',
      who: 'Kaminska (Lydia Yakonowsky)', recs: [['FM0560', 'Introductory Econometrics']] },
    { y: 2022, what: 'Antilogy: the collective and the public inside the same reality',
      who: 'susy.technology, with Paige Culley' },
    { y: 2022, what: "'THAN', during Nuit Blanche: interaction or contemplation",
      who: 'Maria Takeuchi (US/JP)', where: 'Satosphere, Montreal' },
    { y: 2022, what: 'SWARM', who: 'Maarten Isaac de Heer',
      where: 'experimental animation: off-screen space and scale play',
      recs: [['FM1003', 'Swarm']] },
    { y: 2022, what: 'One Sky, an international collaboration of six countries',
      where: 'planetariums', recs: [['FM0786', 'One Sky']] },
    { y: 2023, what: 'the Sphere opens, a dome built around content', where: 'Las Vegas' },
    { y: 2023, what: 'Entanglement, world premiere: speakers placed to answer the architecture',
      who: 'France Jobin, Markus Heckmann', where: 'Satosphere, Montreal, at MUTEK' },
    { y: 2023, what: 'UNION: Play the memory game: ancestral memory through touch',
      who: 'Nancy Lee, Kiran Bhumber (CA)', where: 'Satosphere, Montreal, at MUTEK' },
    { y: 2023, what: 'ENN', who: 'Maria Takeuchi' },
    { y: 2023, what: 'Biliminal and TRIAL', who: 'Collective Sans Perte; CLAUDE x Shin Hyejin',
      where: 'Melbourne International Film Festival' },
    { y: 2023, what: 'Entanglement, Metatact and Iwakura in a sold-out run',
      who: 'Jobin & Heckmann; Sakamoto & Urano; Demirel, Nagaya, Jones',
      where: 'Zeiss Planetarium, Berlin', recs: [['FM0571', 'Iwakura']] },
    { y: 2023, what: 'CLOUD BODIES, adapted out of the Montreal residence',
      who: 'Moore, Desmarteaux, Fandel', where: 'CULTVRLAB, Cardiff, at Fulldome UK',
      recs: [['FM0207', 'Cloud Bodies']] },
    { y: 2023, what: 'the Labos Immersifs, co-creation workshops on performing arts',
      who: 'AADN', where: 'Planetarium of Vaulx-en-Velin, Lyon' },
    { y: 2023, what: 'ASTRO at MUTEK Mexico, in the Digital Dome', who: 'Weidi Zhang',
      recs: [['FM0085', 'Astro']] },
    { y: 2023, what: 'Dancing with Dead Animals', who: 'Maarten Isaac de Heer',
      where: 'experimental animation', recs: [['FM0253', 'Dancing with Dead Animals']] },
    { y: 2023, what: 'CO-CREATE, a residency and the exhibition it ends in',
      who: 'World Creation Studio', where: 'Montreal, with SAT mentoring' },
    { y: 2024, what: 'Inner Island takes the SAT Fest jury special mention', who: 'Sergey Prokofyev',
      where: 'Satosphere, Montreal', recs: [['FM0546', 'Inner Island']] },
    { y: 2024, what: "the Satosphere's system rebuilt: sound now 93.4 channels", who: 'SAT',
      where: 'Satosphere, Montreal' },
    { y: 2024, what: 'the second Festival Sous dôme, 22–24 March',
      who: 'Cité des Sciences, with Jérémy Oury and 36°', where: 'Paris' },
    { y: 2024, what: 'Ignite!', who: 'Lynn Tomlinson', where: 'experimental animation',
      recs: [['FM0523', 'Ignite']] },
    { y: 2026, what: 'Space Explorers: The ISS Experience, filmed on the ISS',
      where: 'planetariums', recs: [['FM0965', 'Space Explorers']] }
  ];

  /* ---------- a label's height, from the text it carries ---------- */
  const lines = s => (s ? Math.max(1, Math.ceil(s.length / CPL)) : 0);
  const height = e => 8 + (lines((e.ylab || e.y) + ' ' + e.what) + lines(e.who) +
                           lines(e.where) + (e.recs ? 1 : 0)) * 13;

  /* ---------- place every label: the first row with room, nearest the axis first ---------- */
  const free = { up: [], dn: [] };
  for (let i = 0; i < ROWS; i++) { free.up.push(LEFT - 80); free.dn.push(LEFT - 80); }
  const placed = [];
  E.slice().sort((a, b) => a.y - b.y).forEach(function (e, i) {
    const x = xAt(e.y);
    let best = null;
    (i % 2 ? ['dn', 'up'] : ['up', 'dn']).forEach(function (side) {
      if (best) return;
      for (let r = 0; r < ROWS; r++) {
        const left = Math.max(free[side][r], x - 40);
        /* a label has to stay inside the chart, however far it fans */
        if (left - x <= MAXRUN && left + LBL_W <= WIDTH - 16) {
          best = { side: side, row: r, left: left }; return;
        }
      }
    });
    if (!best) {                                     /* the least-bad row: nothing is ever dropped */
      ['up', 'dn'].forEach(function (side) {
        for (let r = 0; r < ROWS; r++) {
          const left = Math.max(free[side][r], x - 40);
          if (!best || left < best.left) best = { side: side, row: r, left: left };
        }
      });
    }
    free[best.side][best.row] = best.left + SLOT;
    placed.push({
      e: e, x: x, left: best.left, h: height(e), side: best.side, row: best.row,
      top: best.side === 'up' ? AXIS - GAP - best.row * ROWH - height(e) : AXIS + GAP + best.row * ROWH
    });
  });

  /* ---------- draw ---------- */
  const svg = (tag, at) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(at).forEach(k => n.setAttribute(k, at[k]));
    return n;
  };
  const box = (cls, css) => {
    const n = document.createElement('div');
    n.className = cls;
    Object.keys(css).forEach(k => n.style[k] = css[k]);
    return n;
  };
  const recordLine = (recs) => {
    const r = box('r', {});
    recs.forEach(function (rec, i) {
      if (i) r.appendChild(document.createTextNode(', '));
      const a = document.createElement('a');
      a.href = '../../database/#v=films&in=title&q=' + encodeURIComponent(rec[1]).replace(/%20/g, '+');
      a.textContent = rec[0];
      r.appendChild(a);
    });
    r.appendChild(document.createTextNode(' in the database'));
    return r;
  };

  CHART.style.width = WIDTH + 'px';
  CHART.style.height = H + 'px';

  const g = svg('svg', { width: WIDTH, height: H, class: 'ink' });
  const line = (x1, y1, x2, y2, hair) => g.appendChild(svg('line', {
    x1: x1, y1: y1, x2: x2, y2: y2, stroke: hair ? '#c9c9c9' : '#000000', 'stroke-width': 1
  }));
  for (let y = Y0 + 5; y <= AND; y += 5) {
    const x = xAt(y);
    if (y % 10) line(x, AXIS - 6, x, AXIS + 6);                 /* the year, ticked on the axis */
    else line(x, TOP + 12, x, BOT - 6, true);                   /* the decade, ruled through */
  }
  line(LEFT, AXIS, END, AXIS);
  g.appendChild(svg('polygon', {
    points: END + ',' + AXIS + ' ' + (END - 9) + ',' + (AXIS - 4) + ' ' + (END - 9) + ',' + (AXIS + 4)
  }));
  CHART.appendChild(g);

  for (let y = Y0 + 5; y <= AND; y += 5) {
    const decade = !(y % 10);
    const t = box('yr' + (decade ? '' : ' half'), {
      left: (xAt(y) - 22) + 'px', top: (decade ? TOP : AXIS + 16) + 'px', width: '44px'
    });
    t.textContent = String(y);
    CHART.appendChild(t);
    if (decade) {
      const b = box('yr', { left: (xAt(y) - 22) + 'px', top: BOT + 'px', width: '44px' });
      b.textContent = String(y);
      CHART.appendChild(b);
    }
  }

  placed.forEach(function (p) {
    const l = box('lab', { left: p.left + 'px', top: p.top + 'px', width: LBL_W + 'px' });
    const what = box('w', {});
    const yl = document.createElement('b');
    yl.textContent = (p.e.ylab || String(p.e.y).replace('.5', '')) + ' ';
    what.appendChild(yl);
    what.appendChild(document.createTextNode(p.e.what));
    l.appendChild(what);
    if (p.e.who) { const w = box('a', {}); w.textContent = p.e.who; l.appendChild(w); }
    if (p.e.where) { const w = box('v', {}); w.textContent = p.e.where; l.appendChild(w); }
    if (p.e.recs) l.appendChild(recordLine(p.e.recs));
    CHART.appendChild(l);
    p.actual = l.offsetHeight;
    /* a label above the axis sits on its row's lower edge, whatever height it turned out to be */
    if (p.side === 'up') {
      p.top = AXIS - GAP - p.row * ROWH - p.actual;
      l.style.top = p.top + 'px';
    }
  });

  /* the dots and the leaders, once every label has its true height */
  placed.forEach(function (p) {
    g.appendChild(svg('circle', { cx: p.x, cy: AXIS, r: 4 }));
    const edge = p.side === 'up' ? p.top + p.actual : p.top;
    line(p.x, AXIS, p.x, edge);
    line(Math.min(p.x, p.left + 12), edge, Math.max(p.x, p.left + 12), edge);
  });

  document.querySelectorAll('.tlbar button').forEach(function (b) {
    b.addEventListener('click', function () {
      const wrap = document.querySelector('.tlwrap');
      const at = b.dataset.x ? +b.dataset.x : xAt(+b.dataset.y) - 80;
      wrap.scrollTo({ left: at, behavior: 'smooth' });
      wrap.focus();
    });
  });

  /* what a check can read back */
  CHART.datum = {
    entries: placed.length, labels: CHART.querySelectorAll('.lab').length, axisY: AXIS, rows: ROWS,
    x: { '1923': xAt(1923), '1957': xAt(1957), '1969': xAt(1969), '2011': xAt(2011), '2018': xAt(2018) },
    maxrun: Math.round(Math.max.apply(null, placed.map(p => Math.abs(p.left + 12 - p.x)))),
    maxlabel: Math.max.apply(null, placed.map(p => p.actual)),
    width: WIDTH
  };
})();
