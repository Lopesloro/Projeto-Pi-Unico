const axios = require('axios');
const logger = require('../../utils/logger');
const { formatBRL } = require('../../utils/formatter');

const ORCAMENTO_MINIMO_BRL = 1800;
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL = 'mistral-small-latest';

function buildPrompt(orcamento, objetivo, precosScraping) {
  const listaPrecos = Object.entries(precosScraping)
    .map(([componente, resultados]) => {
      if (!resultados || resultados.length === 0) {
        return `- ${componente}: indisponível nas lojas consultadas`;
      }
      const linhasLojas = resultados
        .filter((r) => r.disponivel && r.preco != null)
        .map((r) => `  • ${r.loja}: ${formatBRL(r.preco)} → ${r.url}`)
        .join('\n');
      return linhasLojas
        ? `- ${componente}:\n${linhasLojas}`
        : `- ${componente}: sem preço disponível`;
    })
    .join('\n');

  return `
Você é um consultor sênior de hardware focado em custo-benefício no Brasil.
Seu objetivo: entregar a MELHOR build POSSÍVEL para o cliente, dentro do orçamento.

🚨 ORÇAMENTO DO CLIENTE (LIMITE INVIOLÁVEL): ${formatBRL(orcamento)}
🎯 OBJETIVO: ${objetivo}

PREÇOS REAIS COLETADOS DAS LOJAS:
${listaPrecos}

TAREFA:
Monte a melhor configuração de PC respeitando o orçamento.
Componentes obrigatórios: CPU, GPU (ou vídeo integrado se necessário), RAM, SSD, Placa-mãe, Fonte, Gabinete, Cooler.

🚨 REGRA #1 — O VALOR DO CLIENTE É TETO ABSOLUTO 🚨
A soma dos "preco" de TODOS os componentes (totalGasto) DEVE ser ≤ ${formatBRL(orcamento)}.
Antes de responder, calcule o total e confirme que cabe. Se passar, troque por opções mais baratas.

🚨 REGRA #2 — APROVEITE O ORÇAMENTO AO MÁXIMO 🚨
Não entregue build muito abaixo do teto se houver opções melhores que cabem.
Use pelo menos 85% do orçamento sempre que possível, priorizando o componente que mais impacta o objetivo:
- Games → GPU forte + CPU compatível + RAM mínima 16GB
- Edição/streaming/render → CPU com mais núcleos + RAM 16-32GB + SSD NVMe
- Programação/uso geral → CPU equilibrada (com vídeo integrado) + SSD; pode dispensar GPU dedicada

🚨 REGRA #3 — COERÊNCIA DE PREÇOS 🚨
Use APENAS preços que aparecem EXATAMENTE na lista acima. Não arredonde, não estime.
O campo "preco" de cada item DEVE bater com o preço listado (na loja escolhida).
O campo "totalGasto" DEVE ser EXATAMENTE a soma dos "preco" dos itens com disponivel=true.
Se inventar preço, gera divergência que invalida toda a build.

DEMAIS REGRAS:
1. Use APENAS produtos da lista (não invente).
2. Compatibilidade: socket CPU = socket placa-mãe; tipo RAM (DDR4/DDR5) suportado pela placa-mãe.
3. Fonte: (TDP_CPU + TDP_GPU) × 1.3 de margem mínima.
4. Se item indisponível, marque disponivel: false (e não conte no total).
5. Justifique cada componente em 1-2 frases objetivas (sem citar valores em reais).

FORMATO DE RESPOSTA (JSON puro, sem markdown, sem texto fora do JSON):
{
  "configuracao": [
    {
      "componente": "CPU",
      "produto": "nome exato do produto",
      "preco": 999.99,
      "loja": "nome da loja",
      "url": "url do produto",
      "disponivel": true,
      "justificativa": "texto curto sem citar preço em R$"
    }
  ],
  "totalGasto": 2999.99,
  "economia": 100.01,
  "resumoGeral": "2-3 frases explicando como a build atende ao objetivo."
}
`.trim();
}

function parseRespostaIA(conteudo) {
  const jsonLimpo = conteudo
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const parsed = JSON.parse(jsonLimpo);

  if (!parsed.configuracao || !Array.isArray(parsed.configuracao)) {
    throw new Error('Resposta da IA não contém o campo "configuracao" esperado.');
  }

  const componentesObrigatorios = ['CPU', 'RAM', 'SSD', 'Placa-mãe', 'Fonte'];
  const componentesRetornados = parsed.configuracao.map((c) => c.componente);
  for (const obrigatorio of componentesObrigatorios) {
    const encontrado = componentesRetornados.some((c) =>
      c.toLowerCase().includes(obrigatorio.toLowerCase())
    );
    if (!encontrado) {
      logger.warn(`Componente obrigatório ausente na resposta da IA: ${obrigatorio}`);
    }
  }

  return parsed;
}

async function chamarMistral(prompt) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY não configurada. Defina a variável de ambiente.');
  }

  const resposta = await axios.post(
    MISTRAL_API_URL,
    {
      model: MISTRAL_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 2000,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    }
  );

  const conteudo = resposta.data.choices?.[0]?.message?.content;
  if (!conteudo) throw new Error('Mistral retornou resposta vazia.');
  return conteudo;
}

// Procura o preço real do scraping para um item retornado pela IA.
// Se encontrar, atualiza c.preco/c.loja/c.url para evitar divergência.
function alinharPrecoComScraping(item, precosScraping) {
  if (!item || !precosScraping) return item;
  const lojaIA   = (item.loja    || '').toLowerCase().trim();
  const produto  = (item.produto || '').toLowerCase().trim();

  for (const [, resultados] of Object.entries(precosScraping)) {
    if (!Array.isArray(resultados)) continue;
    const candidatos = resultados.filter((r) => r.disponivel && r.preco != null);
    // 1) match exato por loja
    const porLoja = candidatos.find((r) => (r.loja || '').toLowerCase().trim() === lojaIA);
    if (porLoja) {
      item.preco = Number(porLoja.preco);
      item.loja  = porLoja.loja || item.loja;
      item.url   = porLoja.url  || item.url;
      return item;
    }
    // 2) match aproximado por nome do produto
    const porProduto = candidatos.find((r) => {
      const nome = (r.nome || r.produto || '').toLowerCase();
      return produto && nome && (nome.includes(produto) || produto.includes(nome));
    });
    if (porProduto) {
      item.preco = Number(porProduto.preco);
      item.loja  = porProduto.loja || item.loja;
      item.url   = porProduto.url  || item.url;
      return item;
    }
  }
  return item;
}

async function recomendarBuild({ orcamento, objetivo, precosScraping }) {
  if (orcamento < ORCAMENTO_MINIMO_BRL) {
    throw new Error(
      `Orçamento insuficiente. O mínimo para uma build funcional é ${formatBRL(ORCAMENTO_MINIMO_BRL)}. Orçamento informado: ${formatBRL(orcamento)}.`
    );
  }

  const prompt = buildPrompt(orcamento, objetivo, precosScraping);
  logger.info('IA: enviando prompt para Mistral', { orcamento, objetivo });

  const normalizarPrecos = (build) => {
    build.configuracao = build.configuracao.map((c) => {
      const alinhado = alinharPrecoComScraping({ ...c }, precosScraping);
      alinhado.preco = Number(alinhado.preco) || 0;
      return alinhado;
    });
    return build;
  };

  const recalcularTotal = (build) =>
    build.configuracao
      .filter((c) => c.disponivel !== false)
      .reduce((acc, c) => acc + (Number(c.preco) || 0), 0);

  let buildRecomendada = parseRespostaIA(await chamarMistral(prompt));
  normalizarPrecos(buildRecomendada);
  buildRecomendada.totalGasto = recalcularTotal(buildRecomendada);

  if (buildRecomendada.totalGasto > orcamento) {
    logger.warn('IA: build inicial estourou o orçamento — pedindo nova tentativa', {
      totalGasto: buildRecomendada.totalGasto,
      orcamento,
    });
    const excesso = buildRecomendada.totalGasto - orcamento;
    const reforco =
      `A build anterior totalizou ${formatBRL(buildRecomendada.totalGasto)}, ` +
      `que excede em ${formatBRL(excesso)} o orçamento do cliente (${formatBRL(orcamento)}). ` +
      `Refaça a montagem trocando peças por opções mais baratas (ou removendo a GPU se necessário) ` +
      `para que o totalGasto fique <= ${formatBRL(orcamento)}. NÃO ULTRAPASSE.`;

    buildRecomendada = parseRespostaIA(await chamarMistral(prompt + '\n\n' + reforco));
    normalizarPrecos(buildRecomendada);
    buildRecomendada.totalGasto = recalcularTotal(buildRecomendada);
  }

  if (buildRecomendada.totalGasto > orcamento) {
    logger.error('IA: mesmo após retry, build excede orçamento — aplicando corte server-side');
    const ordenados = [...buildRecomendada.configuracao]
      .filter((c) => c.disponivel !== false)
      .sort((a, b) => (b.preco || 0) - (a.preco || 0));
    for (const item of ordenados) {
      if (buildRecomendada.totalGasto <= orcamento) break;
      item.disponivel = false;
      item.justificativa =
        `[REMOVIDO PELO ENFORCER] Esta peça foi descartada para respeitar o orçamento de ${formatBRL(orcamento)}. ` +
        (item.justificativa || '');
      buildRecomendada.totalGasto = recalcularTotal(buildRecomendada);
    }
  }

  buildRecomendada.dentroOrcamento = buildRecomendada.totalGasto <= orcamento;
  buildRecomendada.economia = Math.max(0, orcamento - buildRecomendada.totalGasto);

  return buildRecomendada;
}

module.exports = { recomendarBuild };
