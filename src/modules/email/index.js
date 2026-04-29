const { google } = require('googleapis');
const { withRetry } = require('../../utils/retry');
const { renderTemplateLojasBR } = require('./templates/lojas-br');
const { renderTemplateMenorPreco } = require('./templates/menor-preco');
const config = require('../../config');
const logger = require('../../utils/logger');

/**
 * Cria o cliente OAuth2 autenticado com as credenciais do Gmail.
 */
function criarClienteGmail() {
  const oauth2Client = new google.auth.OAuth2(
    config.gmail.clientId,
    config.gmail.clientSecret,
    'https://developers.google.com/oauthplayground'
  );

  oauth2Client.setCredentials({ refresh_token: config.gmail.refreshToken });
  return oauth2Client;
}

/**
 * Codifica e-mail em formato RFC 2822 para a Gmail API.
 */
function encodeEmailRFC2822({ from, to, subject, htmlBody }) {
  const boundary = `boundary_${Date.now()}`;
  const raw = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    'Este e-mail requer um cliente que suporte HTML.',
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  return Buffer.from(raw).toString('base64url');
}

/**
 * Envia um e-mail via Gmail API com retry automático.
 * @param {object} params
 * @param {string} params.emailDestino
 * @param {string} params.assunto
 * @param {string} params.htmlBody
 */
async function enviarEmail({ emailDestino, assunto, htmlBody }) {
  if (!config.gmail.clientId || !config.gmail.refreshToken) {
    throw new Error(
      'Credenciais Gmail não configuradas. Defina GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET e GMAIL_REFRESH_TOKEN no .env.'
    );
  }

  return withRetry(
    async () => {
      const auth = criarClienteGmail();
      const gmail = google.gmail({ version: 'v1', auth });

      const rawMessage = encodeEmailRFC2822({
        from: `PC Builder AI <${config.gmail.user}>`,
        to: emailDestino,
        subject: assunto,
        htmlBody,
      });

      const resposta = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: rawMessage },
      });

      logger.info('Email enviado com sucesso', {
        destino: emailDestino,
        messageId: resposta.data.id,
        timestamp: new Date().toISOString(),
      });

      return { enviado: true, messageId: resposta.data.id };
    },
    { maxRetries: 3, initialDelayMs: 2000, label: `Gmail → ${emailDestino}` }
  );
}

/**
 * Seleciona o template e envia o e-mail de build.
 * @param {object} params
 * @param {string} params.emailDestino
 * @param {string} params.objetivo
 * @param {'lojas-br'|'menor-preco'} params.tipoEmail
 * @param {object} params.buildRecomendada
 * @param {object} params.precosScraping
 */
async function enviarEmailBuild({
  emailDestino,
  objetivo,
  tipoEmail,
  buildRecomendada,
  precosScraping,
}) {
  const { totalGasto } = buildRecomendada;
  const assunto = `Sua Build Personalizada — ${objetivo} por R$${totalGasto.toFixed(0)}`;

  const htmlBody =
    tipoEmail === 'menor-preco'
      ? renderTemplateMenorPreco({ objetivo, buildRecomendada, precosScraping })
      : renderTemplateLojasBR({ objetivo, buildRecomendada });

  return enviarEmail({ emailDestino, assunto, htmlBody });
}

module.exports = { enviarEmailBuild, enviarEmail };
