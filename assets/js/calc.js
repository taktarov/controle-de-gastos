// Cálculos financeiros — seguem as mesmas regras da planilha:
// compra parcelada entra em cada mês de parcela, pelo valor da parcela (ROUND(total/parcelas; 2)).
import { mesIdx, idxParaMes, round2, somarMeses, temAviso, normalizar } from './util.js';

export const CAT_POUPANCA = 'Investimentos e Poupança';
const TETO_PARCELAS_PADRAO = 1500;

/** Prepara índices a partir dos dados crus vindos da planilha. */
export function preparar(dados) {
  const porMes = new Map(); // 'AAAA-MM' -> [{l, valor, k, n}]
  for (const l of dados.lancamentos) {
    if (!l.data) continue;
    const n = Math.max(1, l.parcelas || 1);
    const valor = round2(l.total / n);
    const i0 = mesIdx(l.data);
    for (let k = 0; k < n; k++) {
      const ym = idxParaMes(i0 + k);
      if (!porMes.has(ym)) porMes.set(ym, []);
      porMes.get(ym).push({ l, valor, k: k + 1, n });
    }
  }
  const recPorMes = new Map();
  for (const r of dados.receitas) {
    if (!r.data) continue;
    const ym = r.data.slice(0, 7);
    if (!recPorMes.has(ym)) recPorMes.set(ym, []);
    recPorMes.get(ym).push(r);
  }
  const subsDe = new Map(dados.categorias.map((c) => [c.nome, c.subcategorias]));
  const orcamento = (dados.orcamento || []).filter((o) => o.categoria && !/parcela/i.test(o.categoria));
  const linhaTeto = (dados.orcamento || []).find((o) => /parcela/i.test(o.categoria || ''));
  return {
    ...dados,
    porMes,
    recPorMes,
    subsDe,
    orcamentoCat: orcamento,
    tetoParcelas: linhaTeto ? linhaTeto.teto : TETO_PARCELAS_PADRAO,
  };
}

/** Resumo de um mês. */
export function resumoMes(est, ym) {
  const itens = est.porMes.get(ym) || [];
  const porCategoria = {};
  let gastos = 0, guardado = 0, parcelado = 0, avista = 0, pendente = 0;
  for (const it of itens) {
    if (it.l.categoria === CAT_POUPANCA) { guardado += it.valor; continue; }
    gastos += it.valor;
    porCategoria[it.l.categoria] = (porCategoria[it.l.categoria] || 0) + it.valor;
    if (it.n > 1) parcelado += it.valor; else avista += it.valor;
    if (/pendente/i.test(it.l.status)) pendente += it.valor;
  }
  const recs = est.recPorMes.get(ym) || [];
  const receitas = recs.reduce((s, r) => s + r.valor, 0);
  const porTitular = {};
  for (const r of recs) porTitular[r.titular || '—'] = (porTitular[r.titular || '—'] || 0) + r.valor;
  return {
    ym, itens, receitas: round2(receitas), gastos: round2(gastos), guardado: round2(guardado),
    saldo: round2(receitas - gastos - guardado), parcelado: round2(parcelado), avista: round2(avista),
    pendente: round2(pendente), porCategoria, porTitular, nReceitas: recs.length,
  };
}

/** Série dos últimos n meses terminando em ymFim. */
export function serie(est, ymFim, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(resumoMes(est, somarMeses(ymFim, -i)));
  return out;
}

/** Soma das parcelas (compras em 2x ou mais) que caem em cada mês. */
export function cargaParcelas(est, ymInicio, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const ym = somarMeses(ymInicio, i);
    const v = (est.porMes.get(ym) || []).filter((it) => it.n > 1 && it.l.categoria !== CAT_POUPANCA)
      .reduce((s, it) => s + it.valor, 0);
    out.push({ ym, valor: round2(v) });
  }
  return out;
}

/** Uso do orçamento por categoria no mês. */
export function usoOrcamento(est, ym) {
  const r = resumoMes(est, ym);
  return est.orcamentoCat.map((o) => {
    const gasto = o.categoria === CAT_POUPANCA ? r.guardado : (r.porCategoria[o.categoria] || 0);
    const p = o.teto > 0 ? gasto / o.teto : 0;
    const poupanca = o.categoria === CAT_POUPANCA;
    let nivel = 'ok';
    if (poupanca) nivel = p >= 1 ? 'ok' : p >= 0.5 ? 'atencao' : 'alerta';
    else if (p > 1) nivel = 'alerta';
    else if (p >= 0.85) nivel = 'atencao';
    return { ...o, gasto: round2(gasto), pct: p, nivel, poupanca };
  });
}

/** Média de gasto de uma categoria nos n meses anteriores a ym. */
export function mediaCategoria(est, ym, categoria, n = 3) {
  let soma = 0;
  for (let i = 1; i <= n; i++) soma += resumoMes(est, somarMeses(ym, -i)).porCategoria[categoria] || 0;
  return soma / n;
}

/** Contas fixas do mês: quais já foram lançadas. */
export function situacaoFixas(est, ym) {
  const doMes = (est.porMes.get(ym) || []).map((it) => it.l).filter((l) => l.data.slice(0, 7) === ym);
  return est.contasFixas.filter((f) => f.conta).map((f) => {
    const chave = f.chave || normalizar(f.conta);
    let re;
    try { re = new RegExp(chave, 'i'); } catch { re = new RegExp(chave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
    const achado = doMes.find((l) => re.test(l.descricao) || re.test(normalizar(l.descricao)));
    return { ...f, lancamento: achado || null };
  });
}

/** Pendências de cadastro do mês. */
export function pendencias(est, ym) {
  const lancs = (est.porMes.get(ym) || []).filter((it) => it.k === 1).map((it) => it.l);
  const avisos = lancs.filter((l) => temAviso(l.descricao));
  const pendentes = lancs.filter((l) => /pendente/i.test(l.status));
  return { avisos, pendentes };
}

/** Possíveis duplicados: mesma data (±1 dia) e mesmo valor. */
export function possiveisDuplicados(est, ym) {
  const lancs = est.lancamentos.filter((l) => l.data && l.data.slice(0, 7) === ym);
  const pares = [];
  for (let i = 0; i < lancs.length; i++) {
    for (let j = i + 1; j < lancs.length; j++) {
      const a = lancs[i], b = lancs[j];
      if (Math.abs(a.total - b.total) < 0.01 && Math.abs(new Date(a.data) - new Date(b.data)) <= 86400000 &&
        normalizar(a.descricao) === normalizar(b.descricao)) pares.push([a, b]);
    }
  }
  return pares;
}

/** Progresso de cada meta. */
export function progressoMetas(est, hoje) {
  return (est.metas || []).filter((m) => m.meta).map((m) => {
    const falta = Math.max(0, m.alvo - m.guardado);
    const mesesRestantes = m.dataAlvo ? Math.max(0, mesIdx(m.dataAlvo) - mesIdx(hoje)) : null;
    const necessario = mesesRestantes ? falta / mesesRestantes : falta;
    const p = m.alvo > 0 ? Math.min(1, m.guardado / m.alvo) : 0;
    const noRitmo = !m.aporteMensal ? null : m.aporteMensal >= necessario - 1;
    return { ...m, falta, mesesRestantes, necessario, pct: p, noRitmo };
  });
}

/** Quando cada compra parcelada termina (para os próximos meses). */
export function parcelasAbertas(est, ym) {
  const idx = mesIdx(ym);
  return est.lancamentos.filter((l) => (l.parcelas || 1) > 1 && l.data)
    .map((l) => ({ l, fim: idxParaMes(mesIdx(l.data) + l.parcelas - 1), valor: round2(l.total / l.parcelas) }))
    .filter((p) => mesIdx(p.fim) >= idx && mesIdx(p.l.data) <= idx)
    .sort((a, b) => b.valor - a.valor);
}

/** Resumo compacto para mandar à IA (sem descrições linha a linha). */
export function contextoIA(est, ym) {
  const meses = serie(est, ym, 4).map((r) => ({
    mes: r.ym, receitas: r.receitas, gastos: r.gastos, guardado: r.guardado, saldo: r.saldo,
    parcelado: r.parcelado, porCategoria: Object.fromEntries(Object.entries(r.porCategoria).map(([k, v]) => [k, round2(v)])),
  }));
  const top = (est.porMes.get(ym) || []).filter((it) => it.l.categoria !== CAT_POUPANCA)
    .sort((a, b) => b.valor - a.valor).slice(0, 12)
    .map((it) => ({ descricao: it.l.descricao, categoria: it.l.categoria, valor: it.valor, parcela: `${it.k}/${it.n}` }));
  return {
    mesReferencia: ym,
    meses,
    orcamento: usoOrcamento(est, ym).map((o) => ({ categoria: o.categoria, teto: o.teto, gasto: o.gasto })),
    tetoParcelas: est.tetoParcelas,
    parcelasProximosMeses: cargaParcelas(est, somarMeses(ym, 1), 6),
    metas: progressoMetas(est, `${ym}-15`).map((m) => ({
      meta: m.meta, alvo: m.alvo, guardado: m.guardado, dataAlvo: m.dataAlvo, aporteMensal: m.aporteMensal,
      necessarioPorMes: round2(m.necessario),
    })),
    maioresGastosDoMes: top,
  };
}
