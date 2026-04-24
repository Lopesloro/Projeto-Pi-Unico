function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function sanitizeSearchQuery(query) {
  return query
    .trim()
    .replace(/[^\w\s\-+]/g, '')
    .substring(0, 100);
}

function extractPriceFromText(text) {
  if (!text) return null;
  const normalized = text.replace(/\./g, '').replace(',', '.');
  const match = normalized.match(/\d+(?:\.\d{1,2})?/);
  return match ? parseFloat(match[0]) : null;
}

function deduplicateByLowestPrice(resultados) {
  const byLoja = new Map();

  for (const item of resultados) {
    if (!item.disponivel || item.preco == null) continue;
    const existing = byLoja.get(item.loja);
    if (!existing || item.preco < existing.preco) {
      byLoja.set(item.loja, item);
    }
  }

  return Array.from(byLoja.values());
}

function currentBRTimestamp() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

module.exports = { formatBRL, sanitizeSearchQuery, extractPriceFromText, deduplicateByLowestPrice, currentBRTimestamp };
