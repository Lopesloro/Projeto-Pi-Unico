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
  const termo = sanitizeSearchQuery(componenteNome);
  const searchUrl = `${BASE_URL}/busca?str=${encodeURIComponent(termo)}`;

  return withRetry(
    async () => {
      const { data: html } = await axios.get(searchUrl, {
        headers: {
          ...HTTP_HEADERS,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
        },
        timeout: config.scraper.timeoutMs,
      });

      const $ = cheerio.load(html);

      // Tenta múltiplos seletores de card de produto
      const cardSeletores = [
        '.pbox',
        '.product-item',
        '.product_item',
        'article.product',
        '.item-produto',
        '[class*="product-card"]',
        '.list-product li',
      ];

      let card = null;
      for (const sel of cardSeletores) {
        const found = $(sel).first();
        if (found.length) { card = found; break; }
      }

      if (!card) {
        // Tenta extrair do JSON-LD
        const jsonLdScripts = $('script[type="application/ld+json"]').toArray();
        for (const script of jsonLdScripts) {
          try {
            const jsonData = JSON.parse($(script).html() || '{}');
            const items = jsonData['@type'] === 'ItemList' ? jsonData.itemListElement : [];
            const first = items[0]?.item;
            if (first?.offers?.price) {
              const preco = parseFloat(first.offers.price);
              const nome = first.name || componenteNome;
              const url = first.url || searchUrl;
              logger.debug(`${LOJA} (JSON-LD): "${nome}" R$${preco}`);
              return buildDisponivel(nome, preco, LOJA, url, componenteNome);
            }
          } catch (_) { /* continua */ }
        }

        logger.warn(`${LOJA}: sem resultado para "${componenteNome}"`);
        return buildIndisponivel(componenteNome, LOJA, searchUrl);
      }

      const nomeSeletores = ['.prod-name', 'h2.prod-name', '.product-name', 'a[title]', 'h2', 'h3'];
      const precoSeletores = ['.prod-new-price', '.preco-atual', '[class*="new-price"]', '.price', '[class*="price"]'];
      const linkSeletores = ['a.prod-name', 'a[href*="/produto"]', 'a[href*="terabyte"]', 'a'];

      const nome = nomeSeletores.reduce((found, sel) => {
        if (found) return found;
        const text = card.find(sel).first().text().trim() || card.find(sel).first().attr('title') || '';
        return text || null;
      }, null) || componenteNome;

      const preco = precoSeletores.reduce((found, sel) => {
        if (found) return found;
        const text = card.find(sel).first().text();
        return extractPriceFromText(text) || null;
      }, null);

      const href = linkSeletores.reduce((found, sel) => {
        if (found) return found;
        return card.find(sel).first().attr('href') || null;
      }, null) || '';

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
