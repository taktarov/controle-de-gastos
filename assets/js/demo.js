// Dados FICTÍCIOS para o modo demonstração. Nada aqui vem da planilha real.
import { somarMeses, mesAtual } from './util.js';

export const CATEGORIAS_PADRAO = [
  { nome: 'Moradia', subcategorias: ['Aluguel ou Prestação', 'Condomínio', 'IPTU', 'Manutenção e Reparos', 'Mobília e Decoração', 'Seguro Residencial'] },
  { nome: 'Contas e Serviços', subcategorias: ['Energia Elétrica', 'Água e Esgoto', 'Gás', 'Internet', 'Telefone e Celular', 'TV e Streaming', 'Contador - Beatriz'] },
  { nome: 'Alimentação', subcategorias: ['Supermercado', 'Restaurantes e Delivery', 'Padaria', 'Café e Bar', 'Feira e Hortifruti'] },
  { nome: 'Transporte', subcategorias: ['Combustível', 'Transporte Público', 'Aplicativos de Transporte', 'Manutenção do Veículo', 'Estacionamento e Pedágio', 'Seguro Veicular', 'IPVA e Licenciamento', 'Financiamento do Veículo'] },
  { nome: 'Saúde', subcategorias: ['Plano de Saúde', 'Consultas e Exames', 'Medicamentos', 'Odontologia', 'Terapia e Psicólogo', 'Academia e Bem-estar'] },
  { nome: 'Educação', subcategorias: ['Mensalidade Escolar', 'Cursos e Idiomas', 'Material Escolar', 'Livros', 'Material Odonto Beatriz'] },
  { nome: 'Lazer', subcategorias: ['Cinema e Shows', 'Viagens', 'Hobbies', 'Assinaturas de Streaming', 'Jogos', 'Bares e Festas', 'Restaurantes e Delivery', 'Passeios'] },
  { nome: 'Vestuário e Cuidados Pessoais', subcategorias: ['Roupas e Calçados', 'Cabelo e Estética', 'Cosméticos', 'Acessórios'] },
  { nome: 'Filhos e Pets', subcategorias: ['Escola dos Filhos', 'Brinquedos', 'Mesada', 'Pet - Alimentação', 'Pet - Veterinário'] },
  { nome: 'Dívidas e Financiamentos', subcategorias: ['Cartão de Crédito', 'Empréstimos', 'Financiamentos', 'Juros e Multas', 'Material Odonto Beatriz'] },
  { nome: 'Investimentos e Poupança', subcategorias: ['Reserva de Emergência', 'Investimentos', 'Previdência Privada'] },
  { nome: 'Impostos e Taxas', subcategorias: ['Imposto de Renda', 'Taxas Bancárias', 'Outras Taxas'] },
  { nome: 'Presentes e Doações', subcategorias: ['Presentes', 'Doações e Caridade'] },
  { nome: 'Outros', subcategorias: ['Diversos', 'Imprevistos'] },
];

export const LISTAS_PADRAO = {
  titulares: ['Eu', 'Esposa'],
  tiposReceita: ['Salário Fixo', 'Salário Variável', 'Extra / Bônus', 'Outros'],
  formas: ['Crédito', 'Débito', 'PIX', 'Boleto', 'Transferência', 'Dinheiro'],
};

// gerador simples e repetível
function sorteio(semente) {
  let s = semente;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

export function demoInicial() {
  const r = sorteio(42);
  const atual = mesAtual();
  const meses = [-3, -2, -1, 0].map((n) => somarMeses(atual, n));
  const lanc = [];
  const add = (ym, dia, categoria, subcategoria, descricao, total, extra = {}) => lanc.push({
    data: `${ym}-${String(dia).padStart(2, '0')}`, categoria, subcategoria, descricao, forma: extra.forma || 'Crédito',
    total: Math.round(total * 100) / 100, parcelas: extra.parcelas || 1, status: extra.status || 'Pago', origem: extra.origem || 'Cartão A',
  });
  const v = (base, faixa) => base + (r() - 0.5) * 2 * faixa;

  // compras parceladas antigas (fictícias)
  add(somarMeses(atual, -5), 10, 'Moradia', 'Mobília e Decoração', 'Sofá novo', 3600, { parcelas: 10 });
  add(somarMeses(atual, -4), 3, 'Educação', 'Cursos e Idiomas', 'Curso de especialização', 4800, { parcelas: 12 });
  add(somarMeses(atual, -2), 18, 'Outros', 'Imprevistos', 'Conserto do carro', 1800, { parcelas: 6 });

  meses.forEach((ym, i) => {
    const ultimo = i === meses.length - 1;
    const limite = ultimo ? Math.max(5, new Date().getDate()) : 28;
    const dia = (d) => Math.min(d, limite);
    add(ym, dia(5), 'Moradia', 'Aluguel ou Prestação', 'Prestação do apartamento', 1400, { forma: 'PIX', origem: 'Conta fixa' });
    add(ym, dia(10), 'Moradia', 'Condomínio', 'Condomínio', 480, { forma: 'Boleto', origem: 'Conta fixa' });
    add(ym, dia(12), 'Contas e Serviços', 'Energia Elétrica', 'Luz', v(140, 25), { forma: 'PIX', origem: 'Conta fixa' });
    add(ym, dia(12), 'Contas e Serviços', 'Internet', 'Internet fibra', 129.9, { forma: 'PIX', origem: 'Conta fixa' });
    add(ym, dia(15), 'Saúde', 'Plano de Saúde', 'Plano de saúde', 590, { forma: 'Débito', origem: 'Conta fixa' });
    add(ym, dia(3), 'Alimentação', 'Supermercado', 'Mercado do mês', v(820, 120));
    add(ym, dia(17), 'Alimentação', 'Supermercado', 'Reposição mercado', v(260, 80));
    add(ym, dia(8), 'Alimentação', 'Padaria', 'Padaria', v(70, 20));
    add(ym, dia(14), 'Lazer', 'Restaurantes e Delivery', 'Jantar fora', v(180, 60));
    add(ym, dia(21), 'Alimentação', 'Restaurantes e Delivery', 'Delivery', v(95, 30));
    add(ym, dia(9), 'Transporte', 'Combustível', 'Posto', v(220, 40));
    add(ym, dia(19), 'Filhos e Pets', 'Pet - Alimentação', 'Ração', v(160, 20));
    add(ym, dia(22), 'Vestuário e Cuidados Pessoais', 'Cabelo e Estética', 'Salão', v(150, 40));
    add(ym, dia(2), 'Contas e Serviços', 'TV e Streaming', 'Streaming', 44.9);
    if (i % 2 === 0) add(ym, dia(25), 'Vestuário e Cuidados Pessoais', 'Roupas e Calçados', 'Loja de roupas', v(320, 80), { parcelas: 3 });
    if (i === 2) add(ym, dia(26), 'Outros', 'Diversos', '⚠ IDENTIFICAR - Loja online', 189.9);
    add(ym, dia(28), 'Investimentos e Poupança', 'Reserva de Emergência', 'Transferência para a reserva', 800, { forma: 'Transferência', origem: '' });
  });

  const rec = [];
  meses.forEach((ym) => {
    rec.push({ data: `${ym}-01`, titular: 'Eu', tipo: 'Salário Fixo', descricao: 'Salário', valor: 6800 });
    rec.push({ data: `${ym}-05`, titular: 'Esposa', tipo: 'Salário Variável', descricao: 'Atendimentos do consultório', valor: Math.round(v(6200, 700)) });
    if (r() > 0.4) rec.push({ data: `${ym}-20`, titular: 'Eu', tipo: 'Extra / Bônus', descricao: 'Bônus de viagem', valor: Math.round(v(700, 300)) });
  });

  return {
    alteradoEm: Date.now(),
    lancamentos: lanc,
    receitas: rec,
    contasFixas: [
      { conta: 'Condomínio', categoria: 'Moradia', subcategoria: 'Condomínio', forma: 'Boleto', tipo: 'Fixa', valorPadrao: 480, dia: 10, chave: 'condom', ultimoValor: 480 },
      { conta: 'Prestação do apartamento', categoria: 'Moradia', subcategoria: 'Aluguel ou Prestação', forma: 'PIX', tipo: 'Fixa', valorPadrao: 1400, dia: 5, chave: 'presta', ultimoValor: 1400 },
      { conta: 'Luz', categoria: 'Contas e Serviços', subcategoria: 'Energia Elétrica', forma: 'PIX', tipo: 'Variável', valorPadrao: 140, dia: 12, chave: 'luz', ultimoValor: 150 },
      { conta: 'Internet fibra', categoria: 'Contas e Serviços', subcategoria: 'Internet', forma: 'PIX', tipo: 'Fixa', valorPadrao: 129.9, dia: 12, chave: 'internet', ultimoValor: 129.9 },
      { conta: 'Plano de saúde', categoria: 'Saúde', subcategoria: 'Plano de Saúde', forma: 'Débito', tipo: 'Fixa', valorPadrao: 590, dia: 15, chave: 'plano', ultimoValor: 590 },
    ],
    categorias: CATEGORIAS_PADRAO,
    ...structuredClone(LISTAS_PADRAO),
    orcamento: [
      { categoria: 'Moradia', teto: 1900, obs: '' },
      { categoria: 'Contas e Serviços', teto: 400, obs: '' },
      { categoria: 'Alimentação', teto: 1300, obs: '' },
      { categoria: 'Transporte', teto: 300, obs: '' },
      { categoria: 'Saúde', teto: 650, obs: '' },
      { categoria: 'Educação', teto: 450, obs: '' },
      { categoria: 'Lazer', teto: 300, obs: '' },
      { categoria: 'Vestuário e Cuidados Pessoais', teto: 350, obs: '' },
      { categoria: 'Filhos e Pets', teto: 200, obs: '' },
      { categoria: 'Investimentos e Poupança', teto: 1500, obs: 'Meta de poupança' },
      { categoria: 'Outros', teto: 300, obs: '' },
      { categoria: 'Teto de parcelas (todas)', teto: 1200, obs: '' },
    ],
    metas: [
      { meta: 'Viagem dos sonhos', alvo: 25000, guardado: 6400, dataAlvo: `${somarMeses(atual, 10)}-30`, aporteMensal: 1500, obs: 'Exemplo' },
      { meta: 'Reserva de emergência', alvo: 20000, guardado: 3200, dataAlvo: `${somarMeses(atual, 14)}-28`, aporteMensal: 800, obs: 'Exemplo' },
    ],
  };
}
