const { buscarPrecosLote } = require('./modules/scraper');
const { recomendarBuild } = require('./modules/ai');
const { enviarEmailBuild } = require('./modules/email');
const logger = require('./utils/logger');

// Componentes-alvo que o scraper deve buscar em todas as lojas.
// Termos específicos aumentam a chance de match correto com o catálogo.
const COMPONENTES_ALVO = [
  // Processadores Intel
  'Intel Core i5-12400F',
  'Intel Core i5-13400F',
  'Intel Core i7-12700K',
  // Processadores AMD
  'AMD Ryzen 5 5600',
  'AMD Ryzen 5 5600G',
  'AMD Ryzen 7 5700X',
  // GPUs NVIDIA
  'NVIDIA GeForce RTX 4060',
  'NVIDIA GeForce RTX 3060',
  'NVIDIA GeForce RTX 3070',
  // GPUs AMD
  'AMD Radeon RX 7600',
  'AMD Radeon RX 6600 XT',
  // Memórias
  'Memoria Kingston Fury 16GB DDR4 3200MHz',
  'Memoria Corsair Vengeance 32GB DDR4',
  // Armazenamento
  'SSD Kingston NV2 1TB NVMe',
  'SSD Crucial P3 500GB NVMe',
  // Placas-mãe
  'Placa Mae ASUS Prime B660M LGA1700 DDR4',
  'Placa Mae Gigabyte B550M AM4 DDR4',
  // Fontes
  'Fonte Corsair CV650 650W Bronze',
  'Fonte Corsair CX750 750W Bronze',
  // Gabinete e Cooler
  'Gabinete Gamer ATX Mid Tower',
  'Cooler CPU 120mm AMD Intel',
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
