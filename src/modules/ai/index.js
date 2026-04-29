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
Você é um especialista sênior em hardware de computadores, focado em custo-benefício para o mercado brasileiro.

🚨 ORÇAMENTO DO CLIENTE (LIMITE INVIOLÁVEL): ${formatBRL(orcamento)}
OBJETIVO: ${objetivo}

PREÇOS REAIS COLETADOS DAS LOJAS:
${listaPrecos}

TAREFA:
Monte a melhor configuração de PC possível respeitando o orçamento informado.
Componentes obrigatórios: CPU, GPU (ou integrado se orçamento for restrito), RAM, SSD, Placa-mãe, Fonte, Gabinete, Cooler.

🚨 REGRA #1 — O VALOR DO CLIENTE É O TETO ABSOLUTO 🚨
A soma dos "preco" de TODOS os componentes (totalGasto) DEVE ser ≤ ${formatBRL(orcamento)}.
NUNCA, EM HIPÓTESE NENHUMA, entregue uma build cujo totalGasto ultrapasse ${formatBRL(orcamento)}.
Antes de responder, calcule o total e confirme que cabe. Se não couber, troque por opções mais baratas.

DEMAIS REGRAS:
1. Use APENAS produtos e preços da lista acima (não invente produtos).
2. Respeite compatibilidade: socket CPU = socket placa-mãe; tipo RAM (DDR4/DDR5) = suportado pela placa-mãe.
3. Dimensione a fonte: (TDP_CPU + TDP_GPU) × 1.3 de margem mínima.
4. Se o orçamento for insuficiente para GPU dedicada, use processador com gráfico integrado.
5. Justifique cada componente escolhido em 1-2 frases objetivas.
6. Se algum componente não tiver preço disponível, sinaliza com disponivel: false e use preço de referência com aviso.

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
      "justificativa": "texto curto"
    }
  ],
  "totalGasto": 2999.99,
  "economia": 100.01,
  "resumoGeral": "Texto de 2-3 frases explicando a build e por que é a melhor escolha para o objetivo."
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

async function recomendarBuild({ orcamento, objetivo, precosScraping }) {
  if (orcamento < ORCAMENTO_MINIMO_BRL) {
    throw new Error(
      `Orçamento insuficiente. O mínimo para uma build funcional é ${formatBRL(ORCAMENTO_MINIMO_BRL)}. Orçamento informado: ${formatBRL(orcamento)}.`
    );
  }

  const prompt = buildPrompt(orcamento, objetivo, precosScraping);
  logger.info('IA: enviando prompt para Mistral', { orcamento, objetivo });

  const recalcularTotal = (build) =>
    build.configuracao
      .filter((c) => c.disponivel !== false)
      .reduce((acc, c) => acc + (Number(c.preco) || 0), 0);

  let buildRecomendada = parseRespostaIA(await chamarMistral(prompt));
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
