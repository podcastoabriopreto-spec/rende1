(() => {
  'use strict';

  /* ================================================================
   *  Constantes e utilitários
   * ================================================================ */
  const CFG = window.RENDE_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const FUELS = ['gasolina', 'etanol'];
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

  /** Máscara automática de moeda: digita 349 -> "R$ 3,49" */
  function bindMoney(el, onChange, maxDigits = 6) {
    el.addEventListener('input', () => {
      const d = digits(el.value).slice(0, maxDigits);
      const cents = d ? parseInt(d, 10) : 0;
      el.value = d ? fmtBRL(cents) : '';
      onChange(cents);
    });
  }

  /** Campo decimal: aceita vírgula ou ponto */
  function bindDecimal(el, onChange) {
    el.addEventListener('input', () => {
      el.value = el.value.replace(/[^\d.,]/g, '');
      onChange(parseDec(el.value));
    });
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ================================================================
   *  Estado
   * ================================================================ */
  const DEFAULTS = () => ({
    carro: {
      kml: { gasolina: 12, etanol: 8.5 }, tanque: 50,
      preco: { gasolina: PRESETS.gasolina[1], etanol: PRESETS.etanol[1] },
      valor: 10000, modo: 'valor', combustivel: null,
    },
    moto: {
      kml: { gasolina: 35, etanol: 25 }, tanque: 12,
      preco: { gasolina: PRESETS.gasolina[1], etanol: PRESETS.etanol[1] },
      valor: 5000, modo: 'valor', combustivel: null,
    },
  });

  const LS_CFG = 'rende.cfg.v1';
  const LS_VEIC = 'rende.veiculo';
  const LS_ENTRIES = 'rende.abastecimentos.v1';

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

  try { state.cfg = mergeCfg(JSON.parse(localStorage.getItem(LS_CFG) || 'null')); } catch { /* ignora */ }

  /* ================================================================
   *  Camada de dados: Supabase (nuvem) com fallback local
   * ================================================================ */
  const store = {
    sb: null,
    cloud: false,
    uid: null,

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
        console.warn('Supabase indisponível, usando modo local.', e);
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
        } catch (e) {
          console.warn(e);
          toast('Sem conexão com a nuvem.');
          return [];
        }
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
      all.unshift({ ...e, id: crypto.randomUUID(), criado_em: new Date().toISOString() });
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

  /* ================================================================
   *  Cálculos
   * ================================================================ */
  function calc(fuel) {
    const c = cfg();
    const price = c.preco[fuel] / 100;         // R$/L
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

  let last = null; // último cálculo (usado ao registrar)

  /* ================================================================
   *  Interface: construção (uma vez)
   * ================================================================ */
  const priceEls = {}; // fuel -> { chips:[btn], custom:input }

  function buildUI() {
    // Valores rápidos
    const vc = $('#valorChips');
    VALORES_RAPIDOS.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'chip'; b.dataset.valor = c; b.textContent = fmtBRL(c).replace(',00', '');
      vc.append(b);
    });
    const full = document.createElement('button');
    full.className = 'chip'; full.dataset.valor = 'cheio'; full.textContent = 'Tanque cheio';
    vc.append(full);

    // Preços
    const rows = $('#priceRows');
    FUELS.forEach((fuel) => {
      const row = document.createElement('div');
      row.className = 'pricerow';
      row.innerHTML = `<div class="fuel-label"><i class="dot ${fuel === 'gasolina' ? 'gas' : 'eth'}"></i>${NOME[fuel]}</div><div class="chips"></div>`;
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
    });
  }

  /** Preenche os campos com os valores do veículo atual */
  function syncInputs() {
    const c = cfg();
    $('#valor').value = c.valor ? fmtBRL(c.valor) : '';
    $('#kmlGasolina').value = fmtDec(c.kml.gasolina);
    $('#kmlEtanol').value = fmtDec(c.kml.etanol);
    $('#tanque').value = fmtDec(c.tanque);
    FUELS.forEach((f) => {
      const isPreset = PRESETS[f].includes(c.preco[f]);
      priceEls[f].custom.value = isPreset ? '' : fmtBRL(c.preco[f]);
    });
    $('#veiculoNome').textContent = state.veiculo;
    $('#histVeiculo').textContent = state.veiculo;
    $$('.seg button').forEach((b) => b.setAttribute('aria-selected', b.dataset.veiculo === state.veiculo));
  }

  /* ================================================================
   *  Interface: resultados (a cada mudança)
   * ================================================================ */
  function render() {
    const c = cfg();
    const r = { gasolina: calc('gasolina'), etanol: calc('etanol') };
    const best = bestFuel(r);
    const sel = c.combustivel || best || 'etanol';
    const R = r[sel];
    last = { r, sel };
    watchBest(best);

    // Seletor de combustível + selo "mais barato"
    $$('#fuelSwitch button').forEach((b) => {
      const f = b.dataset.fuel;
      b.setAttribute('aria-pressed', f === sel);
      $('.tag', b).hidden = f !== best;
    });

    // Herói
    const nome = NOME[sel].toLowerCase();
    if (R.ok) {
      $('#heroLabel').textContent = c.modo === 'cheio'
        ? `Tanque cheio de ${nome} (${fmtNum(c.tanque, 0)} L) roda`
        : `Com ${fmtBRL(R.spend * 100)} de ${nome} você roda`;
      $('#heroKm').textContent = fmtNum(R.km, 0);
      $('#heroSub').textContent = `${fmtNum(R.kml)} km/l · ${fmtNum(R.liters)} L · ${fmtBRL(R.price * 100)} por litro`;
      $('#miniText').innerHTML = `${NOME[sel]} · <b>${fmtNum(R.km, 0)} km</b>`;
    } else {
      $('#heroLabel').textContent = 'Informe o valor, o preço do litro e o km/l';
      $('#heroKm').textContent = '—';
      $('#heroSub').textContent = '';
      $('#miniText').textContent = 'Autonomia —';
    }

    // Valor a abastecer
    $$('#valorChips .chip').forEach((b) => {
      const isFull = b.dataset.valor === 'cheio';
      const on = isFull ? c.modo === 'cheio' : (c.modo === 'valor' && c.valor === parseInt(b.dataset.valor, 10));
      b.setAttribute('aria-pressed', on);
    });
    if (c.modo === 'cheio' && R.ok) $('#valor').value = fmtBRL(Math.round(R.spend * 100));

    // Chips de preço
    FUELS.forEach((f) => {
      let matched = false;
      priceEls[f].chips.forEach((b) => {
        const on = parseInt(b.dataset.cents, 10) === c.preco[f];
        b.setAttribute('aria-pressed', on);
        if (on) matched = true;
      });
      priceEls[f].custom.classList.toggle('active', !matched && !!priceEls[f].custom.value);
    });

    // Comparativo
    renderCompare(r, best, sel);

    // Botão registrar
    const btn = $('#registrar');
    btn.disabled = !R.ok;
    btn.textContent = R.ok ? `Registrar ${fmtBRL(Math.round(R.spend * 100))} de ${nome}` : 'Registrar';
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
      : `<strong>${NOME[best]} compensa:</strong> ${fmtBRL(Math.round(win.cpk * 100))} por km contra ${fmtBRL(Math.round(worst.cpk * 100))}, ${pct}% mais barato.`;
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

  /* ================================================================
   *  Histórico
   * ================================================================ */
  async function loadHistory() {
    state.entries = await store.list();
    renderHistory();
    checkReminders();
  }

  function renderHistory() {
    const list = state.entries
      .filter((e) => e.veiculo === state.veiculo)
      .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));

    // Consumo real entre abastecimentos com km do painel
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
      ul.innerHTML = `<li class="empty" style="display:block">Nenhum abastecimento de ${state.veiculo} ainda. Faça um cálculo e toque em Registrar.</li>`;
      return;
    }
    ul.innerHTML = list.map((e) => {
      const d = new Date(e.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
      const rr = real.get(e.id);
      const odo = e.odometro != null ? `${fmtNum(e.odometro, 0)} km` : '';
      const realTxt = rr ? `<span class="real">${fmtNum(rr.km, 0)} km rodados · ${fmtNum(rr.kml)} km/l</span>` : odo;
      return `<li>
        <div class="l1"><i class="dot ${e.combustivel === 'gasolina' ? 'gas' : 'eth'}"></i>${NOME[e.combustivel]} <span class="date">${d}</span></div>
        <div class="r1">${fmtBRL(Math.round(e.valor * 100))}</div>
        <div class="l2">${fmtNum(e.litros)} L · ${fmtBRL(Math.round(e.preco * 100))}/L</div>
        <div class="r2">${realTxt}</div>
        <button class="del" data-id="${e.id}">Excluir</button>
      </li>`;
    }).join('');
  }

  /* ================================================================
   *  Eventos
   * ================================================================ */
  function bindEvents() {
    // Veículo
    $$('.seg button').forEach((b) => b.addEventListener('click', () => {
      state.veiculo = b.dataset.veiculo;
      localStorage.setItem(LS_VEIC, state.veiculo);
      syncInputs(); render(); renderHistory();
    }));

    // Combustível no herói
    $$('#fuelSwitch button').forEach((b) => b.addEventListener('click', () => {
      cfg().combustivel = b.dataset.fuel;
      persist(); render();
    }));

    // Valor a abastecer
    $$('#valorChips .chip').forEach((b) => b.addEventListener('click', () => {
      const c = cfg();
      if (b.dataset.valor === 'cheio') {
        c.modo = 'cheio';
      } else {
        c.modo = 'valor';
        c.valor = parseInt(b.dataset.valor, 10);
        $('#valor').value = fmtBRL(c.valor);
      }
      persist(); render();
    }));

    const valor = $('#valor');
    valor.addEventListener('focus', () => {
      const c = cfg();
      if (c.modo === 'cheio') {           // tocar no campo volta ao modo manual
        c.modo = 'valor';
        c.valor = digits(valor.value) ? parseInt(digits(valor.value), 10) : 0;
        persist(); render();
      }
    });
    bindMoney(valor, (cents) => { const c = cfg(); c.modo = 'valor'; c.valor = cents; persist(); render(); }, 6);

    // Rendimento
    bindDecimal($('#kmlGasolina'), (n) => { cfg().kml.gasolina = n; persist(); render(); });
    bindDecimal($('#kmlEtanol'), (n) => { cfg().kml.etanol = n; persist(); render(); });
    bindDecimal($('#tanque'), (n) => { cfg().tanque = n; persist(); render(); });

    // Odômetro com milhar
    $('#odo').addEventListener('input', (ev) => {
      const d = digits(ev.target.value).slice(0, 7);
      ev.target.value = d ? Number(d).toLocaleString('pt-BR') : '';
    });

    // Registrar
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
        $('#odo').value = '';
        toast('Abastecimento registrado');
        await loadHistory();
      } catch (e) {
        console.warn(e);
        toast('Não foi possível registrar. Verifique a conexão e tente de novo.');
      }
      btn.disabled = false;
    });

    // Excluir do histórico
    $('#histList').addEventListener('click', async (ev) => {
      const b = ev.target.closest('.del');
      if (!b) return;
      if (!confirm('Excluir este abastecimento?')) return;
      try { await store.remove(b.dataset.id); toast('Abastecimento excluído'); await loadHistory(); }
      catch { toast('Não foi possível excluir. Tente de novo.'); }
    });

    // Abas inferiores
    $$('.tabbar button').forEach((b) => b.addEventListener('click', () => {
      state.view = b.dataset.view;
      $$('.tabbar button').forEach((x) => {
        if (x === b) x.setAttribute('aria-current', 'page');
        else x.removeAttribute('aria-current');
      });
      $('#viewCalc').hidden = state.view !== 'calc';
      $('#viewHist').hidden = state.view !== 'hist';
      $('#hero').hidden = state.view !== 'calc';
      if (state.view === 'hist') { $('#minibar').classList.remove('show'); renderHistory(); }
      window.scrollTo({ top: 0 });
    }));

    // Barra compacta quando o resultado sai da tela
    const mini = $('#minibar');
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => {
        mini.classList.toggle('show', !en.isIntersecting && state.view === 'calc');
      }).observe($('#hero'));
    }
  }


  /* ================================================================
   *  Notificações (sino)
   * ================================================================ */
  const LS_NOTIFS = 'rende.notifs.v1';
  const LS_NOTCFG = 'rende.notifcfg.v1';
  const LS_BEST = 'rende.melhor.v1';

  const readJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const ncfg = { lembrete: true, dias: 7, melhor: true, ...readJSON(LS_NOTCFG, {}) };
  let notifs = readJSON(LS_NOTIFS, []);

  const saveNotifs = () => localStorage.setItem(LS_NOTIFS, JSON.stringify(notifs));
  const saveNcfg = () => localStorage.setItem(LS_NOTCFG, JSON.stringify(ncfg));

  function renderBell() {
    const n = notifs.filter((x) => !x.lida).length;
    const badge = $('#badge');
    badge.hidden = n === 0;
    badge.textContent = n > 9 ? '9+' : n;
    $('#bell').setAttribute('aria-label', n ? `Notificações, ${n} novas` : 'Notificações');
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
    if (!notifs.length) {
      ul.innerHTML = '<li class="empty" style="padding-left:16px">Nenhum aviso por enquanto. Deixe o lembrete de abastecimento ligado para não esquecer.</li>';
      return;
    }
    ul.innerHTML = notifs.map((n) => `
      <li class="${n.lida ? '' : 'new'}">
        <b>${n.titulo}</b><p>${n.texto}</p><time>${timeAgo(n.criado_em)}</time>
      </li>`).join('');
  }

  async function systemNotify(titulo, texto) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      const opts = { body: texto, icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', tag: 'rende' };
      if (reg) reg.showNotification(titulo, opts); else new Notification(titulo, opts);
    } catch (e) { console.warn(e); }
  }

  function addNotif({ key, titulo, texto, silent = false }) {
    if (notifs.some((n) => n.key === key)) return;
    notifs.unshift({ id: crypto.randomUUID(), key, titulo, texto, criado_em: new Date().toISOString(), lida: false });
    notifs = notifs.slice(0, 30);
    saveNotifs(); renderBell();
    if (!$('#sheet').hidden) renderNotifs();
    if (!silent) systemNotify(titulo, texto);
  }

  /** Lembrete: X dias desde o último abastecimento de cada veículo */
  function checkReminders() {
    if (!ncfg.lembrete || !(ncfg.dias > 0)) return;
    for (const v of ['carro', 'moto']) {
      const es = state.entries.filter((e) => e.veiculo === v)
        .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
      if (!es.length) continue;
      const last = es[0];
      const dias = Math.floor((Date.now() - new Date(last.criado_em)) / 864e5);
      if (dias >= ncfg.dias) {
        const quando = new Date(last.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
        addNotif({
          key: `lembrete-${last.id}-${Math.floor(dias / ncfg.dias)}`,
          titulo: `Hora de abastecer o ${v}?`,
          texto: `Faz ${dias} dias desde o último abastecimento (${quando}).`,
          silent: pushOn, // o push do servidor já avisa no celular
        });
      }
    }
  }

  /** Aviso: o combustível mais barato por km mudou */
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
          texto: `No seu ${v}, ${NOME[best].toLowerCase()} agora sai mais barato por km com os preços informados.`,
        });
      }
    }, 2000);
  }


  /* ---- Push com o app fechado (Supabase + Edge Function) ---- */
  let pushOn = false;

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
    } catch (e) {
      console.warn('Push indisponível', e);
    }
    if (!$('#sheet').hidden) updatePermUI();
    return pushOn;
  }

  function updatePermUI() {
    const btn = $('#permBtn'), hint = $('#permHint');
    const ios = /iphone|ipad/i.test(navigator.userAgent);
    const base = 'Os avisos são conferidos quando você abre o app.';
    if (!('Notification' in window)) {
      btn.hidden = true;
      hint.textContent = ios
        ? 'No iPhone, adicione o app à Tela de Início (Compartilhar > Adicionar à Tela de Início) para poder ativar avisos do sistema. Enquanto isso, eles aparecem aqui no sino.'
        : 'Este navegador não permite avisos do sistema. Eles aparecem aqui no sino.';
      return;
    }
    btn.hidden = false;
    if (Notification.permission === 'granted') {
      btn.textContent = 'Avisos do celular ativados'; btn.disabled = true;
      hint.textContent = pushOn
        ? 'Lembretes ativos mesmo com o app fechado (conferidos uma vez por dia, de manhã).'
        : base;
    } else if (Notification.permission === 'denied') {
      btn.textContent = 'Avisos do celular bloqueados'; btn.disabled = true;
      hint.textContent = 'Libere as notificações deste site nas configurações do navegador para ativar.';
    } else {
      btn.textContent = 'Ativar avisos no celular'; btn.disabled = false;
      hint.textContent = base;
    }
  }

  let lastFocus = null;
  function openSheet() {
    lastFocus = document.activeElement;
    $('#optLembrete').checked = ncfg.lembrete;
    $('#optDias').value = ncfg.dias;
    $('#optMelhor').checked = ncfg.melhor;
    $('#diasRow').classList.toggle('off', !ncfg.lembrete);
    renderNotifs(); updatePermUI();
    $('#sheet').hidden = false; $('#sheetBg').hidden = false;
    document.body.classList.add('locked');
    $('#sheetClose').focus();
  }
  function closeSheet() {
    $('#sheet').hidden = true; $('#sheetBg').hidden = true;
    document.body.classList.remove('locked');
    notifs.forEach((n) => { n.lida = true; });
    saveNotifs(); renderBell();
    if (lastFocus) lastFocus.focus();
  }

  function bindNotifEvents() {
    $('#bell').addEventListener('click', openSheet);
    $('#sheetClose').addEventListener('click', closeSheet);
    $('#sheetBg').addEventListener('click', closeSheet);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
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

    $('#permBtn').addEventListener('click', async () => {
      try {
        const res = await Notification.requestPermission();
        updatePermUI();
        if (res === 'granted') {
          const ok = await syncPush();
          systemNotify('Avisos ativados', ok ? 'Você vai receber os lembretes do Rende, mesmo com o app fechado.' : 'Você vai receber os lembretes do Rende.');
        }
      } catch (e) { console.warn(e); }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkReminders();
    });
  }

  /* ================================================================
   *  Início
   * ================================================================ */
  async function boot() {
    buildUI();
    bindEvents();
    bindNotifEvents();
    renderBell();
    syncInputs();
    render();

    await store.init();
    const s = $('#sync');
    s.textContent = store.cloud ? 'Salvo na nuvem' : 'Só neste aparelho';
    s.classList.toggle('on', store.cloud);

    if (store.cloud) { await store.loadCfg(); syncInputs(); render(); }
    await loadHistory();

    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
      syncPush();
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
