require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const { processarBuild } = require('./src/index');
const { enviarEmail } = require('./src/modules/email');
const bcrypt = require('bcryptjs');

const app = express();

// ============================================
// MIDDLEWARES
// ============================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ============================================
// BANCO DE DADOS (MySQL)
// ============================================
let db;

async function inicializarBanco() {
    db = await mysql.createConnection({
        host:     process.env.MYSQL_HOST     || '127.0.0.1',
        port:     parseInt(process.env.MYSQL_PORT) || 3306,
        user:     process.env.MYSQL_USER     || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'Pc_Builder_Unico',
    });

    await db.execute(`
        CREATE TABLE IF NOT EXISTS Usuarios (
            Id          INT AUTO_INCREMENT PRIMARY KEY,
            Email       VARCHAR(255) NOT NULL UNIQUE,
            Senha       VARCHAR(255) NOT NULL,
            DataCriacao DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log('Banco MySQL conectado:', process.env.MYSQL_DATABASE);
    console.log('Tabela "Usuarios" verificada/criada.');
}

function verificarBanco(req, res, next) {
    if (!db) {
        return res.status(503).json({
            sucesso: false,
            mensagem: 'Banco de dados indisponivel.'
        });
    }
    next();
}

// ============================================
// ROTA: STATUS
// ============================================
app.get('/api/status', (req, res) => {
    res.json({
        servidor: 'online',
        banco: db ? 'conectado' : 'desconectado',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// ROTA: LOGIN
// ============================================
app.post('/api/login', verificarBanco, async (req, res) => {
    try {
        const { email, senha } = req.body;

        if (!email || !senha) {
            return res.status(400).json({ sucesso: false, mensagem: 'E-mail e senha sao obrigatorios.' });
        }

        if (!email.includes('@')) {
            return res.status(400).json({ sucesso: false, mensagem: 'Formato de e-mail invalido.' });
        }

        const [rows] = await db.execute(
            'SELECT Id, Email, Senha FROM Usuarios WHERE Email = ?',
            [email.trim()]
        );
        const usuario = rows[0];

        if (usuario && bcrypt.compareSync(senha, usuario.Senha)) {
            res.json({
                sucesso: true,
                mensagem: 'Login efetuado com sucesso!',
                usuario: { id: usuario.Id, email: usuario.Email }
            });
        } else {
            res.status(401).json({ sucesso: false, mensagem: 'E-mail ou senha invalidos.' });
        }

    } catch (erro) {
        console.error('Erro no login:', erro);
        res.status(500).json({ sucesso: false, mensagem: 'Erro interno no servidor.' });
    }
});

// ============================================
// ROTA: CADASTRO
// ============================================
app.post('/api/cadastro', verificarBanco, async (req, res) => {
    try {
        const { email, senha } = req.body;

        if (!email || !senha) {
            return res.status(400).json({ sucesso: false, mensagem: 'E-mail e senha sao obrigatorios.' });
        }

        if (!email.includes('@')) {
            return res.status(400).json({ sucesso: false, mensagem: 'Formato de e-mail invalido.' });
        }

        if (senha.length < 8) {
            return res.status(400).json({ sucesso: false, mensagem: 'A senha deve ter pelo menos 8 caracteres.' });
        }

        const [existe] = await db.execute(
            'SELECT Id FROM Usuarios WHERE Email = ?',
            [email.trim()]
        );

        if (existe[0]) {
            return res.status(409).json({ sucesso: false, mensagem: 'Este e-mail ja esta cadastrado!' });
        }

        const hash = bcrypt.hashSync(senha, 10);
        const [resultado] = await db.execute(
            'INSERT INTO Usuarios (Email, Senha) VALUES (?, ?)',
            [email.trim(), hash]
        );

        res.status(201).json({
            sucesso: true,
            mensagem: 'Conta criada com sucesso!',
            usuario: { id: resultado.insertId, email: email.trim() }
        });

    } catch (erro) {
        console.error('Erro no cadastro:', erro);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao criar a conta.' });
    }
});

// ============================================
// ROTA: BUILD COMPLETA (scraping + IA + e-mail)
// ============================================
app.post('/api/build', async (req, res) => {
    try {
        const { orcamento, objetivo, emailDestino, tipoEmail } = req.body;

        if (!orcamento || !objetivo || !emailDestino) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Campos obrigatórios: orcamento, objetivo, emailDestino.'
            });
        }

        if (typeof orcamento !== 'number' || orcamento <= 0) {
            return res.status(400).json({ sucesso: false, mensagem: 'O orçamento deve ser um número positivo.' });
        }

        const resultado = await processarBuild({
            orcamento,
            objetivo,
            emailDestino,
            tipoEmail: tipoEmail || 'lojas-br',
        });

        const statusHttp = resultado.sucesso ? 200 : 207;
        res.status(statusHttp).json(resultado);
    } catch (erro) {
        console.error('Erro no endpoint /api/build:', erro);
        res.status(500).json({ sucesso: false, mensagem: 'Erro interno ao processar a build.' });
    }
});

// ============================================
// ROTA: PROXY IA (Mistral — chave fica no servidor)
// ============================================
app.post('/api/gemini', async (req, res) => {
    try {
        const { contents } = req.body;
        if (!contents) {
            return res.status(400).json({ error: 'Campo "contents" obrigatório.' });
        }

        const mistralKey = process.env.MISTRAL_API_KEY;
        if (!mistralKey) {
            return res.status(500).json({ error: 'MISTRAL_API_KEY não configurada no servidor.' });
        }

        const userText = contents.flatMap(c => c.parts.map(p => p.text)).join('\n');

        const resposta = await axios.post('https://api.mistral.ai/v1/chat/completions', {
            model: 'mistral-small-latest',
            messages: [{ role: 'user', content: userText }]
        }, {
            headers: {
                'Authorization': `Bearer ${mistralKey}`,
                'Content-Type': 'application/json'
            }
        });

        const texto = resposta.data.choices[0].message.content;
        res.json({ candidates: [{ content: { parts: [{ text: texto }] } }] });

    } catch (erro) {
        const status = erro.response?.status || 500;
        const data   = erro.response?.data  || { error: 'Erro ao conectar com a Mistral API.' };
        console.error('Erro no proxy Mistral:', data);
        res.status(status).json(data);
    }
});

// ============================================
// ROTA: ENVIAR E-MAIL (Gmail API)
// ============================================
app.post('/api/enviar-email', async (req, res) => {
    try {
        const { emailDestino, orcamento, objetivo, configuracaoHTML } = req.body;

        if (!emailDestino || !emailDestino.includes('@')) {
            return res.status(400).json({ sucesso: false, mensagem: 'E-mail inválido.' });
        }

        const orcamentoFmt = Number(orcamento).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const assunto = `Sua Build PC — ${objetivo || 'Configuração Personalizada'}`;

        const htmlBody = `<!DOCTYPE html>
<html lang="pt-BR">
<body style="font-family:Inter,sans-serif;background:#0f172a;color:#f8fafc;padding:2rem;max-width:700px;margin:0 auto;">
  <h1 style="color:#3b82f6;">PC Builder AI — Sua Configuração</h1>
  <p><strong>Orçamento:</strong> ${orcamentoFmt}</p>
  <p><strong>Objetivo:</strong> ${objetivo || ''}</p>
  <hr style="border-color:#334155;margin:1.5rem 0;">
  ${configuracaoHTML || ''}
  <hr style="border-color:#334155;margin:1.5rem 0;">
  <p style="color:#94a3b8;font-size:0.85rem;">Gerado por PC Builder AI — Projeto Integrador 26 / PUC Campinas</p>
</body>
</html>`;

        await enviarEmail({ emailDestino, assunto, htmlBody });
        res.json({ sucesso: true, mensagem: 'E-mail enviado com sucesso!' });
    } catch (erro) {
        console.error('Erro em /api/enviar-email:', erro);
        res.status(500).json({ sucesso: false, mensagem: erro.message || 'Erro ao enviar e-mail.' });
    }
});

// ============================================
// ROTA: COMPONENTES
// ============================================
app.get('/api/componentes', (req, res) => {
    try {
        const componentes = require(path.join(__dirname, 'data', 'components.json'));
        res.json(componentes);
    } catch (erro) {
        console.error('Erro ao carregar componentes:', erro);
        res.status(500).json({ erro: 'Falha ao carregar lista de componentes.' });
    }
});

// ============================================
// FALLBACK: index.html
// ============================================
app.get('*', (req, res) => {
    const filePath = path.join(__dirname, req.path);
    res.sendFile(filePath, (err) => {
        if (err) res.sendFile(path.join(__dirname, 'index.html'));
    });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
const PORT = process.env.PORT || 3001;

inicializarBanco()
    .then(() => {
        const servidor = app.listen(PORT, () => {
            console.log('');
            console.log('===========================================');
            console.log('PC Builder AI - Servidor Rodando!');
            console.log(`URL: http://localhost:${PORT}`);
            console.log('===========================================');
            console.log(`Login:     http://localhost:${PORT}/`);
            console.log(`Builder:   http://localhost:${PORT}/pages/builder.html`);
            console.log(`Resultado: http://localhost:${PORT}/pages/resultado.html`);
            console.log('');
        });

        servidor.on('error', (erro) => {
            if (erro.code === 'EADDRINUSE') {
                console.error(`ERRO: Porta ${PORT} ja esta em uso!`);
                console.error(`Mude PORT=${PORT} para PORT=${parseInt(PORT) + 1} no arquivo .env`);
            } else {
                console.error('Erro ao iniciar servidor:', erro.message);
            }
            process.exit(1);
        });
    })
    .catch(err => {
        console.error('Falha ao conectar ao MySQL:', err.message);
        process.exit(1);
    });
