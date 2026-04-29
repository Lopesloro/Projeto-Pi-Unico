const logger = require('./logger');

/**
 * Executa uma função assíncrona com retry e backoff exponencial.
 * @param {Function} fn - Função a executar (deve retornar Promise)
 * @param {object} options
 * @param {number} options.maxRetries - Máximo de tentativas (padrão: 3)
 * @param {number} options.initialDelayMs - Delay inicial em ms (padrão: 1000)
 * @param {number} options.multiplier - Multiplicador do backoff (padrão: 2)
 * @param {string} options.label - Rótulo para logs
 */
async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    multiplier = 2,
    label = 'operação',
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) break;

      const delayMs = initialDelayMs * Math.pow(multiplier, attempt - 1);
      logger.warn(`${label}: tentativa ${attempt}/${maxRetries} falhou. Retry em ${delayMs}ms`, {
        erro: error.message,
      });

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  logger.error(`${label}: todas as ${maxRetries} tentativas falharam`, { erro: lastError?.message });
  throw lastError;
}

module.exports = { withRetry };
