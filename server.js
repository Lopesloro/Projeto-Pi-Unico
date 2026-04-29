require('dotenv').config();
const express = require('express');

const mysql   = require('mysql2/promise');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const axios   = require('axios');
const { processarBuild } = require('./src/index');
const { enviarEmail }    = require('./src/modules/email');
const bcrypt  = require('bcryptjs');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const app = express();

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'DELETE'], allowedHeaders: ['Content-Type'] }));

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

// BANCO DE DADOS (MySQL 8)
// ============================================
let pool;

async function inicializarBanco() {
    pool = mysql.createPool({
        host:               process.env.MYSQL_HOST     || 'localhost',
        port:               parseInt(process.env.MYSQL_PORT) || 3306,
        user:               process.env.MYSQL_USER     || 'root',
        password:           process.env.MYSQL_PASSWORD || '',
        database:           process.env.MYSQL_DATABASE || 'Pc_Builder_Unico',
        waitForConnections: true,
        connectionLimit:    10,
        queueLimit:         0,
    });

    try {
        const conn = await pool.getConnection();
        console.log('✅ Conexão com MySQL estabelecida.');

        // Tabela Usuarios
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS Usuarios (
                Id          INT          AUTO_INCREMENT PRIMARY KEY,
                Email       VARCHAR(255) NOT NULL UNIQUE,
                Senha       VARCHAR(255) NOT NULL,
                Nome        VARCHAR(150) NULL,
                DataCriacao TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
                UltimoLogin TIMESTAMP    NULL DEFAULT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Garante coluna UltimoLogin se tabela já existia
        const [cols] = await conn.execute(`
            SELECT COUNT(*) AS existe FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME   = 'Usuarios'
              AND COLUMN_NAME  = 'UltimoLogin'
        `);
        if (cols[0].existe === 0) {
            await conn.execute(`ALTER TABLE Usuarios ADD COLUMN UltimoLogin TIMESTAMP NULL DEFAULT NULL`);
        }

        // Garante coluna Nome se tabela já existia
        const [colsNome] = await conn.execute(`
            SELECT COUNT(*) AS existe FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME   = 'Usuarios'
              AND COLUMN_NAME  = 'Nome'
        `);
        if (colsNome[0].existe === 0) {
            await conn.execute(`ALTER TABLE Usuarios ADD COLUMN Nome VARCHAR(150) NULL AFTER Senha`);
        }

        // Tabela Builds
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS Builds (
                Id           INT           AUTO_INCREMENT PRIMARY KEY,
                EmailDestino VARCHAR(255)  NOT NULL,
                Objetivo     TEXT          NOT NULL,
                Orcamento    DECIMAL(10,2) NOT NULL,
                TotalGasto   DECIMAL(10,2) NULL,
                Economia     DECIMAL(10,2) NULL,
                ResumoGeral  TEXT          NULL,
                DataCriacao  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_email (EmailDestino)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Tabela BuildComponentes
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS BuildComponentes (
                Id            INT           AUTO_INCREMENT PRIMARY KEY,
                BuildId       INT           NOT NULL,
                Componente    VARCHAR(100)  NULL,
                Produto       VARCHAR(255)  NULL,
                Preco         DECIMAL(10,2) NULL,
                Loja          VARCHAR(100)  NULL,
                Url           TEXT          NULL,
                Disponivel    TINYINT(1)    DEFAULT 1,
                Justificativa TEXT          NULL,
                FOREIGN KEY (BuildId) REFERENCES Builds(Id) ON DELETE CASCADE,
                INDEX idx_build (BuildId)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Tabela ScrapingLog
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS ScrapingLog (
                Id         INT           AUTO_INCREMENT PRIMARY KEY,
                Componente VARCHAR(255)  NOT NULL,
                Loja       VARCHAR(100)  NOT NULL,
                Sucesso    TINYINT(1)    DEFAULT 0,
                Preco      DECIMAL(10,2) NULL,
                Erro       TEXT          NULL,
                DataHora   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_loja (Loja),
                INDEX idx_data (DataHora)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Tabela Sessoes
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS Sessoes (
                Id        INT          AUTO_INCREMENT PRIMARY KEY,
                UsuarioId INT          NOT NULL,
                Token     VARCHAR(255) NOT NULL UNIQUE,
                CriadoEm  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
                ExpiraEm  TIMESTAMP    NOT NULL,
                FOREIGN KEY (UsuarioId) REFERENCES Usuarios(Id) ON DELETE CASCADE,
                INDEX idx_token (Token)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        conn.release();
        console.log('✅ Todas as tabelas verificadas/criadas com sucesso.');
    } catch (err) {
        console.error('❌ Falha ao conectar ao MySQL:', err.message);
        console.error('   Dica: rode o reset_banco.sql no MySQL Workbench e tente novamente.');
        process.exit(1);
    }
}

function verificarBanco(req, res, next) {
    if (!pool) return res.status(503).json({ sucesso: false, mensagem: 'Banco de dados indisponível.' });
=======
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

    res.json({ servidor: 'online', banco: pool ? 'conectado' : 'desconectado', timestamp: new Date().toISOString() });
});

// ============================================
// ROTA: CADASTRO
// ============================================
app.post('/api/cadastro', verificarBanco, async (req, res) => {
    try {
        const { email, senha, nome } = req.body;
        if (!email || !senha) return res.status(400).json({ sucesso: false, mensagem: 'E-mail e senha são obrigatórios.' });
        if (!EMAIL_REGEX.test(email.trim())) return res.status(400).json({ sucesso: false, mensagem: 'Formato de e-mail inválido.' });
        if (senha.length < 8) return res.status(400).json({ sucesso: false, mensagem: 'A senha deve ter pelo menos 8 caracteres.' });

        const [existente] = await pool.execute('SELECT Id FROM Usuarios WHERE Email = ?', [email.trim()]);
        if (existente.length > 0) return res.status(409).json({ sucesso: false, mensagem: 'Este e-mail já está cadastrado!' });

        const hash = bcrypt.hashSync(senha, 10);
        const [result] = await pool.execute(
            'INSERT INTO Usuarios (Email, Senha, Nome) VALUES (?, ?, ?)',
            [email.trim(), hash, nome?.trim() || null]
        );

        res.status(201).json({ sucesso: true, mensagem: 'Conta criada com sucesso!', usuario: { id: result.insertId, email: email.trim() } });
    } catch (erro) {
        console.error('Erro no cadastro:', erro.message);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao criar a conta.' });
    }

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
<<<<<<< HEAD
        if (!email || !senha) return res.status(400).json({ sucesso: false, mensagem: 'E-mail e senha são obrigatórios.' });
        if (!EMAIL_REGEX.test(email.trim())) return res.status(400).json({ sucesso: false, mensagem: 'Formato de e-mail inválido.' });

        const [rows] = await pool.execute('SELECT Id, Email, Senha, Nome FROM Usuarios WHERE Email = ?', [email.trim()]);
        const usuario = rows[0];

        if (usuario && bcrypt.compareSync(senha, usuario.Senha)) {
            await pool.execute('UPDATE Usuarios SET UltimoLogin = NOW() WHERE Id = ?', [usuario.Id]);
            res.json({
                sucesso: true,
                mensagem: 'Login efetuado com sucesso!',
                usuario: { id: usuario.Id, email: usuario.Email, nome: usuario.Nome }
            });
        } else {
            res.status(401).json({ sucesso: false, mensagem: 'E-mail ou senha inválidos.' });
        }
    } catch (erro) {
        console.error('Erro no login:', erro.message);


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

// ROTA: HISTÓRICO DE BUILDS DO USUÁRIO
// ============================================
app.get('/api/historico', verificarBanco, async (req, res) => {
    try {
        const { email } = req.query;
        if (!email || !EMAIL_REGEX.test(email)) return res.status(400).json({ sucesso: false, mensagem: 'E-mail inválido.' });

        const [builds] = await pool.execute(
            'SELECT Id, Objetivo, Orcamento, TotalGasto, Economia, DataCriacao FROM Builds WHERE EmailDestino = ? ORDER BY DataCriacao DESC LIMIT 20',
            [email.trim()]
        );

        for (const build of builds) {
            const [componentes] = await pool.execute(
                'SELECT Componente, Produto, Preco, Loja, Url, Disponivel FROM BuildComponentes WHERE BuildId = ?',
                [build.Id]
            );
            build.componentes = componentes;
        }

        res.json({ sucesso: true, builds });
    } catch (erro) {
        console.error('Erro no histórico:', erro.message);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar histórico.' });

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

// FUNÇÃO: SALVAR BUILD + LOG DE SCRAPING
// ============================================
async function salvarBuild({ emailDestino, objetivo, orcamento, buildRecomendada }) {
    if (!pool || !buildRecomendada) return;
    try {
        const [result] = await pool.execute(
            'INSERT INTO Builds (EmailDestino, Objetivo, Orcamento, TotalGasto, Economia, ResumoGeral) VALUES (?, ?, ?, ?, ?, ?)',
            [emailDestino, objetivo, orcamento,
             buildRecomendada.totalGasto || null,
             buildRecomendada.economia   || null,
             buildRecomendada.resumoGeral || null]
        );
        const buildId = result.insertId;
        for (const c of (buildRecomendada.configuracao || [])) {
            await pool.execute(
                'INSERT INTO BuildComponentes (BuildId, Componente, Produto, Preco, Loja, Url, Disponivel, Justificativa) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [buildId, c.componente || null, c.produto || null, c.preco || null,
                 c.loja || null, c.url || null, c.disponivel !== false ? 1 : 0, c.justificativa || null]
            );
        }
    } catch (erro) {
        console.error('Erro ao salvar build:', erro.message);
    }
}

async function registrarScrapingLog(componente, loja, sucesso, preco, erro) {
    if (!pool) return;
    try {
        await pool.execute(
            'INSERT INTO ScrapingLog (Componente, Loja, Sucesso, Preco, Erro) VALUES (?, ?, ?, ?, ?)',
            [componente, loja, sucesso ? 1 : 0, preco || null, erro || null]
        );
    } catch (_) { /* log não crítico */ }
}

// ============================================
// ROTA: BUILD COMPLETA
=======
// ROTA: BUILD COMPLETA (scraping + IA + e-mail)

// ============================================
app.post('/api/build', async (req, res) => {
    try {
        const { orcamento, objetivo, emailDestino, tipoEmail } = req.body;

        if (!orcamento || !objetivo || !emailDestino) {
            return res.status(400).json({ sucesso: false, mensagem: 'Campos obrigatórios: orcamento, objetivo, emailDestino.' });
        }


        if (!orcamento || !objetivo || !emailDestino) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Campos obrigatórios: orcamento, objetivo, emailDestino.'
            });
        }


        if (typeof orcamento !== 'number' || orcamento <= 0) {
            return res.status(400).json({ sucesso: false, mensagem: 'O orçamento deve ser um número positivo.' });
        }

        const resultado = await processarBuild({ orcamento, objetivo, emailDestino, tipoEmail: tipoEmail || 'lojas-br' });

        if (resultado.buildRecomendada) {
            await salvarBuild({ emailDestino, objetivo, orcamento, buildRecomendada: resultado.buildRecomendada });
        }

        // Registra log de scraping por loja
        if (resultado.statusEtapas?.scraping?.lojas) {
            for (const [loja, info] of Object.entries(resultado.statusEtapas.scraping.lojas)) {
                await registrarScrapingLog(objetivo, loja, info.sucesso, info.preco, info.erro);
            }
        }

        res.status(resultado.sucesso ? 200 : 207).json(resultado);
    } catch (erro) {
        console.error('Erro no endpoint /api/build:', erro.message);

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

// ROTA: PROXY IA (Mistral)
=======
// ROTA: PROXY IA (Mistral — chave fica no servidor)

// ============================================
app.post('/api/gemini', async (req, res) => {
    try {
        const { contents } = req.body;

        if (!contents) return res.status(400).json({ error: 'Campo "contents" obrigatório.' });

        const mistralKey = process.env.MISTRAL_API_KEY;
        if (!mistralKey) return res.status(500).json({ error: 'MISTRAL_API_KEY não configurada no servidor.' });

        const userText = contents.flatMap(c => c.parts.map(p => p.text)).join('\n');
=======
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

            headers: { 'Authorization': `Bearer ${mistralKey}`, 'Content-Type': 'application/json' }

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

// ROTA: ENVIAR E-MAIL
=======
// ROTA: ENVIAR E-MAIL (Gmail API)

// ============================================
app.post('/api/enviar-email', async (req, res) => {
    try {
        const { emailDestino, orcamento, objetivo, configuracaoHTML } = req.body;

        if (!emailDestino || !EMAIL_REGEX.test(emailDestino.trim())) {
            return res.status(400).json({ sucesso: false, mensagem: 'E-mail inválido.' });
        }
        const orcamentoFmt = Number(orcamento).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const assunto = `Sua Build PC — ${objetivo || 'Configuração Personalizada'}`;
        const htmlBody = `<!DOCTYPE html>
<html lang="pt-BR">
<body style="font-family:Inter,sans-serif;background:#070810;color:#e2e8f0;padding:2rem;max-width:700px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#0d1117,#111827);border:1px solid rgba(0,212,255,0.15);border-radius:16px;padding:2rem;">
    <h1 style="background:linear-gradient(135deg,#00d4ff,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:1.8rem;margin-bottom:0.5rem;">PC Builder AI</h1>
    <p style="color:#64748b;margin-bottom:2rem;">Sua configuração personalizada</p>
    <p><strong style="color:#00d4ff;">Orçamento:</strong> <span style="color:#e2e8f0;">${orcamentoFmt}</span></p>
    <p><strong style="color:#00d4ff;">Objetivo:</strong> <span style="color:#e2e8f0;">${objetivo || ''}</span></p>
    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:1.5rem 0;">
    ${configuracaoHTML || ''}
    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:1.5rem 0;">
    <p style="color:#475569;font-size:0.82rem;">Gerado por PC Builder AI — Projeto Integrador 26 / PUC Campinas</p>
  </div>
</body>
</html>`;
        await enviarEmail({ emailDestino, assunto, htmlBody });
        res.json({ sucesso: true, mensagem: 'E-mail enviado com sucesso!' });
    } catch (erro) {
        console.error('Erro em /api/enviar-email:', erro.message);


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

    const filePath = path.join(__dirname, 'data', 'components.json');
    fs.readFile(filePath, 'utf8', (erro, data) => {
        if (erro) return res.status(500).json({ erro: 'Falha ao carregar lista de componentes.' });
        try {
            res.json(JSON.parse(data));
        } catch (_) {
            res.status(500).json({ erro: 'Falha ao processar lista de componentes.' });
        }
    });
});

// ============================================
// FALLBACK
// ============================================
app.get('*', (req, res) => {
    const filePath = path.join(__dirname, req.path);
    res.sendFile(filePath, err => { if (err) res.sendFile(path.join(__dirname, 'index.html')); });
});

// ============================================
// INICIAR
// ============================================
const PORT = process.env.PORT || 3003;

inicializarBanco().then(() => {
    const servidor = app.listen(PORT, () => {
        console.log('');
        console.log('===========================================');
        console.log('  PC Builder AI — Servidor Online');
        console.log(`  URL: http://localhost:${PORT}`);
        console.log('===========================================');
    });
    servidor.on('error', erro => {
        if (erro.code === 'EADDRINUSE') console.error(`ERRO: Porta ${PORT} em uso. Encerre o processo e tente novamente.`);
        else console.error('Erro ao iniciar servidor:', erro.message);
        process.exit(1);
    });
}).catch(err => {
    console.error('Falha fatal ao iniciar banco:', err.message);
    process.exit(1);
});

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
