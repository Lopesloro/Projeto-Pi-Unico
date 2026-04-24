const axios = require('axios');
const config = require('../../config');
const logger = require('../../utils/logger');

/**
 * Gera um link de pagamento via InfinitePay para o valor total da build.
 * Documentação: https://docs.infinitepay.io/payment-links
 *
 * @param {object} params
 * @param {number} params.valorTotal - Valor em BRL
 * @param {string} params.descricao - Descrição do item (ex: "Build Gamer R$3.000")
 * @param {string} params.emailComprador - E-mail do comprador
 * @returns {Promise<string>} URL do link de pagamento
 */
async function gerarLinkPagamento({ valorTotal, descricao, emailComprador }) {
  if (!config.infinitepay.apiKey || !config.infinitepay.merchantId) {
    throw new Error(
      'Credenciais InfinitePay não configuradas. Defina INFINITEPAY_API_KEY e INFINITEPAY_MERCHANT_ID no .env.'
    );
  }

  const payload = {
    merchant_id: config.infinitepay.merchantId,
    amount: Math.round(valorTotal * 100), // InfinitePay usa centavos
    currency: 'BRL',
    description: descricao.substring(0, 255),
    customer_email: emailComprador,
    expires_in: 7 * 24 * 60 * 60, // 7 dias em segundos
    metadata: {
      origem: 'pc-builder-ai',
      geradoEm: new Date().toISOString(),
    },
  };

  try {
    const resposta = await axios.post(
      `${config.infinitepay.baseUrl}/payment_links`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${config.infinitepay.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 15000,
      }
    );

    const linkUrl = resposta.data?.url || resposta.data?.payment_url || resposta.data?.link;

    if (!linkUrl) {
      throw new Error('InfinitePay não retornou URL de pagamento na resposta.');
    }

    logger.info('InfinitePay: link de pagamento gerado', {
      valor: valorTotal,
      linkId: resposta.data?.id,
    });

    return linkUrl;
  } catch (error) {
    // Não expõe credenciais ou detalhes internos nos logs de erro ao usuário
    const mensagemSegura =
      error.response?.status === 401
        ? 'Falha de autenticação com InfinitePay. Verifique INFINITEPAY_API_KEY.'
        : error.response?.status === 422
        ? 'Dados inválidos para geração do link de pagamento.'
        : 'Falha ao gerar link de pagamento. Tente novamente mais tarde.';

    logger.error('InfinitePay: erro ao gerar link', {
      status: error.response?.status,
      mensagem: error.message,
    });

    throw new Error(mensagemSegura);
  }
}

module.exports = { gerarLinkPagamento };
