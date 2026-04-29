const axios = require('axios');
const { withRetry } = require('../../utils/retry');
const { sanitizeSearchQuery } = require('../../utils/formatter');
const { buildDisponivel, buildIndisponivel } = require('./base');
const config = require('../../config');
const logger = require('../../utils/logger');

const LOJA = 'KaBuM!';
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
    },
    { maxRetries: config.scraper.maxRetries, label: `${LOJA} [${componenteNome}]` }
  );
}

module.exports = { scrapeKabum };
