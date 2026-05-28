// ============================================
// BUDGET-ENFORCER.JS
// Garante que NENHUMA build entregue ultrapasse o orçamento.
// Também MAXIMIZA o uso do orçamento — sobe peças quando sobra dinheiro.
// ============================================

const CATEGORIAS_ENFORCER = [
    { key: 'cpu',     campo: 'processadores',  obrigatorio: true  },
    { key: 'mobo',    campo: 'placas_mae',     obrigatorio: true  },
    { key: 'ram',     campo: 'memorias',       obrigatorio: true  },
    { key: 'storage', campo: 'armazenamento',  obrigatorio: true  },
    { key: 'fonte',   campo: 'fontes',         obrigatorio: true  },
    { key: 'gpu',     campo: 'placas_video',   obrigatorio: false }
];

// Ordem de downgrade quando estoura — GPU primeiro
const ORDEM_DOWNGRADE = ['gpu', 'cpu', 'storage', 'ram', 'fonte', 'mobo'];

// Ordem de upgrade quando sobra — GPU primeiro (maior impacto)
const ORDEM_UPGRADE = ['gpu', 'cpu', 'ram', 'storage', 'fonte', 'mobo'];

// ─── Helpers ────────────────────────────────────────────────────────────────

function _resolverPeca(estoque, key, id) {
    if (!id || id === 'null') return null;
    const cat = CATEGORIAS_ENFORCER.find(c => c.key === key);
    if (!cat) return null;
    return estoque[cat.campo]?.find(p => p.id === id) || null;
}

function _calcularTotal(ids, estoque) {
    let total = 0;
    for (const cat of CATEGORIAS_ENFORCER) {
        const peca = _resolverPeca(estoque, cat.key, ids[cat.key]);
        if (peca) total += Number(peca.preco) || 0;
    }
    return total;
}

function _compatBuild(ids, estoque) {
    const cpu   = _resolverPeca(estoque, 'cpu',   ids.cpu);
    const gpu   = _resolverPeca(estoque, 'gpu',   ids.gpu);
    const mobo  = _resolverPeca(estoque, 'mobo',  ids.mobo);
    const ram   = _resolverPeca(estoque, 'ram',   ids.ram);
    const fonte = _resolverPeca(estoque, 'fonte', ids.fonte);

    if (!cpu || !mobo || !ram || !fonte) return false;
    if (cpu.socket !== mobo.socket) return false;
    if (ram.tipo !== mobo.tipo_memoria) return false;
    if (!gpu && !cpu.video_integrado) return false;

    const tdp = (cpu.tdp_w || 0) + (gpu?.tdp_w || 0);
    if (fonte.potencia_w < Math.ceil(tdp * 1.3)) return false;

    return true;
}

// ─── Downgrade ──────────────────────────────────────────────────────────────

function _downgradeComponente(ids, estoque, key) {
    const cat = CATEGORIAS_ENFORCER.find(c => c.key === key);
    if (!cat) return false;

    const atual = _resolverPeca(estoque, key, ids[key]);
    const precoAtual = atual ? (Number(atual.preco) || 0) : Infinity;

    const candidatos = [...(estoque[cat.campo] || [])]
        .filter(p => (Number(p.preco) || 0) < precoAtual)
        .sort((a, b) => (b.preco || 0) - (a.preco || 0));

    for (const cand of candidatos) {
        const idsTeste = { ...ids, [key]: cand.id };
        if (_compatBuild(idsTeste, estoque)) {
            ids[key] = cand.id;
            return true;
        }
    }

    // GPU pode ser removida se CPU tem vídeo integrado
    if (key === 'gpu' && atual) {
        const idsTeste = { ...ids, gpu: null };
        if (_compatBuild(idsTeste, estoque)) {
            ids.gpu = null;
            return true;
        }
    }

    return false;
}

// ─── Upgrade (NOVO) ─────────────────────────────────────────────────────────

/**
 * Tenta trocar UM componente por outro MELHOR que ainda caiba no orçamento.
 * Prioriza a maior melhoria possível dentro do surplus disponível.
 */
function _upgradeComponente(ids, estoque, key, limite) {
    const cat = CATEGORIAS_ENFORCER.find(c => c.key === key);
    if (!cat) return false;

    const total   = _calcularTotal(ids, estoque);
    const surplus = limite - total;
    if (surplus < 50) return false; // margem mínima para tentar upgrade

    const atual     = _resolverPeca(estoque, key, ids[key]);
    const precoAtual = atual ? (Number(atual.preco) || 0) : 0;

    // Candidatos: mais caros que o atual, dentro do surplus disponível
    // GPU e CPU: ordena por melhor score primeiro (empate → mais barato)
    // Demais: ordena pelo mais caro que cabe (melhor custo-benefício por preço)
    const usarScore = (key === 'gpu' || key === 'cpu');
    const candidatos = [...(estoque[cat.campo] || [])]
        .filter(p => {
            const preco = Number(p.preco) || 0;
            if (preco <= precoAtual || (preco - precoAtual) > surplus) return false;
            // GPU/CPU: só promove se o score for ESTRITAMENTE maior — evita trocas laterais
            if (usarScore && p.score != null && atual?.score != null) {
                return p.score > atual.score;
            }
            return true;
        })
        .sort((a, b) => {
            if (usarScore && a.score != null && b.score != null) {
                if (b.score !== a.score) return b.score - a.score;  // maior score primeiro
                return (a.preco || 0) - (b.preco || 0);             // empate: mais barato
            }
            return (b.preco || 0) - (a.preco || 0);                 // mais caro primeiro
        });

    for (const cand of candidatos) {
        const idsTeste  = { ...ids, [key]: cand.id };
        const novoTotal = _calcularTotal(idsTeste, estoque);
        if (novoTotal <= limite && _compatBuild(idsTeste, estoque)) {
            ids[key] = cand.id;
            return true;
        }
    }

    // Se não há GPU e a CPU tem vídeo integrado, tenta adicionar uma GPU com o surplus
    if (key === 'gpu' && !ids.gpu) {
        const gpus = [...(estoque.placas_video || [])]
            .filter(g => (Number(g.preco) || 0) <= surplus)
            .sort((a, b) => (b.preco || 0) - (a.preco || 0));

        for (const g of gpus) {
            const idsTeste  = { ...ids, gpu: g.id };
            const novoTotal = _calcularTotal(idsTeste, estoque);
            if (novoTotal <= limite && _compatBuild(idsTeste, estoque)) {
                ids.gpu = g.id;
                return true;
            }
        }
    }

    return false;
}

/**
 * Maximiza o uso do orçamento fazendo upgrades iterativos.
 * Para quando surplus < 5% do orçamento ou não houver mais upgrades possíveis.
 */
function _maximizarOrcamento(ids, estoque, limite) {
    const MARGEM_OK = 0.05; // 5% de surplus é aceitável
    let melhorou    = true;
    let iteracoes   = 0;
    const MAX_ITER  = 25;

    while (melhorou && iteracoes < MAX_ITER) {
        melhorou  = false;
        iteracoes++;

        const total   = _calcularTotal(ids, estoque);
        const surplus = limite - total;

        if (surplus / limite <= MARGEM_OK) break; // ≥ 95% usado — está ótimo

        for (const key of ORDEM_UPGRADE) {
            if (_upgradeComponente(ids, estoque, key, limite)) {
                melhorou = true;
                break; // reinicia loop com novo estado
            }
        }
    }

    return ids;
}

// ─── Fallback mínimo viável ──────────────────────────────────────────────────

function _buildMinimoViavel(estoque, orcamento) {
    const cpus = [...(estoque.processadores || [])]
        .filter(c => c.video_integrado)
        .sort((a, b) => a.preco - b.preco);

    for (const cpu of cpus) {
        const mobos = [...(estoque.placas_mae || [])]
            .filter(m => m.socket === cpu.socket)
            .sort((a, b) => a.preco - b.preco);

        for (const mobo of mobos) {
            const rams = [...(estoque.memorias || [])]
                .filter(r => r.tipo === mobo.tipo_memoria)
                .sort((a, b) => a.preco - b.preco);
            const ram = rams[0];
            if (!ram) continue;

            const storage = [...(estoque.armazenamento || [])]
                .sort((a, b) => a.preco - b.preco)[0];
            if (!storage) continue;

            const tdpMin = Math.ceil((cpu.tdp_w || 65) * 1.3);
            const fonte  = [...(estoque.fontes || [])]
                .filter(f => f.potencia_w >= tdpMin)
                .sort((a, b) => a.preco - b.preco)[0];
            if (!fonte) continue;

            const total = cpu.preco + mobo.preco + ram.preco + storage.preco + fonte.preco;
            if (total <= orcamento) {
                return { cpu: cpu.id, mobo: mobo.id, ram: ram.id,
                         storage: storage.id, fonte: fonte.id, gpu: null };
            }
        }
    }
    return null;
}

// ─── Função principal ────────────────────────────────────────────────────────

/**
 * 1. Downgrade se o total estourou o orçamento
 * 2. Downsize da fonte se superdimensionada (libera budget para GPU/CPU/RAM)
 * 3. Upgrade iterativo para maximizar o uso do orçamento (GPU/CPU por score)
 * Retorna { ids, total, ajustado, dentroOrcamento, mensagem }.
 */
function aplicarLimiteOrcamento(idsOriginais, estoque, orcamento) {
    const limite = Number(orcamento);
    if (!limite || limite <= 0) {
        return {
            ids: { ...idsOriginais },
            total: _calcularTotal(idsOriginais, estoque),
            ajustado: false, dentroOrcamento: true,
            mensagem: 'Orçamento não informado — sem limite aplicado.'
        };
    }

    let ids            = { ...idsOriginais };
    let total          = _calcularTotal(ids, estoque);
    let foiDowngradado = false; // true SOMENTE quando Fase 1 trocou peças por versões piores

    // ── FASE 1: Downgrade se estourou ────────────────────────────────────────
    if (total > limite) {
        const MAX_DOWN = 30;
        let tentativa  = 0;

        while (total > limite && tentativa < MAX_DOWN) {
            tentativa++;
            let trocou = false;
            for (const key of ORDEM_DOWNGRADE) {
                if (_downgradeComponente(ids, estoque, key)) {
                    trocou         = true;
                    foiDowngradado = true;
                    total          = _calcularTotal(ids, estoque);
                    if (total <= limite) break;
                }
            }
            if (!trocou) break;
        }

        if (total > limite) {
            const fallback = _buildMinimoViavel(estoque, limite);
            if (fallback) {
                ids   = fallback;
                total = _calcularTotal(ids, estoque);
                ids   = _maximizarOrcamento(ids, estoque, limite);
                total = _calcularTotal(ids, estoque);
                const pctFb = ((total / limite) * 100).toFixed(1);
                return {
                    ids, total,
                    ajustado: true,
                    catalogoMaximizado: false,
                    dentroOrcamento: true,
                    mensagem: `Build ajustada para caber no orçamento. Total: R$ ${total.toFixed(2)} de R$ ${limite.toFixed(2)} (${pctFb}%).`
                };
            }
            return {
                ids, total,
                ajustado: true,
                catalogoMaximizado: false,
                dentroOrcamento: false,
                mensagem: `Não foi possível montar uma build dentro de R$ ${limite.toFixed(2)}. Aumente o orçamento.`
            };
        }
    }

    // ── FASE 3: Upgrade — maximiza uso do orçamento ──────────────────────────
    // Seguro de rodar: o HTML da Seção 1 é gerado de enforce.ids em main.js,
    // então upgrades aqui são refletidos igualmente em TODAS as seções.
    ids   = _maximizarOrcamento(ids, estoque, limite);
    total = _calcularTotal(ids, estoque);

    const pct              = ((total / limite) * 100).toFixed(1);
    const catalogoMaximizado = Number(pct) < 70; // orçamento excede o que o catálogo pode oferecer

    let mensagem;
    if (catalogoMaximizado) {
        mensagem = `Melhores peças disponíveis: R$ ${total.toFixed(2)} de R$ ${limite.toFixed(2)} (${pct}% do orçamento). O catálogo foi totalmente maximizado.`;
    } else if (foiDowngradado) {
        mensagem = `Build ajustada para caber no orçamento. Total: R$ ${total.toFixed(2)} de R$ ${limite.toFixed(2)} (${pct}%).`;
    } else {
        mensagem = `Build confirmada: R$ ${total.toFixed(2)} de R$ ${limite.toFixed(2)} (${pct}% do orçamento).`;
    }

    return { ids, total, ajustado: foiDowngradado, catalogoMaximizado, dentroOrcamento: total <= limite, mensagem };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { aplicarLimiteOrcamento };
}
