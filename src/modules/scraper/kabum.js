<<<<<<< HEAD
const axios = require('axios');
const { withRetry } = require('../../utils/retry');
const { sanitizeSearchQuery } = require('../../utils/formatter');
const { buildDisponivel, buildIndisponivel } = require('./base');
=======
const { withRetry } = require('../../utils/retry');
const { sanitizeSearchQuery } = require('../../utils/formatter');
const { criarPaginaPuppeteer, navegarPara, buildDisponivel, buildIndisponivel } = require('./base');
>>>>>>> 618b7376aa19224b5993fd2f9b1071ebf2b98ae7
const config = require('../../config');
const logger = require('../../utils/logger');

const LOJA = 'KaBuM!';
<<<<<<< HEAD
const API_URL = 'https://servicespub.prod.api.kabum.com.br/customer/customerio/home/search/pc-gamer';

async function scrapeKabum(componenteNome) {
  const termo = sanitizeSearchQuery(componenteNome);
  const searchUrl = `https://www.kabum.com.br/busca/${encodeURIComponent(termo)}`;

  return withRetry(
    async () => {
      const { data } = await axios.get(API_URL, {
        params: { pageNumber: 0, pageSize: 1, applicationCode: 'WEB', term: termo },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'pt-BR,pt;q=0.9',
          'Origin': 'https://www.kabum.com.br',
          'Referer': 'https://www.kabum.com.br/',
        },
        timeout: config.scraper.timeoutMs,
      });

      const produtos = data?.data || data?.products || [];
      const first = Array.isArray(produtos) ? produtos[0] : null;

      if (!first) {
        logger.warn(`${LOJA}: sem resultado para "${componenteNome}"`);
        return buildIndisponivel(componenteNome, LOJA, searchUrl);
      }

      const preco = first.vlrPreco || first.preco || first.price || null;
      const nome = first.dsProduto || first.nome || first.name || componenteNome;
      const codigo = first.cdProduto || first.codigo || '';
      const url = codigo ? `https://www.kabum.com.br/produto/${codigo}` : searchUrl;

      if (!preco) {
        logger.warn(`${LOJA}: preço não encontrado para "${componenteNome}"`);
        return buildIndisponivel(componenteNome, LOJA, searchUrl);
      }

      logger.debug(`${LOJA}: "${nome}" R$${preco}`);
      return buildDisponivel(nome, parseFloat(preco), LOJA, url, componenteNome);
=======
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
>>>>>>> 618b7376aa19224b5993fd2f9b1071ebf2b98ae7
    },
    { maxRetries: config.scraper.maxRetries, label: `${LOJA} [${componenteNome}]` }
  );
}

module.exports = { scrapeKabum };
