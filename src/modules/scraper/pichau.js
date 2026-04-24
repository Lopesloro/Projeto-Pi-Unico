const axios = require('axios');
const cheerio = require('cheerio');
const { withRetry } = require('../../utils/retry');
const { sanitizeSearchQuery, extractPriceFromText } = require('../../utils/formatter');
const { HTTP_HEADERS, buildDisponivel, buildIndisponivel } = require('./base');
const config = require('../../config');
const logger = require('../../utils/logger');

const LOJA = 'Pichau';
const BASE_URL = 'https://www.pichau.com.br';

async function scrapePichau(componenteNome) {
  const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(sanitizeSearchQuery(componenteNome))}`;

  return withRetry(
    async () => {
      const { data: html } = await axios.get(searchUrl, {
        headers: HTTP_HEADERS,
        timeout: config.scraper.timeoutMs,
      });

      const $ = cheerio.load(html);

      // Pichau usa Next.js — extrai dados do __NEXT_DATA__ (mais confiável que HTML)
      const nextDataRaw = $('script#__NEXT_DATA__').html();
      if (nextDataRaw) {
        const nextData = JSON.parse(nextDataRaw);
        const products =
          nextData?.props?.pageProps?.searchResult?.products ||
          nextData?.props?.pageProps?.products ||
          [];

        if (products.length > 0) {
          const first = products[0];
          const precoRaw = first.price?.final_price || first.price?.special_price || first.price?.regular_price;

          if (precoRaw) {
            const preco = typeof precoRaw === 'string' ? extractPriceFromText(precoRaw) : precoRaw;
            const slug = first.url_key || first.sku || '';
            const url = slug ? `${BASE_URL}/${slug}` : searchUrl;

            logger.debug(`${LOJA}: "${first.name}" R$${preco}`);
            return buildDisponivel(first.name, preco, LOJA, url, componenteNome);
          }
        }
      }

      // Fallback: parse HTML direto
      const cardSeletores = ['.MuiCard-root', '.product-card', '[class*="ProductCard"]'];
      const card = cardSeletores.reduce((found, sel) => found || ($(sel).first().length ? $(sel).first() : null), null);

      if (!card) {
        logger.warn(`${LOJA}: sem resultado para "${componenteNome}"`);
        return buildIndisponivel(componenteNome, LOJA, searchUrl);
      }

      const nome = card.find('h2, h3, [class*="name"]').first().text().trim();
      const preco = extractPriceFromText(card.find('[class*="price"], [class*="Price"]').first().text());
      const href = card.find('a').first().attr('href') || '';

      if (!preco) {
        logger.warn(`${LOJA}: preço não encontrado para "${componenteNome}"`);
        return buildIndisponivel(componenteNome, LOJA, searchUrl);
      }

      const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      return buildDisponivel(nome, preco, LOJA, url, componenteNome);
    },
    { maxRetries: config.scraper.maxRetries, label: `${LOJA} [${componenteNome}]` }
  );
}

module.exports = { scrapePichau };
