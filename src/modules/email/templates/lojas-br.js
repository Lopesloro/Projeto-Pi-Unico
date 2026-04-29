const { formatBRL, currentBRTimestamp } = require('../../../utils/formatter');

/**
 * Gera o HTML do template Tipo 1 — apenas lojas brasileiras confiáveis.
 */
function renderTemplateLojasBR({ objetivo, buildRecomendada }) {
  const { configuracao, totalGasto, economia, resumoGeral } = buildRecomendada;

  const lojasBR = ['KaBuM!', 'Amazon BR', 'Pichau', 'Terabyte Shop'];
  const linhasTabela = configuracao
    .map((item) => {
      const lojaValida = lojasBR.includes(item.loja);
      const precoFormatado = item.disponivel ? formatBRL(item.preco) : 'Indisponível';
      const botaoComprar = item.disponivel && item.url && lojaValida
        ? `<a href="${item.url}" target="_blank" style="
            display:inline-block;padding:8px 16px;background:#4f46e5;color:#fff;
            text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">
            Comprar agora
          </a>`
        : '<span style="color:#9ca3af;font-size:12px;">Sem link</span>';

      const alertaIndisponivel = !item.disponivel
        ? ' <span style="color:#ef4444;font-size:11px;">(preço de referência)</span>'
        : '';

      return `
        <tr style="border-bottom:1px solid #1e293b;">
          <td style="padding:12px 10px;font-weight:600;color:#94a3b8;font-size:13px;">${item.componente}</td>
          <td style="padding:12px 10px;color:#f1f5f9;font-size:13px;">${item.produto}</td>
          <td style="padding:12px 10px;color:#10b981;font-weight:700;font-size:14px;">${precoFormatado}${alertaIndisponivel}</td>
          <td style="padding:12px 10px;color:#94a3b8;font-size:12px;">${lojaValida ? item.loja : '—'}</td>
          <td style="padding:12px 10px;">${botaoComprar}</td>
        </tr>
        <tr style="background:#0f172a;">
          <td colspan="5" style="padding:4px 10px 12px 10px;color:#64748b;font-size:12px;font-style:italic;">
            ${item.justificativa || ''}
          </td>
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sua Build Personalizada</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:720px;margin:0 auto;padding:24px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#4f46e5,#9333ea);border-radius:12px;padding:28px 32px;margin-bottom:24px;text-align:center;">
      <h1 style="color:#fff;margin:0 0 8px;font-size:22px;">🖥️ PC Builder AI</h1>
      <p style="color:#c4b5fd;margin:0;font-size:15px;">Sua build personalizada está pronta!</p>
    </div>

    <!-- Objetivo -->
    <div style="background:#1e293b;border-radius:10px;padding:18px 22px;margin-bottom:20px;">
      <p style="color:#94a3b8;font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:1px;">Objetivo</p>
      <p style="color:#f1f5f9;font-size:16px;font-weight:600;margin:0;">${objetivo}</p>
    </div>

    <!-- Resumo da IA -->
    <div style="background:#1e293b;border-left:4px solid #4f46e5;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <p style="color:#a5b4fc;font-size:12px;margin:0 0 6px;font-weight:600;text-transform:uppercase;">Análise do Especialista</p>
      <p style="color:#e2e8f0;font-size:14px;line-height:1.6;margin:0;">${resumoGeral}</p>
    </div>

    <!-- Tabela de Componentes -->
    <div style="background:#1e293b;border-radius:10px;overflow:hidden;margin-bottom:24px;">
      <div style="padding:16px 20px;border-bottom:1px solid #334155;">
        <h2 style="color:#f1f5f9;margin:0;font-size:16px;">📋 Componentes Selecionados</h2>
        <p style="color:#64748b;font-size:12px;margin:4px 0 0;">Apenas lojas brasileiras confiáveis</p>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#0f172a;">
              <th style="padding:10px;text-align:left;color:#64748b;font-size:12px;font-weight:600;">TIPO</th>
              <th style="padding:10px;text-align:left;color:#64748b;font-size:12px;font-weight:600;">PRODUTO</th>
              <th style="padding:10px;text-align:left;color:#64748b;font-size:12px;font-weight:600;">PREÇO</th>
              <th style="padding:10px;text-align:left;color:#64748b;font-size:12px;font-weight:600;">LOJA</th>
              <th style="padding:10px;text-align:left;color:#64748b;font-size:12px;font-weight:600;">AÇÃO</th>
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
        <p style="color:#94a3b8;font-size:12px;margin:0 0 4px;">Total da Build</p>
        <p style="color:#10b981;font-size:22px;font-weight:700;margin:0;">${formatBRL(totalGasto)}</p>
      </div>
      <div style="flex:1;background:#1e293b;border-radius:10px;padding:16px;text-align:center;">
        <p style="color:#94a3b8;font-size:12px;margin:0 0 4px;">Economia do Orçamento</p>
        <p style="color:#f59e0b;font-size:22px;font-weight:700;margin:0;">${formatBRL(economia)}</p>
      </div>
    </div>

    <!-- Rodapé -->
    <div style="text-align:center;padding:16px 0;border-top:1px solid #1e293b;">
      <p style="color:#475569;font-size:11px;margin:0;">
        ⚠️ Preços sujeitos a alteração sem aviso prévio. Consultado em: ${currentBRTimestamp()}
      </p>
      <p style="color:#334155;font-size:11px;margin:6px 0 0;">
        PC Builder AI — PUC Campinas · Engenharia de Software
      </p>
    </div>

  </div>
</body>
</html>`;
}

module.exports = { renderTemplateLojasBR };
