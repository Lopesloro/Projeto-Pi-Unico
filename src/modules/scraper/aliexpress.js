const { withRetry } = require('../../utils/retry');
const { sanitizeSearchQuery } = require('../../utils/formatter');
const { criarPaginaPuppeteer, navegarPara, buildDisponivel, buildIndisponivel } = require('./base');
const config = require('../../config');
const logger = require('../../utils/logger');

const LOJA = 'AliExpress';
const BASE_URL = 'https://www.aliexpress.com';

async function scrapeAliexpress(componenteNome) {
  const searchUrl = `${BASE_URL}/wholesale?SearchText=${encodeURIComponent(sanitizeSearchQuery(componenteNome))}&SortType=default`;

  return withRetry(
    async () => {
      // '--lang=pt-BR' adicional para localização correta de preços
      const { page, fechar } = await criarPaginaPuppeteer(['--lang=pt-BR']);
      try {
        await navegarPara(page, searchUrl);

        await page
          .waitForSelector('[class*="manhattan--container"], .list-item', { timeout: 12000 })
          .catch(() => null);

        const raw = await page.evaluate(() => {
          const seletoresCard = [
            '[class*="manhattan--container"]', '.list-item',
            '[class*="product-card"]', 'a[href*="/item/"]',
          ];
          const card = seletoresCard.reduce((found, sel) => found || document.querySelector(sel), null);
          if (!card) return null;

          const nome = card.querySelector('[class*="manhattan--titleText"], [class*="title"], h3')
            ?.textContent?.trim() || '';
          const precoTexto = card.querySelector(
            '[class*="manhattan--price-sale"], [class*="price--sale"], [class*="notranslate"]'
          )?.textContent?.trim() || '';
          const linkEl = card.tagName === 'A' ? card : card.querySelector('a[href*="/item/"]') || card.closest('a');
          const href = linkEl?.getAttribute('href') || '';

          const preco = parseFloat(precoTexto.replace(/[^\d,]/g, '').replace(',', '.'));
          return { nome, preco: isNaN(preco) ? null : preco, href };
        });

        if (!raw?.preco) {
          logger.warn(`${LOJA}: sem resultado para "${componenteNome}"`);
          return buildIndisponivel(componenteNome, LOJA, searchUrl);
        }

        const url = raw.href.startsWith('//') ? `https:${raw.href}` : (raw.href || searchUrl);
        logger.debug(`${LOJA}: "${raw.nome}" $${raw.preco}`);
        return buildDisponivel(raw.nome, raw.preco, LOJA, url, componenteNome);
      } finally {
        await fechar();
      }
    },
    { maxRetries: config.scraper.maxRetries, label: `${LOJA} [${componenteNome}]` }
  );
}

module.exports = { scrapeAliexpress };
