(() => {
  'use strict';

  console.log('[rende v4] carregando');

  const CFG = window.RENDE_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const NOME = { gasolina: 'Gasolina', etanol: 'Etanol' };
  const toCents = (v) => Math.round(v * 100);

  const P = CFG.PRECOS_PREDEFINIDOS || {};
  const PRESETS = {
    gasolina: (P.gasolina || [5.79, 5.89, 5.99]).map(toCents),
    etanol: (P.etanol || [3.49, 3.59, 3.69]).map(toCents),
  };
  const VALORES_RAPIDOS = (CFG.VALORES_RAPIDOS || [50, 100, 150]).map(toCents);

  const fmtBRL = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtNum = (n, d = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtDec = (n) => String(n).replace('.', ',');
  const parseDec = (s) => { const n = parseFloat(String(s).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const digits = (s) => String(s).replace(/\D/g, '');
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));

  function readJSON(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } }
  function writeJSON(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  function bindMoney(el, onChange, maxDigits = 6) {
    el.addEventListener('input', () => {
      const d = digits(el.value).slice(0, maxDigits);
      const cents = d ? parseInt(d, 10) : 0;
      el.value = d ? fmtBRL(cents) : '';
      onChange(cents);
    });
  }
  function bindDecimal(el, onChange) {
    el.addEventListener('input', () => {
      el.value = el.value.replace(/[^\d.,]/g, '');
      onChange(parseDec(el.value));
    });
  }
  function bindKm(el, onChange, maxDigits = 7) {
    el.addEventListener('input', () => {
      const d = digits(el.value).slice(0, maxDigits);
      el.value = d ? Number(d).toLocaleString('pt-BR') : '';
      onChange(d ? parseInt(d, 10) : null);
    });
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ============================================================
     ESTADO
     ============================================================ */
  const DEFAULTS = () => ({
    carro: {
      kml: { gasolina: 12, etanol: 8.5 }, tanque: 50,
      preco: { gasolina: PRESETS.gasolina[1], etanol: PRESETS.etanol[1] },
      valor: 10000, modo: 'valor', combustivel: 'etanol',
    },
    moto: {
      kml: { gasolina: 35, etanol: 25 }, tanque: 12,
      preco: { gasolina: PRESETS.gasolina[1], etanol: PRESETS.etanol[1] },
      valor: 5000, modo: 'valor', combustivel: 'etanol',
    },
  });

  const LS_CFG = 'rende.cfg.v1';
  const LS_VEIC = 'rende.veiculo';
  const LS_ENTRIES = 'rende.abastecimentos.v1';
  const LS_KMATUAL = 'rende.kmatual.v1';
  const LS_NOTIFS = 'rende.notifs.v4';
  const LS_NOTCFG = 'rende.notifcfg.v4';
  const LS_BEST = 'rende.melhor.v4';
  const LS_SEEN = 'rende.seen.v4';

  const state = {
    veiculo: localStorage.getItem(LS_VEIC) === 'moto' ? 'moto' : 'carro',
    view: 'calc',
    cfg: DEFAULTS(),
    entries: [],
  };
  const cfg = () => state.cfg[state.veiculo];

  function mergeCfg(saved) {
    const base = DEFAULTS();
    for (const v of ['carro', 'moto']) {
      const s = saved && saved[v];
      if (!s) continue;
      base[v] = {
        ...base[v], ...s,
        kml: { ...base[v].kml, ...(s.kml || {}) },
        preco: { ...base[v].preco, ...(s.preco || {}) },
      };
    }
    return base;
  }
  try { state.cfg = mergeCfg(JSON.parse(localStorage.getItem(LS_CFG) || 'null')); } catch { /* */ }

  function getKmAtual(v) { return readJSON(LS_KMATUAL, {})[v]; }
  function setKmAtual(v, n) {
    const map = readJSON(LS_KMATUAL, {});
    map[v] = n;
    writeJSON(LS_KMATUAL, map);
  }

  /* ============================================================
     NOTIFICAÇÕES — declaradas ANTES de qualquer uso
     ============================================================ */
  const ncfg = { lembrete: true, dias: 7, melhor: true, autonomia: true, balao: true, ...readJSON(LS_NOTCFG, {}) };
  let notifs = readJSON(LS_NOTIFS, []);
  const seenBalloons = new Set(readJSON(LS_SEEN, []));
  let pushOn = false;

  const saveNotifs = () => localStorage.setItem(LS_NOTIFS, JSON.stringify(notifs));
  const saveNcfg = () => localStorage.setItem(LS_NOTCFG, JSON.stringify(ncfg));
  const saveSeen = () => localStorage.setItem(LS_SEEN, JSON.stringify([...seenBalloons].slice(-50)));

  function renderBell() {
    const n = notifs.filter((x) => !x.lida).length;
    const badge = $('#badge');
    if (!badge) return;
    badge.hidden = n === 0;
    badge.textContent = n > 9 ? '9+' : String(n);
    const bell = $('#bell');
    if (bell) bell.setAttribute('aria-label', n ? `Notificações, ${n} novas` : 'Notificações');
  }

  function timeAgo(iso) {
    const min = Math.round((Date.now() - new Date(iso)) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'ontem' : `há ${d} dias`;
  }

  function renderNotifs() {
    const ul = $('#notifList');
    if (!ul) return;
    if (!notifs.length) {
      ul.innerHTML = '<li class="empty" style="padding-left:16px">Nada por aqui ainda.</li>';
      return;
    }
    ul.innerHTML = notifs.slice(0, 12).map((n) => `
      <li class="${n.lida ? '' : 'new'}">
        <b>${n.titulo}</b><p>${n.texto}</p><time>${timeAgo(n.criado_em)}</time>
      </li>`).join('');
  }

  function showBalloon({ titulo, texto, tipo = 'info', autoClose = 6500, key }) {
    if (!ncfg.balao) return;
    if (key && seenBalloons.has(key)) return;
    if (key) { seenBalloons.add(key); saveSeen(); }

    const stack = $('#balloonStack');
    if (!stack) return;

    const el = document.createElement('div');
    el.className = `balloon ${tipo}`;
    const icoSvg = tipo === 'warn'
      ? '<polygon points="12,3 22,20 2,20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><line x1="12" y1="9" x2="12" y2="14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.2" fill="currentColor"/>'
      : tipo === 'ok'
        ? '<polyline points="4,12 10,18 20,6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'
        : '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><line x1="12" y1="8" x2="12" y2="13" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1.3" fill="currentColor"/>';
    el.innerHTML = `
      <div class="b-ico"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">${icoSvg}</svg></div>
      <div class="b-body"><b>${titulo}</b><p>${texto}</p></div>
      <button class="b-close" aria-label="Fechar">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
      </button>`;
    const close = () => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
    };
    el.querySelector('.b-close').addEventListener('click', close);
    stack.append(el);
    if (autoClose) setTimeout(close, autoClose);
  }

  function systemNotify(titulo, texto) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(titulo, {
            body: texto,
            icon: 'icons/icon-192.png',
            badge: 'icons/favicon-32.png',
            tag: 'rende',
          });
        }).catch(() => {
          new Notification(titulo, { body: texto, icon: 'icons/icon-192.png' });
        });
      } else {
        new Notification(titulo, { body: texto, icon: 'icons/icon-192.png' });
      }
    } catch (e) { console.warn('[rende v4] notify', e); }
  }

  function addNotif({ key, titulo, texto, tipo = 'info', silent = false, showBalloonToo = true }) {
    console.log('[rende v4] addNotif:', titulo);
    if (notifs.some((n) => n.key === key)) return;
    notifs.unshift({ id: uid(), key, titulo, texto, tipo, criado_em: new Date().toISOString(), lida: false });
    notifs = notifs.slice(0, 30);
    saveNotifs();
    renderBell();
    const sheet = $('#sheet');
    if (sheet && !sheet.hidden) renderNotifs();
    if (showBalloonToo) showBalloon({ titulo, texto, tipo, key: 'b:' + key });
    if (!silent) systemNotify(titulo, texto);
  }

  /* ============================================================
     STORE
     ============================================================ */
  const store = {
    sb: null, cloud: false, uid: null,
    async init() {
      if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || !window.supabase) return;
      try {
        this.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
        let { data } = await this.sb.auth.getSession();
        if (!data.session) {
          const res = await this.sb.auth.signInAnonymously();
          if (res.error) throw res.error;
          data = res.data;
        }
        this.uid = data.session.user.id;
        this.cloud = true;
      } catch (e) {
        console.warn('[rende v4] Supabase off', e);
        this.cloud = false;
      }
    },
    async list() {
      if (this.cloud) {
        try {
          const { data, error } = await this.sb.from('abastecimentos')
            .select('*').order('criado_em', { ascending: false }).limit(500);
          if (error) throw error;
          return data.map((r) => ({
            id: r.id, veiculo: r.veiculo, combustivel: r.combustivel,
            preco: Number(r.preco_litro), valor: Number(r.valor_total),
            litros: Number(r.litros), odometro: r.odometro, criado_em: r.criado_em,
          }));
        } catch (e) { console.warn(e); return []; }
      }
      try { return JSON.parse(localStorage.getItem(LS_ENTRIES) || '[]'); } catch { return []; }
    },
    async add(e) {
      if (this.cloud) {
        const { error } = await this.sb.from('abastecimentos').insert({
          veiculo: e.veiculo, combustivel: e.combustivel,
          preco_litro: e.preco, valor_total: e.valor, litros: e.litros, odometro: e.odometro,
        });
        if (error) throw error;
        return;
      }
      const all = await this.list();
      all.unshift({ ...e, id: uid(), criado_em: new Date().toISOString() });
      localStorage.setItem(LS_ENTRIES, JSON.stringify(all));
    },
    async remove(id) {
      if (this.cloud) {
        const { error } = await this.sb.from('abastecimentos').delete().eq('id', id);
        if (error) throw error;
        return;
      }
      const all = (await this.list()).filter((x) => x.id !== id);
      localStorage.setItem(LS_ENTRIES, JSON.stringify(all));
    },
    async loadCfg() {
      if (!this.cloud) return;
      try {
        const { data, error } = await this.sb.from('configs').select('veiculo,dados');
        if (error) throw error;
        const saved = {};
        data.forEach((r) => { saved[r.veiculo] = r.dados; });
        state.cfg = mergeCfg({ ...state.cfg, ...saved });
        localStorage.setItem(LS_CFG, JSON.stringify(state.cfg));
      } catch (e) { console.warn(e); }
    },
    async saveCfg(veiculo, dados) {
      if (!this.cloud) return;
      const { error } = await this.sb.from('configs').upsert(
        { user_id: this.uid, veiculo, dados, atualizado_em: new Date().toISOString() },
        { onConflict: 'user_id,veiculo' },
      );
      if (error) console.warn(error);
    },
  };

  let persistTimer;
  function persist() {
    localStorage.setItem(LS_CFG, JSON.stringify(state.cfg));
    clearTimeout(persistTimer);
    const v = state.veiculo;
    persistTimer = setTimeout(() => store.saveCfg(v, state.cfg[v]), 800);
  }

  /* ============================================================
     CÁLCULOS
     ============================================================ */
  function calc(fuel) {
    const c = cfg();
    const price = c.preco[fuel] / 100;
    const kml = c.kml[fuel];
    if (!(price > 0) || !(kml > 0)) return { ok: false };
    let liters, spend;
    if (c.modo === 'cheio') {
      if (!(c.tanque > 0)) return { ok: false };
      liters = c.tanque; spend = liters * price;
    } else {
      spend = c.valor / 100;
      if (!(spend > 0)) return { ok: false };
      liters = spend / price;
    }
    return { ok: true, price, kml, liters, spend, km: liters * kml, cpk: price / kml };
  }

  function bestFuel(r) {
    if (!r.gasolina.ok || !r.etanol.ok) return null;
    return r.etanol.cpk <= r.gasolina.cpk ? 'etanol' : 'gasolina';
  }

  let last = null;

  function kmlReal(fuel) {
    const list = state.entries
      .filter((e) => e.veiculo === state.veiculo && e.combustivel === fuel && e.odometro != null)
      .sort((a, b) => a.odometro - b.odometro);
    let km = 0, lit = 0;
    for (let i = 1; i < list.length; i++) {
      const d = list[i].odometro - list[i - 1].odometro;
      const kml = d / list[i].litros;
      if (d > 0 && kml > 0.5 && kml < 80) { km += d; lit += list[i].litros; }
    }
    return lit ? km / lit : null;
  }

  function ultimoComOdo(v) {
    return state.entries
      .filter((e) => e.veiculo === v && e.odometro != null)
      .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))[0] || null;
  }

  /* ============================================================
     UI
     ============================================================ */
  const priceEls = {};

  function buildUI() {
    const vc = $('#valorChips');
    vc.innerHTML = '';
    VALORES_RAPIDOS.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'chip'; b.dataset.valor = c;
      b.textContent = fmtBRL(c).replace(',00', '');
      vc.append(b);
    });
    const full = document.createElement('button');
    full.className = 'chip'; full.dataset.valor = 'cheio'; full.textContent = 'Tanque cheio';
    vc.append(full);
  }

  function buildPriceRow() {
    const rows = $('#priceRows');
    rows.innerHTML = '';
    const fuel = cfg().combustivel || 'etanol';
    const row = document.createElement('div');
    row.className = 'pricerow';
    row.innerHTML = `<div class="chips"></div>`;
    const chipsBox = $('.chips', row);
    const chips = PRESETS[fuel].map((c) => {
      const b = document.createElement('button');
      b.className = 'chip'; b.dataset.cents = c; b.textContent = fmtBRL(c);
      chipsBox.append(b);
      return b;
    });
    const custom = document.createElement('input');
    custom.className = 'chip'; custom.placeholder = 'Outro valor';
    custom.inputMode = 'numeric'; custom.autocomplete = 'off';
    custom.setAttribute('aria-label', `Outro preço da ${NOME[fuel].toLowerCase()} por litro`);
    chipsBox.append(custom);
    rows.append(row);
    priceEls[fuel] = { chips, custom };

    chips.forEach((b) => b.addEventListener('click', () => {
      cfg().preco[fuel] = parseInt(b.dataset.cents, 10);
      custom.value = '';
      persist(); render();
    }));
    bindMoney(custom, (c) => {
      if (c > 0) { cfg().preco[fuel] = c; persist(); render(); }
    }, 4);

    let matched = false;
    chips.forEach((b) => {
      const on = parseInt(b.dataset.cents, 10) === cfg().preco[fuel];
      b.setAttribute('aria-pressed', on);
      if (on) matched = true;
    });
    const isPreset = PRESETS[fuel].includes(cfg().preco[fuel]);
    custom.value = isPreset ? '' : fmtBRL(cfg().preco[fuel]);
  }

  function syncInputs() {
    const c = cfg();
    $('#valor').value = c.valor ? fmtBRL(c.valor) : '';
    $('#kmlGasolina').value = fmtDec(c.kml.gasolina);
    $('#kmlEtanol').value = fmtDec(c.kml.etanol);
    $('#tanque').value = fmtDec(c.tanque);
    $('#veiculoNome').textContent = state.veiculo;
    $('#histVeiculo').textContent = state.veiculo;
    $$('.seg button').forEach((b) => b.setAttribute('aria-selected', b.dataset.veiculo === state.veiculo));
    $$('.fuel-opt').forEach((b) => b.setAttribute('aria-pressed', b.dataset.fuel === c.combustivel));
  }

  function render() {
    const c = cfg();
    const r = { gasolina: calc('gasolina'), etanol: calc('etanol') };
    const best = bestFuel(r);
    const sel = c.combustivel || 'etanol';
    const R = r[sel];
    last = { r, sel };
    watchBest(best);

    $$('.fuel-opt').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.fuel === sel);
    });

    const nome = NOME[sel].toLowerCase();
    if (R.ok) {
      $('#heroLabel').textContent = c.modo === 'cheio'
        ? `Tanque cheio de ${nome} (${fmtNum(c.tanque, 0)} L) roda`
        : `Com ${fmtBRL(R.spend * 100)} de ${nome} você roda`;
      $('#heroKm').textContent = fmtNum(R.km, 0);
      $('#heroSub').textContent = `${fmtNum(R.kml)} km/l · ${fmtNum(R.liters)} L · ${fmtBRL(R.price * 100)}/L`;
    } else {
      $('#heroLabel').textContent = 'Informe o valor, o preço do litro e o km/l';
      $('#heroKm').textContent = '—';
      $('#heroSub').textContent = '';
    }

    $$('#valorChips .chip').forEach((b) => {
      const isFull = b.dataset.valor === 'cheio';
      const on = isFull ? c.modo === 'cheio' : (c.modo === 'valor' && c.valor === parseInt(b.dataset.valor, 10));
      b.setAttribute('aria-pressed', on);
    });
    if (c.modo === 'cheio' && R.ok) $('#valor').value = fmtBRL(Math.round(R.spend * 100));

    if (!priceEls[sel]) buildPriceRow();
    const pe = priceEls[sel];
    if (pe) {
      let matched = false;
      pe.chips.forEach((b) => {
        const on = parseInt(b.dataset.cents, 10) === c.preco[sel];
        b.setAttribute('aria-pressed', on);
        if (on) matched = true;
      });
      const isPreset = PRESETS[sel].includes(c.preco[sel]);
      if (document.activeElement !== pe.custom) {
        pe.custom.value = isPreset ? '' : fmtBRL(c.preco[sel]);
      }
      pe.custom.classList.toggle('active', !matched && !!pe.custom.value);
    }

    renderCompare(r, best, sel);

    const btn = $('#registrar');
    btn.disabled = !R.ok;
    btn.textContent = R.ok ? `Registrar ${fmtBRL(Math.round(R.spend * 100))} de ${nome}` : 'Registrar';

    renderPrevisao();
  }

  function renderCompare(r, best, sel) {
    const g = r.gasolina, e = r.etanol;
    const verdict = $('#verdict');
    const table = $('#compare');
    if (!g.ok || !e.ok) {
      verdict.textContent = 'Preencha preço e km/l dos dois combustíveis para comparar.';
      table.innerHTML = '';
      return;
    }
    const worst = best === 'etanol' ? g : e;
    const win = r[best];
    const pct = Math.round(((worst.cpk - win.cpk) / worst.cpk) * 100);
    const c = cfg();
    const breakEven = (c.preco.gasolina / 100) * (c.kml.etanol / c.kml.gasolina);

    verdict.innerHTML = pct === 0
      ? 'Os dois custam o mesmo por km.'
      : `<strong>${NOME[best]} compensa:</strong> ${fmtBRL(Math.round(win.cpk * 100))}/km contra ${fmtBRL(Math.round(worst.cpk * 100))}/km — ${pct}% mais barato.`;
    verdict.innerHTML += `<span class="sub">Com a gasolina a ${fmtBRL(c.preco.gasolina)}, o etanol compensa até ${fmtBRL(Math.round(breakEven * 100))} o litro.</span>`;

    const col = (f) => (f === sel ? 'sel' : '');
    table.innerHTML = `
      <thead><tr>
        <th></th>
        <th class="${col('gasolina')}"><i class="dot gas"></i>Gasolina</th>
        <th class="${col('etanol')}"><i class="dot eth"></i>Etanol</th>
      </tr></thead>
      <tbody>
        <tr><td>Litros</td><td class="${col('gasolina')}">${fmtNum(g.liters)} L</td><td class="${col('etanol')}">${fmtNum(e.liters)} L</td></tr>
        <tr><td>Autonomia</td><td class="${col('gasolina')} strong">${fmtNum(g.km, 0)} km</td><td class="${col('etanol')} strong">${fmtNum(e.km, 0)} km</td></tr>
        <tr><td>Custo por km</td><td class="${col('gasolina')}">${fmtBRL(Math.round(g.cpk * 100))}</td><td class="${col('etanol')}">${fmtBRL(Math.round(e.cpk * 100))}</td></tr>
      </tbody>`;
  }

  function renderPrevisao() {
    const box = $('#kmAtualBlock');
    const v = state.veiculo;
    const lastEntry = ultimoComOdo(v);
    if (!lastEntry) { box.hidden = true; return; }
    box.hidden = false;
    $('#kmSaved').textContent = `Último abastecimento em ${fmtNum(lastEntry.odometro, 0)} km`;

    let atual = getKmAtual(v);
    if (atual == null || atual < lastEntry.odometro) {
      atual = lastEntry.odometro;
      setKmAtual(v, atual);
    }
    const input = $('#kmAtual');
    if (document.activeElement !== input) {
      input.value = Number(atual).toLocaleString('pt-BR');
    }

    const kmlUsar = kmlReal(lastEntry.combustivel) || cfg().kml[lastEntry.combustivel];
    const wrap = $('#prevWrap');
    if (!(kmlUsar > 0) || !(lastEntry.litros > 0)) {
      wrap.innerHTML = `<p class="prev-msg">Informe o km/l do veículo para calcular a previsão.</p>`;
      return;
    }

    const autonomiaTotal = lastEntry.litros * kmlUsar;
    const kmPrevisto = lastEntry.odometro + autonomiaTotal;
    const restante = Math.round(kmPrevisto - atual);
    const pct = Math.max(0, Math.min(100, (restante / autonomiaTotal) * 100));

    let status = 'ok', label = 'Tanque cheio';
    if (restante <= 0) { status = 'danger'; label = 'Vazio'; }
    else if (restante <= 5) { status = 'danger'; label = 'Crítico'; }
    else if (pct <= 20) { status = 'warn'; label = 'Baixo'; }
    else if (pct <= 50) { status = 'warn'; label = 'Meio tanque'; }

    const diasUlt = Math.max(1, Math.floor((Date.now() - new Date(lastEntry.criado_em)) / 864e5));
    const custoKm = (lastEntry.preco / kmlUsar);

    wrap.innerHTML = `
      <div class="previsao">
        <div class="prev-head">
          <span class="lbl">Autonomia restante</span>
          <span class="status ${status}">${label}</span>
        </div>
        <div class="prev-bar">
          <div class="fill ${status}" style="width:${pct}%"></div>
          <div class="mark" style="left:calc(${Math.min(100, pct)}% - 1px)"></div>
        </div>
        <div class="prev-stats">
          <div><b>${fmtNum(Math.max(0, restante), 0)}</b><span>km restantes</span></div>
          <div><b>${fmtNum(autonomiaTotal, 0)}</b><span>km no tanque</span></div>
          <div><b>${fmtNum(kmlUsar)}</b><span>km/l</span></div>
        </div>
        <p class="prev-msg ${status}">
          ${mensagemPrevisao(restante, kmPrevisto, diasUlt, custoKm)}
        </p>
      </div>`;

    checkAutonomiaBaixa(v, lastEntry, restante);
  }

  function mensagemPrevisao(restante, kmPrevisto, dias, custoKm) {
    if (restante <= 0) return `Pela previsão o tanque já esvaziou. Abasteça assim que possível.`;
    const mediaDia = Math.max(1, Math.round((kmPrevisto - restante) / Math.max(1, dias)));
    const diasRestantes = Math.max(1, Math.round(restante / mediaDia));
    if (restante <= 30) {
      return `Faltam ~${fmtNum(restante, 0)} km (${diasRestantes} dia${diasRestantes > 1 ? 's' : ''} no seu ritmo). Melhor já procurar um posto.`;
    }
    return `Abasteça por volta de ${fmtNum(kmPrevisto, 0)} km — cerca de ${diasRestantes} dia${diasRestantes > 1 ? 's' : ''} no seu ritmo. Custo atual: ${fmtBRL(Math.round(custoKm * 100))}/km.`;
  }

  async function loadHistory() {
    state.entries = await store.list();
    renderHistory();
    checkReminders();
    renderPrevisao();
  }

  function renderHistory() {
    const list = state.entries
      .filter((e) => e.veiculo === state.veiculo)
      .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));

    const real = new Map();
    const withOdo = list.filter((e) => e.odometro != null).sort((a, b) => a.odometro - b.odometro);
    let kmSum = 0, litSum = 0;
    for (let i = 1; i < withOdo.length; i++) {
      const km = withOdo[i].odometro - withOdo[i - 1].odometro;
      const kml = km / withOdo[i].litros;
      if (km > 0 && kml > 0.5 && kml < 80) {
        real.set(withOdo[i].id, { km, kml });
        kmSum += km; litSum += withOdo[i].litros;
      }
    }
    const now = new Date();
    const spendMonth = list
      .filter((e) => { const d = new Date(e.criado_em); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
      .reduce((s, e) => s + e.valor, 0);

    $('#stats').innerHTML = `
      <div class="stat"><b>${fmtBRL(Math.round(spendMonth * 100))}</b><span>gasto no mês</span></div>
      <div class="stat"><b>${litSum ? fmtNum(kmSum / litSum) + ' km/l' : '—'}</b><span>consumo real</span></div>
      <div class="stat"><b>${list.length}</b><span>abastecimentos</span></div>`;

    const ul = $('#histList');
    if (!list.length) {
      ul.innerHTML = `<li class="empty" style="display:block">Nenhum abastecimento de ${state.veiculo} ainda.</li>`;
      return;
    }
    ul.innerHTML = list.map((e) => {
      const d = new Date(e.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
      const rr = real.get(e.id);
      const odo = e.odometro != null ? `${fmtNum(e.odometro, 0)} km` : '';
      const realTxt = rr ? `<span class="real">${fmtNum(rr.kml)} km/l real</span>` : '';
      const r2 = [odo, realTxt].filter(Boolean).join(' · ');
      return `<li>
        <div class="l1"><i class="dot ${e.combustivel === 'gasolina' ? 'gas' : 'eth'}"></i>${NOME[e.combustivel]} <span class="date">${d}</span></div>
        <div class="r1">${fmtBRL(Math.round(e.valor * 100))}</div>
        <div class="l2">${fmtNum(e.litros)} L · ${fmtBRL(Math.round(e.preco * 100))}/L</div>
        <div class="r2">${r2}</div>
        <button class="del" data-id="${e.id}">Excluir</button>
      </li>`;
    }).join('');
  }

  /* ============================================================
     SALVAR KM
     ============================================================ */
  function salvarKmAtual() {
    const n = parseInt(digits($('#kmAtual').value), 10);
    const lastEntry = ultimoComOdo(state.veiculo);
    console.log('[rende v4] salvarKmAtual', n);

    if (!Number.isFinite(n) || n <= 0) {
      renderPrevisao();
      toast('Informe um km válido.');
      return;
    }
    if (lastEntry && n < lastEntry.odometro) {
      renderPrevisao();
      toast('O km atual não pode ser menor que o do último abastecimento.');
      return;
    }

    setKmAtual(state.veiculo, n);
    renderPrevisao();
    toast(`Km atual salvo: ${fmtNum(n, 0)} km`);

    const fuel = (lastEntry && lastEntry.combustivel) || cfg().combustivel || 'etanol';
    const kmlUsar = (lastEntry && (kmlReal(fuel) || cfg().kml[fuel])) || cfg().kml[fuel];
    const litrosBase = (lastEntry && lastEntry.litros) || 0;

    if (lastEntry && kmlUsar > 0 && litrosBase > 0) {
      const autonomiaTotal = litrosBase * kmlUsar;
      const kmPrevisto = lastEntry.odometro + autonomiaTotal;
      const restante = Math.max(0, Math.round(kmPrevisto - n));
      const tipo = restante <= 30 ? 'warn' : 'ok';
      addNotif({
        key: `kmatual-${state.veiculo}-${Date.now()}`,
        titulo: `Você pode rodar até ${fmtNum(restante, 0)} km`,
        texto: `Com o painel em ${fmtNum(n, 0)} km, o tanque deve durar até ${fmtNum(kmPrevisto, 0)} km.`,
        tipo,
      });
    } else {
      const tanque = cfg().tanque || 0;
      const autonomiaEstimada = tanque * kmlUsar;
      if (autonomiaEstimada > 0) {
        addNotif({
          key: `kmatual-est-${state.veiculo}-${Date.now()}`,
          titulo: `Km ${fmtNum(n, 0)} salvo`,
          texto: `Com tanque cheio (${fmtNum(tanque, 0)} L) e ${fmtNum(kmlUsar)} km/l, você roda até ${fmtNum(autonomiaEstimada, 0)} km.`,
          tipo: 'ok',
        });
      } else {
        addNotif({
          key: `kmatual-simples-${state.veiculo}-${Date.now()}`,
          titulo: `Km ${fmtNum(n, 0)} salvo`,
          texto: `Registre um abastecimento para calcular a autonomia real.`,
          tipo: 'info',
        });
      }
    }
  }

  /* ============================================================
     EVENTOS
     ============================================================ */
  function bindEvents() {
    $$('.seg button').forEach((b) => b.addEventListener('click', () => {
      state.veiculo = b.dataset.veiculo;
      localStorage.setItem(LS_VEIC, state.veiculo);
      buildPriceRow();
      syncInputs(); render(); renderHistory();
    }));

    $$('.fuel-opt').forEach((b) => b.addEventListener('click', () => {
      cfg().combustivel = b.dataset.fuel;
      persist();
      buildPriceRow();
      syncInputs();
      render();
    }));

    document.addEventListener('click', (ev) => {
      const chip = ev.target.closest('#valorChips .chip');
      if (!chip) return;
      const c = cfg();
      if (chip.dataset.valor === 'cheio') c.modo = 'cheio';
      else { c.modo = 'valor'; c.valor = parseInt(chip.dataset.valor, 10); $('#valor').value = fmtBRL(c.valor); }
      persist(); render();
    });

    const valor = $('#valor');
    valor.addEventListener('focus', () => {
      const c = cfg();
      if (c.modo === 'cheio') {
        c.modo = 'valor';
        c.valor = digits(valor.value) ? parseInt(digits(valor.value), 10) : 0;
        persist(); render();
      }
    });
    bindMoney(valor, (cents) => { const c = cfg(); c.modo = 'valor'; c.valor = cents; persist(); render(); }, 6);

    bindDecimal($('#kmlGasolina'), (n) => { cfg().kml.gasolina = n; persist(); render(); });
    bindDecimal($('#kmlEtanol'), (n) => { cfg().kml.etanol = n; persist(); render(); });
    bindDecimal($('#tanque'), (n) => { cfg().tanque = n; persist(); render(); });

    $('#odo').addEventListener('input', (ev) => {
      const d = digits(ev.target.value).slice(0, 7);
      ev.target.value = d ? Number(d).toLocaleString('pt-BR') : '';
    });

    bindKm($('#kmAtual'), () => {});

    $('#kmSave').addEventListener('click', salvarKmAtual);
    $('#kmAtual').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); $('#kmAtual').blur(); salvarKmAtual(); }
    });

    $('#registrar').addEventListener('click', async () => {
      const { r, sel } = last;
      const R = r[sel];
      if (!R.ok) return;
      const odo = digits($('#odo').value);
      const entry = {
        veiculo: state.veiculo, combustivel: sel,
        preco: Math.round(R.price * 1000) / 1000,
        valor: Math.round(R.spend * 100) / 100,
        litros: Math.round(R.liters * 1000) / 1000,
        odometro: odo ? parseInt(odo, 10) : null,
      };
      const btn = $('#registrar');
      btn.disabled = true;
      try {
        await store.add(entry);
        if (entry.odometro) setKmAtual(state.veiculo, entry.odometro);
        $('#odo').value = '';
        toast('Abastecimento registrado');
        await loadHistory();
      } catch (e) { console.warn(e); toast('Não foi possível registrar.'); }
      btn.disabled = false;
    });

    $('#histList').addEventListener('click', async (ev) => {
      const b = ev.target.closest('.del');
      if (!b) return;
      if (!confirm('Excluir este abastecimento?')) return;
      try { await store.remove(b.dataset.id); toast('Abastecimento excluído'); await loadHistory(); }
      catch { toast('Não foi possível excluir.'); }
    });

    $$('.tabbar button').forEach((b) => b.addEventListener('click', () => {
      state.view = b.dataset.view;
      $$('.tabbar button').forEach((x) => {
        if (x === b) x.setAttribute('aria-current', 'page');
        else x.removeAttribute('aria-current');
      });
      $('#viewCalc').hidden = state.view !== 'calc';
      $('#viewHist').hidden = state.view !== 'hist';
      if (state.view === 'hist') renderHistory();
      window.scrollTo({ top: 0 });
    }));
  }

  /* ============================================================
     CHECKS AUTOMÁTICOS
     ============================================================ */
  function checkReminders() {
    if (!ncfg.lembrete || !(ncfg.dias > 0)) return;
    for (const v of ['carro', 'moto']) {
      const es = state.entries.filter((e) => e.veiculo === v)
        .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
      if (!es.length) continue;
      const lastE = es[0];
      const dias = Math.floor((Date.now() - new Date(lastE.criado_em)) / 864e5);
      if (dias >= ncfg.dias) {
        const quando = new Date(lastE.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
        addNotif({
          key: `lembrete-${lastE.id}-${Math.floor(dias / ncfg.dias)}`,
          titulo: `Hora de abastecer o ${v}?`,
          texto: `Faz ${dias} dias desde o último abastecimento (${quando}).`,
          tipo: 'warn',
          silent: pushOn,
        });
      }
    }
  }

  let bestTimer;
  function watchBest(best) {
    if (!ncfg.melhor || !best) return;
    const v = state.veiculo;
    clearTimeout(bestTimer);
    bestTimer = setTimeout(() => {
      const map = readJSON(LS_BEST, {});
      const prev = map[v];
      map[v] = best;
      localStorage.setItem(LS_BEST, JSON.stringify(map));
      if (prev && prev !== best) {
        addNotif({
          key: `melhor-${v}-${Date.now()}`,
          titulo: `${NOME[best]} passou a compensar`,
          texto: `No seu ${v}, ${NOME[best].toLowerCase()} agora sai mais barato por km.`,
          tipo: 'ok',
        });
      }
    }, 2000);
  }

  function checkAutonomiaBaixa(v, entry, restante) {
    if (!ncfg.autonomia) return;
    if (restante > 5) return;
    addNotif({
      key: `autonomia-${v}-${entry.id}`,
      titulo: `Combustível acabando no ${v}`,
      texto: restante > 0
        ? `Pela previsão, faltam só ~${fmtNum(restante, 0)} km antes do tanque esvaziar.`
        : 'A previsão indica que o tanque já deve estar vazio. Abasteça assim que possível.',
      tipo: 'warn',
    });
  }

  /* ============================================================
     PUSH
     ============================================================ */
  function urlB64ToUint8Array(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }
  async function syncPush() {
    pushOn = false;
    try {
      if (!store.cloud || !CFG.VAPID_PUBLIC_KEY) return false;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false;
      if (Notification.permission !== 'granted') return false;
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(CFG.VAPID_PUBLIC_KEY),
        });
      }
      const j = sub.toJSON();
      const { error } = await store.sb.from('push_subscriptions').upsert({
        endpoint: j.endpoint, user_id: store.uid,
        p256dh: j.keys.p256dh, auth: j.keys.auth,
        dias: ncfg.dias, lembrete_ativo: ncfg.lembrete,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (error) throw error;
      pushOn = true;
    } catch (e) { console.warn('[rende v4] push off', e); }
    if (!$('#sheetGear').hidden) updatePermUI();
    return pushOn;
  }

  function updatePermUI() {
    const btn = $('#permBtn'), hint = $('#permHint');
    const ios = /iphone|ipad/i.test(navigator.userAgent);
    const base = 'Os avisos são conferidos quando você abre o app.';
    if (!('Notification' in window)) {
      btn.hidden = true;
      hint.textContent = ios
        ? 'No iPhone, adicione à Tela de Início (Compartilhar > Adicionar) para receber avisos do sistema.'
        : 'Este navegador não permite avisos do sistema.';
      return;
    }
    btn.hidden = false;
    if (Notification.permission === 'granted') {
      btn.textContent = 'Avisos do celular ativados'; btn.disabled = true;
      hint.textContent = pushOn ? 'Lembretes ativos mesmo com o app fechado.' : base;
    } else if (Notification.permission === 'denied') {
      btn.textContent = 'Avisos bloqueados'; btn.disabled = true;
      hint.textContent = 'Libere as notificações nas configurações do navegador.';
    } else {
      btn.textContent = 'Ativar avisos no celular'; btn.disabled = false;
      hint.textContent = base;
    }
  }

  /* ============================================================
     SHEETS
     ============================================================ */
  let lastFocus = null;
  function openNotifSheet() {
    lastFocus = document.activeElement;
    renderNotifs();
    $('#sheet').hidden = false; $('#sheetBg').hidden = false;
    document.body.classList.add('locked');
    $('#sheetClose').focus();
  }
  function closeNotifSheet() {
    $('#sheet').hidden = true;
    if ($('#sheetGear').hidden) { $('#sheetBg').hidden = true; document.body.classList.remove('locked'); }
    notifs.forEach((n) => { n.lida = true; });
    saveNotifs(); renderBell();
    if (lastFocus) lastFocus.focus();
  }
  function openGearSheet() {
    lastFocus = document.activeElement;
    $('#optLembrete').checked = ncfg.lembrete;
    $('#optDias').value = ncfg.dias;
    $('#optMelhor').checked = ncfg.melhor;
    $('#optAutonomia').checked = ncfg.autonomia;
    $('#optBalao').checked = ncfg.balao;
    $('#diasRow').classList.toggle('off', !ncfg.lembrete);
    updatePermUI();
    $('#sheetGear').hidden = false; $('#sheetBg').hidden = false;
    document.body.classList.add('locked');
    $('#gearClose').focus();
  }
  function closeGearSheet() {
    $('#sheetGear').hidden = true;
    if ($('#sheet').hidden) { $('#sheetBg').hidden = true; document.body.classList.remove('locked'); }
    if (lastFocus) lastFocus.focus();
  }

  function bindNotifEvents() {
    $('#bell').addEventListener('click', openNotifSheet);
    $('#gear').addEventListener('click', openGearSheet);
    $('#sheetClose').addEventListener('click', closeNotifSheet);
    $('#gearClose').addEventListener('click', closeGearSheet);
    $('#sheetBg').addEventListener('click', () => { closeNotifSheet(); closeGearSheet(); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#sheet').hidden) closeNotifSheet();
      if (!$('#sheetGear').hidden) closeGearSheet();
    });

    $('#markRead').addEventListener('click', () => {
      notifs.forEach((n) => { n.lida = true; });
      saveNotifs(); renderBell(); renderNotifs();
    });

    $('#optLembrete').addEventListener('change', (e) => {
      ncfg.lembrete = e.target.checked; saveNcfg();
      $('#diasRow').classList.toggle('off', !ncfg.lembrete);
      checkReminders(); syncPush();
    });
    $('#optDias').addEventListener('input', (e) => {
      e.target.value = digits(e.target.value).slice(0, 3);
      const n = parseInt(e.target.value, 10);
      if (n > 0) { ncfg.dias = n; saveNcfg(); }
    });
    $('#optDias').addEventListener('change', () => { checkReminders(); syncPush(); });
    $('#optMelhor').addEventListener('change', (e) => { ncfg.melhor = e.target.checked; saveNcfg(); });
    $('#optAutonomia').addEventListener('change', (e) => { ncfg.autonomia = e.target.checked; saveNcfg(); renderPrevisao(); });
    $('#optBalao').addEventListener('change', (e) => { ncfg.balao = e.target.checked; saveNcfg(); });

    $('#permBtn').addEventListener('click', async () => {
      try {
        const res = await Notification.requestPermission();
        updatePermUI();
        if (res === 'granted') {
          const ok = await syncPush();
          showBalloon({ titulo: 'Avisos ativados', texto: ok ? 'Você vai receber lembretes mesmo com o app fechado.' : 'Você vai receber os lembretes do Rende.', tipo: 'ok' });
        }
      } catch (e) { console.warn(e); }
    });

    const testBtn = $('#testBtn');
    if (testBtn) {
      testBtn.addEventListener('click', () => {
        console.log('[rende v4] teste');
        addNotif({
          key: `teste-${Date.now()}`,
          titulo: 'Notificação de teste',
          texto: 'Se você está vendo isso, o sino e o balão estão funcionando!',
          tipo: 'ok',
        });
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { checkReminders(); renderPrevisao(); }
    });
  }

  /* ============================================================
     BOOT
     ============================================================ */
  async function boot() {
    console.log('[rende v4] boot');
    buildUI();
    bindEvents();
    bindNotifEvents();
    renderBell();
    buildPriceRow();
    syncInputs();
    render();

    try {
      await store.init();
    } catch (e) { console.warn('[rende v4] store.init', e); }
    const s = $('#sync');
    s.textContent = store.cloud ? 'Salvo na nuvem' : 'Só neste aparelho';
    s.classList.toggle('on', store.cloud);

    if (store.cloud) { await store.loadCfg(); syncInputs(); render(); }
    await loadHistory();

    // Service Worker — só registra se o arquivo sw.js existir
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* ignora se não existir */ });
    }
    console.log('[rende v4] pronto. Notif:', notifs.length);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();