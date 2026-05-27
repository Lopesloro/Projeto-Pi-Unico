// ============================================
// AI.JS - Comunicação com a API (via proxy backend /api/gemini → Mistral)
// ============================================

// ─── Detecta tipo de build ───────────────────────────────────────────────────
function _detectarTipoBuild(objetivo) {
    const obj = (objetivo || '').toLowerCase();
    if (/game|jogo|fps|esport|1080p|1440p|4k/.test(obj)) return 'games';
    if (/edi[cç][aã]o|video|render|premiere|davinci|after.effect/.test(obj)) return 'edicao';
    return 'geral';
}

// ─── Alocação de orçamento por categoria ────────────────────────────────────
// IMPORTANTE: a soma de todos os percentuais por tipo DEVE ser ≤ 94%
// para que, mesmo que a IA escolha o máximo em todas as categorias,
// o total nunca ultrapasse o orçamento. Antes era 110% (games) → bug.
function _calcularAlocacao(orcamento, tipoBuild) {
    const b = Number(orcamento);
    const pct = {
        games:  { gpu: 0.40, cpu: 0.18, mobo: 0.11, ram: 0.09, storage: 0.08, fonte: 0.08 }, // soma: 94%
        edicao: { gpu: 0.18, cpu: 0.30, mobo: 0.12, ram: 0.15, storage: 0.09, fonte: 0.08 }, // soma: 92%
        geral:  { gpu: 0.00, cpu: 0.34, mobo: 0.18, ram: 0.17, storage: 0.15, fonte: 0.10 }, // soma: 94%
    }[tipoBuild];

    return {
        gpu:     Math.round(b * pct.gpu),
        cpu:     Math.round(b * pct.cpu),
        mobo:    Math.round(b * pct.mobo),
        ram:     Math.round(b * pct.ram),
        storage: Math.round(b * pct.storage),
        fonte:   Math.round(b * pct.fonte),
    };
}

/**
 * Fix B (v2) — Filtra o catálogo usando os MESMOS percentuais de _calcularAlocacao().
 * Como esses percentuais somam ≤ 94%, mesmo que a IA escolha o máximo em todas as
 * categorias, o total nunca pode ultrapassar 94% do orçamento → Fase 1 do enforcer
 * nunca dispara → seções 1, 3 e 4 sempre mostram as mesmas peças.
 *
 * Para build 'geral' (sem GPU), placas_video retorna array vazio SEM fallback.
 * Fallback de 3 mais baratos aplica-se apenas a categorias não-nulas.
 */
function _filtrarEstoquePorOrcamento(estoque, orcamento, tipoBuild) {
    const b    = Number(orcamento);
    const tipo = tipoBuild || 'geral';
    const aloc = _calcularAlocacao(b, tipo); // percentuais já somam ≤ 94%

    // Mapeia nome do campo JSON → chave da alocação
    const MAP_CAMPO = {
        processadores: 'cpu',
        placas_mae:    'mobo',
        memorias:      'ram',
        placas_video:  'gpu',
        armazenamento: 'storage',
        fontes:        'fonte',
    };

    const filtrado = {};
    for (const [campo, items] of Object.entries(estoque)) {
        const alocKey = MAP_CAMPO[campo];
        const maxR    = alocKey != null ? aloc[alocKey] : null;

        // GPU = 0 para build 'geral' → array vazio, sem fallback
        if (maxR === 0) { filtrado[campo] = []; continue; }

        if (maxR == null || !Array.isArray(items)) { filtrado[campo] = items; continue; }

        const dentroLimite = items.filter(p => Number(p.preco) <= maxR);

        // Fallback: exibe pelo menos 3 opções (as mais baratas) quando poucas cabem no cap
        if (dentroLimite.length >= 3) {
            filtrado[campo] = dentroLimite;
        } else {
            const ordenados = [...items].sort((a, b2) => Number(a.preco) - Number(b2.preco));
            filtrado[campo] = ordenados.slice(0, Math.max(3, dentroLimite.length));
        }
    }
    return filtrado;
}

/**
 * Formata o catálogo filtrado com dados técnicos + custo-benefício calculado.
 * CPUs e GPUs ordenadas pelo melhor custo-benefício (menor R$/score primeiro).
 */
function _formatarCatalogo(estoque) {
    const linhas = [];

    if (estoque.processadores?.length) {
        linhas.push('── PROCESSADORES ── [menor Custo/Score = melhor valor]');
        const cpus = [...estoque.processadores].sort(
            (a, b) => (Number(a.preco) / a.score) - (Number(b.preco) / b.score)
        );
        for (const p of cpus) {
            const cb = (Number(p.preco) / p.score).toFixed(0);
            linhas.push(
                `  ID: ${p.id} | ${p.nome}` +
                ` | R$ ${Number(p.preco).toFixed(2)} | Socket: ${p.socket}` +
                ` | TDP: ${p.tdp_w}W | Vídeo Integrado: ${p.video_integrado ? 'SIM' : 'NÃO'}` +
                ` | Score: ${p.score} | Custo/Score: R$${cb}/pt`
            );
        }
    }

    if (estoque.placas_mae?.length) {
        linhas.push('\n── PLACAS-MÃE ──');
        for (const m of estoque.placas_mae) {
            linhas.push(
                `  ID: ${m.id} | ${m.nome}` +
                ` | R$ ${Number(m.preco).toFixed(2)} | Socket: ${m.socket} | Aceita: ${m.tipo_memoria}`
            );
        }
    }

    if (estoque.memorias?.length) {
        linhas.push('\n── MEMÓRIAS RAM ──');
        for (const r of estoque.memorias) {
            linhas.push(
                `  ID: ${r.id} | ${r.nome}` +
                ` | R$ ${Number(r.preco).toFixed(2)} | Tipo: ${r.tipo} | ${r.capacidade_gb}GB`
            );
        }
    }

    if (estoque.placas_video?.length) {
        linhas.push('\n── PLACAS DE VÍDEO ── [menor Custo/Score = melhor valor]');
        const gpus = [...estoque.placas_video].sort(
            (a, b) => (Number(a.preco) / a.score) - (Number(b.preco) / b.score)
        );
        for (const g of gpus) {
            const cb = (Number(g.preco) / g.score).toFixed(0);
            linhas.push(
                `  ID: ${g.id} | ${g.nome}` +
                ` | R$ ${Number(g.preco).toFixed(2)} | TDP: ${g.tdp_w}W` +
                ` | Score: ${g.score} | Custo/Score: R$${cb}/pt`
            );
        }
    }

    if (estoque.armazenamento?.length) {
        linhas.push('\n── ARMAZENAMENTO ──');
        for (const s of estoque.armazenamento) {
            linhas.push(`  ID: ${s.id} | ${s.nome} | R$ ${Number(s.preco).toFixed(2)}`);
        }
    }

    if (estoque.fontes?.length) {
        linhas.push('\n── FONTES ──');
        for (const f of estoque.fontes) {
            linhas.push(
                `  ID: ${f.id} | ${f.nome}` +
                ` | R$ ${Number(f.preco).toFixed(2)} | Potência: ${f.potencia_w}W`
            );
        }
    }

    return linhas.join('\n');
}

/**
 * Fix A — Monta o prompt completo enviado à Mistral.
 * Inclui alocação numérica por categoria para evitar que a IA gaste demais em uma peça.
 */
function _buildPrompt(orcamento, objetivo, estoque) {
    // Detecta tipo ANTES de filtrar para usar os caps corretos por tipo (Fix B v2)
    const tipo  = _detectarTipoBuild(objetivo);

    // Filtra catálogo por orçamento usando caps type-aware que somam ≤ 94%
    const estoqueFiltrado = _filtrarEstoquePorOrcamento(estoque, orcamento, tipo);
    const catalogo = _formatarCatalogo(estoqueFiltrado);

    const orcNum   = Number(orcamento);
    const minimo80 = (orcNum * 0.80).toFixed(2);
    const minimo75 = (orcNum * 0.75).toFixed(2);

    // Fix A: calcula alocação numérica por categoria
    const aloc  = _calcularAlocacao(orcamento, tipo);
    const tipoLabel = tipo === 'games' ? 'Games' : tipo === 'edicao' ? 'Edição/Render' : 'Uso Geral';

    const tabelaAlocacao = `
ALOCAÇÃO MÁXIMA POR PEÇA — ${tipoLabel} (baseada no seu orçamento de R$ ${orcamento})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${aloc.gpu  > 0 ? `  GPU:            máx R$ ${aloc.gpu.toFixed(2).padStart(8)}` : '  GPU:            não incluída (uso geral)'}
  CPU:            máx R$ ${aloc.cpu.toFixed(2).padStart(8)}
  Placa-Mãe:     máx R$ ${aloc.mobo.toFixed(2).padStart(8)}
  RAM:            máx R$ ${aloc.ram.toFixed(2).padStart(8)}
  Armazenamento:  máx R$ ${aloc.storage.toFixed(2).padStart(8)}
  Fonte:          máx R$ ${aloc.fonte.toFixed(2).padStart(8)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  TETO POR PEÇA: Não exceda os valores acima individualmente.
    Se escolher GPU mais cara, REDUZA a CPU proporcionalmente.
    A SOMA FINAL deve ser ≤ R$ ${orcamento}. Sem exceções.`;

    return `Você é um especialista sênior em montagem de PCs para o mercado brasileiro.
Sua missão: selecionar a MELHOR build possível, gastando o MÁXIMO do orçamento do cliente em desempenho.

═══════════════════════════════════════════
DADOS DO CLIENTE
═══════════════════════════════════════════
💰 ORÇAMENTO (TETO ABSOLUTO): R$ ${orcamento}
🎯 Objetivo: "${objetivo}"

${tabelaAlocacao}

═══════════════════════════════════════════
CATÁLOGO — USE APENAS ESTES IDs E PREÇOS
(Pré-filtrado para componentes compatíveis com seu orçamento)
═══════════════════════════════════════════
${catalogo}

═══════════════════════════════════════════
REGRAS — TODAS OBRIGATÓRIAS
═══════════════════════════════════════════

REGRA 1 — ORÇAMENTO É TETO ABSOLUTO:
• Total = soma dos preços de todos os componentes escolhidos
• Total DEVE ser ≤ R$ ${orcamento}. Sem exceções.
• Calcule o total ANTES de responder e confirme que cabe.

REGRA 2 — USE O MÁXIMO DO ORÇAMENTO (mínimo 80%):
• Total DEVE ser ≥ R$ ${minimo80} (80% do orçamento).
• Se não conseguir 80%, o MÍNIMO aceitável é R$ ${minimo75} (75%).
• NÃO entregue build barata se houver componentes melhores disponíveis no catálogo.
• Processo: montou a build → sobrou dinheiro → sobe a GPU ou CPU para a melhor opção disponível.
• Repita até o surplus ser menor que R$ 150 ou não haver upgrade possível.

REGRA 3 — REQUISITOS MÍNIMOS POR RESOLUÇÃO (GAMES):
• 4K de alta performance → GPU com Score ≥ 8.0 (ex: gpu_rtx3080, gpu_rx6800xt)
• 1440p / QHD         → GPU com Score ≥ 7.0
• 1080p alto          → GPU com Score ≥ 5.5
• Se o objetivo mencionar "4K" E "alta performance": Score mínimo 8.0 é OBRIGATÓRIO.

REGRA 4 — COMPATIBILIDADE OBRIGATÓRIA:
• Socket da CPU == Socket da Placa-Mãe
• Tipo de RAM == Tipo aceito pela Placa-Mãe (DDR4 ou DDR5)
• Fonte ≥ (TDP_CPU + TDP_GPU) × 1.3  (margem de 30%)
• Se sem GPU: Fonte ≥ TDP_CPU × 1.3

REGRA 5 — EQUILÍBRIO CPU × GPU (sem bottleneck):
• Diferença de score entre CPU e GPU deve ser ≤ 1.5 pontos
• GPU muito mais forte que CPU = CPU é gargalo = desperdício de dinheiro
• CPU muito mais forte que GPU = GPU é gargalo = idem

REGRA 6 — ESCOLHA POR CUSTO-BENEFÍCIO:
• Para CPU e GPU: prefira menor Custo/Score (R$/pt) dentro do budget alocado
• Dois componentes com score parecido? Escolha o mais barato.
• Respeite os tetos por peça definidos na tabela de alocação acima.

REGRA 7 — APENAS IDs DO CATÁLOGO:
• Copie os IDs exatamente (ex: "cpu_i5_12400f", "gpu_rtx3080")
• Use os preços exatamente como listados — não estime, não arredonde

═══════════════════════════════════════════
PROCESSO OBRIGATÓRIO (passo a passo)
═══════════════════════════════════════════
1. Identifique o objetivo (games / edição / geral)
2. Verifique se há menção a resolução (4K / 1440p / 1080p) → defina score mínimo da GPU
3. Consulte a tabela de alocação acima → GPU máx R$ ${aloc.gpu}, CPU máx R$ ${aloc.cpu}
4. Escolha GPU com menor Custo/Score dentro de R$ ${aloc.gpu} e com score mínimo exigido
5. Escolha CPU com score próximo da GPU, socket adequado, dentro de R$ ${aloc.cpu}
6. Escolha Placa-Mãe com mesmo socket da CPU, dentro de R$ ${aloc.mobo}
7. Escolha RAM compatível com a Placa-Mãe, dentro de R$ ${aloc.ram}
8. Escolha Armazenamento (NVMe para games/edição), dentro de R$ ${aloc.storage}
9. Escolha Fonte: (TDP_CPU + TDP_GPU) × 1.3 → menor fonte que atende, dentro de R$ ${aloc.fonte}
10. Some os preços MANUALMENTE usando os valores do catálogo → confirme ≤ R$ ${orcamento}
11. Se total < 80% do orçamento (< R$ ${minimo80}), suba a GPU ou CPU para a melhor disponível
12. Confirme: total ≤ R$ ${orcamento} E total ≥ R$ ${minimo75}

═══════════════════════════════════════════
FORMATO (JSON puro — sem markdown, sem texto fora)
═══════════════════════════════════════════
{
  "raciocinio": "Explique: objetivo identificado, GPU escolhida e por quê (score, Custo/Score), soma dos preços passo a passo, quanto do orçamento foi usado",
  "componentes": {
    "cpu":     "ID_EXATO",
    "mobo":    "ID_EXATO",
    "ram":     "ID_EXATO",
    "gpu":     "ID_EXATO_ou_null",
    "storage": "ID_EXATO",
    "fonte":   "ID_EXATO"
  },
  "total": 0000.00,
  "justificativas": {
    "cpu":     "Por que este processador foi escolhido — foco na função e no objetivo (1-2 frases, SEM citar o nome do produto nem o preço)",
    "mobo":    "Por que esta placa-mãe (1 frase)",
    "ram":     "Por que esta memória — capacidade e velocidade (1 frase)",
    "gpu":     "Por que esta GPU — resolução alvo e desempenho esperado (1-2 frases, SEM citar nome do produto nem preço)",
    "storage": "Por que este armazenamento — tipo e capacidade (1 frase)",
    "fonte":   "Por que esta fonte — potência e margem de segurança (1 frase)",
    "resumo":  "Como esta build atende ao objetivo do cliente e por que é a melhor escolha neste orçamento (2-3 frases)"
  }
}

Regras das justificativas:
- PROIBIDO citar nomes de produtos (ex: 'RTX 3070', 'Ryzen 5 5600') — o sistema exibe automaticamente
- PROIBIDO mencionar preços, R$, totais
- Foco em POR QUÊ a peça foi escolhida: função, desempenho esperado, compatibilidade com o objetivo`;
}

// ─── Envio para a API ────────────────────────────────────────────────────────

async function consultarIA(orcamento, objetivo, estoque) {
    const url    = '/api/gemini';
    const prompt = _buildPrompt(orcamento, objetivo, estoque);

    const resposta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
        throw new Error(dados.error?.message || 'Erro desconhecido na API.');
    }

    const textoGerado = dados.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textoGerado) throw new Error('A IA não retornou nenhuma resposta.');

    return textoGerado;
}

// ─── Parse da resposta ───────────────────────────────────────────────────────

/**
 * Faz o parse da resposta da IA.
 * Tenta JSON (novo formato) primeiro; fallback para delimitadores legados.
 */
function parseRespostaIA(texto) {
    // Limpar markdown
    const textoLimpo = texto
        .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    // Tentar JSON moderno
    try {
        const parsed = JSON.parse(textoLimpo);

        if (parsed.componentes && typeof parsed.componentes === 'object') {
            const c   = parsed.componentes;
            const ids = {
                cpu:     c.cpu     || null,
                gpu:     (c.gpu === 'null' || !c.gpu) ? null : c.gpu,
                mobo:    c.mobo    || null,
                ram:     c.ram     || null,
                fonte:   c.fonte   || null,
                storage: c.storage || null,
            };
            const justificativas = parsed.justificativas || {};
            const raciocinio     = parsed.raciocinio     || '';
            return { ids, justificativas, raciocinio };
        }
    } catch (_) { /* não é JSON válido */ }

    // Fallback legado — resposta fora do formato esperado
    console.warn('[AI] Resposta fora do formato JSON. Usando fallback mínimo.');
    const ids = { cpu: null, gpu: null, mobo: null, ram: null, fonte: null, storage: null };
    return { ids, justificativas: {}, raciocinio: '' };
}
