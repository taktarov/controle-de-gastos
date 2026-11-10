// Controle de Gastos — aplicação principal.
// Os dados ficam no banco próprio do site (Firebase/Firestore) ou, no modo demonstração, só neste navegador.
import { ApiNuvem, ApiDemo, perguntarIA } from './api.js';
import { firebaseConfig, CASA } from './firebase-config.js';
import {
  preparar, resumoMes, serie, cargaParcelas, usoOrcamento, situacaoFixas, progressoMetas, contextoIA, CAT_POUPANCA,
} from './calc.js';
import { analisarLancamento, analisarReceita, analiseCompleta, responderSemIA } from './assistente.js';
import { destruirGraficos, graficoMeses, graficoCategorias, graficoParcelas } from './graficos.js';
import {
  fmt, fmt0, pct, esc, dataBR, hojeISO, mesAtual, somarMeses, rotuloMes, rotuloMesLongo, paraNumero, round2,
  normalizar, temAviso,
} from './util.js';

const CHAVE_CFG = 'cg-config-v2';
const MODELO_IA_PADRAO = 'claude-sonnet-5-5';

const st = {
  cfg: null,
  api: null,
  dados: null,
  est: null,
  mes: mesAtual(),
  rota: 'painel',
  filtro: { busca: '', categoria: '', visao: 'compras', avisos: false },
  chat: [],
  redesenharDepois: false,
};

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ configuração deste aparelho
function lerCfg() {
  try { return JSON.parse(localStorage.getItem(CHAVE_CFG)) || null; } catch { return null; }
}
function gravarCfg(mudancas) {
  st.cfg = { ...(st.cfg || {}), ...mudancas };
  try { localStorage.setItem(CHAVE_CFG, JSON.stringify(st.cfg)); } catch { /* navegador sem armazenamento */ }
}
const nomes = () => st.cfg?.nomes || { Eu: 'Carlos', Esposa: 'Beatriz' };
const nomeTitular = (t) => nomes()[t] || t || '—';

// ------------------------------------------------------------------ início
async function iniciar() {
  $('#mes-ant').addEventListener('click', () => mudarMes(-1));
  $('#mes-prox').addEventListener('click', () => mudarMes(1));
  $('#btn-atualizar').addEventListener('click', () => { st.mes = mesAtual(); render(); });
  $('#btn-novo').addEventListener('click', () => abrirNovo());
  $('#fab').addEventListener('click', () => abrirNovo());
  $('#modal-fundo').addEventListener('click', (e) => { if (e.target.id === 'modal-fundo') fecharModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharModal(); });
  window.addEventListener('hashchange', rotear);
  window.addEventListener('online', atualizarSync);
  window.addEventListener('offline', atualizarSync);

  st.cfg = lerCfg() || { modo: 'nuvem', titular: 'Eu', nomes: { Eu: 'Carlos', Esposa: 'Beatriz' } };
  await conectar();
}

async function conectar() {
  if (st.api?.cancelar) st.api.cancelar.forEach((f) => f());
  st.dados = null;
  st.est = null;
  if (st.cfg.modo === 'nuvem' && !ApiNuvem.configurado(firebaseConfig)) { telaSemFirebase(); return; }
  if (st.cfg.modo === 'demo') st.api = new ApiDemo();
  else { st.nuvem = st.nuvem || new ApiNuvem(firebaseConfig, CASA); st.api = st.nuvem; }
  st.api.aoErroGravar = (e) => toast(/permission/i.test(e.code || e.message) ? 'Sem permissão para gravar. Confira as regras do Firestore.' : `Não gravou: ${e.message}`, 'erro');
  telaCarregando('Abrindo…');
  let usuario;
  try {
    usuario = await st.api.usuario();
  } catch (e) {
    telaErro(`Não consegui carregar o Firebase: ${e.message}. Confira a internet.`);
    return;
  }
  if (!usuario) { telaLogin(); return; }
  $('#usuario-atual').textContent = st.api.nome === 'demo' ? 'Modo demonstração' : st.api.email;
  $('#usuario-atual').title = st.api.email;
  telaCarregando('Carregando os dados…');
  st.api.assinar(aoMudarDados, (e) => telaErro(e.message));
}

function aoMudarDados(d) {
  st.dados = d;
  st.est = preparar(d);
  atualizarSync();
  if (d.vazio) { telaBancoVazio(); return; }
  if (!$('#modal-fundo').hidden) { st.redesenharDepois = true; return; }
  render();
}

function atualizarSync() {
  const el = $('#sync');
  if (!st.api) return;
  const s = st.api.situacao;
  let classe = 'ok', texto = st.api.nome === 'demo' ? 'Só neste navegador' : 'Sincronizado';
  if (!navigator.onLine || s.offline) { classe = 'carregando'; texto = s.pendente ? 'Offline · guardado no aparelho' : 'Offline'; }
  else if (s.pendente) { classe = 'carregando'; texto = 'Enviando…'; }
  el.className = `sync ${classe}`;
  $('#sync-texto').textContent = texto;
}

function mudarMes(n) {
  st.mes = somarMeses(st.mes, n);
  render();
}

// ------------------------------------------------------------------ rotas
const ROTAS = {
  painel: telaPainel,
  lancamentos: telaLancamentos,
  receitas: telaReceitas,
  fixas: telaFixas,
  metas: telaMetas,
  assistente: telaAssistente,
  config: telaConfig,
  mais: telaMais,
};

function rotear() {
  const r = (location.hash.replace(/^#\/?/, '') || 'painel').split('?')[0];
  st.rota = ROTAS[r] ? r : 'painel';
  render();
}

function render() {
  destruirGraficos();
  $$('[data-rota]').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === st.rota));
  $('#mes-titulo').textContent = rotuloMesLongo(st.mes);
  $('#mes-nav').style.visibility = ['config', 'mais'].includes(st.rota) ? 'hidden' : 'visible';
  if (!st.est) return;
  if (st.dados?.vazio && st.rota !== 'config') { telaBancoVazio(); return; }
  ROTAS[st.rota]();
}

// ------------------------------------------------------------------ telas de entrada
function telaCarregando(texto) {
  $('#mes-nav').style.visibility = 'hidden';
  $('#conteudo').innerHTML = `<div class="carregando-tela">${esc(texto)}</div>`;
}

function telaErro(texto) {
  $('#mes-nav').style.visibility = 'hidden';
  $('#conteudo').innerHTML = `<div class="boas-vindas"><div class="cartao"><h2>Algo deu errado</h2><p>${esc(texto)}</p>
    <div class="modal-acoes"><button class="btn" id="b-sair-erro">Sair e entrar com outra conta</button><button class="btn primario" id="b-tenta">Tentar de novo</button></div></div></div>`;
  $('#b-tenta').onclick = conectar;
  $('#b-sair-erro').onclick = async () => { await st.api?.sair(); conectar(); };
}

function telaSemFirebase() {
  $('#mes-nav').style.visibility = 'hidden';
  $('#conteudo').innerHTML = `<div class="boas-vindas"><div class="cartao">
    <h2>Falta ligar o banco de dados</h2>
    <p class="sub">O site guarda tudo num banco próprio e gratuito (Firebase, do Google). Ele ainda não foi configurado.</p>
    <ol class="passos">
      <li>Siga o passo 1 do LEIA-ME para criar o banco (uns 10 minutos).</li>
      <li>Cole os dados de configuração no arquivo <code>assets/js/firebase-config.js</code> e publique de novo.</li>
    </ol>
    <div class="modal-acoes"><button class="btn primario" id="b-demo">Enquanto isso, ver a demonstração</button></div></div></div>`;
  $('#b-demo').onclick = () => { gravarCfg({ modo: 'demo' }); conectar(); };
}

function telaLogin() {
  $('#mes-nav').style.visibility = 'hidden';
  $('#usuario-atual').textContent = '—';
  $('#conteudo').innerHTML = `<div class="boas-vindas"><div class="cartao">
    <h2>Controle de Gastos</h2>
    <p class="sub">Entre com a sua conta Google. Só os e-mails liberados por vocês conseguem ver e lançar.</p>
    <div class="campo" style="margin:14px 0"><label>Quem é você?</label>
      <select id="quem"><option value="Eu">${esc(nomes().Eu)}</option><option value="Esposa" ${st.cfg.titular === 'Esposa' ? 'selected' : ''}>${esc(nomes().Esposa)}</option></select></div>
    <div class="modal-acoes" style="justify-content:flex-start">
      <button class="btn primario" id="b-entrar">Entrar com Google</button>
      <button class="btn" id="b-demo">Ver demonstração</button>
    </div></div></div>`;
  $('#b-entrar').onclick = async () => {
    gravarCfg({ titular: $('#quem').value, modo: 'nuvem' });
    try { await st.api.entrar(); await conectar(); } catch (e) { toast(e.message, 'erro'); }
  };
  $('#b-demo').onclick = () => { gravarCfg({ modo: 'demo' }); conectar(); };
}

function telaBancoVazio() {
  $('#mes-nav').style.visibility = 'hidden';
  $('#conteudo').innerHTML = `<div class="boas-vindas"><div class="cartao">
    <h2>Banco de dados novo</h2>
    <p class="sub">Ainda não há nada guardado. Para começar com tudo o que já estava na planilha, importe o arquivo <code>dados-iniciais-PRIVADO.json</code> que está na pasta do site. É só uma vez.</p>
    <div class="campo" style="margin:14px 0"><label>Arquivo de importação (.json)</label><input type="file" id="arq" accept=".json,application/json"></div>
    <div class="modal-acoes" style="justify-content:flex-start">
      <button class="btn primario" id="b-importar">Importar</button>
      <button class="btn" id="b-zero">Começar do zero</button>
    </div></div></div>`;
  $('#b-importar').onclick = () => importarArquivo($('#arq'));
  $('#b-zero').onclick = async () => { await st.api.comecarDoZero(); toast('Banco criado com as categorias padrão.'); };
}

async function importarArquivo(input) {
  const arq = input.files?.[0];
  if (!arq) { toast('Escolha o arquivo .json primeiro.', 'erro'); return; }
  let json;
  try { json = JSON.parse(await arq.text()); } catch { toast('Esse arquivo não é um JSON válido.', 'erro'); return; }
  telaCarregando('Importando…');
  try {
    const r = await st.api.importar(json);
    toast(`Importado: ${r.lancamentos} lançamentos, ${r.receitas} receitas, ${r.contasFixas} contas fixas.${r.ignorados ? ` ${r.ignorados} já existiam e ficaram de fora.` : ''}`);
    await esperar(300);
    location.hash = '#/painel';
    rotear();
  } catch (e) {
    toast(`Não importou: ${e.message}`, 'erro');
    render();
  }
}

// ------------------------------------------------------------------ painel
function telaPainel() {
  const est = st.est;
  const r = resumoMes(est, st.mes);
  const ant = resumoMes(est, somarMeses(st.mes, -1));
  const varia = (a, b) => (b ? `${a >= b ? '▲' : '▼'} ${pct(Math.abs(a - b) / b)} vs ${rotuloMes(somarMeses(st.mes, -1))}` : '');
  const uso = usoOrcamento(est, st.mes);
  const insights = analiseCompleta(est, st.mes);
  const prioridade = { alerta: 0, atencao: 1, info: 2, ok: 3 };
  const top = [...insights].sort((a, b) => prioridade[a.nivel] - prioridade[b.nivel]).slice(0, 4);
  const metas = progressoMetas(est, hojeISO());

  $('#conteudo').innerHTML = `
    <div class="grade g-4">
      ${kpi('Receitas', fmt0(r.receitas), varia(r.receitas, ant.receitas))}
      ${kpi('Gastos', fmt0(r.gastos), `${fmt0(r.parcelado)} em parcelas · ${varia(r.gastos, ant.gastos)}`)}
      ${kpi('Guardado', fmt0(r.guardado), r.receitas ? `${pct(r.guardado / r.receitas)} da renda` : '')}
      ${kpi('Saldo do mês', `<span class="${r.saldo >= 0 ? 'pos' : 'neg'}">${fmt0(r.saldo)}</span>`, 'receitas − gastos − guardado')}
    </div>

    <div class="grade g-21 secao">
      <div class="cartao">
        <h2>Receitas, gastos e saldo</h2>
        <p class="sub">Últimos 6 meses. Parcelas contam no mês em que caem.</p>
        <div class="grafico alto"><canvas id="g-meses"></canvas></div>
      </div>
      <div class="cartao">
        <div class="cartao-cab"><div><h2>O que o assistente viu</h2><p class="sub">Atualiza a cada lançamento.</p></div>
        <a class="link" href="#/assistente">Ver tudo</a></div>
        <div class="insights">${top.map(cartaoInsight).join('') || '<p class="vazio">Nada a comentar.</p>'}</div>
      </div>
    </div>

    <div class="grade g-2 secao">
      <div class="cartao">
        <div class="cartao-cab"><div><h2>Orçamento do mês</h2><p class="sub">Gasto de cada categoria contra o teto.</p></div>
        <a class="link" href="#/metas">Editar tetos</a></div>
        <div class="envelopes">${uso.length ? uso.map(barraEnvelope).join('') : '<p class="vazio">Nenhum teto definido. Cadastre em Metas e orçamento.</p>'}</div>
      </div>
      <div class="cartao">
        <h2>Gastos por categoria</h2>
        <p class="sub">${rotuloMesLongo(st.mes)} · em vermelho, acima do teto.</p>
        <div class="grafico" style="height:${Math.max(220, Object.keys(r.porCategoria).length * 30 + 40)}px"><canvas id="g-cat"></canvas></div>
      </div>
    </div>

    <div class="grade g-2 secao">
      <div class="cartao">
        <h2>Parcelas dos próximos meses</h2>
        <p class="sub">Só o que já foi parcelado. Teto: ${fmt0(est.tetoParcelas)} por mês.</p>
        <div class="grafico baixo"><canvas id="g-parc"></canvas></div>
      </div>
      <div class="cartao">
        <div class="cartao-cab"><div><h2>Metas</h2><p class="sub">Quanto já foi guardado.</p></div><a class="link" href="#/metas">Abrir</a></div>
        <div class="grade">${metas.map(cartaoMeta).join('') || '<p class="vazio">Nenhuma meta cadastrada.</p>'}</div>
      </div>
    </div>`;

  graficoMeses($('#g-meses'), serie(est, st.mes, 6));
  const linhas = Object.entries(r.porCategoria).sort((a, b) => b[1] - a[1]).map(([categoria, gasto]) => ({
    categoria, gasto: round2(gasto), teto: (est.orcamentoCat.find((o) => o.categoria === categoria) || {}).teto || 0,
  }));
  graficoCategorias($('#g-cat'), linhas);
  graficoParcelas($('#g-parc'), cargaParcelas(est, somarMeses(st.mes, 1), 6), est.tetoParcelas);
}

const kpi = (rot, val, det) => `<div class="cartao kpi"><div class="rot">${rot}</div><div class="val">${val}</div><div class="det">${det || '&nbsp;'}</div></div>`;

const ICONES = { ok: '✓', info: 'i', atencao: '!', alerta: '!' };
const cartaoInsight = (i) => `<div class="insight ${i.nivel}"><div class="icone">${ICONES[i.nivel]}</div><div><strong>${esc(i.titulo)}</strong><p>${esc(i.texto)}</p></div></div>`;

function barraEnvelope(o) {
  const largura = Math.min(100, Math.round(o.pct * 100));
  const resto = o.poupanca ? `${fmt0(o.gasto)} de ${fmt0(o.teto)} guardados` : `${fmt0(o.gasto)} de ${fmt0(o.teto)}`;
  return `<div class="env-linha"><span class="nome">${esc(o.categoria)}</span><span class="nums">${resto} · ${pct(o.pct)}</span>
    <div class="trilho ${o.nivel}"><span style="width:${largura}%"></span></div></div>`;
}

function cartaoMeta(m) {
  return `<div class="meta">
    <div class="topo-meta"><strong>${esc(m.meta)}</strong><span class="pct">${pct(m.pct)}</span></div>
    <div class="trilho ok"><span style="width:${Math.round(m.pct * 100)}%"></span></div>
    <div class="rodape"><span>${fmt0(m.guardado)} de ${fmt0(m.alvo)}</span>
    <span>${m.falta > 0 ? `faltam ${fmt0(m.falta)}${m.mesesRestantes ? ` · ${fmt0(m.necessario)}/mês até ${dataBR(m.dataAlvo)}` : ''}` : 'meta atingida'}</span></div>
  </div>`;
}

// ------------------------------------------------------------------ lançamentos
function telaLancamentos() {
  const est = st.est;
  const f = st.filtro;
  let linhas;
  if (f.visao === 'parcelas') {
    linhas = (est.porMes.get(st.mes) || []).map((it) => ({ l: it.l, noMes: it.valor, parc: `${it.k}/${it.n}` }));
  } else if (f.visao === 'todos') {
    linhas = est.lancamentos.map((l) => ({ l, noMes: null, parc: l.parcelas > 1 ? `${l.parcelas}x` : '' }));
  } else {
    linhas = est.lancamentos.filter((l) => l.data && l.data.slice(0, 7) === st.mes)
      .map((l) => ({ l, noMes: null, parc: l.parcelas > 1 ? `${l.parcelas}x` : '' }));
  }
  const busca = normalizar(f.busca);
  linhas = linhas.filter(({ l }) => (!f.categoria || l.categoria === f.categoria) && (!f.avisos || temAviso(l.descricao)) &&
    (!busca || normalizar(`${l.descricao} ${l.subcategoria} ${l.categoria} ${l.origem}`).includes(busca)))
    .sort((a, b) => (b.l.data || '').localeCompare(a.l.data || '') || String(b.l.id).localeCompare(String(a.l.id)));
  const soma = linhas.reduce((s, x) => s + (x.noMes ?? x.l.total), 0);

  $('#conteudo').innerHTML = `
    <div class="titulo-pagina"><div><h2>Lançamentos</h2><p>${linhas.length} itens · ${fmt(soma)}</p></div>
      <button class="btn primario" id="b-novo-l">+ Novo gasto</button></div>
    <div class="cartao">
      <div class="filtros">
        <div class="alternador" id="visao">
          <button data-v="compras" class="${f.visao === 'compras' ? 'ativo' : ''}">Compras do mês</button>
          <button data-v="parcelas" class="${f.visao === 'parcelas' ? 'ativo' : ''}">Tudo que cai no mês</button>
          <button data-v="todos" class="${f.visao === 'todos' ? 'ativo' : ''}">Todos</button>
        </div>
        <input id="f-busca" type="search" placeholder="Buscar descrição, loja…" value="${esc(f.busca)}">
        <select id="f-cat"><option value="">Todas as categorias</option>${est.categorias.map((c) => `<option ${c.nome === f.categoria ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>
        <label class="marcar"><input type="checkbox" id="f-aviso" ${f.avisos ? 'checked' : ''}> Só com ⚠</label>
      </div>
      <div class="tabela-wrap trocavel"><table>
        <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Forma</th><th class="num">Parc.</th><th class="num">Valor</th>${f.visao === 'parcelas' ? '<th class="num">No mês</th>' : ''}<th>Status</th><th></th></tr></thead>
        <tbody>${linhas.map(linhaLanc).join('') || '<tr><td colspan="9" class="vazio">Nada por aqui.</td></tr>'}</tbody>
      </table></div>
      <div class="lista-movel">${linhas.map(itemMovelLanc).join('') || '<p class="vazio">Nada por aqui.</p>'}</div>
    </div>`;

  $('#b-novo-l').onclick = () => formLancamento();
  $$('#visao button').forEach((b) => { b.onclick = () => { f.visao = b.dataset.v; render(); }; });
  $('#f-busca').oninput = (e) => {
    f.busca = e.target.value;
    clearTimeout(st.tBusca);
    st.tBusca = setTimeout(() => { render(); const i = $('#f-busca'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300);
  };
  $('#f-cat').onchange = (e) => { f.categoria = e.target.value; render(); };
  $('#f-aviso').onchange = (e) => { f.avisos = e.target.checked; render(); };
  ligarAcoesLanc();
}

const etiquetaStatus = (s) => `<span class="etiqueta ${/pendente/i.test(s) ? 'pendente' : /pago/i.test(s) ? 'pago' : ''}">${esc(s || '—')}</span>`;
const quem = (x) => [x.origem, x.criadoPor ? `por ${x.criadoPor}` : ''].filter(Boolean).join(' · ');

function linhaLanc({ l, noMes, parc }) {
  return `<tr>
    <td>${dataBR(l.data)}</td>
    <td>${temAviso(l.descricao) ? '<span class="etiqueta aviso">⚠</span> ' : ''}${esc(l.descricao.replace(/^⚠\s*/, '') || '—')}<div class="ajuda">${esc(quem(l))}</div></td>
    <td>${esc(l.categoria)}<div class="ajuda">${esc(l.subcategoria)}</div></td>
    <td>${esc(l.forma)}</td>
    <td class="num">${parc}</td>
    <td class="num">${fmt(l.total)}</td>
    ${noMes !== null ? `<td class="num">${fmt(noMes)}</td>` : ''}
    <td>${etiquetaStatus(l.status)}</td>
    <td><div class="acoes"><button class="btn pequeno" data-edit-l="${esc(l.id)}">Editar</button><button class="btn pequeno perigo" data-del-l="${esc(l.id)}">Apagar</button></div></td>
  </tr>`;
}

function itemMovelLanc({ l, noMes, parc }) {
  return `<div class="item-movel" data-edit-l="${esc(l.id)}">
    <span class="d">${temAviso(l.descricao) ? '⚠ ' : ''}${esc(l.descricao.replace(/^⚠\s*/, '') || l.subcategoria || '—')}</span>
    <span class="v">${fmt(noMes ?? l.total)}</span>
    <span class="m">${dataBR(l.data)} · ${esc(l.categoria)}${parc ? ` · ${parc}` : ''}</span>
    <span class="m">${esc(l.status || '')}</span>
  </div>`;
}

function ligarAcoesLanc() {
  $$('[data-edit-l]').forEach((b) => { b.onclick = () => formLancamento(achar('lancamentos', b.dataset.editL)); });
  $$('[data-del-l]').forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); confirmarApagar(achar('lancamentos', b.dataset.delL), 'lancamento'); };
  });
}

const achar = (lista, id) => st.dados[lista].find((x) => String(x.id) === String(id));

// ------------------------------------------------------------------ receitas
function telaReceitas() {
  const recs = (st.est.recPorMes.get(st.mes) || []).slice().sort((a, b) => b.data.localeCompare(a.data));
  const r = resumoMes(st.est, st.mes);
  $('#conteudo').innerHTML = `
    <div class="titulo-pagina"><div><h2>Receitas</h2><p>${rotuloMesLongo(st.mes)} · ${fmt(r.receitas)}</p></div>
      <button class="btn primario" id="b-nova-r">+ Nova receita</button></div>
    <div class="grade g-4">${Object.entries(r.porTitular).map(([t, v]) => kpi(esc(nomeTitular(t)), fmt0(v), r.receitas ? `${pct(v / r.receitas)} do mês` : '')).join('') || kpi('Nenhuma receita', fmt0(0), 'Lance o salário e os recebimentos')}</div>
    <div class="cartao secao">
      <div class="tabela-wrap trocavel"><table>
        <thead><tr><th>Data</th><th>Quem</th><th>Tipo</th><th>Descrição</th><th class="num">Valor</th><th></th></tr></thead>
        <tbody>${recs.map((x) => `<tr><td>${dataBR(x.data)}</td><td>${esc(nomeTitular(x.titular))}</td><td>${esc(x.tipo)}</td><td>${esc(x.descricao)}</td><td class="num">${fmt(x.valor)}</td>
          <td><div class="acoes"><button class="btn pequeno" data-edit-r="${esc(x.id)}">Editar</button><button class="btn pequeno perigo" data-del-r="${esc(x.id)}">Apagar</button></div></td></tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhuma receita neste mês.</td></tr>'}</tbody>
      </table></div>
      <div class="lista-movel">${recs.map((x) => `<div class="item-movel" data-edit-r="${esc(x.id)}"><span class="d">${esc(x.descricao || x.tipo)}</span><span class="v">${fmt(x.valor)}</span><span class="m">${dataBR(x.data)} · ${esc(nomeTitular(x.titular))}</span><span class="m">${esc(x.tipo)}</span></div>`).join('') || '<p class="vazio">Nenhuma receita neste mês.</p>'}</div>
    </div>`;
  $('#b-nova-r').onclick = () => formReceita();
  $$('[data-edit-r]').forEach((b) => { b.onclick = () => formReceita(achar('receitas', b.dataset.editR)); });
  $$('[data-del-r]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); confirmarApagar(achar('receitas', b.dataset.delR), 'receita'); }; });
}

// ------------------------------------------------------------------ contas fixas
function telaFixas() {
  const lista = situacaoFixas(st.est, st.mes);
  const faltam = lista.filter((f) => !f.lancamento).length;
  $('#conteudo').innerHTML = `
    <div class="titulo-pagina"><div><h2>Contas fixas</h2><p>${rotuloMesLongo(st.mes)} · ${lista.length ? (faltam ? `${faltam} ainda não lançadas` : 'todas lançadas') : 'nenhuma cadastrada'}</p></div>
      <div class="topo-acoes"><button class="btn" id="b-nova-fixa">+ Nova conta</button><button class="btn primario" id="b-fixas" ${faltam ? '' : 'disabled'}>Lançar contas do mês</button></div></div>
    <div class="cartao">
      <p class="sub">As contas de valor variável entram como "⚠ CONFERIR VALOR" e status Pendente. Quando a conta chegar, clique em Conferir, ajuste o valor e marque Pago.</p>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Conta</th><th>Tipo</th><th>Dia</th><th class="num">Valor padrão</th><th>Neste mês</th><th></th></tr></thead>
        <tbody>${lista.map((f) => `<tr><td><strong>${esc(f.conta)}</strong><div class="ajuda">${esc(f.categoria)} · ${esc(f.subcategoria)}</div></td>
          <td>${esc(f.tipo)}</td><td>${f.dia}</td><td class="num">${fmt(f.valorPadrao)}</td>
          <td>${f.lancamento ? `${fmt(f.lancamento.total)} ${etiquetaStatus(f.lancamento.status)}` : '<span class="etiqueta aviso">Não lançada</span>'}</td>
          <td><div class="acoes">${f.lancamento ? `<button class="btn pequeno" data-edit-l="${esc(f.lancamento.id)}">${/pendente/i.test(f.lancamento.status) ? 'Conferir' : 'Ver'}</button>` : ''}<button class="btn pequeno" data-edit-f="${esc(f.id)}">Editar conta</button></div></td></tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhuma conta fixa cadastrada.</td></tr>'}</tbody>
      </table></div>
    </div>`;
  $('#b-fixas').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const r = await st.api.lancarFixas(st.mes);
      toast(r.criadas?.length ? `${r.criadas.length} contas lançadas.` : 'Nada novo para lançar.');
    } catch (err) { toast(err.message, 'erro'); }
  };
  $('#b-nova-fixa').onclick = () => formFixa(null);
  $$('[data-edit-f]').forEach((b) => { b.onclick = () => formFixa(achar('contasFixas', b.dataset.editF)); });
  ligarAcoesLanc();
}

function formFixa(f) {
  const novo = !f;
  const x = f || { conta: '', categoria: '', subcategoria: '', forma: 'PIX', tipo: 'Fixa', valorPadrao: '', dia: 10, chave: '', ultimoValor: 0 };
  abrirModal(`<h3>${novo ? 'Nova conta fixa' : 'Editar conta fixa'}</h3>
    <form id="ff" class="form-grade" autocomplete="off">
      <div class="campo inteiro"><label>Nome da conta</label><input name="conta" required value="${esc(x.conta)}" placeholder="Ex.: Condomínio"></div>
      <div class="campo"><label>Categoria</label><select name="categoria" required><option value="">Escolha…</option>${opcoes(st.dados.categorias.map((c) => c.nome), x.categoria)}</select></div>
      <div class="campo"><label>Subcategoria</label><select name="subcategoria"></select></div>
      <div class="campo"><label>Tipo</label><select name="tipo">${opcoes(['Fixa', 'Variável'], x.tipo)}</select><span class="ajuda">Variável entra para conferir o valor.</span></div>
      <div class="campo"><label>Forma de pagamento</label><select name="forma">${opcoes(st.dados.formas, x.forma)}</select></div>
      <div class="campo"><label>Valor padrão (R$)</label><input name="valorPadrao" inputmode="decimal" required value="${String(x.valorPadrao).replace('.', ',')}"></div>
      <div class="campo"><label>Dia do mês</label><input name="dia" type="number" min="1" max="31" value="${x.dia}"></div>
      <div class="campo inteiro"><label>Palavra-chave (opcional)</label><input name="chave" value="${esc(x.chave)}" placeholder="Ex.: condom"><span class="ajuda">Trecho da descrição que identifica esta conta nos lançamentos. Em branco, usa o nome da conta.</span></div>
      <div class="modal-acoes inteiro">${novo ? '' : '<button type="button" class="btn perigo" id="b-del-fixa">Apagar conta</button>'}<button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primario">Salvar</button></div>
    </form>`);
  const form = $('#ff');
  ligarSubcategorias(form, x);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    const item = { ...v, valorPadrao: paraNumero(v.valorPadrao), ultimoValor: x.ultimoValor || paraNumero(v.valorPadrao) };
    try {
      if (novo) await st.api.addFixa(item); else await st.api.editFixa(f.id, item);
      fecharModal();
      toast('Conta fixa salva.');
    } catch (err) { toast(err.message, 'erro'); }
  };
  if (!novo) $('#b-del-fixa').onclick = async () => { await st.api.delFixa(f.id); fecharModal(); toast('Conta fixa apagada.'); };
}

// ------------------------------------------------------------------ metas e orçamento
function telaMetas() {
  const metas = progressoMetas(st.est, hojeISO());
  const orc = st.dados.orcamento || [];
  const uso = usoOrcamento(st.est, st.mes);
  const temTetoParcelas = orc.some((o) => /parcela/i.test(o.categoria));
  const faltando = [...st.dados.categorias.map((c) => c.nome), ...(temTetoParcelas ? [] : ['Teto de parcelas (todas)'])]
    .filter((c) => !orc.some((o) => o.categoria === c));
  const lerTetos = () => orc.map((o) => ({
    categoria: o.categoria,
    teto: paraNumero($(`[data-teto="${CSS.escape(o.categoria)}"]`).value),
    obs: $(`[data-obs="${CSS.escape(o.categoria)}"]`).value,
  }));
  $('#conteudo').innerHTML = `
    <div class="titulo-pagina"><div><h2>Metas e orçamento</h2><p>Os tetos valem para todos os meses.</p></div>
      <button class="btn primario" id="b-nova-meta">+ Nova meta</button></div>
    <div class="grade g-3">${metas.map((m, i) => `<div class="cartao">${cartaoMeta(m)}
      <div class="ajuda" style="margin-top:8px">${m.aporteMensal ? `Plano: ${fmt0(m.aporteMensal)}/mês${m.noRitmo === false ? ' · abaixo do necessário' : ''}` : ''}${m.obs ? ` · ${esc(m.obs)}` : ''}</div>
      <div class="modal-acoes" style="justify-content:flex-start"><button class="btn pequeno primario" data-aporte="${i}">Registrar aporte</button><button class="btn pequeno" data-edit-meta="${i}">Editar</button></div></div>`).join('') || '<div class="cartao vazio">Nenhuma meta ainda.</div>'}</div>

    <div class="cartao secao">
      <div class="cartao-cab"><div><h2>Tetos por categoria</h2><p class="sub">Gasto de ${rotuloMesLongo(st.mes)} ao lado, para comparar. A linha "Teto de parcelas" limita a soma das parcelas abertas.</p></div>
      <button class="btn primario" id="b-salvar-orc">Salvar tetos</button></div>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Categoria</th><th class="num">Teto mensal (R$)</th><th class="num">Gasto no mês</th><th>Observação</th></tr></thead>
        <tbody>${orc.map((o) => {
          const u = uso.find((y) => y.categoria === o.categoria);
          return `<tr><td>${esc(o.categoria)}</td><td class="num"><input data-teto="${esc(o.categoria)}" inputmode="decimal" value="${String(o.teto).replace('.', ',')}" style="max-width:130px;text-align:right"></td>
            <td class="num">${u ? `<span class="${u.nivel === 'alerta' && !u.poupanca ? 'neg' : ''}">${fmt0(u.gasto)}</span>` : '—'}</td>
            <td><input data-obs="${esc(o.categoria)}" value="${esc(o.obs || '')}"></td></tr>`;
        }).join('')}</tbody>
        <tfoot><tr class="total-linha"><td>Total (sem poupança e sem teto de parcelas)</td><td class="num">${fmt0(orc.filter((o) => o.categoria !== CAT_POUPANCA && !/parcela/i.test(o.categoria)).reduce((s, o) => s + o.teto, 0))}</td><td></td><td></td></tr></tfoot>
      </table></div>
      ${faltando.length ? `<div class="filtros" style="margin-top:12px"><select id="nova-cat">${faltando.map((c) => `<option>${esc(c)}</option>`).join('')}</select><button class="btn" id="b-add-cat">+ Adicionar teto</button></div>` : ''}
    </div>`;

  const addCat = $('#b-add-cat');
  if (addCat) addCat.onclick = async () => { await st.api.salvarOrcamento([...lerTetos(), { categoria: $('#nova-cat').value, teto: 0, obs: '' }]); toast('Categoria adicionada. Defina o teto e salve.'); };
  $('#b-nova-meta').onclick = () => formMeta(null);
  $$('[data-edit-meta]').forEach((b) => { b.onclick = () => formMeta(Number(b.dataset.editMeta)); });
  $$('[data-aporte]').forEach((b) => { b.onclick = () => formAporte(Number(b.dataset.aporte)); });
  $('#b-salvar-orc').onclick = async () => { await st.api.salvarOrcamento(lerTetos()); toast('Tetos salvos.'); };
}

function formMeta(i) {
  const metas = st.dados.metas || [];
  const m = i === null ? { meta: '', alvo: 0, guardado: 0, dataAlvo: '', aporteMensal: 0, obs: '' } : metas[i];
  abrirModal(`<h3>${i === null ? 'Nova meta' : 'Editar meta'}</h3>
    <form id="fm" class="form-grade">
      <div class="campo inteiro"><label>Nome</label><input name="meta" required value="${esc(m.meta)}"></div>
      <div class="campo"><label>Valor alvo (R$)</label><input name="alvo" inputmode="decimal" required value="${String(m.alvo).replace('.', ',')}"></div>
      <div class="campo"><label>Já guardado (R$)</label><input name="guardado" inputmode="decimal" value="${String(m.guardado).replace('.', ',')}"></div>
      <div class="campo"><label>Data alvo</label><input name="dataAlvo" type="date" value="${esc(m.dataAlvo)}"></div>
      <div class="campo"><label>Aporte mensal planejado (R$)</label><input name="aporteMensal" inputmode="decimal" value="${String(m.aporteMensal).replace('.', ',')}"></div>
      <div class="campo inteiro"><label>Observação</label><input name="obs" value="${esc(m.obs)}"></div>
      <div class="modal-acoes inteiro">${i !== null ? '<button type="button" class="btn perigo" id="b-del-meta">Apagar meta</button>' : ''}<button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primario">Salvar</button></div>
    </form>`);
  const salvar = async (lista) => { await st.api.salvarMetas(lista); fecharModal(); toast('Metas salvas.'); };
  $('#fm').onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const nova = { meta: d.meta, alvo: paraNumero(d.alvo), guardado: paraNumero(d.guardado), dataAlvo: d.dataAlvo, aporteMensal: paraNumero(d.aporteMensal), obs: d.obs };
    const lista = metas.map((x) => ({ ...x }));
    if (i === null) lista.push(nova); else lista[i] = nova;
    salvar(lista);
  };
  if (i !== null) $('#b-del-meta').onclick = () => salvar(metas.filter((_, k) => k !== i));
}

function formAporte(i) {
  const m = st.dados.metas[i];
  abrirModal(`<h3>Registrar aporte · ${esc(m.meta)}</h3>
    <form id="fa" class="form-grade">
      <div class="campo"><label>Valor (R$)</label><input name="valor" inputmode="decimal" required value="${String(m.aporteMensal || '').replace('.', ',')}"></div>
      <div class="campo"><label>Data</label><input name="data" type="date" value="${hojeISO()}"></div>
      <label class="campo inteiro" style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" name="lancar" checked style="width:auto">
        <span>Lançar também em Lançamentos (Investimentos e Poupança), para aparecer como "Guardado" no painel</span></label>
      <div class="modal-acoes inteiro"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primario">Registrar</button></div>
    </form>`);
  $('#fa').onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const valor = paraNumero(d.valor);
    const lista = st.dados.metas.map((x) => ({ ...x }));
    lista[i].guardado = round2((lista[i].guardado || 0) + valor);
    await st.api.salvarMetas(lista);
    if (d.lancar) {
      await st.api.addLancamento({
        data: d.data, categoria: CAT_POUPANCA, subcategoria: /reserva/i.test(m.meta) ? 'Reserva de Emergência' : 'Investimentos',
        descricao: `Aporte - ${m.meta}`, forma: 'Transferência', total: valor, parcelas: 1, status: 'Pago', origem: '',
      });
    }
    fecharModal();
    toast(`${fmt(valor)} guardados em ${m.meta}.`);
  };
}

// ------------------------------------------------------------------ assistente
function telaAssistente() {
  const insights = analiseCompleta(st.est, st.mes);
  const ia = !!st.cfg.chaveIA;
  $('#conteudo').innerHTML = `
    <div class="titulo-pagina"><div><h2>Assistente</h2><p>Análise de ${rotuloMesLongo(st.mes)}, refeita a cada dado novo.</p></div></div>
    <div class="grade g-21">
      <div class="cartao"><div class="insights">${insights.map(cartaoInsight).join('')}</div></div>
      <div class="cartao">
        <h2>Pergunte</h2>
        <p class="sub">${ia ? 'Respostas da IA (Claude) com base num resumo dos números de vocês.' : 'Respostas rápidas sobre gastos, saldo, categorias, parcelas e metas. Para perguntas livres, ligue a IA em Configurações.'}</p>
        <div class="chat" id="chat">${st.chat.map((m) => `<div class="msg ${m.eu ? 'eu' : ''}">${esc(m.texto)}</div>`).join('')}
          <form id="f-chat"><input name="p" placeholder="Ex.: dá para comprar a lava e seca este mês?" autocomplete="off"><button class="btn primario">Enviar</button></form>
        </div>
        <div class="ajuda" style="margin-top:10px">Sugestões: <button class="link" data-sug="Quanto gastamos este mês?">quanto gastamos</button> · <button class="link" data-sug="Onde mais gastamos?">onde mais gastamos</button> · <button class="link" data-sug="Como estão as parcelas?">parcelas</button> · <button class="link" data-sug="Como estão as metas?">metas</button></div>
      </div>
    </div>`;
  const enviar = async (pergunta) => {
    if (!pergunta.trim()) return;
    st.chat.push({ eu: true, texto: pergunta });
    let resposta;
    if (ia) {
      st.chat.push({ eu: false, texto: 'Pensando…' });
      render();
      try {
        resposta = await perguntarIA(st.cfg.chaveIA, st.cfg.modeloIA || MODELO_IA_PADRAO, pergunta, contextoIA(st.est, st.mes));
      } catch (e) { resposta = e.message; }
      st.chat.pop();
    } else {
      resposta = responderSemIA(st.est, st.mes, pergunta) ||
        'Essa pergunta precisa da IA ligada (Configurações). Sem ela eu respondo sobre gastos do mês, saldo, categorias, parcelas e metas.';
    }
    st.chat.push({ eu: false, texto: resposta });
    render();
  };
  $('#f-chat').onsubmit = (e) => { e.preventDefault(); enviar(e.target.p.value); };
  $$('[data-sug]').forEach((b) => { b.onclick = () => enviar(b.dataset.sug); });
}

// ------------------------------------------------------------------ menu "mais" (celular)
function telaMais() {
  const itens = [['fixas', '↻', 'Contas fixas'], ['receitas', '↑', 'Receitas'], ['metas', '◆', 'Metas e orçamento'], ['config', '⚙', 'Configurações']];
  $('#conteudo').innerHTML = `<div class="grade">${itens.map(([r, ic, t]) => `<a class="cartao" href="#/${r}" style="text-decoration:none;color:inherit;font-weight:600">${ic} &nbsp;${t}</a>`).join('')}</div>`;
}

// ------------------------------------------------------------------ configurações
function telaConfig() {
  const c = st.cfg;
  const n = nomes();
  const cats = st.dados?.categorias || [];
  $('#conteudo').innerHTML = `
    <div class="titulo-pagina"><div><h2>Configurações</h2><p>${st.api?.nome === 'demo' ? 'Modo demonstração: os dados ficam só neste navegador.' : `Conectado como ${esc(st.api?.email || '')}.`}</p></div></div>

    <div class="cartao">
      <h2>Este aparelho</h2>
      <form id="fc" class="form-grade" style="margin-top:10px">
        <div class="campo"><label>Quem usa este aparelho</label><select name="titular"><option value="Eu" ${c.titular !== 'Esposa' ? 'selected' : ''}>${esc(n.Eu)}</option><option value="Esposa" ${c.titular === 'Esposa' ? 'selected' : ''}>${esc(n.Esposa)}</option></select></div>
        <div class="campo"><label>Origem padrão dos gastos</label><input name="ultimaOrigem" value="${esc(c.ultimaOrigem || '')}" placeholder="Ex.: C6 5052"></div>
        <div class="campo"><label>Nome para "Eu"</label><input name="nomeEu" value="${esc(n.Eu)}"></div>
        <div class="campo"><label>Nome para "Esposa"</label><input name="nomeEsposa" value="${esc(n.Esposa)}"></div>
        <div class="campo inteiro"><label>Chave da API Claude (opcional)</label><input name="chaveIA" type="password" value="${esc(c.chaveIA || '')}" placeholder="sk-ant-…" autocomplete="off">
          <span class="ajuda">Liga as perguntas livres no Assistente. Fica guardada só neste aparelho. Veja o LEIA-ME.</span></div>
        <div class="campo"><label>Modelo da IA</label><input name="modeloIA" value="${esc(c.modeloIA || MODELO_IA_PADRAO)}"></div>
        <div class="modal-acoes inteiro"><button class="btn primario">Salvar</button></div>
      </form>
    </div>

    <div class="cartao secao">
      <h2>Importar e exportar</h2>
      <p class="sub">Importar não duplica: o que já existe (mesmo valor, com até 1 dia de diferença na data) fica de fora. Use para o arquivo mensal das faturas (<code>importar-no-site-AAAA-MM.json</code>, na pasta do mês no Drive) e para restaurar backups.</p>
      <div class="filtros"><input type="file" id="arq" accept=".json,application/json"><button class="btn" id="b-importar">Importar arquivo</button><button class="btn" id="b-exportar">Baixar backup (.json)</button></div>
    </div>

    <div class="cartao secao">
      <div class="cartao-cab"><div><h2>Categorias</h2><p class="sub">Uma categoria por linha; subcategorias separadas por vírgula depois de dois-pontos.</p></div><button class="btn" id="b-salvar-cats">Salvar categorias</button></div>
      <textarea id="cats" rows="${Math.max(8, cats.length + 2)}" style="font-family:ui-monospace,monospace;font-size:13px">${esc(cats.map((x) => `${x.nome}: ${x.subcategorias.join(', ')}`).join('\n'))}</textarea>
    </div>

    <div class="cartao secao">
      <h2>Conta</h2>
      <div class="modal-acoes" style="justify-content:flex-start">
        ${st.api?.nome === 'demo'
          ? `<button class="btn" id="b-reset-demo">Reiniciar demonstração</button>${ApiNuvem.configurado(firebaseConfig) ? '<button class="btn primario" id="b-nuvem">Usar o banco de verdade</button>' : ''}`
          : '<button class="btn" id="b-demo">Ver demonstração</button><button class="btn perigo" id="b-sair">Sair da conta</button>'}
      </div>
    </div>`;

  $('#fc').onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    gravarCfg({ titular: d.titular, ultimaOrigem: d.ultimaOrigem, chaveIA: d.chaveIA.trim(), modeloIA: d.modeloIA.trim() || MODELO_IA_PADRAO, nomes: { Eu: d.nomeEu || 'Eu', Esposa: d.nomeEsposa || 'Esposa' } });
    toast('Configurações salvas neste aparelho.');
    render();
  };
  $('#b-importar').onclick = () => importarArquivo($('#arq'));
  $('#b-exportar').onclick = () => {
    const { vazio, ...dados } = st.dados;
    const blob = new Blob([JSON.stringify({ versao: 1, exportadoEm: new Date().toISOString(), ...dados }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `controle-de-gastos-backup-${hojeISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#b-salvar-cats').onclick = async () => {
    const lista = $('#cats').value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [nome, resto = ''] = l.split(':');
      return { nome: nome.trim(), subcategorias: resto.split(',').map((s) => s.trim()).filter(Boolean) };
    }).filter((x) => x.nome);
    if (!lista.length) { toast('A lista de categorias não pode ficar vazia.', 'erro'); return; }
    await st.api.salvarCategorias(lista);
    toast('Categorias salvas.');
  };
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('#b-reset-demo', () => { st.api.reiniciar(); toast('Demonstração reiniciada.'); });
  on('#b-nuvem', () => { gravarCfg({ modo: 'nuvem' }); conectar(); });
  on('#b-demo', () => { gravarCfg({ modo: 'demo' }); conectar(); });
  on('#b-sair', async () => { await st.api.sair(); gravarCfg({ modo: 'nuvem' }); conectar(); });
}

// ------------------------------------------------------------------ formulários
function abrirNovo() {
  if (!st.est || st.dados?.vazio) return;
  formLancamento();
}

function opcoes(lista, atual) {
  return lista.map((v) => `<option ${v === atual ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

/** Liga a lista de subcategoria à categoria escolhida no formulário. */
function ligarSubcategorias(form, x) {
  const preencher = () => {
    const subs = st.est.subsDe.get(form.categoria.value) || [];
    const atual = form.subcategoria.value || x.subcategoria;
    const lista = atual && !subs.includes(atual) && form.categoria.value === x.categoria ? [...subs, atual] : subs;
    form.subcategoria.innerHTML = `<option value="">—</option>${opcoes(lista, atual)}`;
  };
  form.categoria.onchange = () => { form.subcategoria.value = ''; preencher(); };
  preencher();
}

function formLancamento(l = null) {
  const novo = !l;
  const d = st.dados;
  const x = l || { data: hojeISO(), categoria: '', subcategoria: '', descricao: '', forma: 'Crédito', total: '', parcelas: 1, status: 'Pago', origem: st.cfg.ultimaOrigem || '' };
  const origens = [...new Set(d.lancamentos.map((y) => y.origem).filter(Boolean))].sort();
  abrirModal(`
    ${novo ? '<div class="alternador" style="margin-bottom:14px"><button type="button" class="ativo">Gasto</button><button type="button" id="t-receita">Receita</button></div>' : ''}
    <h3>${novo ? 'Novo gasto' : 'Editar lançamento'}</h3>
    <form id="fl" class="form-grade" autocomplete="off">
      <div class="campo"><label>Valor total (R$)</label><input name="total" inputmode="decimal" required value="${x.total === '' ? '' : String(x.total).replace('.', ',')}" placeholder="0,00"></div>
      <div class="campo"><label>Data da compra</label><input name="data" type="date" required value="${x.data}"></div>
      <div class="campo inteiro"><label>Descrição</label><input name="descricao" value="${esc(x.descricao)}" placeholder="Ex.: Mercado do mês - Assaí"></div>
      <div class="campo"><label>Categoria</label><select name="categoria" required><option value="">Escolha…</option>${opcoes(d.categorias.map((c) => c.nome), x.categoria)}</select></div>
      <div class="campo"><label>Subcategoria</label><select name="subcategoria"></select></div>
      <div class="campo"><label>Forma de pagamento</label><select name="forma">${opcoes(d.formas, x.forma)}</select></div>
      <div class="campo"><label>Nº de parcelas</label><input name="parcelas" type="number" min="1" max="48" value="${x.parcelas || 1}"><span class="ajuda" id="ajuda-parc"></span></div>
      <div class="campo"><label>Status</label><select name="status">${opcoes(['Pago', 'Pendente'], x.status || 'Pago')}</select></div>
      <div class="campo"><label>Origem (cartão/conta)</label><input name="origem" list="origens" value="${esc(x.origem)}" placeholder="Ex.: C6 5052"><datalist id="origens">${origens.map((o) => `<option value="${esc(o)}">`).join('')}</datalist></div>
      ${l?.criadoPor ? `<p class="ajuda inteiro">Lançado por ${esc(l.criadoPor)}${l.alteradoPor ? ` · alterado por ${esc(l.alteradoPor)}` : ''}</p>` : ''}
      <div class="modal-acoes inteiro">
        ${novo ? '' : '<button type="button" class="btn perigo" id="b-apagar">Apagar</button>'}
        <button type="button" class="btn" data-fechar>Cancelar</button>
        <button class="btn primario" id="b-salvar">${novo ? 'Lançar' : 'Salvar'}</button>
      </div>
    </form>`);

  const f = $('#fl');
  ligarSubcategorias(f, x);
  const ajudaParc = () => {
    const n = Math.max(1, Number(f.parcelas.value) || 1);
    const t = paraNumero(f.total.value);
    $('#ajuda-parc').textContent = n > 1 && t ? `${n}x de ${fmt(t / n)}` : '';
  };
  f.parcelas.oninput = ajudaParc;
  f.total.oninput = ajudaParc;
  ajudaParc();
  setTimeout(() => f.total.focus(), 50);
  if (novo) $('#t-receita').onclick = () => formReceita();
  else $('#b-apagar').onclick = () => confirmarApagar(l, 'lancamento');

  f.onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    const item = {
      data: v.data, categoria: v.categoria, subcategoria: v.subcategoria, descricao: v.descricao.trim(), forma: v.forma,
      total: round2(paraNumero(v.total)), parcelas: Math.max(1, Math.round(Number(v.parcelas) || 1)), status: v.status, origem: v.origem.trim(),
    };
    if (!item.total) { toast('Informe o valor.', 'erro'); return; }
    if (item.origem) gravarCfg({ ultimaOrigem: item.origem });
    travarBotao('#b-salvar');
    try {
      const r = novo ? await st.api.addLancamento(item) : await st.api.editLancamento(l.id, item);
      await esperar(60);
      const salvo = st.dados.lancamentos.find((y) => y.id === r.id);
      mostrarAnalise(novo ? 'Gasto lançado' : 'Lançamento atualizado', salvo ? analisarLancamento(st.est, salvo) : [], () => formLancamento());
    } catch (err) { toast(err.message, 'erro'); destravarBotao('#b-salvar'); }
  };
}

function formReceita(rx = null) {
  const novo = !rx;
  const d = st.dados;
  const x = rx || { data: hojeISO(), titular: st.cfg.titular || 'Eu', tipo: 'Salário Fixo', descricao: '', valor: '' };
  abrirModal(`
    ${novo ? '<div class="alternador" style="margin-bottom:14px"><button type="button" id="t-gasto">Gasto</button><button type="button" class="ativo">Receita</button></div>' : ''}
    <h3>${novo ? 'Nova receita' : 'Editar receita'}</h3>
    <form id="fr" class="form-grade" autocomplete="off">
      <div class="campo"><label>Valor (R$)</label><input name="valor" inputmode="decimal" required value="${x.valor === '' ? '' : String(x.valor).replace('.', ',')}" placeholder="0,00"></div>
      <div class="campo"><label>Data</label><input name="data" type="date" required value="${x.data}"></div>
      <div class="campo"><label>De quem</label><select name="titular">${d.titulares.map((t) => `<option value="${esc(t)}" ${t === x.titular ? 'selected' : ''}>${esc(nomeTitular(t))}</option>`).join('')}</select></div>
      <div class="campo"><label>Tipo</label><select name="tipo">${opcoes(d.tiposReceita, x.tipo)}</select></div>
      <div class="campo inteiro"><label>Descrição</label><input name="descricao" value="${esc(x.descricao)}" placeholder="Ex.: Salário, Pocket Money, Facetas"></div>
      <div class="modal-acoes inteiro">
        ${novo ? '' : '<button type="button" class="btn perigo" id="b-apagar">Apagar</button>'}
        <button type="button" class="btn" data-fechar>Cancelar</button>
        <button class="btn primario" id="b-salvar">${novo ? 'Lançar' : 'Salvar'}</button>
      </div>
    </form>`);
  const f = $('#fr');
  setTimeout(() => f.valor.focus(), 50);
  if (novo) $('#t-gasto').onclick = () => formLancamento();
  else $('#b-apagar').onclick = () => confirmarApagar(rx, 'receita');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    const item = { data: v.data, titular: v.titular, tipo: v.tipo, descricao: v.descricao.trim(), valor: round2(paraNumero(v.valor)) };
    if (!item.valor) { toast('Informe o valor.', 'erro'); return; }
    travarBotao('#b-salvar');
    try {
      if (novo) await st.api.addReceita(item); else await st.api.editReceita(rx.id, item);
      await esperar(60);
      mostrarAnalise(novo ? 'Receita lançada' : 'Receita atualizada', analisarReceita(st.est, item), () => formReceita());
    } catch (err) { toast(err.message, 'erro'); destravarBotao('#b-salvar'); }
  };
}

function travarBotao(sel) { const b = $(sel); if (b) { b.disabled = true; b.textContent = 'Gravando…'; } }
function destravarBotao(sel) { const b = $(sel); if (b) { b.disabled = false; b.textContent = 'Tentar de novo'; } }

function mostrarAnalise(titulo, insights, outro) {
  const offline = st.api.situacao.offline ? '<p class="ajuda">Sem internet agora: ficou guardado no aparelho e sobe sozinho quando a conexão voltar.</p>' : '';
  abrirModal(`<h3>✓ ${esc(titulo)}</h3>${offline}
    <p class="sub">O assistente olhou o que mudou:</p>
    <div class="insights analise-pos">${insights.map(cartaoInsight).join('') || '<p class="vazio">Tudo certo.</p>'}</div>
    <div class="modal-acoes"><button class="btn" id="b-outro">Lançar outro</button><button class="btn primario" data-fechar>Fechar</button></div>`);
  $('#b-outro').onclick = outro;
}

function confirmarApagar(item, tipo) {
  if (!item) return;
  const valor = tipo === 'receita' ? item.valor : item.total;
  abrirModal(`<h3>Apagar ${tipo === 'receita' ? 'receita' : 'lançamento'}?</h3>
    <p>${esc(item.descricao || '—')} · ${dataBR(item.data)} · <strong>${fmt(valor)}</strong></p>
    <p class="sub">Não dá para desfazer. Se apagar sem querer, lance de novo.</p>
    <div class="modal-acoes"><button class="btn" data-fechar>Cancelar</button><button class="btn primario" id="b-sim" style="background:var(--vermelho);border-color:var(--vermelho)">Apagar</button></div>`);
  $('#b-sim').onclick = async () => {
    $('#b-sim').disabled = true;
    try {
      if (tipo === 'receita') await st.api.delReceita(item.id); else await st.api.delLancamento(item.id);
      fecharModal();
      toast('Apagado.');
    } catch (e) { toast(e.message, 'erro'); }
  };
}

// ------------------------------------------------------------------ modal e avisos
function abrirModal(html) {
  const m = $('#modal');
  m.innerHTML = html;
  $('#modal-fundo').hidden = false;
  $$('[data-fechar]', m).forEach((b) => { b.onclick = fecharModal; });
}

function fecharModal() {
  if ($('#modal-fundo').hidden) return;
  $('#modal-fundo').hidden = true;
  $('#modal').innerHTML = '';
  st.redesenharDepois = false;
  if (st.dados?.vazio) telaBancoVazio(); else render();
}

function toast(texto, tipo = '') {
  const t = document.createElement('div');
  t.className = `toast ${tipo}`;
  t.textContent = texto;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), tipo === 'erro' ? 6000 : 3200);
}

iniciar();
