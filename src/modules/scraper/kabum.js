const { withRetry } = require('../../utils/retry');
const { sanitizeSearchQuery } = require('../../utils/formatter');
const { criarPaginaPuppeteer, navegarPara, buildDisponivel, buildIndisponivel } = require('./base');
const config = require('../../config');
const logger = require('../../utils/logger');

const LOJA = 'KaBuM!';
const BASE_URL = 'https://www.kabum.com.br';

async function scrapeKabum(componenteNome) {
  const searchUrl = `${BASE_URL}/busca/${encodeURIComponent(sanitizeSearchQuery(componenteNome))}`;

  return withRetry(
    async () => {
      const { page, fechar } = await criarPaginaPuppeteer();
      try {
        await navegarPara(page, searchUrl);

        await page
          .waitForSelector('[data-testid="productCard"], .productCard, article[class*="sc-"]', {
            timeout: 12000,
          })
          .catch(() => null);

        const raw = await page.evaluate((base) => {
          const seletoresCard = [
            '[data-testid="productCard"]',
            '.productCard',
            'article[class*="sc-"]',
          ];
          const card = seletoresCard.reduce((found, sel) => found || document.querySelector(sel), null);
          if (!card) return null;

          const getText = (sels) =>
            sels.reduce((found, s) => {
              if (found) return found;
              const el = card.querySelector(s);
              return el?.textContent?.trim() || null;
            }, null) || '';

          const nome = getText([
            'span[class*="nameCard"]', 'h2[class*="name"]',
            '[class*="productName"]', 'span[class*="sc-d79c9f52"]',
          ]);
          const precoTexto = getText([
            'span[class*="priceCard"]', '[class*="price"] > span',
            '[class*="sc-613b4e00"]', 'h4[class*="price"]',
          ]);
          const href =
            ['a[href*="/produto"]', 'a'].reduce((found, s) => {
              return found || card.querySelector(s)?.getAttribute('href') || null;
            }, null) || '';

          const preco = parseFloat(precoTexto.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.'));
          return { nome, preco: isNaN(preco) ? null : preco, href };
        }, BASE_URL);

        if (!raw?.preco) {
          logger.warn(`${LOJA}: sem resultado para "${componenteNome}"`);
          return buildIndisponivel(componenteNome, LOJA, searchUrl);
        }

        const url = raw.href.startsWith('http') ? raw.href : `${BASE_URL}${raw.href}`;
        logger.debug(`${LOJA}: "${raw.nome}" R$${raw.preco}`);
        return buildDisponivel(raw.nome, raw.preco, LOJA, url, componenteNome);
      } finally {
        await fechar();
      }
    },
    { maxRetries: config.scraper.maxRetries, label: `${LOJA} [${componenteNome}]` }
  );
}

module.exports = { scrapeKabum };
