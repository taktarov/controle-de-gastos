// Utilidades gerais: dinheiro, datas e HTML.

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const BRL0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const fmt = (v) => BRL.format(Number(v) || 0);
export const fmt0 = (v) => BRL0.format(Math.round(Number(v) || 0));
export const pct = (v) => `${Math.round((Number(v) || 0) * 100)}%`;
export const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto',
  'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** 'AAAA-MM-DD' ou 'AAAA-MM' -> índice de mês (ano*12 + mês). */
export const mesIdx = (iso) => Number(String(iso).slice(0, 4)) * 12 + Number(String(iso).slice(5, 7));
/** índice de mês -> 'AAAA-MM'. */
export const idxParaMes = (i) => {
  const a = Math.floor((i - 1) / 12);
  const m = ((i - 1) % 12) + 1;
  return `${a}-${String(m).padStart(2, '0')}`;
};
export const somarMeses = (ym, n) => idxParaMes(mesIdx(ym) + n);
export const rotuloMes = (ym) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
export const rotuloMesLongo = (ym) => `${MESES_LONGOS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

export const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const mesAtual = () => hojeISO().slice(0, 7);
export const dataBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
export const diasNoMes = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
export const diferencaDias = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Converte "1.234,56", "1234.56" ou número em número. */
export const paraNumero = (v) => {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const temAviso = (desc) => /⚠|IDENTIFICAR|CONFERIR/i.test(desc || '');
