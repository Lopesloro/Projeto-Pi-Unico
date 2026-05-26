// ============================================
// AI.JS - Comunicação com a API (via proxy backend /api/gemini → Mistral)
// ============================================

/**
 * Formata o catálogo de componentes em texto estruturado para o prompt.
 * Inclui todos os dados técnicos relevantes para a IA tomar decisões.
 */
function _formatarCatalogo(estoque) {
    const linhas = [];

    if (estoque.processadores?.length) {
        linhas.push('── PROCESSADORES ──');
        for (const p of estoque.processadores) {
            linhas.push(
                `  ID: ${p.id} | ${p.nome} | R$ ${Number(p.preco).toFixed(2)}` +
                ` | Socket: ${p.socket} | TDP: ${p.tdp_w}W` +
                ` | Vídeo Integrado: ${p.video_integrado ? 'SIM' : 'NÃO'} | Score: ${p.score}`
            );
        }
    }

    if (estoque.placas_mae?.length) {
        linhas.push('\n── PLACAS-MÃE ──');
        for (const m of estoque.placas_mae) {
            linhas.push(
                `  ID: ${m.id} | ${m.nome} | R$ ${Number(m.preco).toFixed(2)}` +
                ` | Socket: ${m.socket} | Aceita: ${m.tipo_memoria}`
            );
        }
    }

    if (estoque.memorias?.length) {
        linhas.push('\n── MEMÓRIAS RAM ──');
        for (const r of estoque.memorias) {
            linhas.push(
                `  ID: ${r.id} | ${r.nome} | R$ ${Number(r.preco).toFixed(2)}` +
                ` | Tipo: ${r.tipo} | Capacidade: ${r.capacidade_gb}GB`
            );
        }
    }

    if (estoque.placas_video?.length) {
        linhas.push('\n── PLACAS DE VÍDEO ──');
        for (const g of estoque.placas_video) {
            linhas.push(
                `  ID: ${g.id} | ${g.nome} | R$ ${Number(g.preco).toFixed(2)}` +
                ` | TDP: ${g.tdp_w}W | Score: ${g.score}`
            );
        }
    }

    if (estoque.armazenamento?.length) {
        linhas.push('\n── ARMAZENAMENTO ──');
        for (const s of estoque.armazenamento) {
            linhas.push(
                `  ID: ${s.id} | ${s.nome} | R$ ${Number(s.preco).toFixed(2)}`
            );
        }
    }

    if (estoque.fontes?.length) {
        linhas.push('\n── FONTES ──');
        for (const f of estoque.fontes) {
            linhas.push(
                `  ID: ${f.id} | ${f.nome} | R$ ${Number(f.preco).toFixed(2)}` +
                ` | Potência: ${f.potencia_w}W`
            );
        }
    }

    return linhas.join('\n');
}

/**
 * Monta o prompt para a IA com todas as regras e o catálogo completo.
 */
function _buildPrompt(orcamento, objetivo, estoque) {
    const catalogo = _formatarCatalogo(estoque);

    return `Você é um especialista sênior em montagem de PCs para o mercado brasileiro.
Sua missão: selecionar a MELHOR build possível para o cliente, respeitando o orçamento e maximizando o desempenho para o objetivo informado.

═══════════════════════════════════════════
DADOS DO CLIENTE
═══════════════════════════════════════════
💰 ORÇAMENTO MÁXIMO (TETO ABSOLUTO): R$ ${orcamento}
🎯 Objetivo / Uso: "${objetivo}"

═══════════════════════════════════════════
CATÁLOGO DE COMPONENTES DISPONÍVEIS
(Use APENAS estes IDs — não invente nenhum)
═══════════════════════════════════════════
${catalogo}

═══════════════════════════════════════════
REGRAS OBRIGATÓRIAS
═══════════════════════════════════════════

REGRA 1 — ORÇAMENTO É TETO ABSOLUTO:
• Total = preco_cpu + preco_mobo + preco_ram + preco_storage + preco_fonte + preco_gpu (se houver)
• Esse total DEVE ser ≤ R$ ${orcamento}. Sem exceções.
• Se não couber GPU dedicada, use CPU com Vídeo Integrado = SIM e defina gpu como null.

REGRA 2 — MAXIMIZE O ORÇAMENTO (use 85-100% do teto):
Priorize o componente que mais impacta o objetivo:
• "Games" / "Jogos": GPU de maior score possível + CPU equilibrada + RAM ≥ 16 GB
• "Edição de vídeo" / "Streaming" / "Render" / "3D": CPU com muitos núcleos + RAM 16-32 GB + SSD NVMe rápido
• "Programação" / "Uso geral" / "Escritório" / "Estudo": CPU equilibrada (preferencialmente com vídeo integrado) + SSD; GPU opcional
• Budget apertado: remova GPU dedicada e use CPU com Vídeo Integrado = SIM

REGRA 3 — COMPATIBILIDADE OBRIGATÓRIA:
• Socket da CPU == Socket da Placa-Mãe (ex: AM4 ↔ AM4, LGA1700 ↔ LGA1700)
• Tipo de RAM == Tipo aceito pela Placa-Mãe (DDR4 ou DDR5)
• Potência da Fonte ≥ (TDP_CPU + TDP_GPU) × 1.3   [margem de segurança de 30%]
• Se sem GPU: Fonte ≥ TDP_CPU × 1.3

REGRA 4 — EQUILÍBRIO CPU × GPU (evite bottleneck):
• Fórmula de bottleneck: ((score_gpu − score_cpu) / score_gpu) × 100
• Se resultado > 30% → gargalo severo → escolha CPU com score mais próximo da GPU
• Se resultado > 20% → gargalo moderado → tente ajustar
• Alvo ideal: diferença de score ≤ 1.5 pontos entre CPU e GPU

REGRA 5 — USE APENAS IDs DO CATÁLOGO:
• Copie os IDs exatamente como aparecem acima (ex: "cpu_i5_12400f", "gpu_rtx3060")
• NÃO arredonde nem estime preços — use exatamente os valores listados

═══════════════════════════════════════════
PROCESSO DE RACIOCÍNIO (siga passo a passo)
═══════════════════════════════════════════
1. Classifique o objetivo do cliente (games / edição / geral / etc.)
2. Identifique o componente principal a priorizar
3. Aloque o budget: reserve verba para componente principal, depois distribua o restante
4. Escolha CPU e Placa-Mãe com socket compatível
5. Escolha RAM compatível com a Placa-Mãe (DDR4 ou DDR5)
6. Escolha GPU (se couber e for útil); verifique bottleneck com a CPU
7. Escolha Armazenamento (prefira NVMe para games/edição)
8. Escolha Fonte: calcule TDP total × 1.3 e selecione a menor fonte suficiente
9. Some todos os preços → confirme que total ≤ R$ ${orcamento}
10. Se estourar, troque pelo item mais barato compatível e recalcule

═══════════════════════════════════════════
FORMATO DE RESPOSTA (JSON puro — sem markdown, sem texto fora do JSON)
═══════════════════════════════════════════
{
  "raciocinio": "Resumo em 2-3 frases do processo de seleção e trade-offs feitos",
  "componentes": {
    "cpu":     "ID_EXATO_DO_PROCESSADOR",
    "mobo":    "ID_EXATO_DA_PLACA_MAE",
    "ram":     "ID_EXATO_DA_MEMORIA",
    "gpu":     "ID_EXATO_DA_GPU_ou_null",
    "storage": "ID_EXATO_DO_ARMAZENAMENTO",
    "fonte":   "ID_EXATO_DA_FONTE"
  },
  "total": 0000.00,
  "economia": 000.00,
  "html": "<h3>Processador</h3><p><strong>NOME</strong> — JUSTIFICATIVA TÉCNICA SEM MENCIONAR PREÇO</p><h3>Placa-Mãe</h3><p>...</p><h3>Memória RAM</h3><p>...</p><h3>Placa de Vídeo</h3><p>...</p><h3>Armazenamento</h3><p>...</p><h3>Fonte</h3><p>...</p><p>RESUMO GERAL: como a build atende ao objetivo do cliente.</p>"
}

Regras do campo "html":
- Tags permitidas: h3, p, strong, ul, li
- PROIBIDO citar valores em reais, "R$", totais ou preços — o sistema calcula e exibe automaticamente
- Foque em justificativa TÉCNICA: por que essa peça é a melhor escolha para o objetivo
- Se gpu = null: em h3 "Placa de Vídeo" explique que o vídeo integrado da CPU é suficiente para o uso`;
}

/**
 * Envia o prompt para a IA via proxy e retorna o texto gerado.
 */
async function consultarIA(orcamento, objetivo, estoque) {
    const url = '/api/gemini';
    const prompt = _buildPrompt(orcamento, objetivo, estoque);

    const resposta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
        const mensagemErro = dados.error?.message || 'Erro desconhecido na API.';
        throw new Error(mensagemErro);
    }

    const textoGerado = dados.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textoGerado) throw new Error('A IA não retornou nenhuma resposta.');

    return textoGerado;
}

/**
 * Faz o parse da resposta da IA.
 * Tenta JSON (novo formato) primeiro; cai no formato legado ##COMPONENTES## se necessário.
 */
function parseRespostaIA(texto) {
    // 1) Limpar possíveis blocos markdown
    const textoLimpo = texto
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    // 2) Tentar parse JSON (novo formato)
    try {
        const parsed = JSON.parse(textoLimpo);

        if (parsed.componentes && typeof parsed.componentes === 'object') {
            const c = parsed.componentes;
            const ids = {
                cpu:     c.cpu     || null,
                gpu:     (c.gpu === 'null' || !c.gpu) ? null : c.gpu,
                mobo:    c.mobo    || null,
                ram:     c.ram     || null,
                fonte:   c.fonte   || null,
                storage: c.storage || null,
            };
            const html = (parsed.html || '').replace(/```html?\s*/gi, '').replace(/```\s*/gi, '').trim();
            return { ids, html };
        }
    } catch (_) {
        // Não é JSON válido — tentar formato legado
    }

    // 3) Fallback: formato legado com delimitadores ##COMPONENTES## / ##HTML## / ##FIM##
    console.warn('[AI] Resposta fora do formato JSON. Tentando parse legado...');

    const idsMatch  = texto.match(/##COMPONENTES##\s*([\s\S]*?)\s*##HTML##/);
    const htmlMatch = texto.match(/##HTML##\s*([\s\S]*?)\s*##FIM##/);

    const ids = { cpu: null, gpu: null, mobo: null, ram: null, fonte: null, storage: null };

    if (idsMatch) {
        idsMatch[1].trim().split(',').forEach(part => {
            const sepIdx = part.indexOf(':');
            if (sepIdx === -1) return;
            const key   = part.slice(0, sepIdx).trim();
            const value = part.slice(sepIdx + 1).trim();
            if (key in ids) ids[key] = (value === 'null' || !value) ? null : value;
        });
    }

    let html = htmlMatch
        ? htmlMatch[1].trim()
        : texto.replace(/##COMPONENTES##[\s\S]*?##HTML##/g, '').replace(/##FIM##/g, '').trim();

    html = html.replace(/```html?\s*/gi, '').replace(/```\s*/gi, '').trim();

    return { ids, html };
}
