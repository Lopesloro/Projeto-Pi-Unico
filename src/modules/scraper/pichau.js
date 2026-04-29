const axios = require('axios');
const cheerio = require('cheerio');
const { withRetry } = require('../../utils/retry');
const { sanitizeSearchQuery, extractPriceFromText } = require('../../utils/formatter');
const { HTTP_HEADERS, buildDisponivel, buildIndisponivel } = require('./base');
const config = require('../../config');
const logger = require('../../utils/logger');

const LOJA = 'Pichau';
const BASE_URL = 'https://www.pichau.com.br';

<<<<<<< HEAD
// API GraphQL da Pichau (mais confiável que scraping HTML)
const GRAPHQL_URL = 'https://www.pichau.com.br/api/pichau';
const GRAPHQL_QUERY = `
  query SearchProducts($search: String!, $pageSize: Int!) {
    products(search: $search, pageSize: $pageSize, currentPage: 1) {
      items {
        name
        url_key
        price_range {
          minimum_price {
            final_price { value }
          }
        }
      }
    }
  }
`;

async function scrapePichau(componenteNome) {
  const termo = sanitizeSearchQuery(componenteNome);
  const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(termo)}`;

  return withRetry(
    async () => {
      // Tenta via GraphQL primeiro
      try {
        const { data: gqlData } = await axios.post(
          GRAPHQL_URL,
          { query: GRAPHQL_QUERY, variables: { search: termo, pageSize: 1 } },
          {
            headers: { ...HTTP_HEADERS, 'Content-Type': 'application/json' },
            timeout: config.scraper.timeoutMs,
          }
        );

        const items = gqlData?.data?.products?.items || [];
        if (items.length > 0) {
          const first = items[0];
          const preco = first.price_range?.minimum_price?.final_price?.value;
          if (preco) {
            const url = `${BASE_URL}/${first.url_key}`;
            logger.debug(`${LOJA} (GraphQL): "${first.name}" R$${preco}`);
            return buildDisponivel(first.name, preco, LOJA, url, componenteNome);
          }
        }
      } catch (gqlErr) {
        logger.warn(`${LOJA}: GraphQL falhou, tentando HTML`, { motivo: gqlErr.message });
      }

      // Fallback: HTML via __NEXT_DATA__
=======
async function scrapePichau(componenteNome) {
  const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(sanitizeSearchQuery(componenteNome))}`;

  return withRetry(
    async () => {
>>>>>>> 618b7376aa19224b5993fd2f9b1071ebf2b98ae7
      const { data: html } = await axios.get(searchUrl, {
        headers: HTTP_HEADERS,
        timeout: config.scraper.timeoutMs,
      });

      const $ = cheerio.load(html);

<<<<<<< HEAD
      const nextDataRaw = $('script#__NEXT_DATA__').html();
      if (nextDataRaw) {
        try {
          const nextData = JSON.parse(nextDataRaw);
          const products =
            nextData?.props?.pageProps?.searchResult?.products?.items ||
            nextData?.props?.pageProps?.products?.items ||
            nextData?.props?.pageProps?.searchResult?.products ||
            nextData?.props?.pageProps?.products ||
            [];

          if (products.length > 0) {
            const first = products[0];
            const precoRaw =
              first.price_range?.minimum_price?.final_price?.value ||
              first.price?.final_price ||
              first.price?.special_price ||
              first.price?.regular_price;

            if (precoRaw) {
              const preco = typeof precoRaw === 'string' ? extractPriceFromText(precoRaw) : precoRaw;
              const slug = first.url_key || first.sku || '';
              const url = slug ? `${BASE_URL}/${slug}` : searchUrl;
              logger.debug(`${LOJA} (Next.js): "${first.name}" R$${preco}`);
              return buildDisponivel(first.name, preco, LOJA, url, componenteNome);
            }
          }
        } catch (_) { /* continua para fallback HTML */ }
      }

      // Fallback: seletores HTML direto
      const cardSeletores = [
        '[class*="ProductCard"]', '.MuiCard-root', '.product-card',
        '[class*="product-item"]', '[data-testid="product-card"]',
      ];
      const card = cardSeletores.reduce(
        (found, sel) => found || ($(sel).first().length ? $(sel).first() : null),
        null
      );
=======
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
>>>>>>> 618b7376aa19224b5993fd2f9b1071ebf2b98ae7

      if (!card) {
        logger.warn(`${LOJA}: sem resultado para "${componenteNome}"`);
        return buildIndisponivel(componenteNome, LOJA, searchUrl);
      }

<<<<<<< HEAD
      const nome = card.find('h2, h3, [class*="name"], [class*="title"]').first().text().trim();
=======
      const nome = card.find('h2, h3, [class*="name"]').first().text().trim();
>>>>>>> 618b7376aa19224b5993fd2f9b1071ebf2b98ae7
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
