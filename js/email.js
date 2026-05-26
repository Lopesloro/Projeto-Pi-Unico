// ============================================
// EMAIL.JS - Envio de orçamento via backend (Gmail API)
// ============================================

const EMAIL_REGEX_FRONTEND = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function enviarOrcamentoPorEmail(toEmail, orcamento, objetivo, configuracaoHTML) {
    if (!toEmail || !EMAIL_REGEX_FRONTEND.test(toEmail.trim())) {
        throw new Error('Digite um e-mail válido (ex: nome@dominio.com).');
    }

    const resp = await fetch('/api/enviar-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailDestino: toEmail, orcamento, objetivo, configuracaoHTML })
    });

    const dados = await resp.json();

    if (!resp.ok || !dados.sucesso) {
        throw new Error(dados.mensagem || 'Erro ao enviar e-mail.');
    }

    return dados;
}
