const { withRetry } = require('../../utils/retry');
const { sanitizeSearchQuery } = require('../../utils/formatter');
const { criarPaginaPuppeteer, navegarPara, buildDisponivel, buildIndisponivel } = require('./base');
const config = require('../../config');
const logger = require('../../utils/logger');

const LOJA = 'Amazon BR';
const BASE_URL = 'https://www.amazon.com.br';

async function scrapeAmazon(componenteNome) {
<<<<<<< HEAD
  const searchUrl = `${BASE_URL}/s?k=${encodeURIComponent(sanitizeSearchQuery(componenteNome))}&i=computers`;

  return withRetry(
    async () => {
      const { page, fechar } = await criarPaginaPuppeteer([
        '--lang=pt-BR',
        '--disable-blink-features=AutomationControlled',
      ]);

      try {
        // Remove indicador de webdriver para evitar bloqueio
        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        await navegarPara(page, searchUrl);

        // Aguarda resultado ou página de CAPTCHA
        const seletor = await Promise.race([
          page.waitForSelector('[data-component-type="s-search-result"]', { timeout: 15000 }).then(() => 'result').catch(() => null),
          page.waitForSelector('form[action="/errors/validateCaptcha"]', { timeout: 15000 }).then(() => 'captcha').catch(() => null),
        ]);

        if (seletor === 'captcha' || !seletor) {
          logger.warn(`${LOJA}: bloqueado por CAPTCHA ou sem resultado para "${componenteNome}"`);
          return buildIndisponivel(componenteNome, LOJA, searchUrl);
        }

        const raw = await page.evaluate(() => {
          const cards = document.querySelectorAll('[data-component-type="s-search-result"]');
          for (const card of cards) {
            const nome = card.querySelector('h2 a span, h2 span, [class*="a-size-medium"]')?.textContent?.trim() || '';
            const precoInteiro = card.querySelector('.a-price-whole')?.textContent?.replace(/\D/g, '') || '';
            const precoFrac = card.querySelector('.a-price-fraction')?.textContent?.replace(/\D/g, '').padEnd(2, '0') || '00';
            const href = card.querySelector('h2 a[href]')?.getAttribute('href') || '';
            if (precoInteiro) {
              return { nome, preco: parseFloat(`${precoInteiro}.${precoFrac}`), href };
            }
          }
          return null;
=======
  const searchUrl = `${BASE_URL}/s?k=${encodeURIComponent(sanitizeSearchQuery(componenteNome))}`;

  return withRetry(
    async () => {
      const { page, fechar } = await criarPaginaPuppeteer();
      try {
        await navegarPara(page, searchUrl);

        await page
          .waitForSelector('[data-component-type="s-search-result"]', { timeout: 12000 })
          .catch(() => null);

        const raw = await page.evaluate(() => {
          const card = document.querySelector('[data-component-type="s-search-result"]');
          if (!card) return null;

          const nome = card.querySelector('h2 a span, h2 span')?.textContent?.trim() || '';
          const precoInteiro = card.querySelector('.a-price-whole')?.textContent?.replace(/\D/g, '') || '';
          const precoFrac = card.querySelector('.a-price-fraction')?.textContent?.replace(/\D/g, '').padEnd(2, '0') || '00';
          const href = card.querySelector('h2 a[href]')?.getAttribute('href') || '';

          return {
            nome,
            preco: precoInteiro ? parseFloat(`${precoInteiro}.${precoFrac}`) : null,
            href,
          };
>>>>>>> 618b7376aa19224b5993fd2f9b1071ebf2b98ae7
        });

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

module.exports = { scrapeAmazon };
