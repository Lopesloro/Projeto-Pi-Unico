const axios = require('axios');
const logger = require('../../utils/logger');
const { formatBRL } = require('../../utils/formatter');

const ORCAMENTO_MINIMO_BRL = 1500;
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL = 'mistral-small-latest';

// ──────────────────────────────────────────────────────────────
// CONSTRUÇÃO DO PROMPT
// ──────────────────────────────────────────────────────────────

/**
 * Organiza os dados de scraping em texto claro para o prompt.
 * Cada componente mostra os preços reais coletados por loja.
 */
function _formatarDadosScraping(precosScraping) {
  const linhas = [];

  for (const [componente, resultados] of Object.entries(precosScraping)) {
    if (!resultados || resultados.length === 0) {
      linhas.push(`▸ ${componente}: indisponível nas lojas consultadas`);
      continue;
    }

    const disponiveis = resultados.filter((r) => r.disponivel && r.preco != null);

    if (disponiveis.length === 0) {
      linhas.push(`▸ ${componente}: sem preço disponível`);
      continue;
    }

    linhas.push(`▸ ${componente}:`);
    for (const r of disponiveis) {
      linhas.push(`    • ${r.loja}: ${formatBRL(r.preco)} → ${r.url}`);
    }
  }

  return linhas.join('\n');
}

/**
 * Monta o prompt completo enviado à Mistral.
 */
function buildPrompt(orcamento, objetivo, precosScraping) {
  const dadosScraping = _formatarDadosScraping(precosScraping);

  return `Você é um consultor sênior de hardware com foco em custo-benefício no mercado brasileiro.
Missão: montar a MELHOR build possível para o cliente, dentro do orçamento, usando os preços reais coletados.

═══════════════════════════════════════════
DADOS DO CLIENTE
═══════════════════════════════════════════
💰 ORÇAMENTO MÁXIMO (TETO ABSOLUTO): ${formatBRL(orcamento)}
🎯 Objetivo / Uso: "${objetivo}"

═══════════════════════════════════════════
PREÇOS REAIS COLETADOS DAS LOJAS
(Use APENAS estes — não invente produto, preço ou URL)
═══════════════════════════════════════════
${dadosScraping}

═══════════════════════════════════════════
COMPONENTES OBRIGATÓRIOS
═══════════════════════════════════════════
CPU, Placa-mãe, RAM (mín. 8 GB), Armazenamento (SSD preferencialmente), Fonte, Gabinete.
GPU: obrigatória para games/edição; opcional para uso geral (use CPU com vídeo integrado).
Cooler: inclua se disponível nos dados de scraping.

═══════════════════════════════════════════
REGRAS OBRIGATÓRIAS
═══════════════════════════════════════════

REGRA 1 — ORÇAMENTO É TETO ABSOLUTO:
• totalGasto = soma dos "preco" de TODOS os itens com disponivel = true
• Esse total DEVE ser ≤ ${formatBRL(orcamento)}. Sem exceções.
• Antes de responder, some os preços e confirme que cabe.
• Se estourar: troque itens por opções mais baratas ou remova a GPU (se CPU tiver vídeo integrado).

REGRA 2 — MAXIMIZE O ORÇAMENTO (use 85-100% do teto):
Priorize o componente que mais impacta o objetivo:
• "Games" / "Jogos": GPU de maior custo-benefício + CPU equilibrada + RAM ≥ 16 GB
• "Edição de vídeo" / "Streaming" / "Render" / "3D": CPU com muitos núcleos + RAM 16-32 GB + SSD NVMe
• "Programação" / "Uso geral" / "Escritório": CPU equilibrada (com vídeo integrado) + SSD; GPU opcional

REGRA 3 — COMPATIBILIDADE OBRIGATÓRIA:
• Socket da CPU == Socket da Placa-Mãe
• Tipo de RAM == Tipo suportado pela Placa-Mãe (DDR4 ou DDR5)
• Fonte: potência ≥ (TDP_CPU + TDP_GPU) × 1.3  [margem de 30%]

REGRA 4 — EQUILÍBRIO CPU × GPU (evite bottleneck):
• Se tiver dados de score: mantenha diferença de score ≤ 1.5 entre CPU e GPU
• GPU muito mais potente que a CPU = desperdício de dinheiro
• CPU muito mais potente que a GPU = CPU ociosa — redistribua o budget

REGRA 5 — COERÊNCIA DE PREÇOS:
• O campo "preco" de cada item DEVE bater exatamente com o preço listado para aquela loja acima
• O campo "totalGasto" DEVE ser exatamente a soma dos precos dos itens com disponivel = true
• Preço inventado invalida toda a build

REGRA 6 — ITENS INDISPONÍVEIS:
• Se um componente não constar nos dados de scraping: marque disponivel: false, preco: 0
• Itens com disponivel: false NÃO entram no totalGasto

═══════════════════════════════════════════
PROCESSO DE RACIOCÍNIO (siga antes de responder)
═══════════════════════════════════════════
1. Classifique o objetivo (games / edição / geral / etc.)
2. Identifique o componente principal
3. Selecione CPU + Placa-Mãe com socket compatível
4. Selecione RAM compatível com a Placa-Mãe
5. Selecione GPU (se necessário), verificando equilíbrio com a CPU
6. Selecione Armazenamento e Fonte (verifique TDP total × 1.3)
7. Some os preços → confirme total ≤ ${formatBRL(orcamento)}
8. Se estourar: faça downgrade no item menos crítico e recalcule

═══════════════════════════════════════════
FORMATO DE RESPOSTA (JSON puro — sem markdown, sem texto fora do JSON)
═══════════════════════════════════════════
{
  "configuracao": [
    {
      "componente": "CPU",
      "produto": "nome exato do produto",
      "preco": 999.99,
      "loja": "nome exato da loja",
      "url": "url exata do produto",
      "disponivel": true,
      "justificativa": "1-2 frases técnicas sem citar valor em R$"
    }
  ],
  "totalGasto": 2999.99,
  "economia": 100.01,
  "resumoGeral": "2-3 frases explicando como a build atende ao objetivo e por que é a melhor escolha dentro do orçamento."
}`.trim();
}

// ──────────────────────────────────────────────────────────────
// PARSE DA RESPOSTA
// ──────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────
// ALINHAMENTO DE PREÇOS COM SCRAPING
// ──────────────────────────────────────────────────────────────

/**
 * Tenta associar um item retornado pela IA ao resultado real de scraping.
 * Prioriza match por nome de produto; fallback por loja.
 * Garante que preco/loja/url reflitam os dados reais coletados.
 */
function alinharPrecoComScraping(item, precosScraping) {
  if (!item || !precosScraping) return item;

  const lojaIA   = (item.loja    || '').toLowerCase().trim();
  const produtoIA = (item.produto || '').toLowerCase().trim();

  for (const [, resultados] of Object.entries(precosScraping)) {
    if (!Array.isArray(resultados)) continue;

    const candidatos = resultados.filter((r) => r.disponivel && r.preco != null);

    // 1) Match por nome do produto (mais confiável)
    if (produtoIA.length >= 5) {
      const porProduto = candidatos.find((r) => {
        const nomeReal = (r.nome || r.produto || '').toLowerCase();
        return nomeReal && (nomeReal.includes(produtoIA) || produtoIA.includes(nomeReal));
      });
      if (porProduto) {
        item.preco = Number(porProduto.preco);
        item.loja  = porProduto.loja || item.loja;
        item.url   = porProduto.url  || item.url;
        return item;
      }
    }

    // 2) Fallback: match por loja + componente (menos confiável, só se loja bate)
    if (lojaIA) {
      const porLoja = candidatos.find(
        (r) => (r.loja || '').toLowerCase().trim() === lojaIA
      );
      if (porLoja) {
        item.preco = Number(porLoja.preco);
        item.loja  = porLoja.loja || item.loja;
        item.url   = porLoja.url  || item.url;
        return item;
      }
    }
  }

  return item;
}

// ──────────────────────────────────────────────────────────────
// CHAMADA À MISTRAL
// ──────────────────────────────────────────────────────────────

async function chamarMistral(prompt) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY não configurada. Defina a variável de ambiente.');
  }

  const resposta = await axios.post(
    MISTRAL_API_URL,
    {
      model: MISTRAL_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'Você é um assistente especialista em hardware de PC para o mercado brasileiro. ' +
            'Sempre responda em JSON puro, sem markdown, sem texto fora do JSON. ' +
            'Respeite rigorosamente todas as regras de orçamento, compatibilidade e preço informadas.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
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

// ──────────────────────────────────────────────────────────────
// FUNÇÕES AUXILIARES DE NORMALIZAÇÃO
// ──────────────────────────────────────────────────────────────

function normalizarPrecos(build, precosScraping) {
  build.configuracao = build.configuracao.map((c) => {
    const alinhado = alinharPrecoComScraping({ ...c }, precosScraping);
    alinhado.preco = Number(alinhado.preco) || 0;
    return alinhado;
  });
  return build;
}

function recalcularTotal(build) {
  return build.configuracao
    .filter((c) => c.disponivel !== false)
    .reduce((acc, c) => acc + (Number(c.preco) || 0), 0);
}

// ──────────────────────────────────────────────────────────────
// ENFORCER SERVER-SIDE (último recurso)
// ──────────────────────────────────────────────────────────────

/**
 * Se mesmo após retry a build estourar o orçamento,
 * remove itens opcionais (do mais caro ao mais barato) até caber.
 */
function aplicarEnforcerServerSide(build, orcamento) {
  logger.error('IA: mesmo após retry, build excede orçamento — aplicando corte server-side');

  // Ordem de remoção: GPU (opcional) primeiro, depois itens mais caros
  const ordenados = [...build.configuracao]
    .filter((c) => c.disponivel !== false)
    .sort((a, b) => {
      // GPU vai primeiro na fila de corte
      if (a.componente?.toLowerCase().includes('gpu') || a.componente?.toLowerCase().includes('vídeo')) return -1;
      if (b.componente?.toLowerCase().includes('gpu') || b.componente?.toLowerCase().includes('vídeo')) return 1;
      return (b.preco || 0) - (a.preco || 0);
    });

  for (const item of ordenados) {
    if (recalcularTotal(build) <= orcamento) break;
    item.disponivel = false;
    item.justificativa =
      `[REMOVIDO AUTOMATICAMENTE] Peça descartada para respeitar o orçamento de ${formatBRL(orcamento)}. ` +
      (item.justificativa || '');
  }

  return build;
}

// ──────────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL
// ──────────────────────────────────────────────────────────────

/**
 * Gera a recomendação de build via IA.
 * Inclui retry automático se o orçamento for ultrapassado.
 */
async function recomendarBuild({ orcamento, objetivo, precosScraping }) {
  if (orcamento < ORCAMENTO_MINIMO_BRL) {
    throw new Error(
      `Orçamento insuficiente. O mínimo para uma build funcional é ${formatBRL(ORCAMENTO_MINIMO_BRL)}. ` +
        `Orçamento informado: ${formatBRL(orcamento)}.`
    );
  }

  const prompt = buildPrompt(orcamento, objetivo, precosScraping);
  logger.info('IA: enviando prompt para Mistral', { orcamento, objetivo });

  // ── Tentativa 1 ──
  let buildRecomendada = parseRespostaIA(await chamarMistral(prompt));
  normalizarPrecos(buildRecomendada, precosScraping);
  buildRecomendada.totalGasto = recalcularTotal(buildRecomendada);

  // ── Retry se ultrapassou o orçamento ──
  if (buildRecomendada.totalGasto > orcamento) {
    const excesso = buildRecomendada.totalGasto - orcamento;
    logger.warn('IA: build inicial estourou o orçamento — pedindo nova tentativa', {
      totalGasto: buildRecomendada.totalGasto,
      orcamento,
      excesso,
    });

    const reforco =
      `\n\nATENÇÃO — A build anterior totalizou ${formatBRL(buildRecomendada.totalGasto)}, ` +
      `excedendo em ${formatBRL(excesso)} o orçamento do cliente (${formatBRL(orcamento)}). ` +
      `Refaça a montagem:\n` +
      `1. Troque os itens mais caros por opções mais baratas e compatíveis\n` +
      `2. Ou remova a GPU (se a CPU tiver vídeo integrado)\n` +
      `3. O totalGasto DEVE ser ≤ ${formatBRL(orcamento)} — confirme a soma antes de responder.\n` +
      `Retorne apenas o JSON corrigido.`;

    buildRecomendada = parseRespostaIA(await chamarMistral(prompt + reforco));
    normalizarPrecos(buildRecomendada, precosScraping);
    buildRecomendada.totalGasto = recalcularTotal(buildRecomendada);
  }

  // ── Enforcer server-side (último recurso) ──
  if (buildRecomendada.totalGasto > orcamento) {
    buildRecomendada = aplicarEnforcerServerSide(buildRecomendada, orcamento);
    buildRecomendada.totalGasto = recalcularTotal(buildRecomendada);
  }

  buildRecomendada.dentroOrcamento = buildRecomendada.totalGasto <= orcamento;
  buildRecomendada.economia = Math.max(0, orcamento - buildRecomendada.totalGasto);

  logger.info('IA: build finalizada', {
    totalGasto: buildRecomendada.totalGasto,
    orcamento,
    dentroOrcamento: buildRecomendada.dentroOrcamento,
    economia: buildRecomendada.economia,
  });

  return buildRecomendada;
}

module.exports = { recomendarBuild };
