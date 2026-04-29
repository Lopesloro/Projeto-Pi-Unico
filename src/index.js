const { buscarPrecosLote } = require('./modules/scraper');
const { recomendarBuild } = require('./modules/ai');
const { enviarEmailBuild } = require('./modules/email');
const logger = require('./utils/logger');

// Componentes-alvo que o scraper deve buscar em todas as lojas.
// Baseado nos itens mais relevantes do catálogo components.json.
const COMPONENTES_ALVO = [
  'Processador Intel Core i5',
  'Processador AMD Ryzen 5',
  'Placa de Video RTX 4060',
  'Placa de Video RX 7600',
  'Memoria RAM DDR4 16GB',
  'Memoria RAM DDR5 16GB',
  'SSD NVMe 1TB',
  'Placa Mae LGA1700 DDR4',
  'Placa Mae AM5 DDR5',
  'Fonte 650W 80 Plus Bronze',
  'Gabinete Gamer ATX',
  'Cooler CPU 120mm',
];

/**
 * Orquestra todo o fluxo de montagem de PC.
 *
 * @param {object} input
 * @param {number}  input.orcamento      - Orçamento em BRL
 * @param {string}  input.objetivo       - Objetivo do usuário (ex: "PC gamer 1080p")
 * @param {string}  input.emailDestino   - E-mail do destinatário
 * @param {'lojas-br'|'menor-preco'} input.tipoEmail - Tipo de template
 * @returns {Promise<object>} Status de cada etapa do fluxo
 */
async function processarBuild({ orcamento, objetivo, emailDestino, tipoEmail }) {
  const statusEtapas = {
    scraping: { ok: false },
    ia: { ok: false },
    email: { ok: false },
  };

  // ── ETAPA 1: Scraping em paralelo ────────────────────────────────────────
  logger.info('Fluxo: iniciando scraping', { componentes: COMPONENTES_ALVO.length });

  let precosScraping = {};
  try {
    precosScraping = await buscarPrecosLote(COMPONENTES_ALVO);
    statusEtapas.scraping = { ok: true, componentesEncontrados: Object.keys(precosScraping).length };
  } catch (erroScraping) {
    logger.error('Fluxo: scraping falhou parcialmente', { erro: erroScraping.message });
    statusEtapas.scraping = { ok: false, erro: erroScraping.message };
    // Não aborta — a IA pode usar preços de referência do catálogo
  }

  // ── ETAPA 2: Recomendação da IA ──────────────────────────────────────────
  logger.info('Fluxo: consultando IA para recomendação de build');

  let buildRecomendada;
  try {
    buildRecomendada = await recomendarBuild({ orcamento, objetivo, precosScraping });
    statusEtapas.ia = { ok: true, totalGasto: buildRecomendada.totalGasto };
  } catch (erroIA) {
    logger.error('Fluxo: IA falhou', { erro: erroIA.message });
    statusEtapas.ia = { ok: false, erro: erroIA.message };
    return { sucesso: false, statusEtapas, erro: `Falha na IA: ${erroIA.message}` };
  }

  // ── ETAPA 3: Envio do e-mail ─────────────────────────────────────────────
  logger.info('Fluxo: enviando e-mail', { destino: emailDestino, tipo: tipoEmail });

  try {
    await enviarEmailBuild({
      emailDestino,
      objetivo,
      tipoEmail: tipoEmail || 'lojas-br',
      buildRecomendada,
      precosScraping,
    });
    statusEtapas.email = { ok: true, timestamp: new Date().toISOString() };
  } catch (erroEmail) {
    logger.error('Fluxo: envio de e-mail falhou', { erro: erroEmail.message });
    statusEtapas.email = { ok: false, erro: erroEmail.message };
  }

  // ── Resultado final ───────────────────────────────────────────────────────
  const sucesso = statusEtapas.ia.ok && statusEtapas.email.ok;

  logger.info('Fluxo: concluído', { sucesso, statusEtapas });

  return {
    sucesso,
    buildRecomendada: buildRecomendada || null,
    statusEtapas,
  };
}

module.exports = { processarBuild };
