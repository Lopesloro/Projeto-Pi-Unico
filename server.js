require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const axios   = require('axios');
const { processarBuild } = require('./src/index');
const { enviarEmail }    = require('./src/modules/email');
const bcrypt  = require('bcryptjs');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ============================================
// BANCO DE DADOS (PostgreSQL)
// ============================================
let pool;

const TABELAS = [
    {
        nome: 'Usuarios',
        sql: `
            CREATE TABLE IF NOT EXISTS "Usuarios" (
                "Id"          SERIAL       PRIMARY KEY,
                "Email"       VARCHAR(255) NOT NULL UNIQUE,
                "Senha"       VARCHAR(255) NOT NULL,
                "Nome"        VARCHAR(150) NULL,
                "DataCriacao" TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
                "UltimoLogin" TIMESTAMP    NULL DEFAULT NULL
            )
        `
    },
    {
        nome: 'Builds',
        sql: `
            CREATE TABLE IF NOT EXISTS "Builds" (
                "Id"           SERIAL        PRIMARY KEY,
                "EmailDestino" VARCHAR(255)  NOT NULL,
                "Objetivo"     TEXT          NOT NULL,
                "Orcamento"    DECIMAL(10,2) NOT NULL,
                "TotalGasto"   DECIMAL(10,2) NULL,
                "Economia"     DECIMAL(10,2) NULL,
                "ResumoGeral"  TEXT          NULL,
                "DataCriacao"  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
            )
        `
    },
    {
        nome: 'BuildComponentes',
        sql: `
            CREATE TABLE IF NOT EXISTS "BuildComponentes" (
                "Id"            SERIAL        PRIMARY KEY,
                "BuildId"       INT           NOT NULL,
                "Componente"    VARCHAR(100)  NULL,
                "Produto"       VARCHAR(255)  NULL,
                "Preco"         DECIMAL(10,2) NULL,
                "Loja"          VARCHAR(100)  NULL,
                "Url"           TEXT          NULL,
                "Disponivel"    BOOLEAN       DEFAULT TRUE,
                "Justificativa" TEXT          NULL,
                FOREIGN KEY ("BuildId") REFERENCES "Builds"("Id") ON DELETE CASCADE
            )
        `
    },
    {
        nome: 'ScrapingLog',
        sql: `
            CREATE TABLE IF NOT EXISTS "ScrapingLog" (
                "Id"         SERIAL        PRIMARY KEY,
                "Componente" VARCHAR(255)  NOT NULL,
                "Loja"       VARCHAR(100)  NOT NULL,
                "Sucesso"    BOOLEAN       DEFAULT FALSE,
                "Preco"      DECIMAL(10,2) NULL,
                "Erro"       TEXT          NULL,
                "DataHora"   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
            )
        `
    },
    {
        nome: 'Sessoes',
        sql: `
            CREATE TABLE IF NOT EXISTS "Sessoes" (
                "Id"        SERIAL       PRIMARY KEY,
                "UsuarioId" INT          NOT NULL,
                "Token"     VARCHAR(255) NOT NULL UNIQUE,
                "CriadoEm"  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
                "ExpiraEm"  TIMESTAMP    NOT NULL,
                FOREIGN KEY ("UsuarioId") REFERENCES "Usuarios"("Id") ON DELETE CASCADE
            )
        `
    }
];

const INDICES = [
    `CREATE INDEX IF NOT EXISTS idx_builds_email ON "Builds"("EmailDestino")`,
    `CREATE INDEX IF NOT EXISTS idx_componentes_build ON "BuildComponentes"("BuildId")`,
    `CREATE INDEX IF NOT EXISTS idx_scraping_loja ON "ScrapingLog"("Loja")`,
    `CREATE INDEX IF NOT EXISTS idx_scraping_data ON "ScrapingLog"("DataHora")`,
    `CREATE INDEX IF NOT EXISTS idx_sessoes_token ON "Sessoes"("Token")`,
];

async function inicializarBanco() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL não configurada nas variáveis de ambiente.');
    }

    const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

    pool = new Pool({
        connectionString,
        ssl: isLocal ? false : { rejectUnauthorized: false },
        max: 10,
    });

    const client = await pool.connect();
    try {
        console.log('✅ Conexão com PostgreSQL estabelecida.');

        const criadas = [];
        const falhas  = [];
        for (const tabela of TABELAS) {
            try {
                await client.query(tabela.sql);
                criadas.push(tabela.nome);
            } catch (errTab) {
                falhas.push({ nome: tabela.nome, erro: errTab.message });
                console.error(`❌ Falha ao criar tabela ${tabela.nome}:`, errTab.message);
            }
        }

        for (const indice of INDICES) {
            try { await client.query(indice); } catch (_) { /* índice opcional */ }
        }

        // Garante colunas extras em Usuarios (caso tabela já existisse com schema antigo)
        try {
            const { rows: cols } = await client.query(`
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'Usuarios'
            `);
            const nomesCols = cols.map(c => c.column_name);
            if (!nomesCols.includes('UltimoLogin')) {
                await client.query(`ALTER TABLE "Usuarios" ADD COLUMN "UltimoLogin" TIMESTAMP NULL DEFAULT NULL`);
            }
            if (!nomesCols.includes('Nome')) {
                await client.query(`ALTER TABLE "Usuarios" ADD COLUMN "Nome" VARCHAR(150) NULL`);
            }
        } catch (errAlter) {
            console.warn('⚠️  Erro ao verificar colunas extras:', errAlter.message);
        }

        const { rows: tabelasExistentes } = await client.query(
            `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
        );
        const lista = tabelasExistentes.map(r => r.tablename);
        console.log(`✅ Tabelas no banco: ${lista.join(', ') || '(nenhuma)'}`);
        if (falhas.length > 0) {
            console.warn(`⚠️  ${falhas.length} tabela(s) falharam:`, falhas);
        } else {
            console.log(`✅ Todas as ${criadas.length} tabelas verificadas/criadas com sucesso.`);
        }
    } finally {
        client.release();
    }
}

function verificarBanco(req, res, next) {
    if (!pool) return res.status(503).json({ sucesso: false, mensagem: 'Banco de dados indisponível.' });
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

        const { rows: existente } = await pool.query('SELECT "Id" FROM "Usuarios" WHERE "Email" = $1', [email.trim()]);
        if (existente.length > 0) return res.status(409).json({ sucesso: false, mensagem: 'Este e-mail já está cadastrado!' });

        const hash = bcrypt.hashSync(senha, 10);
        const { rows } = await pool.query(
            'INSERT INTO "Usuarios" ("Email", "Senha", "Nome") VALUES ($1, $2, $3) RETURNING "Id"',
            [email.trim(), hash, nome?.trim() || null]
        );

        res.status(201).json({ sucesso: true, mensagem: 'Conta criada com sucesso!', usuario: { id: rows[0].Id, email: email.trim() } });
    } catch (erro) {
        console.error('Erro no cadastro:', erro.message);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao criar a conta.' });
    }
});

// ============================================
// ROTA: LOGIN
// ============================================
app.post('/api/login', verificarBanco, async (req, res) => {
    try {
        const { email, senha } = req.body;
        if (!email || !senha) return res.status(400).json({ sucesso: false, mensagem: 'E-mail e senha são obrigatórios.' });
        if (!EMAIL_REGEX.test(email.trim())) return res.status(400).json({ sucesso: false, mensagem: 'Formato de e-mail inválido.' });

        const { rows } = await pool.query('SELECT "Id", "Email", "Senha", "Nome" FROM "Usuarios" WHERE "Email" = $1', [email.trim()]);
        const usuario = rows[0];

        if (usuario && bcrypt.compareSync(senha, usuario.Senha)) {
            await pool.query('UPDATE "Usuarios" SET "UltimoLogin" = NOW() WHERE "Id" = $1', [usuario.Id]);
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

        const { rows: builds } = await pool.query(
            'SELECT "Id", "Objetivo", "Orcamento", "TotalGasto", "Economia", "DataCriacao" FROM "Builds" WHERE "EmailDestino" = $1 ORDER BY "DataCriacao" DESC LIMIT 20',
            [email.trim()]
        );

        for (const build of builds) {
            const { rows: componentes } = await pool.query(
                'SELECT "Componente", "Produto", "Preco", "Loja", "Url", "Disponivel" FROM "BuildComponentes" WHERE "BuildId" = $1',
                [build.Id]
            );
            build.componentes = componentes;
        }

        res.json({ sucesso: true, builds });
    } catch (erro) {
        console.error('Erro no histórico:', erro.message);
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar histórico.' });
    }
});

// ============================================
// FUNÇÃO: SALVAR BUILD + LOG DE SCRAPING
// ============================================
async function salvarBuild({ emailDestino, objetivo, orcamento, buildRecomendada }) {
    if (!pool || !buildRecomendada) return;
    try {
        const { rows } = await pool.query(
            'INSERT INTO "Builds" ("EmailDestino", "Objetivo", "Orcamento", "TotalGasto", "Economia", "ResumoGeral") VALUES ($1, $2, $3, $4, $5, $6) RETURNING "Id"',
            [emailDestino, objetivo, orcamento,
             buildRecomendada.totalGasto || null,
             buildRecomendada.economia   || null,
             buildRecomendada.resumoGeral || null]
        );
        const buildId = rows[0].Id;
        for (const c of (buildRecomendada.configuracao || [])) {
            await pool.query(
                'INSERT INTO "BuildComponentes" ("BuildId", "Componente", "Produto", "Preco", "Loja", "Url", "Disponivel", "Justificativa") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                [buildId, c.componente || null, c.produto || null, c.preco || null,
                 c.loja || null, c.url || null, c.disponivel !== false, c.justificativa || null]
            );
        }
    } catch (erro) {
        console.error('Erro ao salvar build:', erro.message);
    }
}

async function registrarScrapingLog(componente, loja, sucesso, preco, erro) {
    if (!pool) return;
    try {
        await pool.query(
            'INSERT INTO "ScrapingLog" ("Componente", "Loja", "Sucesso", "Preco", "Erro") VALUES ($1, $2, $3, $4, $5)',
            [componente, loja, !!sucesso, preco || null, erro || null]
        );
    } catch (_) { /* log não crítico */ }
}

// ============================================
// ROTA: BUILD COMPLETA (scraping + IA + e-mail)
// ============================================
app.post('/api/build', async (req, res) => {
    try {
        const { orcamento, objetivo, emailDestino, tipoEmail } = req.body;
        if (!orcamento || !objetivo || !emailDestino) {
            return res.status(400).json({ sucesso: false, mensagem: 'Campos obrigatórios: orcamento, objetivo, emailDestino.' });
        }
        if (typeof orcamento !== 'number' || orcamento <= 0) {
            return res.status(400).json({ sucesso: false, mensagem: 'O orçamento deve ser um número positivo.' });
        }

        const resultado = await processarBuild({ orcamento, objetivo, emailDestino, tipoEmail: tipoEmail || 'lojas-br' });

        if (resultado.buildRecomendada) {
            await salvarBuild({ emailDestino, objetivo, orcamento, buildRecomendada: resultado.buildRecomendada });
        }

        if (resultado.statusEtapas?.scraping?.lojas) {
            for (const [loja, info] of Object.entries(resultado.statusEtapas.scraping.lojas)) {
                await registrarScrapingLog(objetivo, loja, info.sucesso, info.preco, info.erro);
            }
        }

        res.status(resultado.sucesso ? 200 : 207).json(resultado);
    } catch (erro) {
        console.error('Erro no endpoint /api/build:', erro.message);
        res.status(500).json({ sucesso: false, mensagem: 'Erro interno ao processar a build.' });
    }
});

// ============================================
// ROTA: PROXY IA (Mistral)
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
// ROTA: ENVIAR E-MAIL
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
    const filePath = path.resolve(__dirname, req.path.slice(1));
    if (!filePath.startsWith(__dirname)) return res.sendFile(path.join(__dirname, 'index.html'));
    res.sendFile(filePath, err => { if (err) res.sendFile(path.join(__dirname, 'index.html')); });
});

// ============================================
// INICIAR
// ============================================
const PORT = process.env.PORT || 3001;

const servidor = app.listen(PORT, () => {
    console.log('');
    console.log('===========================================');
    console.log('  PC Builder AI — Servidor Online');
    console.log(`  URL: http://localhost:${PORT}`);
    console.log(`  Builder:   http://localhost:${PORT}/pages/builder.html`);
    console.log(`  Resultado: http://localhost:${PORT}/pages/resultado.html`);
    console.log('===========================================');
    console.log('');
});

servidor.on('error', erro => {
    if (erro.code === 'EADDRINUSE') {
        console.error(`ERRO: Porta ${PORT} já está em uso!`);
        console.error(`Mude PORT no arquivo .env para outra porta.`);
    } else {
        console.error('Erro ao iniciar servidor:', erro.message);
    }
    process.exit(1);
});

inicializarBanco().catch(err => {
    console.error('⚠️  Banco de dados indisponível:', err.message);
    console.error('   Rotas que dependem do banco retornarão 503 até a conexão ser estabelecida.');
});
