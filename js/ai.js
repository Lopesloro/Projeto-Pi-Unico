// ============================================
// AI.JS - Comunicação com a API (via proxy backend /api/gemini → Mistral)
// ============================================

/**
 * Formata o catálogo completo com dados técnicos + custo-benefício calculado.
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
 * Monta o prompt completo enviado à Mistral.
 */
function _buildPrompt(orcamento, objetivo, estoque) {
    const catalogo = _formatarCatalogo(estoque);
    const orcNum   = Number(orcamento);

    // Thresholds de uso do budget (usados nas regras abaixo)
    const minimo95  = (orcNum * 0.95).toFixed(2);
    const minimo85  = (orcNum * 0.85).toFixed(2);

    return `Você é um especialista sênior em montagem de PCs para o mercado brasileiro.
Sua missão: selecionar a MELHOR build possível, gastando o MÁXIMO do orçamento do cliente em desempenho.

═══════════════════════════════════════════
DADOS DO CLIENTE
═══════════════════════════════════════════
💰 ORÇAMENTO (TETO ABSOLUTO): R$ ${orcamento}
🎯 Objetivo: "${objetivo}"

═══════════════════════════════════════════
CATÁLOGO — USE APENAS ESTES IDs E PREÇOS
═══════════════════════════════════════════
${catalogo}

═══════════════════════════════════════════
REGRAS — TODAS OBRIGATÓRIAS
═══════════════════════════════════════════

REGRA 1 — ORÇAMENTO É TETO ABSOLUTO:
• Total = soma dos preços de todos os componentes escolhidos
• Total DEVE ser ≤ R$ ${orcamento}. Sem exceções.
• Calcule o total ANTES de responder e confirme que cabe.

REGRA 2 — USE O MÁXIMO DO ORÇAMENTO (mínimo 92%):
• Total DEVE ser ≥ R$ ${minimo95} (95% do orçamento).
• Se não conseguir 95%, o MÍNIMO aceitável é R$ ${minimo85} (85%).
• NÃO entregue build barata se houver componentes melhores disponíveis no catálogo.
• Processo obrigatório: montou a build → sobrou dinheiro → sobe a peça mais impactante.
• Repita até o surplus ser menor que R$ 200 ou não haver upgrade possível.

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
• Distribuição do orçamento por objetivo:
  → Games:          GPU 45-55% | CPU 18-22% | Mobo 10-14% | RAM 8-10% | Storage 5-7% | Fonte 6-8%
  → Edição/Render:  CPU 28-33% | RAM 15-20% | GPU 20-25% | Mobo 10-14% | Storage 8-10% | Fonte 5-7%
  → Uso geral:      CPU 28-33% | Mobo 13-16% | RAM 10-13% | Storage 8-10% | Fonte 6-8% | GPU 0%

REGRA 7 — APENAS IDs DO CATÁLOGO:
• Copie os IDs exatamente (ex: "cpu_i5_12400f", "gpu_rtx3080")
• Use os preços exatamente como listados — não estime, não arredonde

═══════════════════════════════════════════
PROCESSO OBRIGATÓRIO (passo a passo)
═══════════════════════════════════════════
1. Identifique o objetivo (games / edição / geral)
2. Verifique se há menção a resolução (4K / 1440p / 1080p) → defina score mínimo da GPU
3. Calcule o budget para GPU (45-55% se games, 20-25% se edição)
4. Escolha GPU com menor Custo/Score dentro desse budget e com score mínimo exigido
5. Escolha CPU com score próximo da GPU e socket adequado
6. Escolha Placa-Mãe com mesmo socket da CPU
7. Escolha RAM compatível com a Placa-Mãe
8. Escolha Armazenamento (NVMe para games/edição)
9. Escolha Fonte: (TDP_CPU + TDP_GPU) × 1.3 → menor fonte que atende
10. Some os preços → se total < 92% do orçamento, FAÇA UPGRADE na GPU ou CPU
11. Confirme: total ≤ R$ ${orcamento} E total ≥ R$ ${minimo85}

═══════════════════════════════════════════
FORMATO (JSON puro — sem markdown, sem texto fora)
═══════════════════════════════════════════
{
  "raciocinio": "Explique: objetivo identificado, GPU escolhida e por quê (score, Custo/Score), como chegou ao total, quanto do orçamento foi usado",
  "componentes": {
    "cpu":     "ID_EXATO",
    "mobo":    "ID_EXATO",
    "ram":     "ID_EXATO",
    "gpu":     "ID_EXATO_ou_null",
    "storage": "ID_EXATO",
    "fonte":   "ID_EXATO"
  },
  "total": 0000.00,
  "economia": 000.00,
  "html": "<h3>Processador</h3><p><strong>NOME</strong> — JUSTIFICATIVA TÉCNICA (sem mencionar preço)</p><h3>Placa-Mãe</h3><p>...</p><h3>Memória RAM</h3><p>...</p><h3>Placa de Vídeo</h3><p>...</p><h3>Armazenamento</h3><p>...</p><h3>Fonte</h3><p>...</p><p>RESUMO: como esta build atende ao objetivo e por que é a melhor escolha neste orçamento.</p>"
}

Regras do HTML:
- Tags permitidas: h3, p, strong, ul, li
- PROIBIDO mencionar preços, R$, totais — o sistema exibe os valores automaticamente
- Foco: justificativa TÉCNICA de cada escolha e como as peças se complementam`;
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
            const html       = (parsed.html || '').replace(/```html?\s*/gi, '').replace(/```\s*/gi, '').trim();
            const raciocinio = parsed.raciocinio || '';
            return { ids, html, raciocinio };
        }
    } catch (_) { /* não é JSON válido */ }

    // Fallback legado
    console.warn('[AI] Resposta fora do formato JSON. Tentando parse legado...');
    const idsMatch  = texto.match(/##COMPONENTES##\s*([\s\S]*?)\s*##HTML##/);
    const htmlMatch = texto.match(/##HTML##\s*([\s\S]*?)\s*##FIM##/);
    const ids = { cpu: null, gpu: null, mobo: null, ram: null, fonte: null, storage: null };

    if (idsMatch) {
        idsMatch[1].trim().split(',').forEach(part => {
            const sep = part.indexOf(':');
            if (sep === -1) return;
            const key   = part.slice(0, sep).trim();
            const value = part.slice(sep + 1).trim();
            if (key in ids) ids[key] = (value === 'null' || !value) ? null : value;
        });
    }

    let html = htmlMatch
        ? htmlMatch[1].trim()
        : texto.replace(/##COMPONENTES##[\s\S]*?##HTML##/g, '').replace(/##FIM##/g, '').trim();
    html = html.replace(/```html?\s*/gi, '').replace(/```\s*/gi, '').trim();

    return { ids, html, raciocinio: '' };
}
