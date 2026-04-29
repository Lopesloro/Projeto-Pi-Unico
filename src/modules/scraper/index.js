const { scrapeKabum } = require('./kabum');
const { scrapeAmazon } = require('./amazon');
const { scrapePichau } = require('./pichau');
const { scrapeTerabyte } = require('./terabyte');
const { scrapeAliexpress } = require('./aliexpress');
const { deduplicateByLowestPrice } = require('../../utils/formatter');
const config = require('../../config');
const logger = require('../../utils/logger');

/**
 * Aguarda um delay para respeitar o rate limit entre requisições.
 */
const rateLimit = () =>
  new Promise((resolve) => setTimeout(resolve, config.scraper.rateLimitMs));

/**
 * Busca preços de um único componente em todas as lojas em paralelo.
 * @param {string} componenteNome - Nome do componente a buscar
 * @returns {Promise<Array>} Lista de resultados padronizados por loja
 */
async function buscarPrecosComponente(componenteNome) {
  logger.info(`Scraping: iniciando busca para "${componenteNome}"`);

  const [kabum, amazon, pichau, terabyte, aliexpress] = await Promise.allSettled([
    scrapeKabum(componenteNome),
    scrapeAmazon(componenteNome),
    scrapePichau(componenteNome),
    scrapeTerabyte(componenteNome),
    scrapeAliexpress(componenteNome),
  ]);

  const resultados = [kabum, amazon, pichau, terabyte, aliexpress].map((settled) => {
    if (settled.status === 'fulfilled') return settled.value;

    logger.warn(`Scraper retornou erro`, { motivo: settled.reason?.message });
    return null;
  }).filter(Boolean);

  const deduplicados = deduplicateByLowestPrice(resultados);
  logger.info(`Scraping: ${deduplicados.length} lojas com preço para "${componenteNome}"`);

  return deduplicados;
}

/**
 * Busca preços de múltiplos componentes com rate limiting entre cada um.
 * @param {string[]} componentesNomes - Lista de nomes de componentes
 * @returns {Promise<Object>} Mapa { nomeComponente: [resultadosPorLoja] }
 */
async function buscarPrecosLote(componentesNomes) {
  const mapaPrecos = {};

  for (const nome of componentesNomes) {
    mapaPrecos[nome] = await buscarPrecosComponente(nome);
    await rateLimit();
  }

  return mapaPrecos;
}

module.exports = { buscarPrecosComponente, buscarPrecosLote };
