// Gráficos (Chart.js). Cores vêm das variáveis CSS, então funcionam no tema claro e escuro.
import { fmt0, rotuloMes } from './util.js';

const ativos = [];

export function destruirGraficos() {
  while (ativos.length) ativos.pop().destroy();
}

function cor(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

function base() {
  const texto = cor('--texto-2');
  const grade = cor('--grafico-grade');
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { labels: { color: texto, boxWidth: 12, usePointStyle: true } },
      tooltip: { callbacks: { label: (c) => `${c.dataset.label ? c.dataset.label + ': ' : ''}${fmt0(c.parsed.y ?? c.parsed.x ?? c.parsed)}` } },
    },
    scales: {
      x: { ticks: { color: texto }, grid: { display: false }, border: { color: grade } },
      y: { ticks: { color: texto, callback: (v) => fmt0(v) }, grid: { color: grade }, border: { display: false } },
    },
  };
}

function criar(canvas, config) {
  if (!window.Chart || !canvas) return null;
  const g = new window.Chart(canvas, config);
  ativos.push(g);
  return g;
}

/** Receitas x gastos x guardado, com a linha do saldo. */
export function graficoMeses(canvas, serie) {
  const opt = base();
  return criar(canvas, {
    type: 'bar',
    data: {
      labels: serie.map((r) => rotuloMes(r.ym)),
      datasets: [
        { type: 'bar', label: 'Receitas', data: serie.map((r) => r.receitas), backgroundColor: cor('--verde'), borderRadius: 6, maxBarThickness: 26 },
        { type: 'bar', label: 'Gastos', data: serie.map((r) => r.gastos), backgroundColor: cor('--grafico-cinza'), borderRadius: 6, maxBarThickness: 26 },
        { type: 'bar', label: 'Guardado', data: serie.map((r) => r.guardado), backgroundColor: cor('--acento'), borderRadius: 6, maxBarThickness: 26 },
        { type: 'line', label: 'Saldo', data: serie.map((r) => r.saldo), borderColor: cor('--laranja'), backgroundColor: cor('--laranja'), tension: 0.3, pointRadius: 3 },
      ],
    },
    options: opt,
  });
}

/** Gastos por categoria no mês (barras horizontais), destacando quem passou do teto. */
export function graficoCategorias(canvas, linhas) {
  const opt = base();
  opt.indexAxis = 'y';
  opt.plugins.legend.display = false;
  opt.plugins.tooltip.callbacks.label = (c) => {
    const l = linhas[c.dataIndex];
    return l.teto ? `${fmt0(l.gasto)} de ${fmt0(l.teto)}` : fmt0(l.gasto);
  };
  opt.scales = {
    x: { ticks: { color: cor('--texto-2'), callback: (v) => fmt0(v) }, grid: { color: cor('--grafico-grade') }, border: { display: false } },
    y: { ticks: { color: cor('--texto') }, grid: { display: false } },
  };
  return criar(canvas, {
    type: 'bar',
    data: {
      labels: linhas.map((l) => l.categoria),
      datasets: [{
        data: linhas.map((l) => l.gasto),
        backgroundColor: linhas.map((l) => (l.teto && l.gasto > l.teto ? cor('--vermelho') : cor('--acento'))),
        borderRadius: 5,
        maxBarThickness: 18,
      }],
    },
    options: opt,
  });
}

/** Parcelas já contratadas por mês, com a linha do teto. */
export function graficoParcelas(canvas, carga, teto) {
  const opt = base();
  opt.plugins.legend.display = true;
  return criar(canvas, {
    type: 'bar',
    data: {
      labels: carga.map((c) => rotuloMes(c.ym)),
      datasets: [
        {
          type: 'bar', label: 'Parcelas', data: carga.map((c) => c.valor), borderRadius: 6, maxBarThickness: 34,
          backgroundColor: carga.map((c) => (c.valor > teto ? cor('--vermelho') : cor('--acento'))),
        },
        { type: 'line', label: 'Teto', data: carga.map(() => teto), borderColor: cor('--texto-3'), borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 },
      ],
    },
    options: opt,
  });
}
