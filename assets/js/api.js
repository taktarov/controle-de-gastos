// Onde os dados ficam:
//  - ApiNuvem: banco próprio do site no Firebase (Firestore), com login Google, tempo real e modo offline.
//  - ApiDemo: dados inventados guardados só neste navegador, para testar.
// As duas têm a mesma interface, então o resto do site não sabe qual está em uso.
import { demoInicial, CATEGORIAS_PADRAO, LISTAS_PADRAO } from './demo.js';
import { round2, normalizar } from './util.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const ESPERA_GRAVACAO = 1500; // offline: não espera o servidor, a gravação sobe quando a internet voltar

// ------------------------------------------------------------------ limpeza dos dados
export function limparLancamento(i) {
  return {
    data: String(i.data || '').slice(0, 10),
    categoria: i.categoria || '',
    subcategoria: i.subcategoria || '',
    descricao: String(i.descricao || '').trim(),
    forma: i.forma || '',
    total: round2(i.total),
    parcelas: Math.max(1, Math.round(Number(i.parcelas) || 1)),
    status: i.status || 'Pago',
    origem: String(i.origem || '').trim(),
  };
}

export function limparReceita(i) {
  return {
    data: String(i.data || '').slice(0, 10),
    titular: i.titular || 'Eu',
    tipo: i.tipo || 'Outros',
    descricao: String(i.descricao || '').trim(),
    valor: round2(i.valor),
  };
}

export function limparFixa(i) {
  return {
    conta: String(i.conta || '').trim(),
    categoria: i.categoria || '',
    subcategoria: i.subcategoria || '',
    forma: i.forma || '',
    tipo: /vari/i.test(i.tipo) ? 'Variável' : 'Fixa',
    valorPadrao: round2(i.valorPadrao),
    dia: Math.min(31, Math.max(1, Math.round(Number(i.dia) || 1))),
    chave: String(i.chave || '').trim(),
    ultimoValor: round2(i.ultimoValor || 0),
  };
}


/** Contas fixas que ainda não estão lançadas no mês 'AAAA-MM'. */
export function fixasParaLancar(dados, mes) {
  const doMes = dados.lancamentos.filter((l) => (l.data || '').slice(0, 7) === mes);
  const out = [];
  for (const f of dados.contasFixas) {
    if (!f.conta) continue;
    const chave = f.chave || normalizar(f.conta);
    let re;
    try { re = new RegExp(chave, 'i'); } catch { re = new RegExp(chave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
    if (doMes.some((l) => re.test(l.descricao) || re.test(normalizar(l.descricao)))) continue;
    const ultimoDia = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
    const fixa = !/vari/i.test(f.tipo);
    out.push(limparLancamento({
      data: `${mes}-${String(Math.min(f.dia || 1, ultimoDia)).padStart(2, '0')}`,
      categoria: f.categoria, subcategoria: f.subcategoria,
      descricao: fixa ? f.conta : `⚠ CONFERIR VALOR - ${f.conta}`,
      forma: f.forma, total: fixa ? f.valorPadrao : (f.ultimoValor || f.valorPadrao),
      parcelas: 1, status: 'Pendente', origem: 'Conta fixa',
    }));
  }
  return out;
}

/** Separa o que é novo num arquivo de importação.
 *  Um item do arquivo é considerado "já lançado" quando existe no banco um item com o mesmo valor e data
 *  até 1 dia de diferença (mesmo que a descrição seja outra, por exemplo um gasto que alguém lançou à mão).
 *  Cada item do banco só "cobre" um item do arquivo, então quatro pedágios iguais contam como quatro. */
export function planejarImportacao(atual, arquivo) {
  const casar = (existentes, novos, valorDe) => {
    const usados = new Set();
    const dia = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / 86400000;
    const fora = [];
    const entram = novos.filter((n) => {
      const i = existentes.findIndex((e, k) => !usados.has(k) && e.data && Math.abs(valorDe(e) - valorDe(n)) < 0.005 &&
        Math.abs(dia(e.data) - dia(n.data)) <= 1);
      if (i >= 0) { usados.add(i); fora.push(n); return false; }
      return true;
    });
    return { entram, fora };
  };
  const L = casar(atual.lancamentos, (arquivo.lancamentos || []).map(limparLancamento).filter((l) => l.data && l.total), (x) => round2(x.total));
  const R = casar(atual.receitas, (arquivo.receitas || []).map(limparReceita).filter((r) => r.data && r.valor), (x) => round2(x.valor));
  const lancamentos = L.entram;
  const receitas = R.entram;
  const jaF = new Set(atual.contasFixas.map((f) => normalizar(f.conta)));
  const contasFixas = (arquivo.contasFixas || []).map(limparFixa).filter((f) => f.conta && !jaF.has(normalizar(f.conta)) && jaF.add(normalizar(f.conta)));
  const config = {};
  for (const k of ['categorias', 'titulares', 'tiposReceita', 'formas', 'orcamento', 'metas']) {
    if (Array.isArray(arquivo[k]) && arquivo[k].length && !(atual[k] || []).length) config[k] = arquivo[k];
  }
  return { lancamentos, receitas, contasFixas, config, ignorados: L.fora.length + R.fora.length };
}

/** Pergunta à IA (Claude) direto do navegador, com a chave guardada só neste aparelho. */
export async function perguntarIA(chave, modelo, pergunta, contexto) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': chave,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 1500,
      system: 'Você é um consultor financeiro sênior que acompanha as finanças de um casal brasileiro (Carlos, CLT, e Beatriz, dentista PJ). ' +
        'Responda em português do Brasil, direto e prático, com números em reais. Use só os dados enviados; quando faltar dado, diga o que falta. ' +
        'Não recomende investimentos específicos; você não é planejador certificado.',
      messages: [{ role: 'user', content: `Resumo dos dados (JSON):\n${JSON.stringify(contexto)}\n\nPergunta: ${pergunta}` }],
    }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`A IA respondeu com erro: ${json.error?.message || resp.status}`);
  return (json.content || []).map((c) => c.text || '').join('\n').trim();
}

const comTempo = (p) => Promise.race([p, new Promise((r) => setTimeout(r, ESPERA_GRAVACAO))]);

// ------------------------------------------------------------------ Firebase
export class ApiNuvem {
  constructor(config, casa) {
    this.nome = 'nuvem';
    this.config = config;
    this.casa = casa;
    this.estado = { casa: null, lancamentos: [], receitas: [], contasFixas: [] };
    this.prontos = new Set();
    this.pendentes = { casa: false, lancamentos: false, receitas: false, contasFixas: false };
    this.doCache = false;
    this.aoErroGravar = () => {};
  }

  static configurado(config) {
    return !!(config && config.apiKey && !/COLE-AQUI/.test(config.apiKey) && config.projectId && !/COLE-AQUI/.test(config.projectId));
  }

  async carregarSdk() {
    if (this.fs) return;
    const [app, auth, fs] = await Promise.all([
      import(`${SDK}firebase-app.js`), import(`${SDK}firebase-auth.js`), import(`${SDK}firebase-firestore.js`),
    ]);
    this.fauth = auth;
    this.fs = fs;
    this.app = app.getApps().length ? app.getApp() : app.initializeApp(this.config);
    this.auth = auth.getAuth(this.app);
    try {
      this.db = fs.initializeFirestore(this.app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
    } catch {
      this.db = fs.getFirestore(this.app);
    }
  }

  async usuario() {
    await this.carregarSdk();
    try { await this.fauth.getRedirectResult(this.auth); } catch { /* sem login pendente */ }
    return new Promise((res) => { const off = this.fauth.onAuthStateChanged(this.auth, (u) => { off(); res(u); }); });
  }

  async entrar() {
    await this.carregarSdk();
    const prov = new this.fauth.GoogleAuthProvider();
    prov.setCustomParameters({ prompt: 'select_account' });
    try {
      await this.fauth.signInWithPopup(this.auth, prov);
    } catch (e) {
      if (/popup-blocked|operation-not-supported|popup-closed-by-browser/.test(e.code || '')) {
        await this.fauth.signInWithRedirect(this.auth, prov);
        return;
      }
      if (/popup-closed-by-user|cancelled-popup/.test(e.code || '')) throw new Error('Login cancelado.');
      if (/unauthorized-domain/.test(e.code || '')) throw new Error('Este endereço do site ainda não foi autorizado no Firebase (Authentication → Configurações → Domínios autorizados).');
      throw new Error(`Não consegui entrar: ${e.message}`);
    }
  }

  async sair() { await this.carregarSdk(); await this.fauth.signOut(this.auth); }

  get email() { return this.auth?.currentUser?.email || ''; }
  get primeiroNome() { return (this.auth?.currentUser?.displayName || this.email).split(/[ @]/)[0]; }

  ref(...partes) { return this.fs.doc(this.db, 'casas', this.casa, ...partes); }
  col(nome) { return this.fs.collection(this.db, 'casas', this.casa, nome); }

  /** Escuta o banco; chama aoMudar(dados) a cada mudança (sua ou da outra pessoa). */
  assinar(aoMudar, aoErro) {
    const { onSnapshot } = this.fs;
    const avisar = () => { if (this.prontos.size === 4) aoMudar(this.montar()); };
    const erro = (e) => aoErro(/permission/i.test(e.code || e.message)
      ? new Error(`O e-mail ${this.email} não tem acesso a este banco. Confira as regras do Firestore (LEIA-ME).`)
      : e);
    const opc = { includeMetadataChanges: true };
    this.cancelar = [
      onSnapshot(this.ref(), opc, (s) => {
        this.estado.casa = s.exists() ? s.data() : null;
        this.pendentes.casa = s.metadata.hasPendingWrites;
        this.doCache = s.metadata.fromCache;
        this.prontos.add('casa'); avisar();
      }, erro),
      ...['lancamentos', 'receitas', 'contasFixas'].map((nome) => onSnapshot(this.col(nome), opc, (s) => {
        this.estado[nome] = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        this.pendentes[nome] = s.metadata.hasPendingWrites;
        this.doCache = s.metadata.fromCache;
        this.prontos.add(nome); avisar();
      }, erro)),
    ];
  }

  get situacao() {
    const pend = Object.values(this.pendentes).some(Boolean);
    return { pendente: pend, offline: this.doCache || !navigator.onLine };
  }

  montar() {
    const c = this.estado.casa || {};
    const tira = (x) => { const { criadoEm, ...resto } = x; return resto; };
    return {
      vazio: !this.estado.casa,
      lancamentos: this.estado.lancamentos.map(tira),
      receitas: this.estado.receitas.map(tira),
      contasFixas: this.estado.contasFixas.map(tira),
      categorias: c.categorias || [],
      titulares: c.titulares || LISTAS_PADRAO.titulares,
      tiposReceita: c.tiposReceita || LISTAS_PADRAO.tiposReceita,
      formas: c.formas || LISTAS_PADRAO.formas,
      orcamento: c.orcamento || [],
      metas: c.metas || [],
    };
  }

  gravar(p) {
    p.catch((e) => this.aoErroGravar(e));
    return comTempo(p);
  }

  async novo(colecao, item) {
    const ref = this.fs.doc(this.col(colecao));
    await this.gravar(this.fs.setDoc(ref, { ...item, criadoPor: this.primeiroNome, criadoEm: this.fs.serverTimestamp() }));
    return { id: ref.id };
  }

  async alterar(colecao, id, item) {
    await this.gravar(this.fs.updateDoc(this.fs.doc(this.col(colecao), id), { ...item, alteradoPor: this.primeiroNome }));
    return { id };
  }

  async apagar(colecao, id) {
    await this.gravar(this.fs.deleteDoc(this.fs.doc(this.col(colecao), id)));
    return {};
  }

  addLancamento(i) { return this.novo('lancamentos', limparLancamento(i)); }
  editLancamento(id, i) { return this.alterar('lancamentos', id, limparLancamento(i)); }
  delLancamento(id) { return this.apagar('lancamentos', id); }
  addReceita(i) { return this.novo('receitas', limparReceita(i)); }
  editReceita(id, i) { return this.alterar('receitas', id, limparReceita(i)); }
  delReceita(id) { return this.apagar('receitas', id); }
  addFixa(i) { return this.novo('contasFixas', limparFixa(i)); }
  editFixa(id, i) { return this.alterar('contasFixas', id, limparFixa(i)); }
  delFixa(id) { return this.apagar('contasFixas', id); }

  salvarCasa(campos) { return this.gravar(this.fs.setDoc(this.ref(), campos, { merge: true })); }
  salvarOrcamento(itens) { return this.salvarCasa({ orcamento: itens }); }
  salvarMetas(itens) { return this.salvarCasa({ metas: itens }); }
  salvarCategorias(categorias) { return this.salvarCasa({ categorias }); }

  async comecarDoZero() {
    await this.salvarCasa({ categorias: CATEGORIAS_PADRAO, ...LISTAS_PADRAO, orcamento: [], metas: [] });
  }

  async lancarFixas(mes) {
    const itens = fixasParaLancar(this.montar(), mes);
    for (const i of itens) await this.addLancamento(i);
    return { criadas: itens.map((i) => i.descricao) };
  }

  async importar(arquivo) {
    const plano = planejarImportacao(this.montar(), arquivo);
    const { writeBatch, doc, serverTimestamp } = this.fs;
    const operacoes = [];
    const quem = this.primeiroNome;
    for (const [nome, lista] of [['lancamentos', plano.lancamentos], ['receitas', plano.receitas], ['contasFixas', plano.contasFixas]]) {
      for (const item of lista) operacoes.push((b) => b.set(doc(this.col(nome)), { ...item, criadoPor: `${quem} (importação)`, criadoEm: serverTimestamp() }));
    }
    if (Object.keys(plano.config).length) operacoes.push((b) => b.set(this.ref(), plano.config, { merge: true }));
    for (let i = 0; i < operacoes.length; i += 400) {
      const lote = writeBatch(this.db);
      operacoes.slice(i, i + 400).forEach((op) => op(lote));
      await this.gravar(lote.commit());
    }
    return { lancamentos: plano.lancamentos.length, receitas: plano.receitas.length, contasFixas: plano.contasFixas.length, config: Object.keys(plano.config), ignorados: plano.ignorados };
  }
}

// ------------------------------------------------------------------ demonstração
const CHAVE_DEMO = 'cg-demo-v2';
let seq = 0;
const novoId = () => `d${Date.now().toString(36)}${(seq++).toString(36)}`;

export class ApiDemo {
  constructor() {
    this.nome = 'demo';
    try { this.db = JSON.parse(localStorage.getItem(CHAVE_DEMO)); } catch { this.db = null; }
    if (!this.db) this.db = this.semear(demoInicial());
    this.aoErroGravar = () => {};
  }

  semear(d) {
    for (const k of ['lancamentos', 'receitas', 'contasFixas']) d[k] = d[k].map((x) => ({ id: novoId(), ...x }));
    return d;
  }

  async usuario() { return { email: 'demo' }; }
  async entrar() {}
  async sair() {}
  get email() { return 'demonstração'; }
  get primeiroNome() { return 'Demo'; }
  get situacao() { return { pendente: false, offline: false }; }

  assinar(aoMudar) { this.aoMudar = aoMudar; this.avisar(); }
  avisar() { if (this.aoMudar) this.aoMudar({ vazio: false, ...structuredClone(this.db) }); }

  salvar() {
    try { localStorage.setItem(CHAVE_DEMO, JSON.stringify(this.db)); } catch { /* sem armazenamento: fica só na memória */ }
    setTimeout(() => this.avisar(), 0);
  }

  reiniciar() {
    try { localStorage.removeItem(CHAVE_DEMO); } catch { /* ignora */ }
    this.db = this.semear(demoInicial());
    this.salvar();
  }

  async novo(c, item) { const id = novoId(); this.db[c].push({ id, ...item, criadoPor: 'Demo' }); this.salvar(); return { id }; }
  async alterar(c, id, item) {
    const i = this.db[c].findIndex((x) => x.id === id);
    if (i < 0) throw new Error('Esse item não existe mais.');
    this.db[c][i] = { ...this.db[c][i], ...item };
    this.salvar();
    return { id };
  }
  async apagar(c, id) { this.db[c] = this.db[c].filter((x) => x.id !== id); this.salvar(); return {}; }

  addLancamento(i) { return this.novo('lancamentos', limparLancamento(i)); }
  editLancamento(id, i) { return this.alterar('lancamentos', id, limparLancamento(i)); }
  delLancamento(id) { return this.apagar('lancamentos', id); }
  addReceita(i) { return this.novo('receitas', limparReceita(i)); }
  editReceita(id, i) { return this.alterar('receitas', id, limparReceita(i)); }
  delReceita(id) { return this.apagar('receitas', id); }
  addFixa(i) { return this.novo('contasFixas', limparFixa(i)); }
  editFixa(id, i) { return this.alterar('contasFixas', id, limparFixa(i)); }
  delFixa(id) { return this.apagar('contasFixas', id); }
  async salvarOrcamento(itens) { this.db.orcamento = itens; this.salvar(); }
  async salvarMetas(itens) { this.db.metas = itens; this.salvar(); }
  async salvarCategorias(c) { this.db.categorias = c; this.salvar(); }
  async comecarDoZero() {}

  async lancarFixas(mes) {
    const itens = fixasParaLancar(this.db, mes);
    for (const i of itens) this.db.lancamentos.push({ id: novoId(), ...i });
    this.salvar();
    return { criadas: itens.map((i) => i.descricao) };
  }

  async importar(arquivo) {
    const plano = planejarImportacao(this.db, arquivo);
    for (const k of ['lancamentos', 'receitas', 'contasFixas']) this.db[k].push(...plano[k].map((x) => ({ id: novoId(), ...x })));
    Object.assign(this.db, plano.config);
    this.salvar();
    return { lancamentos: plano.lancamentos.length, receitas: plano.receitas.length, contasFixas: plano.contasFixas.length, config: Object.keys(plano.config), ignorados: plano.ignorados };
  }
}
