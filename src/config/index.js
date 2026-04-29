require('dotenv').config();

const config = {
  server: {
    port: parseInt(process.env.PORT, 10) || 3001,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
  },
  gmail: {
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN,
    user: process.env.GMAIL_USER,
  },
  scraper: {
    rateLimitMs: 1500,
    maxRetries: 3,
    timeoutMs: 30000,
    headless: true,
  },
};

const missingInProduction = [];
if (config.server.nodeEnv === 'production') {
  if (!config.openai.apiKey) missingInProduction.push('OPENAI_API_KEY');
  if (!config.gmail.clientId) missingInProduction.push('GMAIL_CLIENT_ID');
  if (!config.gmail.refreshToken) missingInProduction.push('GMAIL_REFRESH_TOKEN');

  if (missingInProduction.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes em produção: ${missingInProduction.join(', ')}`);
  }
}

module.exports = config;
