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

if (config.server.nodeEnv === 'production') {
  const missing = [];
  if (!process.env.MISTRAL_API_KEY) missing.push('MISTRAL_API_KEY');
  if (!config.gmail.clientId) missing.push('GMAIL_CLIENT_ID');
  if (!config.gmail.refreshToken) missing.push('GMAIL_REFRESH_TOKEN');
  if (missing.length > 0) {
    console.warn(`⚠️  Variáveis de ambiente ausentes: ${missing.join(', ')}`);
  }
}

module.exports = config;
