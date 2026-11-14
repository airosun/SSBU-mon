/* SSBU-mon client */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const SL = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
  const BOOSTL = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', accuracy: 'Acc', evasion: 'Eva' };
  const STATUSL = { brn: 'BRN', par: 'PAR', psn: 'PSN', tox: 'TOX', slp: 'SLP', frz: 'FRZ' };

  const S = {
    dex: null, byId: {}, me: { id: null, name: '' }, lobby: { users: [], battles: [] }, lobbyChat: [],
    teams: load('ssbu-teams', []), selTeam: load('ssbu-selteam', 0), tab: 'home',
    battles: {}, openBattles: [], editTeam: null, editSlot: 0, searching: false, unread: {},
    dexFilter: '', pickerFilter: '', outgoing: null,
  };
  function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } }
  function save() { try { localStorage.setItem('ssbu-teams', JSON.stringify(S.teams)); localStorage.setItem('ssbu-selteam', JSON.stringify(S.selTeam)); } catch {} }
  let clientId = load('ssbu-client', null);
  if (!clientId) { clientId = Math.random().toString(36).slice(2) + Date.now().toString(36); try { localStorage.setItem('ssbu-client', JSON.stringify(clientId)); } catch {} }

  // ---------- helpers ----------
  const typeChip = t => `<span class="type" style="background:var(--t-${t})">${t}</span>`;
  function badge(f, cls = '') {
    if (!f) return `<div class="badge ${cls}">?</div>`;
    const t = f.types || ['Normal'];
    const initials = f.name.replace(/\(.*?\)/g, '').replace(/[^A-Za-z0-9 &.]/g, '').split(/[\s&.]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const sub = f.name.match(/\((.*?)\)/);
    return `<div class="badge ${cls}" style="--c1:var(--t-${t[0]});--c2:var(--t-${t[1] || t[0]})" title="${esc(f.name)}">${esc(sub ? initials[0] + sub[1][0] : initials)}</div>`;
  }
  const hpColor = p => p > 50 ? 'var(--good)' : p > 20 ? 'var(--warn)' : 'var(--bad)';
  function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add('hidden'), ms); }
  function modal(html) { $('#modalCard').innerHTML = html; $('#modal').classList.remove('hidden'); }
  function closeModal() { $('#modal').classList.add('hidden'); $('#modalCard').innerHTML = ''; }
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  const bst = f => STATS.reduce((a, s) => a + f.stats[s], 0);
  const curTeam = () => S.teams[S.selTeam];

  // ---------- sockets ----------
  const socket = io();
  socket.on('connect', () => socket.emit('hello', { clientId, name: load('ssbu-name', '') }));
  socket.on('welcome', d => { S.me = { id: d.id, name: d.name }; try { localStorage.setItem('ssbu-name', JSON.stringify(d.name)); } catch {} if (d.chat) S.lobbyChat = d.chat; $('#nameBtn').textContent = d.name; render(); });
  socket.on('lobby', d => { S.lobby = d; if (S.tab === 'home') renderHome(); });
  socket.on('chat', ({ room, msg }) => {
    if (room === 'lobby') { S.lobbyChat.push(msg); if (S.tab === 'home') renderHome(); }
  });
  socket.on('battle', p => {
    const isNew = !S.battles[p.id];
    S.battles[p.id] = p;
    if (!S.openBattles.includes(p.id)) S.openBattles.push(p.id);
    if (isNew && !p.state.ended) { S.tab = p.id; S.searching = false; render(); return; }
    if (S.tab === p.id) renderBattle(p.id); else { S.unread[p.id] = true; renderTabs(); }
  });
  socket.on('searchStatus', d => { S.searching = d.searching; if (S.tab === 'home') renderHome(); });
  socket.on('challenged', ({ from, name }) => {
    modal(`<h2>Challenge!</h2><p><b>${esc(name)}</b> wants to battle you.</p>
      <div class="field"><label>Your team</label>${teamSelect('chTeam')}</div>
      <div class="row" style="margin-top:14px"><button class="primary" id="chAccept">Accept</button><button id="chDecline">Decline</button></div>`);
    $('#chAccept').onclick = () => { const t = S.teams[+$('#chTeam').value]; if (!t) return toast('Build a team first.'); socket.emit('respond', { from, accept: true, team: t.mons }, r => { if (r.error) toast(r.error, 5000); else closeModal(); }); };
    $('#chDecline').onclick = () => { socket.emit('respond', { from, accept: false }); closeModal(); };
  });
  socket.on('challengeDeclined', ({ by }) => { S.outgoing = null; toast(`${by} declined your challenge.`); renderHome(); });
  socket.on('challengeCancelled', () => { closeModal(); toast('The challenge was cancelled.'); });

  $('#nameBtn').onclick = () => {
    modal(`<h2>Your name</h2><div class="row"><input id="nmIn" maxlength="24" value="${esc(S.me.name)}" class="grow"><button class="primary" id="nmOk">Save</button></div>`);
    $('#nmIn').focus();
    const go = () => { socket.emit('rename', $('#nmIn').value); closeModal(); };
    $('#nmOk').onclick = go; $('#nmIn').onkeydown = e => { if (e.key === 'Enter') go(); };
  };

  // ---------- tabs ----------
  function renderTabs() {
    const tabs = [['home', 'Home'], ['builder', 'Teambuilder'], ['dex', 'Fighterdex']];
    let h = tabs.map(([k, n]) => `<button class="tab ${S.tab === k ? 'active' : ''}" data-tab="${k}">${n}</button>`).join('');
    for (const id of S.openBattles) {
      const p = S.battles[id]; if (!p) continue;
      const nm = `${p.players[0].name} vs ${p.players[1].name}`;
      h += `<button class="tab ${S.tab === id ? 'active' : ''}" data-tab="${id}">${S.unread[id] ? '<span class="dot"></span>' : ''}${esc(nm)}<span class="x" data-close="${id}">✕</span></button>`;
    }
    $('#tabs').innerHTML = h;
  }
  $('#tabs').addEventListener('click', e => {
    const c = e.target.closest('[data-close]');
    if (c) {
      const id = c.dataset.close; const p = S.battles[id];
      if (p && !p.state.ended && p.you !== null && !confirm('Leave this battle? You will forfeit.')) return;
      if (p && !p.state.ended && p.you !== null) socket.emit('forfeit', { id });
      socket.emit('leaveBattle', { id });
      S.openBattles = S.openBattles.filter(x => x !== id); delete S.battles[id];
      if (S.tab === id) S.tab = 'home';
      render(); e.stopPropagation(); return;
    }
    const t = e.target.closest('[data-tab]'); if (t) { S.tab = t.dataset.tab; delete S.unread[S.tab]; render(); }
  });
  function render() {
    renderTabs();
    if (!S.dex) { $('#view').innerHTML = '<div class="card">Loading…</div>'; return; }
    if (S.tab === 'home') renderHome();
    else if (S.tab === 'builder') renderBuilder();
    else if (S.tab === 'dex') renderDex();
    else if (S.battles[S.tab]) renderBattle(S.tab);
    else { S.tab = 'home'; renderHome(); }
  }

  // ---------- home ----------
  function teamSelect(id) {
    if (!S.teams.length) return `<select id="${id}" disabled><option>No teams yet — open the Teambuilder</option></select>`;
    return `<select id="${id}">${S.teams.map((t, i) => `<option value="${i}" ${i === S.selTeam ? 'selected' : ''}>${esc(t.name)} (${t.mons.length})</option>`).join('')}</select>`;
  }
  function renderHome() {
    const chatScroll = $('#lobbyChat') ? $('#lobbyChat').scrollTop : null;
    const others = S.lobby.users.filter(u => u.id !== S.me.id);
    $('#view').innerHTML = `
    <div class="grid-home">
      <section class="card hero span2">
        <h1>Battle with Smash Ultimate fighters</h1>
        <p>Build a team of up to six fighters, then take on a friend, a random opponent, or the CPU.</p>
        <div class="row">
          ${teamSelect('homeTeam')}
          <button class="primary" id="btnSearch">${S.searching ? 'Cancel search' : 'Find opponent'}</button>
          <button id="btnCpu">Battle the CPU</button>
          <button class="ghost" id="btnCpuRandom" title="Use a random team">Random team vs CPU</button>
          ${S.searching ? '<span class="pill">Searching…</span>' : ''}
        </div>
      </section>
      <section class="card">
        <h2>Online (${S.lobby.users.length})</h2>
        <div class="list">${others.length ? others.map(u => `<div class="list-item"><span class="grow">${esc(u.name)}</span>${u.searching ? '<span class="pill">searching</span>' : ''}<button class="small" data-challenge="${esc(u.id)}">Challenge</button></div>`).join('') : '<div class="muted">Nobody else is online. Share the link with a friend, or battle the CPU.</div>'}</div>
        ${S.outgoing ? `<div class="row" style="margin-top:10px"><span class="pill">Waiting for ${esc(S.outgoing.name)}…</span><button class="small" id="btnCancelCh">Cancel</button></div>` : ''}
      </section>
      <section class="card">
        <h2>Live battles</h2>
        <div class="list">${S.lobby.battles.length ? S.lobby.battles.map(b => `<div class="list-item"><span class="grow">${esc(b.p1)} vs ${esc(b.p2)}</span><span class="pill">Turn ${b.turn}</span><button class="small" data-watch="${b.id}">Watch</button></div>`).join('') : '<div class="muted">No battles right now.</div>'}</div>
      </section>
      <section class="card span2">
        <h2>Lobby chat</h2>
        <div class="chat-box" id="lobbyChat">${S.lobbyChat.map(m => `<div><span class="who">${esc(m.name)}:</span> ${esc(m.text)}</div>`).join('')}</div>
        <div class="row" style="margin-top:8px"><input id="lobbyIn" class="grow" maxlength="300" placeholder="Say something…"><button id="lobbySend">Send</button></div>
      </section>
    </div>`;
    const lc = $('#lobbyChat'); lc.scrollTop = chatScroll ?? lc.scrollHeight; if (chatScroll === null || lc.scrollHeight - chatScroll < 400) lc.scrollTop = lc.scrollHeight;
    const ht = $('#homeTeam'); if (ht && !ht.disabled) ht.onchange = () => { S.selTeam = +ht.value; save(); };
    const team = () => { const t = curTeam(); if (!t || !t.mons.length) { toast('Build a team in the Teambuilder first.'); return null; } return t.mons; };
    $('#btnSearch').onclick = () => {
      if (S.searching) { socket.emit('cancelSearch'); S.searching = false; renderHome(); return; }
      const t = team(); if (!t) return;
      socket.emit('search', { team: t }, r => { if (r.error) toast(r.error, 5000); else if (r.searching) { S.searching = true; renderHome(); } });
    };
    $('#btnCpu').onclick = () => { const t = team(); if (!t) return; socket.emit('cpu', { team: t }, r => { if (r.error) toast(r.error, 5000); }); };
    $('#btnCpuRandom').onclick = () => socket.emit('cpu', { team: randomTeam() }, r => { if (r.error) toast(r.error, 5000); });
    document.querySelectorAll('[data-challenge]').forEach(b => b.onclick = () => {
      const t = team(); if (!t) return;
      const u = S.lobby.users.find(x => x.id === b.dataset.challenge);
      socket.emit('challenge', { to: b.dataset.challenge, team: t }, r => { if (r.error) toast(r.error, 5000); else { S.outgoing = { id: u.id, name: u.name }; renderHome(); } });
    });
    const cc = $('#btnCancelCh'); if (cc) cc.onclick = () => { socket.emit('cancelChallenge', { to: S.outgoing.id }); S.outgoing = null; renderHome(); };
    document.querySelectorAll('[data-watch]').forEach(b => b.onclick = () => socket.emit('spectate', { id: b.dataset.watch }, r => { if (r.error) toast(r.error); else { S.tab = b.dataset.watch; } }));
    const send = () => { const v = $('#lobbyIn').value.trim(); if (v) { socket.emit('chat', { room: 'lobby', text: v }); $('#lobbyIn').value = ''; } };
    $('#lobbySend').onclick = send; $('#lobbyIn').onkeydown = e => { if (e.key === 'Enter') send(); };
  }
  function randomTeam() {
    const f = S.dex.fighters.slice().sort(() => Math.random() - .5).slice(0, 6);
    return f.map(x => ({ species: x.id, ability: x.abilities[0].name, item: 'Leftovers', nature: 'Hardy', evs: { hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84 }, moves: x.signature.map(s => s.move) }));
  }

  // ---------- teambuilder ----------
  function newMon(f) {
    const physical = f.stats.atk >= f.stats.spa;
    return { species: f.id, ability: f.abilities[0].name, item: '', nature: physical ? 'Adamant' : 'Modest', evs: { hp: 4, atk: physical ? 252 : 0, def: 0, spa: physical ? 0 : 252, spd: 0, spe: 252 }, moves: f.signature.map(s => s.move) };
  }
  function renderBuilder() {
    if (S.editTeam !== null && !S.teams[S.editTeam]) S.editTeam = null;
    const list = S.teams.map((t, i) => `<div class="team-row ${i === S.editTeam ? 'sel' : ''}" data-team="${i}">
      <div class="row"><b class="grow">${esc(t.name)}</b><span class="pill">${t.mons.length}/6</span></div>
      <div class="mini">${t.mons.map(m => badge(S.byId[m.species], 'sm')).join('')}</div></div>`).join('');
    $('#view').innerHTML = `<div class="tb">
      <section class="card">
        <h2>Your teams</h2>
        <div class="row" style="margin-bottom:10px"><button class="primary" id="tbNew">New team</button><button id="tbImport">Import</button></div>
        <div class="list" style="max-height:none">${list || '<div class="muted">No teams yet.</div>'}</div>
      </section>
      <section class="card" id="tbEditor">${S.editTeam === null ? '<div class="muted">Pick a team on the left or make a new one.</div>' : ''}</section>
    </div>`;
    $('#tbNew').onclick = () => { S.teams.push({ name: 'Team ' + (S.teams.length + 1), mons: [] }); S.editTeam = S.teams.length - 1; S.editSlot = 0; save(); renderBuilder(); openPicker(); };
    $('#tbImport').onclick = () => {
      modal(`<h2>Import team</h2><p class="muted">Paste a team in the text format (same as Export).</p><textarea class="export" id="impText"></textarea><div class="row" style="margin-top:10px"><input id="impName" placeholder="Team name" value="Imported team"><button class="primary" id="impOk">Import</button></div>`);
      $('#impOk').onclick = () => { const r = parseTeam($('#impText').value); if (r.error) return toast(r.error, 5000); S.teams.push({ name: $('#impName').value || 'Imported team', mons: r.mons }); S.editTeam = S.teams.length - 1; save(); closeModal(); renderBuilder(); };
    };
    document.querySelectorAll('[data-team]').forEach(el => el.onclick = () => { S.editTeam = +el.dataset.team; S.editSlot = 0; renderBuilder(); });
    if (S.editTeam !== null) renderTeamEditor();
  }
  function renderTeamEditor() {
    const t = S.teams[S.editTeam];
    if (S.editSlot >= t.mons.length) S.editSlot = Math.max(0, t.mons.length - 1);
    const slots = [0, 1, 2, 3, 4, 5].map(i => {
      const m = t.mons[i];
      if (!m) return `<div class="slot" data-slot="add">＋<span class="muted">Add fighter</span></div>`;
      const f = S.byId[m.species];
      return `<div class="slot filled ${i === S.editSlot ? 'sel' : ''}" data-slot="${i}">${badge(f)}<span>${esc(f.name)}</span></div>`;
    }).slice(0, Math.min(6, t.mons.length + 1)).join('');
    const ed = $('#tbEditor');
    ed.innerHTML = `
      <div class="row"><input id="tName" class="grow" value="${esc(t.name)}" maxlength="40">
        <button class="small" id="tUse">${S.selTeam === S.editTeam ? '✓ Selected' : 'Use for battles'}</button>
        <button class="small" id="tExport">Export</button><button class="small" id="tDup">Duplicate</button><button class="small" id="tDel">Delete</button></div>
      <div class="slots">${slots}</div>
      <div id="monEditor"></div>`;
    $('#tName').oninput = e => { t.name = e.target.value; save(); };
    $('#tUse').onclick = () => { S.selTeam = S.editTeam; save(); renderTeamEditor(); };
    $('#tExport').onclick = () => { modal(`<h2>Export: ${esc(t.name)}</h2><textarea class="export" readonly>${esc(exportTeam(t))}</textarea><div class="row" style="margin-top:10px"><button id="cpy" class="primary">Copy</button><button id="cls">Close</button></div>`); $('#cpy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(exportTeam(t)); toast('Copied.'); }; $('#cls').onclick = closeModal; };
    $('#tDup').onclick = () => { S.teams.push(JSON.parse(JSON.stringify(Object.assign({}, t, { name: t.name + ' (copy)' })))); S.editTeam = S.teams.length - 1; save(); renderBuilder(); };
    $('#tDel').onclick = () => { if (!confirm(`Delete "${t.name}"?`)) return; S.teams.splice(S.editTeam, 1); if (S.selTeam >= S.teams.length) S.selTeam = 0; S.editTeam = null; save(); renderBuilder(); };
    ed.querySelectorAll('[data-slot]').forEach(el => el.onclick = () => { if (el.dataset.slot === 'add') { S.editSlot = t.mons.length; openPicker(); } else { S.editSlot = +el.dataset.slot; renderTeamEditor(); } });
    if (t.mons[S.editSlot]) renderMonEditor(t, t.mons[S.editSlot]);
  }
  function openPicker() {
    const t = S.teams[S.editTeam];
    const draw = () => {
      const q = S.pickerFilter.toLowerCase();
      const used = new Set(t.mons.map((m, i) => i !== S.editSlot && m.species));
      const list = S.dex.fighters.filter(f => !q || f.name.toLowerCase().includes(q) || f.series.toLowerCase().includes(q) || f.types.some(x => x.toLowerCase() === q));
      $('#pickGrid').innerHTML = list.map(f => `<div class="dex-card" data-pick="${f.id}" style="${used.has(f.id) ? 'opacity:.35;pointer-events:none' : ''}">${badge(f)}<div class="grow"><div class="nm">${esc(f.name)}</div><div>${f.types.map(typeChip).join(' ')}</div><div class="muted" style="font-size:12px;margin-top:3px">BST ${bst(f)} · ${esc(f.series)}</div></div></div>`).join('');
      document.querySelectorAll('[data-pick]').forEach(el => el.onclick = () => {
        const f = S.byId[el.dataset.pick];
        t.mons[S.editSlot] = newMon(f); save(); closeModal(); renderBuilder();
      });
    };
    modal(`<div class="row" style="margin-bottom:12px"><h2 class="grow" style="margin:0">Choose a fighter</h2><input id="pickQ" placeholder="Search name, series or type" value="${esc(S.pickerFilter)}"><button id="pickX">Close</button></div><div class="dex-grid" id="pickGrid"></div>`);
    $('#pickQ').oninput = e => { S.pickerFilter = e.target.value; draw(); }; $('#pickQ').focus(); $('#pickX').onclick = closeModal;
    draw();
  }
  function statsFor(m) { const f = S.byId[m.species]; const o = {}; for (const s of STATS) o[s] = DEX.calcStat(s, f.stats[s], 31, m.evs[s] || 0, 100, m.nature); return o; }
  function renderMonEditor(t, m) {
    const f = S.byId[m.species];
    const abilities = [...f.abilities.map(a => ({ ...a, hidden: false })), { ...f.hidden, hidden: true }];
    const ab = abilities.find(a => a.name === m.ability) || abilities[0];
    const nat = S.dex.natures[m.nature] || {};
    const st = statsFor(m);
    const evTotal = STATS.reduce((a, s) => a + (m.evs[s] || 0), 0);
    const items = Object.keys(S.dex.items).filter(i => i !== 'Eviolite' || S.dex.eviolite.includes(f.id));
    const sigMoves = new Set(f.signature.map(s => s.move));
    const sigFlav = Object.fromEntries(f.signature.map(s => [s.move, s.smash]));
    const learn = f.learnset.slice().sort((a, b) => (sigMoves.has(b) - sigMoves.has(a)) || S.dex.moves[a].type.localeCompare(S.dex.moves[b].type) || a.localeCompare(b));
    const moveOpts = sel => `<option value="">—</option>` + learn.map(n => `<option ${n === sel ? 'selected' : ''}>${esc(n)}</option>`).join('');
    $('#monEditor').innerHTML = `
      <div class="row" style="margin-bottom:12px">${badge(f, 'lg')}<div class="grow"><div style="font-size:20px;font-weight:700">${esc(f.name)}</div><div>${f.types.map(typeChip).join(' ')} <span class="muted">· ${esc(f.series)} · BST ${bst(f)}</span></div></div>
        <button class="small" id="mChange">Change fighter</button><button class="small" id="mRemove">Remove</button></div>
      <div class="editor">
        <div>
          <div class="field"><label>Ability</label><select id="mAb">${abilities.map(a => `<option value="${esc(a.name)}" ${a.name === m.ability ? 'selected' : ''}>${esc(a.name)}${a.hidden ? ' (Hidden)' : ''}</option>`).join('')}</select><div class="desc">${esc(ab.desc)}</div></div>
          <div class="field" style="margin-top:10px"><label>Item</label><select id="mItem"><option value="">(none)</option>${items.map(i => `<option ${i === m.item ? 'selected' : ''}>${esc(i)}</option>`).join('')}</select><div class="desc">${esc(S.dex.items[m.item] || '')}</div></div>
          <div class="field" style="margin-top:10px"><label>Moves</label>${[0, 1, 2, 3].map(i => `<select data-mv="${i}" style="width:100%;margin-bottom:5px">${moveOpts(m.moves[i])}</select>`).join('')}</div>
        </div>
        <div>
          <div class="field"><label>Nature</label><select id="mNat">${Object.keys(S.dex.natures).map(n => { const x = S.dex.natures[n]; return `<option value="${n}" ${n === m.nature ? 'selected' : ''}>${n}${x.plus ? ` (+${SL[x.plus]} −${SL[x.minus]})` : ''}</option>`; }).join('')}</select></div>
          <div class="field" style="margin-top:10px"><label>EVs — ${evTotal}/510 used ${evTotal > 510 ? '<b style="color:var(--bad)">over limit</b>' : ''}</label>
            ${STATS.map(s => `<div class="ev-row"><span class="${nat.plus === s ? 'plus' : nat.minus === s ? 'minus' : ''}">${SL[s]}</span><input type="range" min="0" max="252" step="4" value="${m.evs[s] || 0}" data-ev="${s}"><input type="number" min="0" max="252" value="${m.evs[s] || 0}" data-evn="${s}"><span class="stat">${st[s]}</span></div>`).join('')}
            <div class="desc">Level 100, all IVs 31. Base stats: ${STATS.map(s => `${SL[s]} ${f.stats[s]}`).join(' · ')}</div>
          </div>
        </div>
      </div>
      <h2 style="margin-top:16px">Move pool (${f.learnset.length}) — click to add</h2>
      <div class="move-table"><table><tr><th>Move</th><th>Type</th><th>Cat</th><th>Pow</th><th>Acc</th><th>PP</th></tr>
        ${learn.map(n => { const mv = S.dex.moves[n]; return `<tr class="pick ${m.moves.includes(n) ? 'chosen' : ''}" data-addmv="${esc(n)}"><td>${esc(n)}${sigMoves.has(n) ? ` <span class="sig">★ ${esc(sigFlav[n] || 'Smash')}</span>` : ''}</td><td>${typeChip(mv.type)}</td><td><span class="cat">${mv.cat}</span></td><td>${mv.power || '—'}</td><td>${mv.acc === true ? '—' : mv.acc}</td><td>${Math.floor(mv.pp * 8 / 5)}</td></tr>`; }).join('')}
      </table></div>`;
    const re = () => { save(); renderMonEditor(t, m); };
    $('#mChange').onclick = openPicker;
    $('#mRemove').onclick = () => { t.mons.splice(S.editSlot, 1); S.editSlot = Math.max(0, S.editSlot - 1); save(); renderTeamEditor(); };
    $('#mAb').onchange = e => { m.ability = e.target.value; re(); };
    $('#mItem').onchange = e => { m.item = e.target.value; re(); };
    $('#mNat').onchange = e => { m.nature = e.target.value; re(); };
    document.querySelectorAll('[data-mv]').forEach(el => el.onchange = () => { const i = +el.dataset.mv; const v = el.value; if (v && m.moves.includes(v) && m.moves[i] !== v) { toast('Already has that move.'); el.value = m.moves[i] || ''; return; } m.moves[i] = v; m.moves = m.moves.filter((x, k) => x || k < 4).slice(0, 4); m.moves = m.moves.map(x => x || ''); re(); });
    const setEv = (s, v) => { v = Math.max(0, Math.min(252, v | 0)); const others = STATS.reduce((a, k) => a + (k === s ? 0 : (m.evs[k] || 0)), 0); m.evs[s] = Math.min(v, 510 - others); };
    document.querySelectorAll('[data-ev]').forEach(el => { el.oninput = () => { setEv(el.dataset.ev, +el.value); const n = document.querySelector(`[data-evn="${el.dataset.ev}"]`); n.value = m.evs[el.dataset.ev]; el.value = m.evs[el.dataset.ev]; }; el.onchange = re; });
    document.querySelectorAll('[data-evn]').forEach(el => el.onchange = () => { setEv(el.dataset.evn, +el.value); re(); });
    document.querySelectorAll('[data-addmv]').forEach(el => el.onclick = () => {
      const n = el.dataset.addmv;
      if (m.moves.includes(n)) { m.moves = m.moves.map(x => x === n ? '' : x); re(); return; }
      const free = [0, 1, 2, 3].find(i => !m.moves[i]);
      if (free === undefined) return toast('All 4 move slots are full — pick a slot above or click a chosen move to remove it.');
      m.moves[free] = n; re();
    });
  }
  function exportTeam(t) {
    return t.mons.map(m => {
      const f = S.byId[m.species];
      const evs = STATS.filter(s => m.evs[s]).map(s => `${m.evs[s]} ${SL[s]}`).join(' / ');
      return [`${f.name}${m.item ? ' @ ' + m.item : ''}`, `Ability: ${m.ability}`, evs ? `EVs: ${evs}` : '', `${m.nature} Nature`, ...m.moves.filter(Boolean).map(x => `- ${x}`)].filter(Boolean).join('\n');
    }).join('\n\n');
  }
  function parseTeam(txt) {
    const byName = Object.fromEntries(S.dex.fighters.map(f => [f.name.toLowerCase(), f]));
    const revSL = Object.fromEntries(Object.entries(SL).map(([k, v]) => [v.toLowerCase(), k]));
    const mons = [];
    for (const block of txt.trim().split(/\n\s*\n/)) {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines.length) continue;
      const [nm, item] = lines[0].split(' @ ');
      const f = byName[nm.trim().toLowerCase()];
      if (!f) return { error: `Unknown fighter: ${nm}` };
      const m = newMon(f); m.item = item ? item.trim() : ''; m.moves = []; m.evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      for (const l of lines.slice(1)) {
        if (l.startsWith('Ability:')) m.ability = l.slice(8).trim();
        else if (l.startsWith('EVs:')) for (const part of l.slice(4).split('/')) { const [v, s] = part.trim().split(/\s+/); if (revSL[(s || '').toLowerCase()]) m.evs[revSL[s.toLowerCase()]] = +v; }
        else if (/Nature$/.test(l)) m.nature = l.replace(/Nature$/, '').trim();
        else if (l.startsWith('-')) m.moves.push(l.slice(1).trim());
      }
      mons.push(m);
    }
    if (!mons.length || mons.length > 6) return { error: 'A team needs 1 to 6 fighters.' };
    return { mons };
  }

  // ---------- fighterdex ----------
  function renderDex() {
    const q = S.dexFilter.toLowerCase();
    const list = S.dex.fighters.filter(f => !q || f.name.toLowerCase().includes(q) || f.series.toLowerCase().includes(q) || f.types.some(x => x.toLowerCase() === q) || f.learnset.some(x => x.toLowerCase() === q));
    const max = 160;
    $('#view').innerHTML = `<section class="card"><div class="row" style="margin-bottom:12px"><h2 class="grow" style="margin:0">Fighterdex · ${list.length} fighters</h2><input id="dexQ" placeholder="Search name, series, type or move" value="${esc(S.dexFilter)}"></div>
      <div class="dex-grid">${list.map(f => `<div class="dex-card" data-dex="${f.id}" style="flex-direction:column"><div class="row">${badge(f)}<div class="grow"><div class="nm">#${f.num} ${esc(f.name)}</div><div>${f.types.map(typeChip).join(' ')}</div></div><span class="pill">BST ${bst(f)}</span></div>
        <div class="statbars">${STATS.map(s => `<span class="muted">${SL[s]}</span><span style="font-family:var(--mono)">${f.stats[s]}</span><div class="statbar"><i style="width:${Math.min(100, f.stats[s] / max * 100)}%;background:${f.stats[s] >= 110 ? 'var(--good)' : f.stats[s] >= 80 ? 'var(--warn)' : 'var(--bad)'}"></i></div>`).join('')}</div></div>`).join('')}</div></section>`;
    const inp = $('#dexQ'); inp.oninput = e => { S.dexFilter = e.target.value; const pos = inp.selectionStart; renderDex(); const n = $('#dexQ'); n.focus(); n.setSelectionRange(pos, pos); };
    document.querySelectorAll('[data-dex]').forEach(el => el.onclick = () => showFighter(S.byId[el.dataset.dex]));
  }
  function showFighter(f) {
    const sig = Object.fromEntries(f.signature.map(s => [s.move, s.smash]));
    modal(`<div class="row" style="margin-bottom:10px">${badge(f, 'lg')}<div class="grow"><div style="font-size:22px;font-weight:800">${esc(f.name)}</div><div>${f.types.map(typeChip).join(' ')} <span class="muted">· ${esc(f.series)}</span></div></div><button id="fx">Close</button></div>
      <div class="statbars" style="max-width:420px">${STATS.map(s => `<span class="muted">${SL[s]}</span><span style="font-family:var(--mono)">${f.stats[s]}</span><div class="statbar"><i style="width:${Math.min(100, f.stats[s] / 1.6)}%;background:var(--accent2)"></i></div>`).join('')}</div>
      <h2 style="margin-top:14px">Abilities</h2>
      ${f.abilities.map(a => `<div><b>${esc(a.name)}</b> — <span class="muted">${esc(a.desc)}</span></div>`).join('')}
      <div><b>${esc(f.hidden.name)}</b> <span class="pill">Hidden</span> — <span class="muted">${esc(f.hidden.desc)}</span></div>
      <h2 style="margin-top:14px">Move pool</h2>
      <div class="move-table"><table><tr><th>Move</th><th>Type</th><th>Cat</th><th>Pow</th><th>Acc</th></tr>${f.learnset.map(n => { const mv = S.dex.moves[n]; return `<tr><td>${esc(n)}${sig[n] !== undefined ? ` <span class="sig">★ ${esc(sig[n])}</span>` : ''}</td><td>${typeChip(mv.type)}</td><td><span class="cat">${mv.cat}</span></td><td>${mv.power || '—'}</td><td>${mv.acc === true ? '—' : mv.acc}</td></tr>`; }).join('')}</table></div>`);
    $('#fx').onclick = closeModal;
  }

  // ---------- battle ----------
  function combatantHtml(side, isFoe, p) {
    const a = side.active;
    const pips = side.team.map(m => `<span class="pip ${m.fainted ? 'fainted' : m.status ? 'status' : ''}" title="${esc(m.name)}"></span>`).join('');
    if (!a) return `<div class="combatant ${isFoe ? 'foe' : 'you'}"><div class="hpcard"><div class="nm">${esc(side.name)}</div><div class="pips">${pips}</div></div></div>`;
    const f = S.byId[a.id] || { name: a.name, types: a.types };
    const boosts = Object.entries(a.boosts || {}).map(([k, v]) => `<span class="chip ${v > 0 ? 'up' : 'down'}">${v > 0 ? '+' : ''}${v} ${BOOSTL[k]}</span>`).join('');
    const vols = (a.volatiles || []).map(v => `<span class="chip">${{ substitute: 'Substitute', confusion: 'Confused', leechSeed: 'Seeded', taunt: 'Taunted', encore: 'Encore', trapped: 'Trapped', ingrain: 'Ingrained', charging: 'Charging', attract: 'Infatuated' }[v] || v}</span>`).join('');
    const hpText = a.hp !== undefined ? `${a.hp}/${a.maxhp} HP` : `${a.hpPct}%`;
    return `<div class="combatant ${isFoe ? 'foe' : 'you'}">${badge({ name: a.name, types: a.types }, 'lg' + (a.fainted ? ' fainted' : ''))}
      <div class="hpcard"><div class="nm">${esc(a.name)} ${a.status ? `<span class="st st-${a.status}">${STATUSL[a.status]}</span>` : ''}</div>
        <div class="chips">${a.types.map(typeChip).join('')}</div>
        <div class="hpbar"><i style="width:${a.hpPct}%;background:${hpColor(a.hpPct)}"></i></div>
        <div class="hptext">${hpText} · ${esc(side.name)}</div>
        <div class="chips">${boosts}${vols}</div>
        <div class="pips">${pips}</div></div></div>`;
  }
  function fieldChips(st) {
    const c = [];
    if (st.field.weather) c.push({ rain: '🌧 Rain', sun: '☀ Harsh sun', snow: '❄ Snow' }[st.field.weather]);
    if (st.field.trickroom) c.push(`Trick Room (${st.field.trickroom})`);
    if (st.field.gravity) c.push(`Gravity (${st.field.gravity})`);
    for (const s of st.sides) {
      const k = s.conditions; const n = esc(s.name);
      if (k.reflect) c.push(`${n}: Reflect`); if (k.lightscreen) c.push(`${n}: Light Screen`); if (k.tailwind) c.push(`${n}: Tailwind`);
      if (k.stealthrock) c.push(`${n}: Stealth Rock`); if (k.spikes) c.push(`${n}: Spikes ×${k.spikes}`); if (k.toxicspikes) c.push(`${n}: Toxic Spikes ×${k.toxicspikes}`); if (k.stickyweb) c.push(`${n}: Sticky Web`);
    }
    return c.map(x => `<span class="chip">${x}</span>`).join('');
  }
  function renderBattle(id) {
    const p = S.battles[id]; if (!p) return;
    delete S.unread[id];
    const st = p.state; const you = p.you === null ? 0 : p.you;
    const mine = st.sides[you], foe = st.sides[1 - you];
    const logEl = $('#blog'); const atBottom = !logEl || logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 60;
    let controls = '';
    const r = p.request;
    if (st.ended) {
      const won = st.winner === p.you;
      controls = `<div class="banner ${p.you !== null && !won ? 'lose' : ''}"><span>${st.winner === null ? 'Tie game!' : `${esc(st.sides[st.winner].name)} won!`}</span><button id="bBack">Back to lobby</button></div>`;
    } else if (p.you === null) controls = `<div class="muted">You are spectating.</div>`;
    else if (r.kind === 'preview') {
      controls = `<div class="preview"><div><h2>Choose your lead</h2>${r.team.map((m, i) => `<button class="lead-btn" data-lead="${i}">${badge(S.byId[m.id], 'sm')}<span class="grow">${esc(m.name)}</span>${m.types.map(typeChip).join(' ')}</button>`).join('')}</div>
        <div><h2>${esc(foe.name)}'s team</h2>${foe.team.map(m => `<div class="list-item" style="margin-bottom:6px">${badge(S.byId[m.id], 'sm')}<span class="grow">${esc(m.name)}</span>${m.types.map(typeChip).join(' ')}</div>`).join('')}</div></div>`;
    } else if (r.kind === 'move') {
      const moveBtns = r.locked ? `<button class="move-btn primary" data-move="0" style="grid-column:span 2"><span class="mn">Continue: ${esc(r.locked)}</span></button>`
        : r.struggle ? `<button class="move-btn" data-move="0" style="grid-column:span 2"><span class="mn">Struggle</span></button>`
          : r.moves.map(m => `<button class="move-btn" data-move="${m.index}" style="--tc:var(--t-${m.type})" ${m.disabled ? 'disabled' : ''} title="${esc(moveTip(m.name))}"><span class="mn">${esc(m.name)}</span><span class="mi">${m.type} · ${m.cat === 'Status' ? 'Status' : (m.power || '—') + ' BP'} · ${m.pp}/${m.maxpp} PP</span></button>`).join('');
      controls = `<div class="moves">${moveBtns}</div><h2 style="margin-top:12px">Switch ${r.canSwitch ? '' : '<span class="pill">trapped</span>'}</h2><div class="switches">${switchBtns(r, !r.canSwitch)}</div>`;
    } else if (r.kind === 'switch') {
      controls = `<h2>${r.reason === 'faint' ? 'Choose your next fighter' : 'Choose a fighter to switch in'}</h2><div class="switches">${switchBtns(r, false)}</div>`;
    } else if (r.kind === 'wait') {
      controls = `<div class="row"><span class="muted grow">Waiting for ${esc(foe.name)}…</span>${st.phase === 'move' ? '<button class="small" id="bUndo">Undo</button>' : ''}</div>`;
    }
    $('#view').innerHTML = `<div class="battle">
      <section>
        <div class="row" style="margin-bottom:8px"><b class="grow">${esc(st.sides[0].name)} vs ${esc(st.sides[1].name)}</b><span class="pill">Turn ${st.turn}</span>${!st.ended && p.you !== null ? '<button class="small" id="bForfeit">Forfeit</button>' : ''}</div>
        <div class="arena ${st.field.weather ? 'weather-' + st.field.weather : ''}">
          ${combatantHtml(foe, true, p)}
          <div class="fieldinfo">${fieldChips(st)}</div>
          ${combatantHtml(mine, false, p)}
        </div>
        <div class="controls card">${controls}</div>
      </section>
      <section>
        <div class="log" id="blog">${renderLog(p)}</div>
        <div class="row" style="margin-top:8px"><input id="bChat" class="grow" maxlength="300" placeholder="Chat…"><button id="bSend">Send</button></div>
      </section></div>`;
    const lg = $('#blog'); if (atBottom) lg.scrollTop = lg.scrollHeight;
    const choose = c => socket.emit('choose', { id, choice: c }, res => { if (res && res.error) toast(res.error); });
    document.querySelectorAll('[data-lead]').forEach(b => b.onclick = () => choose({ lead: +b.dataset.lead }));
    document.querySelectorAll('[data-move]').forEach(b => b.onclick = () => choose({ type: 'move', index: +b.dataset.move }));
    document.querySelectorAll('[data-switch]').forEach(b => b.onclick = () => choose(r.kind === 'switch' ? { index: +b.dataset.switch } : { type: 'switch', index: +b.dataset.switch }));
    const u = $('#bUndo'); if (u) u.onclick = () => socket.emit('undo', { id });
    const fo = $('#bForfeit'); if (fo) fo.onclick = () => { if (confirm('Forfeit this battle?')) socket.emit('forfeit', { id }); };
    const bb = $('#bBack'); if (bb) bb.onclick = () => { S.tab = 'home'; render(); };
    const send = () => { const v = $('#bChat').value.trim(); if (v) { socket.emit('chat', { room: id, text: v }); $('#bChat').value = ''; } };
    $('#bSend').onclick = send; $('#bChat').onkeydown = e => { if (e.key === 'Enter') send(); };
  }
  function switchBtns(r, disabledAll) {
    return r.team.map(m => {
      const dis = disabledAll || m.fainted || m.active;
      return `<button class="sw-btn" data-switch="${m.index}" ${dis ? 'disabled' : ''} title="${esc(monTip(m))}">${badge(S.byId[m.id], 'sm' + (m.fainted ? ' fainted' : ''))}<span class="grow">${esc(m.name)}${m.status ? ` <span class="st st-${m.status}">${STATUSL[m.status]}</span>` : ''}<div class="mini-hp"><i style="width:${m.hpPct}%;background:${hpColor(m.hpPct)}"></i></div></span></button>`;
    }).join('');
  }
  function moveTip(n) { const m = S.dex.moves[n]; return `${n} — ${m.type} ${m.cat}${m.power ? ', ' + m.power + ' BP' : ''}${m.acc === true ? '' : ', ' + m.acc + '% acc'}${m.prio ? ', priority ' + (m.prio > 0 ? '+' : '') + m.prio : ''}`; }
  function monTip(m) { return `${m.name} — ${m.hp}/${m.maxhp} HP · ${m.ability}${m.item ? ' · ' + m.item : ''}\n${(m.moves || []).map(x => x.name + ` (${x.pp}/${x.maxpp})`).join(', ')}`; }
  function renderLog(p) {
    return p.log.map(l => l.cls === 'chat' ? `<div class="chatline">${esc(l.text)}</div>` : `<div class="${l.cls}">${esc(l.text)}</div>`).join('');
  }

  // ---------- boot ----------
  fetch('/api/dex').then(r => r.json()).then(d => {
    S.dex = d; S.byId = Object.fromEntries(d.fighters.map(f => [f.id, f]));
    if (!S.teams.length) S.teams.push({ name: 'Starter team', mons: ['mario', 'link', 'pikachu', 'samus', 'kirby', 'fox'].map(id => newMon(S.byId[id])) }), save();
    render();
  });
})();
