// Assistente de análise: lê os dados e devolve observações (insights) em linguagem simples.
// Funciona sem internet extra; a IA (Claude) é opcional e fica no Apps Script.
import {
  CAT_POUPANCA, resumoMes, usoOrcamento, mediaCategoria, cargaParcelas, pendencias, possiveisDuplicados,
  progressoMetas, situacaoFixas, parcelasAbertas,
} from './calc.js';
import { fmt, fmt0, pct, rotuloMes, somarMeses, mesAtual, hojeISO, diasNoMes, round2, temAviso, mesIdx } from './util.js';

const I = (nivel, titulo, texto) => ({ nivel, titulo, texto });

/** Observações logo depois de gravar um lançamento novo (ou editado). */
export function analisarLancamento(est, l) {
  const out = [];
  const ym = l.data.slice(0, 7);
  const n = Math.max(1, l.parcelas || 1);
  const parcela = round2(l.total / n);

  // subcategoria x categoria
  const subs = est.subsDe.get(l.categoria) || [];
  if (l.subcategoria && subs.length && !subs.includes(l.subcategoria)) {
    out.push(I('atencao', 'Subcategoria fora da categoria',
      `"${l.subcategoria}" não é uma subcategoria de ${l.categoria}. Confira para o relatório não ficar torto.`));
  }

  if (l.categoria === CAT_POUPANCA) {
    out.push(I('ok', 'Dinheiro guardado', `${fmt(l.total)} registrados como poupança. Atualize o valor guardado da meta em Metas.`));
    return out;
  }

  // orçamento da categoria
  const uso = usoOrcamento(est, ym).find((o) => o.categoria === l.categoria);
  if (uso && uso.teto > 0) {
    const sobra = uso.teto - uso.gasto;
    if (uso.pct > 1) {
      out.push(I('alerta', `${l.categoria} passou do teto`,
        `Com este lançamento, ${l.categoria} chega a ${fmt0(uso.gasto)} em ${rotuloMes(ym)}, ${pct(uso.pct)} do teto de ${fmt0(uso.teto)}. Passou ${fmt0(-sobra)}.`));
    } else if (uso.pct >= 0.85) {
      out.push(I('atencao', `${l.categoria} quase no limite`,
        `${fmt0(uso.gasto)} de ${fmt0(uso.teto)} (${pct(uso.pct)}). Restam ${fmt0(sobra)} até o fim do mês.`));
    } else {
      out.push(I('ok', `${l.categoria} dentro do teto`,
        `${fmt0(uso.gasto)} de ${fmt0(uso.teto)} (${pct(uso.pct)}). Ainda cabem ${fmt0(sobra)} neste mês.`));
    }
  }

  // parcelamento
  if (n > 1) {
    const fim = somarMeses(ym, n - 1);
    const carga = cargaParcelas(est, ym, n);
    const estouro = carga.filter((c) => c.valor > est.tetoParcelas);
    out.push(I(estouro.length ? 'alerta' : 'info', `Parcela de ${fmt(parcela)} até ${rotuloMes(fim)}`,
      estouro.length
        ? `Somando com as outras parcelas, ${estouro.length} ${estouro.length > 1 ? 'meses passam' : 'mês passa'} do teto de ${fmt0(est.tetoParcelas)}. O pior é ${rotuloMes(estouro.reduce((a, c) => (c.valor > a.valor ? c : a)).ym)}, com ${fmt0(Math.max(...estouro.map((c) => c.valor)))} em parcelas.`
        : `As parcelas somadas continuam abaixo do teto de ${fmt0(est.tetoParcelas)} por mês. No mês mais cheio, ${fmt0(Math.max(...carga.map((c) => c.valor)))}.`));
  } else if (l.total >= 300 && !/fixa/i.test(l.origem || '')) {
    out.push(I('info', 'Compra acima de R$ 300', 'Regra do casal: compras grandes fora do plano esperam 48 horas e passam por uma conversa.'));
  }

  // comparação com a média
  const media = mediaCategoria(est, ym, l.categoria, 3);
  const r = resumoMes(est, ym);
  const atual = r.porCategoria[l.categoria] || 0;
  if (media > 0 && atual > media * 1.3 && ym === mesAtual()) {
    out.push(I('atencao', 'Acima do costume', `${l.categoria} já está em ${fmt0(atual)} este mês; a média dos 3 meses anteriores é ${fmt0(media)}.`));
  }

  // duplicado
  const dup = est.lancamentos.filter((x) => x !== l && x.data && Math.abs(x.total - l.total) < 0.01 &&
    Math.abs(new Date(x.data) - new Date(l.data)) <= 86400000);
  if (dup.length) {
    out.push(I('atencao', 'Pode ser duplicado', `Já existe ${dup[0].descricao || 'um lançamento'} de ${fmt(dup[0].total)} em ${dup[0].data.split('-').reverse().join('/')}. Se for o mesmo, apague um dos dois.`));
  }

  if (temAviso(l.descricao)) out.push(I('info', 'Marcado para conferir', 'Quando souber o que foi, troque o ⚠ pela descrição certa.'));

  // saldo do mês
  if (r.receitas > 0) {
    out.push(I(r.saldo >= 0 ? 'ok' : 'alerta', `Saldo de ${rotuloMes(ym)}: ${fmt0(r.saldo)}`,
      `Receitas ${fmt0(r.receitas)} − gastos ${fmt0(r.gastos)} − guardado ${fmt0(r.guardado)}.`));
  }
  return out;
}

/** Observações depois de gravar uma receita. */
export function analisarReceita(est, rec) {
  const out = [];
  const ym = rec.data.slice(0, 7);
  const r = resumoMes(est, ym);
  if (/extra|b[oô]nus/i.test(rec.tipo) || /pocket|b[oô]nus|venda|retroativo/i.test(rec.descricao)) {
    out.push(I('info', 'Dinheiro extra', `Regra do casal: ${fmt(rec.valor)} de extra vão 100% para a meta da Europa. Depois de transferir, atualize o valor guardado em Metas.`));
  }
  const taxa = r.receitas > 0 ? (r.guardado + Math.max(0, r.saldo)) / r.receitas : 0;
  out.push(I(r.saldo >= 0 ? 'ok' : 'alerta', `Receitas de ${rotuloMes(ym)}: ${fmt0(r.receitas)}`,
    `Gastos ${fmt0(r.gastos)}, guardado ${fmt0(r.guardado)}, saldo ${fmt0(r.saldo)}. Dá para guardar ${pct(taxa)} da renda do mês.`));
  return out;
}

/** Análise completa do mês. */
export function analiseCompleta(est, ym) {
  const out = [];
  const r = resumoMes(est, ym);
  const hoje = hojeISO();
  const eMesAtual = ym === mesAtual();

  // 1. Resultado do mês
  if (r.receitas === 0) {
    out.push(I('atencao', 'Nenhuma receita lançada no mês', 'Sem as receitas, o saldo e a taxa de poupança ficam errados. Lance salário e recebimentos do consultório.'));
  } else {
    const taxa = r.guardado / r.receitas;
    out.push(I(r.saldo >= 0 ? 'ok' : 'alerta', `Saldo do mês: ${fmt0(r.saldo)}`,
      `Entraram ${fmt0(r.receitas)}, saíram ${fmt0(r.gastos)} em gastos e ${fmt0(r.guardado)} foram guardados (${pct(taxa)} da renda). ${r.parcelado > 0 ? `${fmt0(r.parcelado)} dos gastos são parcelas.` : ''}`));
    const titulares = Object.keys(r.porTitular);
    if (titulares.length === 1) {
      out.push(I('atencao', 'Só uma pessoa com receita no mês', `Só há receitas de "${titulares[0]}". Se a outra pessoa recebeu, lance para o saldo ficar certo.`));
    }
  }

  // 2. Projeção (mês corrente)
  if (eMesAtual) {
    const dia = Number(hoje.slice(8, 10));
    const total = diasNoMes(ym);
    // gasto do dia a dia: à vista, fora poupança e fora contas fixas
    const variavel = (m) => (est.porMes.get(m) || []).filter((it) => it.n === 1 && it.l.categoria !== CAT_POUPANCA &&
      !/conta fixa/i.test(it.l.origem || '')).reduce((s, it) => s + it.valor, 0);
    const doMes = variavel(ym);
    const anteriores = [1, 2, 3].map((k) => variavel(somarMeses(ym, -k))).filter((v) => v > 0);
    const mediaDia = anteriores.length ? anteriores.reduce((s, v) => s + v, 0) / anteriores.length / 30 : 0;
    const ritmo = dia >= 7 || !mediaDia ? doMes / Math.max(1, dia) : mediaDia;
    const fixasFaltando = situacaoFixas(est, ym).filter((f) => !f.lancamento)
      .reduce((s, f) => s + (f.ultimoValor || f.valorPadrao || 0), 0);
    const projecao = r.gastos + ritmo * (total - dia) + fixasFaltando;
    out.push(I('info', `Projeção para o fim do mês: ${fmt0(projecao)} em gastos`,
      `No ritmo de ${fmt0(ritmo)} por dia no dia a dia, faltando ${total - dia} dias${fixasFaltando ? `, mais ${fmt0(fixasFaltando)} de contas fixas ainda não lançadas` : ''}.${r.receitas ? ` O saldo projetado é ${fmt0(r.receitas - projecao - r.guardado)}.` : ''}`));
  }

  // 3. Envelopes
  const uso = usoOrcamento(est, ym).filter((o) => !o.poupanca);
  const estourados = uso.filter((o) => o.nivel === 'alerta').sort((a, b) => (b.gasto - b.teto) - (a.gasto - a.teto));
  const quase = uso.filter((o) => o.nivel === 'atencao');
  if (estourados.length) {
    out.push(I('alerta', `${estourados.length} ${estourados.length > 1 ? 'categorias passaram' : 'categoria passou'} do teto`,
      estourados.map((o) => `${o.categoria}: ${fmt0(o.gasto)} de ${fmt0(o.teto)}`).join(' · ')));
  }
  if (quase.length) out.push(I('atencao', 'Perto do limite', quase.map((o) => `${o.categoria} ${pct(o.pct)}`).join(' · ')));
  if (!estourados.length && !quase.length && uso.length) out.push(I('ok', 'Todas as categorias dentro do teto', 'Continuem assim até o fim do mês.'));

  const poup = usoOrcamento(est, ym).find((o) => o.poupanca);
  if (poup && poup.teto > 0) {
    out.push(I(poup.pct >= 1 ? 'ok' : 'atencao', `Guardado: ${fmt0(poup.gasto)} de ${fmt0(poup.teto)}`,
      poup.pct >= 1 ? 'Meta de poupança do mês cumprida.' : `Faltam ${fmt0(poup.teto - poup.gasto)} para a meta de poupança do mês. O ideal é transferir no dia do salário.`));
  }

  // 4. Categoria que mais subiu
  let maior = null;
  for (const [cat, v] of Object.entries(r.porCategoria)) {
    const m = mediaCategoria(est, ym, cat, 3);
    if (m > 100 && v - m > (maior ? maior.dif : 150)) maior = { cat, v, m, dif: v - m };
  }
  if (maior) out.push(I('atencao', `${maior.cat} subiu ${fmt0(maior.dif)}`, `${fmt0(maior.v)} neste mês contra ${fmt0(maior.m)} de média nos 3 anteriores.`));

  // 5. Maiores gastos
  const top = (r.itens || []).filter((it) => it.l.categoria !== CAT_POUPANCA).sort((a, b) => b.valor - a.valor).slice(0, 3);
  if (top.length) {
    out.push(I('info', 'Maiores gastos do mês', top.map((it) => `${it.l.descricao || it.l.subcategoria} ${fmt0(it.valor)}${it.n > 1 ? ` (${it.k}/${it.n})` : ''}`).join(' · ')));
  }

  // 6. Parcelas à frente
  const carga = cargaParcelas(est, somarMeses(ym, 1), 6);
  const acima = carga.filter((c) => c.valor > est.tetoParcelas);
  const abertas = parcelasAbertas(est, ym);
  const acabando = abertas.filter((p) => p.fim === ym).reduce((s, p) => s + p.valor, 0);
  out.push(I(acima.length ? 'atencao' : 'ok', `Parcelas no próximo mês: ${fmt0(carga[0].valor)}`,
    `${acima.length ? `${acima.length} dos próximos 6 meses ainda passam do teto de ${fmt0(est.tetoParcelas)}.` : `Os próximos 6 meses ficam dentro do teto de ${fmt0(est.tetoParcelas)}.`}${acabando > 0 ? ` Acabam neste mês ${fmt0(acabando)} em parcelas — não reocupem esse espaço.` : ''}`));

  // 7. Metas
  for (const m of progressoMetas(est, hoje)) {
    if (!m.alvo) continue;
    if (m.falta <= 0) { out.push(I('ok', `${m.meta}: meta atingida`, `${fmt0(m.guardado)} guardados.`)); continue; }
    if (m.mesesRestantes === 0) {
      const passou = m.dataAlvo && m.dataAlvo < hoje;
      out.push(I(passou ? 'alerta' : 'atencao', `${m.meta}: ${passou ? 'o prazo passou' : 'prazo é este mês'}`, `Faltam ${fmt0(m.falta)}${passou ? '. Ajuste a data ou o valor da meta.' : ` até ${m.dataAlvo.split('-').reverse().join('/')}.`}`));
      continue;
    }
    out.push(I(m.noRitmo === false ? 'atencao' : 'info', `${m.meta}: ${pct(m.pct)} guardado`,
      `Faltam ${fmt0(m.falta)} em ${m.mesesRestantes} ${m.mesesRestantes === 1 ? 'mês' : 'meses'}: ${fmt0(m.necessario)} por mês.${m.aporteMensal ? ` O plano é ${fmt0(m.aporteMensal)}${m.noRitmo ? ', está no ritmo.' : ', precisa aumentar.'}` : ''}`));
  }

  // 8. Cadastro
  const pend = pendencias(est, ym);
  if (pend.avisos.length) {
    out.push(I('atencao', `${pend.avisos.length} lançamentos com ⚠ para identificar`,
      `Somam ${fmt0(pend.avisos.reduce((s, l) => s + l.total, 0))}. Abram Lançamentos e filtrem por "Só com ⚠".`));
  }
  if (pend.pendentes.length) {
    out.push(I('info', `${pend.pendentes.length} contas com status Pendente`, pend.pendentes.slice(0, 5).map((l) => l.descricao).join(' · ')));
  }
  const fixas = situacaoFixas(est, ym).filter((f) => !f.lancamento);
  if (fixas.length && mesIdx(ym) <= mesIdx(mesAtual())) {
    out.push(I('atencao', `${fixas.length} contas fixas ainda não lançadas`, `${fixas.map((f) => f.conta).join(' · ')}. Use "Lançar contas do mês" em Contas fixas.`));
  }
  const dups = possiveisDuplicados(est, ym);
  if (dups.length) out.push(I('atencao', `${dups.length} possíveis duplicados`, dups.slice(0, 3).map(([a]) => `${a.descricao} ${fmt(a.total)}`).join(' · ')));

  return out;
}

/** Respostas rápidas sem IA, para perguntas comuns. */
export function responderSemIA(est, ym, pergunta) {
  const p = pergunta.toLowerCase();
  const r = resumoMes(est, ym);
  if (/quanto.*(gast|sai)/.test(p)) return `Em ${rotuloMes(ym)} os gastos estão em ${fmt(r.gastos)} (${fmt(r.parcelado)} em parcelas).`;
  if (/sald|sobr/.test(p)) return `Saldo de ${rotuloMes(ym)}: ${fmt(r.saldo)} (receitas ${fmt(r.receitas)}, gastos ${fmt(r.gastos)}, guardado ${fmt(r.guardado)}).`;
  if (/categoria|onde/.test(p)) {
    const lista = Object.entries(r.porCategoria).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, v]) => `${c}: ${fmt0(v)}`).join('\n');
    return `Onde mais saiu dinheiro em ${rotuloMes(ym)}:\n${lista}`;
  }
  if (/parcela/.test(p)) {
    const c = cargaParcelas(est, somarMeses(ym, 1), 6).map((x) => `${rotuloMes(x.ym)}: ${fmt0(x.valor)}`).join('\n');
    return `Parcelas já contratadas nos próximos meses (teto ${fmt0(est.tetoParcelas)}):\n${c}`;
  }
  if (/meta|europa|viagem|reserva/.test(p)) {
    return progressoMetas(est, hojeISO()).map((m) => `${m.meta}: ${fmt0(m.guardado)} de ${fmt0(m.alvo)} (${pct(m.pct)}), faltam ${fmt0(m.falta)}`).join('\n') || 'Nenhuma meta cadastrada.';
  }
  return null;
}
