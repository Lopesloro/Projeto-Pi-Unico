const { formatBRL, currentBRTimestamp } = require('../../../utils/formatter');

/**
 * Gera o HTML do template Tipo 2 — menor preço incluindo AliExpress.
 */
function renderTemplateMenorPreco({ objetivo, buildRecomendada, precosScraping }) {
  const { configuracao, totalGasto, economia, resumoGeral } = buildRecomendada;

  // Identifica a maior economia vs AliExpress para destaque visual
  let maiorEconomiaItem = null;
  let maiorEconomiaValor = 0;

  const linhasTabela = configuracao
    .map((item) => {
      const resultadosLoja = precosScraping?.[item.produto] || [];
      const dadoAliexpress = resultadosLoja.find((r) => r.loja === 'AliExpress' && r.disponivel);

      const economiaAli =
        item.disponivel && dadoAliexpress
          ? Math.max(0, item.preco - dadoAliexpress.preco)
          : 0;

      if (economiaAli > maiorEconomiaValor) {
        maiorEconomiaValor = economiaAli;
        maiorEconomiaItem = item.componente;
      }

      const precoFormatado = item.disponivel ? formatBRL(item.preco) : 'Indisponível';
      const precoAliFormatado = dadoAliexpress ? formatBRL(dadoAliexpress.preco) : '—';

      const badgeEconomia =
        economiaAli > 0
          ? `<span style="color:#10b981;font-size:11px;font-weight:600;">
               ↓ ${formatBRL(economiaAli)}
             </span>`
          : '';

      const botaoComprarBR =
        item.disponivel && item.url
          ? `<a href="${item.url}" target="_blank" style="
              display:inline-block;padding:6px 12px;background:#4f46e5;color:#fff;
              text-decoration:none;border-radius:5px;font-size:12px;font-weight:600;">BR</a>`
          : '—';

      const botaoComprarAli =
        dadoAliexpress
          ? `<a href="${dadoAliexpress.url}" target="_blank" style="
              display:inline-block;padding:6px 12px;background:#e8680a;color:#fff;
              text-decoration:none;border-radius:5px;font-size:12px;font-weight:600;">Ali</a>`
          : '—';

      const destacado = item.componente === maiorEconomiaItem;
      const rowBg = destacado ? '#1a2744' : 'transparent';

      return `
        <tr style="border-bottom:1px solid #1e293b;background:${rowBg};">
          <td style="padding:11px 10px;font-weight:600;color:#94a3b8;font-size:12px;">${item.componente}</td>
          <td style="padding:11px 10px;color:#f1f5f9;font-size:12px;">${item.produto}</td>
          <td style="padding:11px 10px;color:#10b981;font-weight:700;font-size:13px;">${precoFormatado}</td>
          <td style="padding:11px 10px;color:#f59e0b;font-size:13px;">${precoAliFormatado} ${badgeEconomia}</td>
          <td style="padding:11px 10px;">${item.loja || '—'}</td>
          <td style="padding:11px 10px;display:flex;gap:6px;">${botaoComprarBR} ${botaoComprarAli}</td>
        </tr>
      `;
    })
    .join('');

  const secaoMaiorEconomia =
    maiorEconomiaValor > 0
      ? `
      <div style="background:#0d2118;border:1px solid #10b981;border-radius:10px;padding:14px 18px;margin-bottom:20px;">
        <p style="color:#10b981;font-size:13px;font-weight:700;margin:0 0 4px;">🏆 Maior economia encontrada</p>
        <p style="color:#e2e8f0;font-size:13px;margin:0;">
          <strong>${maiorEconomiaItem}</strong> — você economiza
          <strong style="color:#10b981;">${formatBRL(maiorEconomiaValor)}</strong>
          comprando no AliExpress.
        </p>
      </div>`
      : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sua Build — Menor Preço</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:780px;margin:0 auto;padding:24px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#4f46e5,#9333ea);border-radius:12px;padding:28px 32px;margin-bottom:24px;text-align:center;">
      <h1 style="color:#fff;margin:0 0 8px;font-size:22px;">🖥️ PC Builder AI — Menor Preço</h1>
      <p style="color:#c4b5fd;margin:0;font-size:14px;">Comparativo com AliExpress incluído</p>
    </div>

    <!-- Objetivo -->
    <div style="background:#1e293b;border-radius:10px;padding:16px 20px;margin-bottom:16px;">
      <p style="color:#94a3b8;font-size:12px;margin:0 0 4px;text-transform:uppercase;">Objetivo</p>
      <p style="color:#f1f5f9;font-size:16px;font-weight:600;margin:0;">${objetivo}</p>
    </div>

    <!-- Resumo -->
    <div style="background:#1e293b;border-left:4px solid #4f46e5;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <p style="color:#e2e8f0;font-size:14px;line-height:1.6;margin:0;">${resumoGeral}</p>
    </div>

    ${secaoMaiorEconomia}

    <!-- Aviso AliExpress -->
    <div style="background:#1c1408;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <p style="color:#f59e0b;font-size:12px;font-weight:600;margin:0 0 4px;">⚠️ Atenção — Compras no AliExpress</p>
      <p style="color:#d1d5db;font-size:12px;margin:0;line-height:1.5;">
        Prazos de entrega: 15–40 dias úteis. Sujeito a imposto de importação (60% sobre valor + frete).
        Verifique a procedência do vendedor. Não há garantia de assistência técnica no Brasil.
      </p>
    </div>

    <!-- Tabela Comparativa -->
    <div style="background:#1e293b;border-radius:10px;overflow:hidden;margin-bottom:24px;">
      <div style="padding:14px 20px;border-bottom:1px solid #334155;">
        <h2 style="color:#f1f5f9;margin:0;font-size:15px;">📊 Comparativo de Preços</h2>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#0f172a;">
              <th style="padding:10px;text-align:left;color:#64748b;font-size:11px;">TIPO</th>
              <th style="padding:10px;text-align:left;color:#64748b;font-size:11px;">PRODUTO</th>
              <th style="padding:10px;text-align:left;color:#10b981;font-size:11px;">LOJAS BR</th>
              <th style="padding:10px;text-align:left;color:#f59e0b;font-size:11px;">ALIEXPRESS</th>
              <th style="padding:10px;text-align:left;color:#64748b;font-size:11px;">LOJA BR</th>
              <th style="padding:10px;text-align:left;color:#64748b;font-size:11px;">LINKS</th>
            </tr>
          </thead>
          <tbody>
            ${linhasTabela}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Totais -->
    <div style="display:flex;gap:12px;margin-bottom:24px;">
      <div style="flex:1;background:#1e293b;border-radius:10px;padding:16px;text-align:center;">
        <p style="color:#94a3b8;font-size:12px;margin:0 0 4px;">Total (Lojas BR)</p>
        <p style="color:#10b981;font-size:20px;font-weight:700;margin:0;">${formatBRL(totalGasto)}</p>
      </div>
      <div style="flex:1;background:#1e293b;border-radius:10px;padding:16px;text-align:center;">
        <p style="color:#94a3b8;font-size:12px;margin:0 0 4px;">Sobra do Orçamento</p>
        <p style="color:#f59e0b;font-size:20px;font-weight:700;margin:0;">${formatBRL(economia)}</p>
      </div>
    </div>

    <!-- Rodapé -->
    <div style="text-align:center;padding:16px 0;border-top:1px solid #1e293b;">
      <p style="color:#475569;font-size:11px;margin:0;">
        ⚠️ Preços sujeitos a alteração. Consultado em: ${currentBRTimestamp()}
      </p>
      <p style="color:#334155;font-size:11px;margin:6px 0 0;">
        PC Builder AI — PUC Campinas · Engenharia de Software
      </p>
    </div>

  </div>
</body>
</html>`;
}

module.exports = { renderTemplateMenorPreco };
