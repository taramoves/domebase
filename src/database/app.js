
const DATA = /*__DATA__*/null;
const $ = s => document.querySelector(s);
const VIEWS = ['films', 'artists', 'editions'];               // the tabs on offer, in order
const DEFAULT_SORT = { screens: [], films: [], artists: [], editions: [], awards: [] };  // every view opens unsorted
const VIEWLABEL = {screens: 'screenings', films: 'films', artists: 'artists', editions: 'festivals', awards: 'awards'};
const S = {view:'films', q:'', sort:{}, widths:{}, collapsed:{},
           _tt:{}, _sub:{}, _score:{}, _fs:{}, _as:{}, _es:{}, _f:null,
           _parts:[], _hidden:0, _hiddenBy:[]};
const UKEY = 'fulldome_sections_collapsed';
const COLLAPSED_DEFAULT = {filters: true};   // the filter section starts minimised
function loadSections(){
  try { S.collapsed = Object.assign({}, COLLAPSED_DEFAULT,
                                    JSON.parse(localStorage.getItem(UKEY) || 'null') || {}); }
  catch (e) { S.collapsed = Object.assign({}, COLLAPSED_DEFAULT); }
}
function saveSections(){ try { localStorage.setItem(UKEY, JSON.stringify(S.collapsed)); } catch (e) {} }
function applySections(){
  const f = !!S.collapsed.filters;
  $('#filters').classList.toggle('hide', f);
  const b = $('#ftoggle');
  b.innerHTML = (f ? '▼' : '▲') + ' search &amp; filters';
  b.setAttribute('aria-expanded', String(!f));
}
function toggleSection(which){
  S.collapsed[which] = !S.collapsed[which];
  saveSections(); applySections(); render();
}
/* one line saying what is currently filtered, so a collapsed section is never a mystery */
function filterSummary(){
  const bits = [], v = id => ($('#' + id) || {}).value || '';
  if ($('#q').value.trim()) bits.push('“' + $('#q').value.trim() + '”');
  const sc = $('#scope').value; if (sc !== 'any') bits.push('in ' + sc);
  const fchosen = [...msValues('fest')];
  if (fchosen.length) bits.push(fchosen.join(' '));
  ['country', 'status', 'acat'].forEach(id => { const m = [...msValues(id)]; if (m.length) bits.push(m.join(' / ')); });
  const fl = $('#flag').value; if (fl) bits.push(fl === 'ANY' ? 'any flag state' : 'flag: ' + fl);
  if (v('y1') || v('y2')) bits.push('years ' + (v('y1') || '…') + '–' + (v('y2') || '…'));
  if (v('d1') || v('d2')) bits.push((v('d1') || '…') + '–' + (v('d2') || '…') + ' min');
  if (v('nfmin') || v('nfmax')) bits.push('at ' + (v('nfmin') || '…') + '–' + (v('nfmax') || '…') + ' festivals');
  [['awarded', 'awarded only'], ['vt', 'title varies'], ['va', 'artist spelling varies'],
   ['desc', 'has description'], ['fpage', 'has film page']]
    .forEach(([id, lbl]) => { if ($('#' + id).checked) bits.push(lbl); });
  if (!$('#people').checked) bits.push('organisations shown');
  return bits.length ? bits.join(' · ') : 'no filters';
}
const WKEY = 'fulldome_col_widths';
function loadWidths(){ try { S.widths = JSON.parse(localStorage.getItem(WKEY) || '{}') || {}; } catch (e) { S.widths = {}; } }
function saveWidths(){ try { localStorage.setItem(WKEY, JSON.stringify(S.widths)); } catch (e) {} }
function applyWidths(){
  const cols = COLS[S.view], w = S.widths[S.view] || {};
  const tbl = $('#tbl');
  const any = cols.some(c => w[c[0]]);
  tbl.classList.toggle('fixed', any);
  let cg = tbl.querySelector('colgroup');
  if (!cg){ cg = document.createElement('colgroup'); tbl.insertBefore(cg, tbl.firstChild); }
  cg.innerHTML = cols.map(c => `<col style="${w[c[0]] ? 'width:' + w[c[0]] + 'px' : ''}">`).join('');
}
function startResize(ev, grip){
  ev.preventDefault();
  const th = grip.closest('th'), view = S.view, col = grip.dataset.c;
  const startX = ev.clientX, startW = th.getBoundingClientRect().width;
  grip.classList.add('on');
  const move = e => {
    const wpx = Math.max(52, Math.round(startW + (e.clientX - startX)));
    S.widths[view] = S.widths[view] || {};
    S.widths[view][col] = wpx;
    applyWidths();
  };
  const up = () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    grip.classList.remove('on');
    S._justResized = true;                 // swallow the click that follows a drag
    setTimeout(() => { S._justResized = false; }, 0);
    saveWidths();
    render();
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}
for (const v in DEFAULT_SORT) S.sort[v] = DEFAULT_SORT[v].slice();
let LAST = null;
const festName = {}; DATA.editions.forEach(e => festName[e.festival_id] = e.festival_name);
const filmById = {}; DATA.films.forEach(f => filmById[f.master_id] = f);
const esc = s => (s==null?'':String(s)).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm = s => (s==null?'':String(s)).normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase();
function yearLabel(y){ return y; }

/* ---------- grouping ---------- */
const G = {};                       // master_id -> {films:[...], festivals:Set, artists:Set, firstRow}
DATA.films.forEach(f => G[f.master_id] = f);
function artistRows(a){
  const films = a.films.map(id => filmById[id]).filter(Boolean);
  return {artist:a, films,
    festivals:[...new Set(films.flatMap(f => f.festivals))].sort(),
    years:[...new Set(films.flatMap(f => f.years))].sort()};
}
const ART = {};
DATA.artists.forEach(a => ART[a.key] = a);
const ROWART = {};                       // row_id -> the artist keys credited on that row
DATA.artists.forEach(a => (a.row_ids || []).forEach(id => (ROWART[id] = ROWART[id] || []).push(a.key)));

/* every festival a film was programmed at, paired with that edition's year, read off the
   screening rows so the year travels with its festival */
const FPAIR = {};
DATA.screens.forEach(r => {
  const a = FPAIR[r.master_id] || (FPAIR[r.master_id] = []);
  if (!a.some(p => p.f === r.festival_id && p.y === r.edition_year)) a.push({f: r.festival_id, y: r.edition_year});
});
const shortYear = y => String(y == null ? '' : y).slice(-2);
function festPairs(mid){
  return (FPAIR[mid] || []).slice().sort((x, y) =>
    x.f === y.f ? (Number(x.y) - Number(y.y)) : (x.f < y.f ? -1 : 1));
}
function festYearList(mid){
  const a = festPairs(mid);
  return a.length ? a.map(p => esc(p.f) + '\u00a0' + esc(shortYear(p.y))).join(', ')
                  : '<span class="dim">no festival printed</span>';
}
function artistFestList(a){
  const m = new Map();
  (a.films || []).forEach(id => festPairs(id).forEach(p => {
    const ys = m.get(p.f) || []; ys.push(Number(p.y)); m.set(p.f, ys);
  }));
  const out = [...m.entries()].map(([f, ys]) => ({f: f, lo: Math.min(...ys), hi: Math.max(...ys)}))
                              .sort((x, y) => x.f < y.f ? -1 : 1);
  return out.map(x => esc(x.f) + '\u00a0' + esc(shortYear(x.lo)) + (x.hi > x.lo ? '–' + esc(shortYear(x.hi)) : ''))
            .join(', ');
}

/* ---------- search ----------
   A query is a list of terms. Each term may carry a field prefix, a negation and a mode:

     dream                 word-start match: finds Dream and Dreaming, never Daydream
     "dark side"           one phrase, matched word-to-word
     -dreamworks           exclude rows that match
     -"night sky"          exclude a phrase
     ~tron                 substring anywhere inside a word (finds electronic)
     title:tron            read only the film title, and the titles other festivals printed
     artist:kraas          only the credits
     country:germany       only the country fields
     award:janus           award name, status, category, format, jury comment
     section:fulldome      section / slot
     desc:pluto            the printed description / synopsis
     source:pluto          the source quote and file name
     flags:illegible       the row's data flags
     fest:jena             festival id
     year:2010-2016        edition year, exact or a range
     F00123                a row id
   An unprefixed term reads whichever field the in: selector names. Every term is
   AND-ed, and a term that begins with - must be absent. */
const FIELDS = {title:'title', film:'title', films:'title', name:'artist', artist:'artist', artists:'artist',
  director:'artist', credit:'artist', credits:'artist', country:'country', countries:'country',
  award:'award', awards:'award', jury:'award', status:'award', category:'award', section:'section',
  slot:'section', desc:'description', description:'description', synopsis:'description',
  source:'source', quote:'source', file:'source', flag:'flags', flags:'flags',
  fest:'fest', festival:'fest', festivals:'fest', year:'year', years:'year', id:'id', row:'id'};
const FIELDRE = new RegExp('^(' + Object.keys(FIELDS).sort((a, b) => b.length - a.length).join('|') + '):', 'i');
const ROWIDRE = /^f\d{3,}$/i;

function parseQuery(q){
  const out = []; const re = /(-?)("([^"]*)"|(\S+))/g; let m;
  while ((m = re.exec(q)) !== null){
    const neg = m[1] === '-';
    let t = m[3] !== undefined ? m[3] : m[4];
    let f = null, sub = false;
    const pm = FIELDRE.exec(t);                     // title:tron  ->  field title, term tron
    if (pm){ f = FIELDS[pm[1].toLowerCase()]; t = t.slice(pm[0].length); }
    if (t.charAt(0) === '~'){ sub = true; t = t.slice(1); }
    t = norm(t).trim();
    if (!t) continue;
    const part = {t: t, neg: neg, sub: sub, f: f};
    if (f === 'year'){                              // year:2016 or year:2010-2016
      const ym = /^(\d{4})\s*(?:-\s*(\d{4}))?$/.exec(t);
      if (ym){ part.lo = Number(ym[1]); part.hi = Number(ym[2] || ym[1]); }
      else part.f = null;                           // not a year after all: read it as words
    }
    if (!f && ROWIDRE.test(t)) part.f = 'id';
    out.push(part);
  }
  return out;
}

/* One token string per field, built on first use. Every token is preceded by a space, which
   turns a plain indexOf into a word-start test: ' kraas' hits Kraas and Kraasner, not Daykraas. */
function termText(scope){
  if (!S._tt[scope]) S._tt[scope] = DATA.screens.map(r => {
    const seen = new Set();
    norm(scopedText(r, scope)).split(/[^a-z0-9]+/).forEach(t => { if (t) seen.add(t); });
    return ' ' + [...seen].join(' ');
  });
  return S._tt[scope];
}
function termSub(scope){                            // the unfolded text, for ~anywhere terms
  if (!S._sub[scope]) S._sub[scope] = DATA.screens.map(r => norm(scopedText(r, scope)));
  return S._sub[scope];
}
function partHit(r, i, p, f){
  if (p.f === 'year') return p.lo == null ? true : (Number(r.edition_year) >= p.lo && Number(r.edition_year) <= p.hi);
  if (p.f === 'id')   return norm(r.row_id).indexOf(p.t) === 0;
  if (p.f === 'fest'){ const fid = norm(r.festival_id);
                       return fid === p.t || fid.split(/\s+/).some(w => w.indexOf(p.t) === 0); }
  const scope = p.f || f.scope;
  return p.sub ? termSub(scope)[i].indexOf(p.t) >= 0
               : termText(scope)[i].indexOf(' ' + p.t) >= 0;
}
function partWeight(p, f){                          // what a match is worth when ranking
  if (p.neg) return 0;
  if (p.f === 'year' || p.f === 'id' || p.f === 'fest') return 2;
  const scope = p.f || f.scope;
  let w = (scope === 'title' || scope === 'artist') ? 3 : (scope === 'any' ? 1 : 2);
  if (p.t.indexOf(' ') >= 0) w += 1;                // a phrase is stronger evidence than a word
  return w;
}
function foldLen(s){
  // length-preserving fold, so highlight offsets map back onto the printed text
  const f = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return {text: f, ok: f.length === s.length};
}
function hl(text, parts){
  const raw = text == null ? '' : String(text);
  if (!parts || !parts.length) return esc(raw);
  const toks = parts.filter(p => !p.neg && p.t.length > 1);
  if (!toks.length) return esc(raw);
  const f = foldLen(raw);
  if (!f.ok) return esc(raw);
  const marks = [];
  for (const p of toks){
    let i = f.text.indexOf(p.t);
    while (i >= 0){ marks.push([i, i + p.t.length]); i = f.text.indexOf(p.t, i + p.t.length); }
  }
  if (!marks.length) return esc(raw);
  marks.sort((a, b) => a[0] - b[0]);
  let out = '', pos = 0;
  for (const m of marks){
    if (m[0] < pos) continue;
    out += esc(raw.slice(pos, m[0])) + '<mark>' + esc(raw.slice(m[0], m[1])) + '</mark>';
    pos = m[1];
  }
  return out + esc(raw.slice(pos));
}

/* ---------- filtering ---------- */
function scopedText(r, scope){
  const fm = filmById[r.master_id] || {titles: [], artists: [], awards: []};
  switch (scope){
    case 'title':   return [r.film_title, fm.titles.join(' ')].join(' | ');
    case 'artist':  return [r.director, r.other_credits, r.production_company, r.award_recipients,
                            fm.artists.join(' ')].join(' | ');
    case 'country': return [r.country_of_origin, r.location_country].join(' | ');
    case 'award':   return [r.award, r.award_status, r.award_category, r.award_format,
                            r.jury_comment, r.award_recipients].join(' | ');
    case 'section': return [r.section, r.screening_info, r.festival_edition, r.edition_dates].join(' | ');
    case 'source':  return [r.evidence_quote, r.source_file].join(' | ');
    case 'description': return [r.description, r.external_description, r.description_source].join(' | ');
    case 'flags':   return r.flags || '';
    default:        return [r.row_id, r.film_title, r.director, r.other_credits, r.production_company,
                            r.country_of_origin, r.festival_name, r.festival_edition, r.edition_year,
                            r.section, r.award, r.award_status, r.award_recipients, r.jury_comment,
                            r.flags, r.screening_info, r.description, r.source_file, r.evidence_quote,
                            fm.titles.join(' '), fm.artists.join(' '), fm.awards.join(' ')].join(' | ');
  }
}
function numVal(id){ const v = $('#' + id).value.trim(); return v === '' ? null : Number(v); }
function activeFests(){ return msValues('fest'); }
function filterState(){
  return {ctry: msValues('country'), st: msValues('status'), acat: msValues('acat'),
          fsel: msValues('fest'), aw: $('#awarded').checked, fl: $('#flag').value,
          vt: $('#vt').checked, va: $('#va').checked, dsc: $('#desc').checked,
          lnk: $('#fpage').checked, scope: $('#scope').value, parts: parseQuery(S.q),
          nfmin: numVal('nfmin'), nfmax: numVal('nfmax'), y1: numVal('y1'), y2: numVal('y2'),
          d1: numVal('d1'), d2: numVal('d2')};
}
/* skip names the facet being counted: a facet must not count itself, or every unticked
   option would read as zero */
function passes(r, i, f, skip){
  if (skip !== 'fest'    && f.fsel.size && !f.fsel.has(r.festival_id)) return false;
  if (skip !== 'country' && f.ctry.size && !f.ctry.has(r.country_of_origin)) return false;
  if (skip !== 'status'  && f.st.size   && !f.st.has(r.award_status)) return false;
  if (skip !== 'acat'    && f.acat.size && !f.acat.has(r.award_category)) return false;
  if (f.aw && !(r.award || r.award_status).trim()) return false;
  if (f.fl === 'ANY'){ if (!(r.flags || '').trim()) return false; }
  else if (f.fl && (r.flags || '').indexOf(f.fl) < 0) return false;
  const fm = filmById[r.master_id] || {festivals: [], titles: []};
  const nf = fm.festivals.length;
  if (f.nfmin !== null && nf < f.nfmin) return false;
  if (f.nfmax !== null && nf > f.nfmax) return false;
  if (f.vt && !(fm.titles && fm.titles.length > 1)) return false;
  if (f.va && !fm.var_artist) return false;
  if (f.dsc && !(r.description || '').trim()) return false;
  if (f.lnk && !(r.film_url || '').trim()) return false;
  const yr = Number(r.edition_year) || 0;
  if (f.y1 !== null && yr < f.y1) return false;
  if (f.y2 !== null && yr > f.y2) return false;
  if (f.d1 !== null || f.d2 !== null){
    const dm = (r.dur_min === '' || r.dur_min == null) ? null : Number(r.dur_min);
    if (dm === null) return false;                 // no printed length: cannot verify a range
    if (f.d1 !== null && dm < f.d1) return false;
    if (f.d2 !== null && dm > f.d2) return false;
  }
  for (const p of f.parts){
    if (skip && p.f === skip) continue;            // a facet never counts its own query terms
    const hit = partHit(r, i, p, f);
    if (p.neg ? hit : !hit) return false;
  }
  return true;
}
function currentRows(){
  const f = S._f = filterState();
  const rank = f.parts.length > 0;
  const out = [];
  S._parts = f.parts;
  S._score = {}; S._fs = {}; S._as = {}; S._es = {};
  for (let i = 0; i < DATA.screens.length; i++){
    const r = DATA.screens[i];
    if (!passes(r, i, f, null)) continue;
    out.push(r);
    if (!rank) continue;
    let sc = 0;
    for (const p of f.parts) if (!p.neg && partHit(r, i, p, f)) sc += partWeight(p, f);
    S._score[r.row_id] = sc;
    const ek = r.festival_id + '|' + r.edition_year;
    if (!(sc <= (S._fs[r.master_id] || 0))) S._fs[r.master_id] = sc;
    if (!(sc <= (S._es[ek] || 0))) S._es[ek] = sc;
    const keys = ROWART[r.row_id];
    if (keys) keys.forEach(k => { if (!(sc <= (S._as[k] || 0))) S._as[k] = sc; });
  }
  return out;
}
/* Live facet counts. Each option shows how many rows it would leave, given the query and
   every other filter, so a combination that yields nothing is visible before you click it. */
function updateFacets(f){
  if (!f) return;
  const dim = {fest: r => r.festival_id, country: r => r.country_of_origin,
               status: r => r.award_status, acat: r => r.award_category};
  for (const d in dim){
    const got = {}; let any = 0;
    for (let i = 0; i < DATA.screens.length; i++){
      const r = DATA.screens[i];
      if (!passes(r, i, f, d)) continue;
      const v = dim[d](r); if (!v) continue;
      got[v] = (got[v] || 0) + 1; any++;
    }
    msboxes(d).forEach(b => {
      const sp = b.nextElementSibling;
      if (sp) sp.textContent = (b.dataset.label || b.value) + ' (' + (got[b.value] || 0) + ')';
    });
    const btn = document.querySelector('.msbtn[data-ms="' + d + '"]');
    if (btn) btn.dataset.count = any;
    msLabel(d);
  }
}
/* ---------- columns ---------- */
const COLS = {
 screens: [
  ['film','Film', r => r.film_title, r => `<div class="t">${hl(r.film_title, S._parts)}` +
      ((r.flags||'').trim() ? ' <span class="flag" title="this row carries a data flag - open it to read">⚑</span>' : '') +
      `</div>`],
  ['n_fest','At', r => (filmById[r.master_id] || {festivals: []}).festivals.length,
      r => { const n = (filmById[r.master_id] || {festivals: []}).festivals.length;
             return n > 1 ? `<span class="tag w">${n}</span>` : '<span class="dim">1</span>'; }],
  ['director','Artist', r => r.director || r.production_company,
      r => hl(r.director || '', S._parts) +
           (r.production_company ? `<div class="dim">${hl(r.production_company, S._parts)}</div>` : '')],
  ['festival','Festival', r => r.festival_id, r => `<span class="tag f">${esc(r.festival_id)}</span>`],
  ['edition_year','Year', r => r.edition_year, r => esc(r.edition_year)],
  ['section','Section', r => r.section, r => `<span class="dim">${esc(r.section)}</span>`],
  ['country_of_origin','Country', r => r.country_of_origin, r => esc(r.country_of_origin)],
  ['duration','Length', r => (r.dur_min === '' || r.dur_min == null) ? -1 : Number(r.dur_min),
      r => esc(r.duration)],
  ['award','Award', r => r.award_category || r.award || r.award_status,
      r => (r.award ? `<span class="tag a">${esc(r.award)}</span>` : '') +
           (r.award_status ? ` <span class="tag">${esc(r.award_status)}</span>` : '') +
           (r.award_category ? `<div><span class="tag c">${esc(r.award_category)}</span>` +
              (r.award_format ? ` <span class="tag">${esc(r.award_format)}</span>` : '') + `</div>` : '')],
  ['source_page','Source', r => r.source_file + ' p' + r.source_page,
      r => `<span class="dim">${esc((r.source_file||'').replace(/^.*__/,'').replace(/\.txt$/,''))} · p${esc(r.source_page)}</span>`],
 ],
  awards: [
  ['film','Film', r => r.film_title, r => `<div class="t">${hl(r.film_title, S._parts)}</div>
      <div class="dim">${esc(r.director || r.production_company || '')}</div>`],
  ['award_category','Award category', r => r.award_category,
      r => (r.award_category ? `<span class="tag c">${esc(r.award_category)}</span>` : '<span class="dim">—</span>')
           + (r.award_format ? ` <span class="tag">${esc(r.award_format)}</span>` : '')],
  ['award','Award as printed', r => r.award || r.award_status,
      r => (r.award ? `<span class="tag a">${esc(r.award)}</span>` : '') +
           (r.award_status ? ` <span class="tag">${esc(r.award_status)}</span>` : '')],
  ['award_status','Status', r => r.award_status, r => esc(r.award_status)],
  ['festival','Festival', r => r.festival_id, r => `<span class="tag f">${esc(r.festival_id)}</span>`],
  ['edition_year','Year', r => r.edition_year, r => esc(r.edition_year)],
  ['country_of_origin','Country', r => r.country_of_origin, r => esc(r.country_of_origin)],
  ['source_page','Source', r => r.source_file + ' p' + r.source_page,
      r => `<span class="dim">${esc((r.source_file||'').replace(/^.*__/,'').replace(/\.txt$/,''))} · p${esc(r.source_page)}</span>`],
 ],
 films: [
  ['canonical','Film', f => f.canonical, f => `<div class="t">${hl(f.canonical, S._parts)}</div>` +
      (f.titles.length > 1 ? `<div class="dim">also printed: ${f.titles.filter(t=>t!==f.canonical).map(esc).join(' · ')}</div>` : '') +
      (f.var_title ? '<div><span class="tag">title worded differently across festivals</span></div>' : '')],
  ['artists','Artists', f => f.artists.join('; '), f => f.artists.map(a => `<a class="link" data-go="artist::${esc(a)}">${esc(a)}</a>`).join('<span class="dim">, </span>')],
  ['n','# festivals', f => f.festivals.length, f => `<span class="tag w">${f.festivals.length}</span>`],
  ['festivals','Festivals', f => f.festivals.length, f => festYearList(f.master_id)],
  ['countries','Country', f => f.countries.join(' '), f => esc(f.countries.join(', '))],
  ['awards','Awards', f => f.awards.join(' '),
      f => f.awards.slice(0,3).map(a => `<span class="tag a">${esc(a)}</span>`).join(' ') + (f.awards.length>3?`<span class="tag">+${f.awards.length-3}</span>`:'')],
  ['n_screens','Screenings', f => f.n_screens, f => esc(f.n_screens)],
 ],
 artists: [
  [ 'name','Artist', a => a.names[0], a => `<div class="t">${hl(a.names[0], S._parts)}</div>` +
      (a.names.length>1?`<div class="dim">also printed: ${a.names.slice(1).map(esc).join(' · ')}</div>`:'')],
  ['nfil','Films', a => a.films.length, a => esc(a.films.length)],
  ['festivals','Festivals', a => a.festivals.length, a => artistFestList(a)],
  ['nawards','Awards', a => a.n_awards, a => a.n_awards ? `<span class="tag a">${a.n_awards}</span>` : ''],
  ['films','Film list', a => a.films.join(' '),
      a => a.films.map(id => filmById[id] ? `<span class="tag">${esc(filmById[id].canonical)}</span>` : '').join(' ')],
 ],
 editions: [
  ['festival_id','Festival', e => festName[e.festival_id] || e.festival_id,
      e => `<span class="tag f">${esc(e.festival_id)}</span> ${esc(festName[e.festival_id]||'')}`],
  ['year','Year', e => e.year, e => esc(e.year)],
  ['dates','Dates', e => e.dates.join('; '), e => esc(e.dates.join('; '))],
  ['city','Location', e => (e.city.concat(e.country)).join(', '), e => esc(e.city.concat(e.country).join(', '))],
  ['n','Films', e => e.n, e => esc(e.n)],
  ['n_award','Award rows', e => e.n_award, e => e.n_award ? `<span class="tag a">${e.n_award}</span>` : '<span class="dim">none in source</span>'],
  ['sections','Sections', e => e.sections.join(' '), e => `<span class="nw">${e.sections.length}</span> section${e.sections.length===1?'':'s'}`],
  ['cats','Award categories', e => Object.keys(e.award_cats || {}).join(' '),
      e => { const c = e.award_cats || {}; const ks = Object.keys(c);
             return ks.length ? ks.map(k => `<span class="tag c">${esc(k)} ${c[k]}</span>`).join(' ')
                              : '<span class="dim">no award data printed</span>'; }],
 ],
};
function getter(view, col){
  const c = {screens:r=>r, films:f=>f, artists:a=>a, editions:e=>e}[view];
  return (x) => { const coldef = COLS[view].find(c2 => c2[0] === col); return coldef ? coldef[2](x) : ''; };
}

/* ---------- render ---------- */
function f_parts_now(){ return (S._f && S._f.parts) ? S._f.parts.length > 0 : false; }
function render(){
  const view = S.view, cols = COLS[view];
  const rows = currentRows();                       // filters always apply, all four views
  let items;
  if (view === 'screens') items = rows;
  else if (view === 'awards') items = rows.filter(r => (r.award || r.award_status || '').trim());
  else if (view === 'films'){
    const ids = new Set(rows.map(r => r.master_id));
    items = DATA.films.filter(f => ids.has(f.master_id));
    if (!(S.sort[view] || []).length)
      items = items.slice().sort((a, b) => String(a.canonical).localeCompare(String(b.canonical), undefined, {sensitivity: 'base'}));
  } else if (view === 'artists'){
    const ids = new Set(rows.map(r => r.row_id));
    items = DATA.artists.filter(a => a.row_ids.some(id => ids.has(id)));
    if ($('#people').checked) items = items.filter(a => !a.org);
  } else {
    const fset = new Set(rows.map(r => r.festival_id + '|' + r.edition_year));
    items = DATA.editions.filter(e => fset.has(e.festival_id + '|' + e.year));
  }
  const stack = S.sort[view] || [];
  S._hidden = 0; S._hiddenBy = [];
  if (stack.length){
    // compare on the first key, break ties on the next, and so on
    const keys = stack.map(o => { const c = cols.find(c2 => c2[0] === o.c); return c ? {k: c[2], d: o.dir === 'desc' ? -1 : 1} : null; })
                      .filter(Boolean);
    if (keys.length){
      // sorting by a column hides every row that has nothing in it
      const blank = v => v == null || String(v).trim() === '' || (typeof v === 'number' && v === 0);
      const before = items.length;
      items = items.filter(x => keys.every(key => !blank(key.k(x))));
      S._hidden = before - items.length;
      S._hiddenBy = keys.map(key => { const c = cols.find(c2 => c2[2] === key.k); return c ? c[1] : ''; })
                        .filter(Boolean);
      items = items.slice().sort((a, b) => {
        for (const key of keys){
          const A = key.k(a), B = key.k(b);
          const na = parseFloat(A), nb = parseFloat(B);
          let c;
          if (typeof A === 'number' && typeof B === 'number') c = A - B;
          else if (!isNaN(na) && !isNaN(nb) && /^[\d.]+$/.test(String(A)) && /^[\d.]+$/.test(String(B))) c = na - nb;
          else c = String(A).localeCompare(String(B), undefined, {sensitivity:'base'});
          if (c) return c * key.d;
        }
        return 0;
      });
    }
  }
  // a query ranks its own results unless a column sort was asked for
  const ranked = !stack.length && f_parts_now();
  if (ranked){
    const sc = view === 'films'   ? (x => S._fs[x.master_id] || 0)
             : view === 'artists' ? (x => S._as[x.key] || 0)
             : view === 'editions'? (x => S._es[x.festival_id + '|' + x.year] || 0)
             :                      (x => S._score[x.row_id] || 0);
    const tie = view === 'films'
      ? (a, b) => String(a.canonical).localeCompare(String(b.canonical), undefined, {sensitivity: 'base'})
      : view === 'artists'
      ? (a, b) => String(a.names[0]).localeCompare(String(b.names[0]), undefined, {sensitivity: 'base'})
      : (a, b) => 0;
    items = items.slice().sort((a, b) => (sc(b) - sc(a)) || tie(a, b));
  }
  const th = cols.map(c => {
    const i = (S.sort[view] || []).findIndex(o => o.c === c[0]);
    const on = i >= 0, dir = on ? S.sort[view][i].dir : 'asc';
    const badge = on ? `<span class="ar"> ${dir === 'desc' ? '▼' : '▲'}${S.sort[view].length > 1 ? (i + 1) : ''}</span>` : '';
    return `<th data-c="${c[0]}" title="click to sort by this column, shift-click to add it as a second or third key">` +
           `${esc(c[1])}${badge}<span class="rsz" data-c="${c[0]}" title="drag to resize this column · double-click to reset"></span></th>`;
  }).join('');
  $('#tbl thead').innerHTML = `<tr>${th}</tr>`;
  const body = items.slice(0, 4000).map(x => {
    const tds = cols.map(c => {
      const k = c[0];
      const cls = k === 'source_page' ? ' class="src"'
        : (['years','edition_year','duration','n','n_screens','nfil','nawards','n_award','year','n_fest','n_artists']
            .includes(k) ? ' class="nw"' : '');
      return `<td${cls}>${c[3](x)}</td>`;
    }).join('');
    return `<tr class="row" data-id="${view==='screens'?x.row_id:(view==='films'?x.master_id:(view==='artists'?x.key:(x.festival_id+'|'+x.year)))}">${tds}</tr>`;
  }).join('');
  $('#tbl tbody').innerHTML = body || '';
  applyWidths();

  LAST = {view: view, items: items};
  const total = {screens:DATA.screens.length, awards:rows.filter(r => (r.award || r.award_status || '').trim()).length,
                 films:DATA.films.length, artists:DATA.artists.length,
                 editions:DATA.editions.length}[view];
  $('#count').textContent = `${items.length} of ${total} ${VIEWLABEL[view] || view}` +
    (S._hidden ? ` · ${S._hidden} hidden, nothing in ${S._hiddenBy.join(' or ')}` : '') +
    (items.length > 4000 ? ' (showing first 4000)' : '');
  const stext = (S.sort[view] || []).map(o => {
    const c = cols.find(c2 => c2[0] === o.c);
    return c ? `${esc(c[1])} ${o.dir === 'desc' ? '▼' : '▲'}` : null;
  }).filter(Boolean).join(' · ');
  $('#sortinfo').innerHTML = stext
    ? `<span class="dim">sorted:</span> <b>${stext}</b><span class="sx" id="clrsort" title="clear sort">clear</span>`
    : (ranked
       ? '<span class="dim">sorted:</span> <b>best match ▼</b><span class="dim"> · click a heading to reorder</span>'
       : '<span class="dim" title="rows are in the order the source data is stored - click a heading to sort">unsorted</span>');
  $('#fsum').textContent = S.collapsed.filters ? filterSummary() : '';
  updateFacets(S._f);
  const cs = $('#clrsort');
  if (cs) cs.onclick = () => { S.sort[view] = []; changed(); };
  const anyw = Object.keys(S.widths[view] || {}).length;
  $('#sortinfo').insertAdjacentHTML('beforeend',
    anyw ? `<span class="sx" id="clrwidths" title="back to automatic column widths">reset widths</span>` : '');
  const cw = $('#clrwidths');
  if (cw) cw.onclick = () => { S.widths[view] = {}; saveWidths(); render(); };
}
/* ---------- multiselect filters ---------- */
const MSNOUN = {fest:'festivals', country:'countries', status:'award statuses', acat:'award categories'};
function buildMS(host, id, pairs){
  const h = $(host); if (!h) return;
  h.classList.add('ms');
  h.innerHTML = '<button class="msbtn" data-ms="' + id + '" aria-expanded="false"></button>' +
    '<span class="msmenu" data-ms="' + id + '" hidden>' +
      '<span class="msrow"><button class="msall" data-ms="' + id + '">all</button>' +
      '<button class="msnone" data-ms="' + id + '">none</button></span>' +
      pairs.map(p => '<label><input type="checkbox" data-ms="' + id + '" value="' + esc(p[0]) + '" ' +
                     'data-label="' + esc(p[1]) + '">' +
                     '<span>' + esc(p[1]) + '</span></label>').join('') +
    '</span>';
  msLabel(id);
}
function msboxes(id){ return [...document.querySelectorAll('.msmenu[data-ms="' + id + '"] input[type=checkbox]')]; }
function msValues(id){ return new Set(msboxes(id).filter(i => i.checked).map(i => i.value)); }
function msSet(id, arr){
  const s = new Set(arr || []);
  msboxes(id).forEach(i => { i.checked = s.has(i.value); });
  msLabel(id);
}
function msClear(id){ msSet(id, []); }
function msLabel(id){
  const b = document.querySelector('.msbtn[data-ms="' + id + '"]'); if (!b) return;
  const picked = [...msValues(id)], total = msboxes(id).length;
  const base = !picked.length ? 'all ' + (MSNOUN[id] || '')
             : picked.length === 1 ? picked[0]
             : picked.length + ' of ' + total + ' ' + (MSNOUN[id] || '');
  const n = b.dataset.count;
  b.textContent = base + (n === '' || n === undefined ? '' : ' · ' + n + ' row' + (n === '1' ? '' : 's'));
  b.title = picked.join(', ') || 'nothing narrowed here';
}
function closeMenus(){
  document.querySelectorAll('.msmenu').forEach(m => { m.hidden = true; });
  document.querySelectorAll('.msbtn').forEach(b => b.setAttribute('aria-expanded', 'false'));
}
function wireMS(){
  document.addEventListener('click', ev => {
    const btn = ev.target.closest('.msbtn');
    if (btn){
      const id = btn.dataset.ms, menu = document.querySelector('.msmenu[data-ms="' + id + '"]');
      const wasOpen = menu && !menu.hidden;
      closeMenus();
      if (!wasOpen && menu){ menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
      return;
    }
    const all = ev.target.closest('.msall'), none = ev.target.closest('.msnone');
    if (all || none){
      const id = (all || none).dataset.ms;
      msboxes(id).forEach(i => { i.checked = !!all; });
      msLabel(id); changed();
    }
  });
  document.addEventListener('change', ev => {
    const c = ev.target.closest('.msmenu input[type=checkbox]'); if (!c) return;
    msLabel(c.dataset.ms); changed();
  });
}
function setup(){
  loadWidths();
  loadSections();
  DATA.editions.forEach(e => { if (!festName[e.festival_id]) festName[e.festival_id] = e.festival_name; });
  const counts = {};
  DATA.screens.forEach(r => counts[r.festival_id] = (counts[r.festival_id] || 0) + 1);
  const fids = [...new Set(DATA.screens.map(r => r.festival_id))].sort();
  buildMS('#ms-fest', 'fest', fids.map(f => [f, f]));   // the live count supplies the number
  $('#flag').innerHTML = '<option value="">any flag state</option><option value="ANY">rows carrying any flag</option>' +
    (DATA.flag_opts || []).map(o => `<option value="${esc(o[0])}">${esc(o[0])} (${o[1]})</option>`).join('');
  const acat = {};
  DATA.screens.forEach(r => { if (r.award_category) acat[r.award_category] = (acat[r.award_category] || 0) + 1; });
  buildMS('#ms-acat', 'acat', Object.keys(acat).sort((a, b) => acat[b] - acat[a])
    .map(k => [k, k + ' (' + acat[k] + ')']));
  buildMS('#ms-country', 'country',
    [...new Set(DATA.screens.map(r => r.country_of_origin))].filter(Boolean).sort().map(c => [c, c]));
  buildMS('#ms-status', 'status',
    [...new Set(DATA.screens.map(r => r.award_status))].filter(Boolean).sort().map(s => [s, s]));
  wire();
  applyState();
  applySections();
  render();
}
const debounce = (fn, ms) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };
const slowChanged = debounce(changed, 130);      // typing re-renders 1,662 rows; wait for a pause
function wire(){
  ['q','scope','nfmin','nfmax','y1','y2','d1','d2',
   'awarded','flag','vt','va','desc','fpage','people'].forEach(id => {
    $('#' + id).addEventListener('input', slowChanged);
    $('#' + id).addEventListener('change', changed);
  });
  const qh = $('#qhint');
  if (qh){
    $('#q').addEventListener('focus', () => { qh.hidden = false; });
    $('#q').addEventListener('blur',  () => { if (!$('#q').value.trim()) qh.hidden = true; });
  }
  wireMS();
  document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
    S.view = b.dataset.v;
    if (!S.sort[S.view]) S.sort[S.view] = (DEFAULT_SORT[S.view] || []).slice();
    document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
    changed();
  });
  $('#tbl').addEventListener('click', ev => {
    if (ev.target.closest('.rsz')) return;
    const t = ev.target.closest('th');
    if (t){
      const c = t.dataset.c;
      const st = S.sort[S.view] || (S.sort[S.view] = []);
      const i = st.findIndex(o => o.c === c);
      if (ev.shiftKey){                          // shift-click builds the chain: add, then toggle, then remove
        if (i < 0) st.push({c: c, dir: 'asc'});
        else if (st[i].dir === 'asc') st[i].dir = 'desc';
        else st.splice(i, 1);
      } else if (i === 0){                        // plain click on the primary key reverses it
        st[0].dir = st[0].dir === 'asc' ? 'desc' : 'asc';
      } else if (i > 0){                          // plain click on a secondary key promotes it
        st.unshift(st.splice(i, 1)[0]);
      } else {
        S.sort[S.view] = [{c: c, dir: 'asc'}];
      }
      changed(); return;
    }
    const row = ev.target.closest('tr.row'); if (!row) return;
    if (ev.target.classList.contains('link')) return;
    openDetail(row.dataset.id);
  });
  // one document-level handler, so cross-links work in the table AND inside the detail panel
  document.addEventListener('mousedown', ev => {
    const grip = ev.target.closest('.rsz');
    if (grip) startResize(ev, grip);
  });
  document.addEventListener('click', ev => {
    if (S._justResized) return;
    const a = ev.target.closest('[data-go]'); if (!a) return;
    ev.preventDefault(); ev.stopPropagation();
    const parts = a.dataset.go.split('::'), kind = parts[0], val = parts.slice(1).join('::');
    if (kind === 'film') openFilm(val);
    else if (kind === 'artist') openArtist(val);
    else if (kind === 'screen') openScreen(val);
    else if (kind === 'fest'){
      msClear('fest'); msSet('fest', [val]);
      clearControls(true); changed();
    }
  }, true);
  document.addEventListener('dblclick', ev => {
    const grip = ev.target.closest('.rsz'); if (!grip) return;
    if (S.widths[S.view]) delete S.widths[S.view][grip.dataset.c];
    saveWidths(); render();
  });
  $('#ftoggle').onclick = () => toggleSection('filters');
  $('#reset').onclick = () => { clearControls(false); changed(); };
  $('#link').onclick = async () => {
    const btn = $('#link');
    let ok = false;
    try { await navigator.clipboard.writeText(location.href); ok = true; }
    catch (e) {
      try {                                     // works without window focus, e.g. in a preview pane
        const ta = document.createElement('textarea');
        ta.value = location.href;
        ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
        document.body.appendChild(ta); ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch (e2) { ok = false; }
    }
    btn.textContent = ok ? 'copied' : 'copy blocked — use the address bar';
    setTimeout(() => { btn.textContent = 'copy link'; }, 1800);
  };
  $('#csv').onclick = exportCSV;
  document.addEventListener('click', ev => {
    if (ev.target.closest('.ms')) return;          // the multiselects look after themselves
    closeMenus();
    const d = $('#d');
    if (d.classList.contains('on') && !ev.target.closest('#d') && !ev.target.closest('tr.row')) closeD();
  });
  window.addEventListener('hashchange', () => { applyState(); render(); });
}
function clearControls(keepFests){
  ['nfmin','nfmax','y1','y2','d1','d2'].forEach(id => $('#' + id).value = '');
  ['country','status','acat'].forEach(msClear);
  $('#scope').value = 'any';
  ['awarded','vt','va','desc','fpage'].forEach(id => $('#' + id).checked = false);
  $('#flag').value = '';
  $('#people').checked = true;
  if (!keepFests) msClear('fest');
  S.q = ''; $('#q').value = '';
  S._tt = {}; S._sub = {};
}
function changed(){ S.q = $('#q').value; syncHash(); render(); }
function encodeState(){
  const p = new URLSearchParams();
  p.set('v', S.view);
  if (S.q) p.set('q', S.q);
  if ($('#scope').value !== 'any') p.set('in', $('#scope').value);
  const fs = [...activeFests()]; if (fs.length) p.set('fest', fs.join(','));
  const st = S.sort[S.view] || [];
  p.set('s', st.length ? st.map(o => o.c + ':' + o.dir).join(',') : 'none');
  ['country','status','acat'].forEach(id => { const m = [...msValues(id)]; if (m.length) p.set(id, m.join('|')); });
  ['nfmin','nfmax','y1','y2','d1','d2'].forEach(id => {
    const v = $('#' + id).value.trim(); if (v) p.set(id, v);
  });
  ['awarded','vt','va','desc','fpage','people'].forEach(id => p.set(id, $('#' + id).checked ? '1' : '0'));
  if ($('#flag').value) p.set('flag', $('#flag').value);
  return p.toString();
}
function applyState(){
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  const wantv = p.get('v');
  S.view = VIEWS.includes(wantv) ? wantv : 'films';
  S.q = p.get('q') || '';
  $('#q').value = S.q;
  $('#scope').value = p.get('in') || 'any';
  msClear('fest'); msSet('fest', (p.get('fest') || '').split(',').filter(Boolean));
  ['country','status','acat'].forEach(id => {
    msClear(id); msSet(id, (p.get(id) || '').split('|').filter(Boolean));
  });
  ['nfmin','nfmax','y1','y2','d1','d2'].forEach(id => $('#' + id).value = p.get(id) || '');
  ['awarded','vt','va','desc','fpage','people'].forEach(id =>
    $('#' + id).checked = p.has(id) ? p.get(id) === '1' : (id === 'people'));
  $('#flag').value = p.get('flag') || '';
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === S.view));
  S._tt = {}; S._sub = {};
  const sv = p.get('s');
  if (sv === 'none') S.sort[S.view] = [];
  else if (sv) S.sort[S.view] = sv.split(',').map(x => {
    const parts = x.split(':');
    return {c: parts[0], dir: parts[1] === 'desc' ? 'desc' : 'asc'};
  });
  else S.sort[S.view] = (DEFAULT_SORT[S.view] || []).slice();
}
function syncHash(){
  const h = '#' + encodeState();
  if (h !== location.hash) history.replaceState(null, '', h);
}
function exportCSV(){
  const view = (LAST || {}).view || S.view, items = (LAST || {}).items || [];
  if (!items.length){ return; }
  const flat = v => Array.isArray(v) ? v.join('; ') : (v == null ? '' : v);
  let out;
  if (view === 'screens') out = items;
  else if (view === 'awards') out = items.map(r => ({
    film: r.film_title, award_category: r.award_category, award_format: r.award_format,
    award_as_printed: r.award, award_status: r.award_status, festival: r.festival_id,
    year: r.edition_year, country: r.country_of_origin, artist: r.director || r.production_company,
    source: (r.source_file || '') + ' p' + r.source_page}));
  else if (view === 'films') out = items.map(f => ({
    master_id: f.master_id, film: f.canonical, title_variants: f.titles.join('; '),
    artists: f.artists.join('; '), festivals_at: f.festivals.length, festivals: f.festivals.join('; '),
    years: f.years.join('; '), countries: f.countries.join('; '), awards: f.awards.join('; '),
    screenings: f.n_screens, flags: f.flags.join('; ')}));
  else if (view === 'artists') out = items.map(a => ({
    artist: a.names[0], name_variants: a.names.join('; '), kind: a.org ? 'org/place' : 'person',
    films: a.films.length, film_titles: a.films.map(id => filmById[id] ? filmById[id].canonical : '').join('; '),
    festivals: a.festivals.join('; '), years: a.years.join('; '), awards: a.n_awards}));
  else out = items.map(e => ({
    festival_id: e.festival_id, festival: festName[e.festival_id] || '', year: e.year,
    dates: e.dates.join('; '), location: e.city.concat(e.country).join(', '),
    films: e.n, award_rows: e.n_award, sections: e.sections.join('; ')}));
  const cols = Object.keys(out[0]);
  const q = v => '"' + String(flat(v)).replace(/"/g, '""') + '"';
  const blob = new Blob([[cols.join(','), ...out.map(r => cols.map(c => q(r[c])).join(','))].join('\n')],
                        {type: 'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'fulldome_' + view + '_view.csv'; a.click();
}
function closeD(){ $('#d').classList.remove('on'); }
function kv(pairs){ return `<div class="kv">${pairs.filter(p => p[1]).map(p => `<div>${esc(p[0])}</div><div>${p[1]}</div>`).join('')}</div>`; }
function openDetail(id){
  if (id && id.startsWith('FM')) return openFilm(id);
  if (id && id.includes('|')) { const [f, y] = id.split('|'); return openFestival(f, y); }
  if (id && ART[id]) return openArtist(id);
  openScreen(id);
}
function openScreen(rid){
  const r = DATA.screens.find(x => x.row_id === rid); if (!r) return;
  const fm = filmById[r.master_id] || {titles:[], festivals:[], artists:[], years:[], awards:[]};
  $('#dc').innerHTML = `
    <h2>${esc(r.film_title)}</h2>
    <div class="dim">${esc(r.director || r.production_company || 'no artist credit printed')}</div>
    <h3>Screening</h3>
    ${kv([['Festival', `<span class="tag f">${esc(r.festival_name)}</span>`],
          ['Edition', esc(r.festival_edition) + (r.edition_dates ? ' · ' + esc(r.edition_dates) : '')],
          ['Year', esc(r.edition_year)],
          ['Location', esc([r.location_city, r.location_country].filter(Boolean).join(', '))],
          ['Section', esc(r.section)],
          ['Screening info', esc(r.screening_info)],
          ['Length', esc(r.duration)],
          ['Country', esc(r.country_of_origin)]])}
    <h3>Credits</h3>
    ${kv([['Director / artist', esc(r.director)], ['Other credits', esc(r.other_credits)],
          ['Production', esc(r.production_company)]])}
    ${(r.description || '').trim() ? `<h3>Description, as printed in the programme</h3>
      <div class="desc">${esc(r.description)}</div>
      <div class="dim">${esc(r.description_source)}${r.description_page ? `, page ${esc(r.description_page)}` : ''}
        <span class="tag">${esc(r.description_confidence)} confidence</span></div>`
      : `<h3>Description</h3><div class="dim">no description printed for this film in this programme</div>`}
    ${(r.poster_url || r.film_url || r.external_description) ? `<h3>Film page</h3>
      ${r.poster_url ? `<img class="poster" src="${esc(r.poster_url)}" alt="${esc(r.film_title)} poster" loading="lazy">` : ''}
      ${r.film_url ? `<div><a class="ext" href="${esc(r.film_url)}" target="_blank" rel="noopener">${esc(r.film_url)}</a></div>` : ''}
      <div class="dim">${esc(r.film_url_source || 'catalogue page')} · link checked when the data was built</div>
      ${(r.external_description || '').trim() && !(r.description || '').trim()
        ? `<div class="extdesc">${esc(r.external_description)}</div>
           <div class="dim">description from the film page above, not from the festival programme</div>` : ''}`
      : ''}
    ${r.award || r.award_status ? `<h3>Award</h3>${kv([['Award', esc(r.award)],
          ['Category', r.award_category ? `<span class="tag c">${esc(r.award_category)}</span>` + (r.award_format ? ` <span class="tag">${esc(r.award_format)}</span>` : '') : ''],
          ['Status', esc(r.award_status)],
          ['Recipients', esc(r.award_recipients)], ['Jury', esc(r.jury_comment)]])}` : ''}
    ${fm.festivals.length > 1 ? `<h3>This film at other festivals</h3>` + DATA.screens.filter(x => x.master_id === r.master_id && x.row_id !== r.row_id)
        .map(x => `<div class="chip"><b>${esc(x.festival_id)} ${esc(x.edition_year)}</b> — ${esc(x.film_title)}` +
                  (x.director ? ` · ${esc(x.director)}` : '') + (x.award ? ` · <span class="tag a">${esc(x.award)}</span>` : '') +
                  ` <a class="link" data-go="film::${esc(x.master_id)}">film record</a> <a class="link" data-go="fest::${esc(x.festival_id)}">show edition</a></div>`).join('') : ''}
    <h3>Provenance</h3>
    ${kv([['Source file', esc(r.source_file)], ['Page', esc(r.source_page)], ['Confidence', esc(r.confidence)]])}
    <div class="q">${esc(r.evidence_quote)}</div>
    ${r.flags ? `<h3>Flags</h3><div class="dim">${esc(r.flags).split('; ').map(f => `<div class="chip">${esc(f)}</div>`).join('')}</div>` : ''}
  `;
  $('#d').classList.add('on');
}
function descBlock(o, heading){
  const hasPr = (o.description || '').trim(), hasEx = (o.external_description || '').trim();
  const page = (o.film_url || '').trim();
  if (!hasPr && !hasEx && !page) return '';
  return `<h3>${heading}</h3>` +
    (hasPr ? `<div class="desc">${esc(o.description)}</div>
       <div class="dim">${esc(o.description_source || '')}${o.description_page ? ', page ' + esc(o.description_page) : ''}
         <span class="tag">${esc(o.description_confidence)} confidence</span></div>`
     : `<div class="dim">no description printed for this film in any programme</div>`) +
    (page ? `<div class="fp">${o.poster_url ? `<img class="poster" src="${esc(o.poster_url)}" alt="" loading="lazy">` : ''}
       <a class="ext" href="${esc(page)}" target="_blank" rel="noopener">${esc(page)}</a>
       <div class="dim">${esc(o.film_url_source || 'film page')} · link verified by fetch at build time</div>
       ${hasEx && !hasPr ? `<div class="extdesc">${esc(o.external_description)}</div>
         <div class="dim">above from the film page, not from the festival programme</div>` : ''}</div>` : '');
}
function openFilm(mid){
  const f = DATA.films.find(x => x.master_id === mid); if (!f) return;
  const scr = DATA.screens.filter(r => r.master_id === mid);
  $('#dc').innerHTML = `
    <h2>${esc(f.canonical)}</h2>
    <div class="dim">${f.n_screens} screening${f.n_screens>1?'s':''} at ${f.festivals.length} festival${f.festivals.length>1?'s':''}</div>
    <h3>Title variants as printed</h3>
    ${f.titles.map(t => `<div class="chip"><b>${esc(t)}</b></div>`).join('')}
    <h3>Artists as printed</h3>
    ${f.artists.length ? f.artists.map(a => `<div class="chip">${esc(a)} <a class="link" data-go="artist::${esc(a)}">show artist</a></div>`).join('') : '<div class="dim">no artist printed in any source</div>'}
    ${descBlock(f, 'Description')}
    <h3>Festivals &amp; years</h3>
    <div>${f.festivals.map(x => `<span class="tag f">${esc(x)}</span>`).join(' ')} ${f.years.map(y => `<span class="tag">${esc(y)}</span>`).join(' ')}</div>
    ${f.awards.length ? `<h3>Awards (${f.awards.length})</h3>` + f.awards.map(a => `<div class="chip"><span class="tag a">${esc(a)}</span></div>`).join('') : ''}
    <h3>Every screening</h3>
    ${scr.map(r => `<div class="chip"><b>${esc(r.festival_id)} ${esc(r.edition_year)}</b> · ${esc(r.section)}` +
                   (r.award ? ` · <span class="tag a">${esc(r.award)}</span>` : '') +
                   ` <a class="link" data-go="screen::${esc(r.row_id)}">source</a></div>`).join('')}
    ${f.flags.length ? `<h3>Flags on these rows</h3>` + f.flags.map(x => `<div class="chip">${esc(x)}</div>`).join('') : ''}
  `;
  $('#d').classList.add('on');
}
function openArtist(nm){
  const a = ART[nm] || Object.values(ART).find(x => x.names.includes(nm));
  if (!a) { $('#dc').innerHTML = `<h2>${esc(nm)}</h2><div class="dim">No credit row matches this name exactly — it may be part of a longer printed credit. Use the search box for a substring match.</div>`;
           $('#d').classList.add('on'); return; }
  const films = a.films.map(id => filmById[id]).filter(Boolean);
  $('#dc').innerHTML = `
    <h2>${esc(a.names[0])}</h2>
    <div class="dim">${films.length} film${films.length>1?'s':''} across ${a.festivals.length} festival${a.festivals.length>1?'s':''}</div>
    ${a.names.length>1?`<h3>Name variants printed</h3>${a.names.map(n=>`<div class="chip">${esc(n)}</div>`).join('')}`:''}
    <h3>Festivals &amp; years</h3>
    <div>${a.festivals.map(x=>`<span class="tag f">${esc(x)}</span>`).join(' ')} ${a.years.map(y=>`<span class="tag">${esc(y)}</span>`).join(' ')}</div>
    <h3>Films</h3>
    ${films.map(f => `<div class="chip"><b>${esc(f.canonical)}</b> <span class="dim">${f.festivals.join(', ')} ${f.years.join(', ')}</span>` +
                     (f.awards.length?` <span class="tag a">${esc(f.awards[0])}</span>`:'') +
                     ` <a class="link" data-go="film::${esc(f.master_id)}">open</a></div>`).join('')}
    ${a.awards.length?`<h3>Awards involving this name</h3>${a.awards.map(x=>`<div class="chip">${esc(x)}</div>`).join('')}`:''}
  `;
  $('#d').classList.add('on');
}
function openFestival(fid, year){
  const e = DATA.editions.find(x => x.festival_id === fid && String(x.year) === String(year)); if (!e) return;
  const rows = DATA.screens.filter(r => r.festival_id === fid && String(r.edition_year) === String(year));
  $('#dc').innerHTML = `
    <h2>${esc(festName[fid] || fid)} ${esc(year)}</h2>
    <div class="dim">${esc(e.dates.join('; '))} ${e.city.join(', ')}</div>
    <h3>Edition</h3>
    ${kv([['Films / award rows', esc(e.n) + (e.n_award ? ' · ' + e.n_award + ' award rows' : ' · no award data printed')],
          ['Sections', esc(e.sections.join(' · '))]])}
    <h3>Films</h3>
    ${rows.map(r => `<div class="chip"><b>${esc(r.film_title)}</b> <span class="dim">${esc(r.director||r.production_company||'')}</span>` +
                    (r.award?` <span class="tag a">${esc(r.award)}</span>`:'') +
                    ` <a class="link" data-go="screen::${esc(r.row_id)}">source</a> <a class="link" data-go="film::${esc(r.master_id)}">film</a></div>`).join('')}
  `;
  $('#d').classList.add('on');
}
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '');
  if (e.key === 'f' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey){
    e.preventDefault(); toggleSection('filters'); return;
  }
  if (e.key === 'Escape'){
    if (document.activeElement === $('#q') && $('#q').value){ clearControls2(); changed(); }
    else closeD();
  }
  if (e.key === '/' && document.activeElement !== $('#q')){ e.preventDefault(); $('#q').focus(); }
  if (e.key === 'Enter' && document.activeElement === $('#q')){
    const first = document.querySelector('#tbl tbody tr'); if (first) first.click();
  }
});
function clearControls2(){ S.q = ''; $('#q').value = ''; }
setup();
