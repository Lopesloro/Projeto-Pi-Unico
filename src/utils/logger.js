const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const activeLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

function buildMessage(level, message, meta) {
  const ts = new Date().toISOString();
  const metaPart = meta && Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
  return `[${ts}] [${level.toUpperCase().padEnd(5)}] ${message}${metaPart}`;
}

const logger = {
  error: (msg, meta) => {
    if (LEVELS[activeLevel] >= LEVELS.error) console.error(buildMessage('error', msg, meta));
  },
  warn: (msg, meta) => {
    if (LEVELS[activeLevel] >= LEVELS.warn) console.warn(buildMessage('warn', msg, meta));
  },
  info: (msg, meta) => {
    if (LEVELS[activeLevel] >= LEVELS.info) console.info(buildMessage('info', msg, meta));
  },
  debug: (msg, meta) => {
    if (LEVELS[activeLevel] >= LEVELS.debug) console.debug(buildMessage('debug', msg, meta));
  },
};

module.exports = logger;
