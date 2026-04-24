const puppeteer = require('puppeteer');
const config = require('../../config');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Cabeçalhos compartilhados para requisições Axios/Cheerio
const HTTP_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept-Language': 'pt-BR,pt;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

/**
 * Cria um browser Puppeteer já configurado com UA, viewport e headers BR.
 * Retorna { page, fechar } — chame fechar() no finally.
 * @param {string[]} extraArgs - Args adicionais de launch (ex: ['--lang=pt-BR'])
 */
async function criarPaginaPuppeteer(extraArgs = []) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', ...extraArgs],
  });

  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  await page.setViewport({ width: 1280, height: 800 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });

  return { page, fechar: () => browser.close() };
}

/**
 * Navega para uma URL e aguarda carregamento.
 */
async function navegarPara(page, url) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: config.scraper.timeoutMs });
}

/**
 * Cria o objeto de resultado padronizado para item disponível.
 */
function buildDisponivel(produto, preco, loja, url, componenteNome) {
  return {
    produto: produto || componenteNome,
    preco,
    loja,
    url,
    disponivel: true,
    atualizadoEm: new Date(),
  };
}

/**
 * Cria o objeto de resultado padronizado para item indisponível.
 */
function buildIndisponivel(componenteNome, loja, url) {
  return {
    produto: componenteNome,
    preco: null,
    loja,
    url,
    disponivel: false,
    atualizadoEm: new Date(),
  };
}

module.exports = { HTTP_HEADERS, criarPaginaPuppeteer, navegarPara, buildDisponivel, buildIndisponivel };
