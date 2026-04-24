const { OpenAI } = require('openai');
const config = require('../../config');
const logger = require('../../utils/logger');
const { formatBRL } = require('../../utils/formatter');

// Orçamento mínimo para uma build funcional sem GPU dedicada
const ORCAMENTO_MINIMO_BRL = 1800;

const openaiClient = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * Monta o prompt com os preços reais coletados pelo scraper.
 */
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

ORÇAMENTO DO USUÁRIO: ${formatBRL(orcamento)}
OBJETIVO: ${objetivo}

PREÇOS REAIS COLETADOS DAS LOJAS:
${listaPrecos}

TAREFA:
Monte a melhor configuração de PC possível respeitando o orçamento informado.
Componentes obrigatórios: CPU, GPU (ou integrado se orçamento for restrito), RAM, SSD, Placa-mãe, Fonte, Gabinete, Cooler.

REGRAS:
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

/**
 * Valida e parseia o JSON retornado pela IA.
 */
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

/**
 * Usa GPT-4o para recomendar a melhor build dentro do orçamento.
 * @param {object} params
 * @param {number} params.orcamento - Orçamento em BRL
 * @param {string} params.objetivo - Objetivo do usuário (ex: "PC gamer 1080p")
 * @param {object} params.precosScraping - Mapa { componenteNome: [resultados] }
 * @returns {Promise<object>} Build recomendada no formato especificado
 */
async function recomendarBuild({ orcamento, objetivo, precosScraping }) {
  if (orcamento < ORCAMENTO_MINIMO_BRL) {
    throw new Error(
      `Orçamento insuficiente. O mínimo para uma build funcional é ${formatBRL(ORCAMENTO_MINIMO_BRL)}. Orçamento informado: ${formatBRL(orcamento)}.`
    );
  }

  if (!config.openai.apiKey) {
    throw new Error(
      'OPENAI_API_KEY não configurada. Defina a variável de ambiente para usar o módulo de IA.'
    );
  }

  const prompt = buildPrompt(orcamento, objetivo, precosScraping);
  logger.info('IA: enviando prompt para GPT-4o', { orcamento, objetivo });

  const completion = await openaiClient.chat.completions.create({
    model: config.openai.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  });

  const conteudo = completion.choices[0]?.message?.content;
  if (!conteudo) {
    throw new Error('GPT-4o retornou resposta vazia.');
  }

  logger.debug('IA: resposta recebida do GPT-4o', { tokens: completion.usage?.total_tokens });

  const buildRecomendada = parseRespostaIA(conteudo);

  // Garante que o totalGasto esteja calculado caso a IA não calcule corretamente
  if (!buildRecomendada.totalGasto) {
    buildRecomendada.totalGasto = buildRecomendada.configuracao
      .filter((c) => c.disponivel !== false)
      .reduce((acc, c) => acc + (c.preco || 0), 0);
  }

  buildRecomendada.economia = Math.max(0, orcamento - buildRecomendada.totalGasto);

  return buildRecomendada;
}

module.exports = { recomendarBuild };
