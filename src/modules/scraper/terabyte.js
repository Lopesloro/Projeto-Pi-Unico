const axios = require('axios');
const cheerio = require('cheerio');
const { withRetry } = require('../../utils/retry');
const { sanitizeSearchQuery, extractPriceFromText } = require('../../utils/formatter');
const { HTTP_HEADERS, buildDisponivel, buildIndisponivel } = require('./base');
const config = require('../../config');
const logger = require('../../utils/logger');

const LOJA = 'Terabyte Shop';
const BASE_URL = 'https://www.terabyteshop.com.br';

async function scrapeTerabyte(componenteNome) {
  const searchUrl = `${BASE_URL}/busca?str=${encodeURIComponent(sanitizeSearchQuery(componenteNome))}`;

  return withRetry(
    async () => {
      const { data: html } = await axios.get(searchUrl, {
        headers: HTTP_HEADERS,
        timeout: config.scraper.timeoutMs,
      });

      const $ = cheerio.load(html);
      const card = $('.pbox').first();

      if (!card.length) {
        logger.warn(`${LOJA}: sem resultado para "${componenteNome}"`);
        return buildIndisponivel(componenteNome, LOJA, searchUrl);
      }

      const nome = card.find('.prod-name, h2.prod-name, .product-name').first().text().trim();
      const preco = extractPriceFromText(
        card.find('.prod-new-price, .preco-atual, [class*="new-price"]').first().text()
      );
      const href = card.find('a.prod-name, a[href*="/produto"]').first().attr('href') || '';

      if (!preco) {
        logger.warn(`${LOJA}: preço não encontrado para "${componenteNome}"`);
        return buildIndisponivel(componenteNome, LOJA, searchUrl);
      }

      const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      logger.debug(`${LOJA}: "${nome}" R$${preco}`);
      return buildDisponivel(nome, preco, LOJA, url, componenteNome);
    },
    { maxRetries: config.scraper.maxRetries, label: `${LOJA} [${componenteNome}]` }
  );
}

module.exports = { scrapeTerabyte };
