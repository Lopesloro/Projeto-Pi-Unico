// ============================================
// BUDGET-ENFORCER.JS
// Garante que NENHUMA build entregue ultrapasse o orçamento do cliente.
// Roda no front após a IA responder; também serve de defesa final
// na tela de resultado.
// ============================================

const CATEGORIAS_ENFORCER = [
    { key: 'cpu',     campo: 'processadores',  obrigatorio: true  },
    { key: 'mobo',    campo: 'placas_mae',     obrigatorio: true  },
    { key: 'ram',     campo: 'memorias',       obrigatorio: true  },
    { key: 'storage', campo: 'armazenamento',  obrigatorio: true  },
    { key: 'fonte',   campo: 'fontes',         obrigatorio: true  },
    { key: 'gpu',     campo: 'placas_video',   obrigatorio: false }
];

// Ordem de downgrade quando estoura o orçamento — GPU primeiro (maior impacto)
const ORDEM_DOWNGRADE = ['gpu', 'cpu', 'storage', 'ram', 'fonte', 'mobo'];

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
    const minimo = Math.ceil(tdp * 1.2);
    if (fonte.potencia_w < minimo) return false;

    return true;
}

// Tenta trocar UM componente por outro mais barato, mantendo compatibilidade.
function _downgradeComponente(ids, estoque, key) {
    const cat = CATEGORIAS_ENFORCER.find(c => c.key === key);
    if (!cat) return false;

    const atual = _resolverPeca(estoque, key, ids[key]);
    const precoAtual = atual ? (Number(atual.preco) || 0) : Infinity;

    // Para GPU não-obrigatória, considera a opção "remover" como mais barata
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

    // GPU pode ser removida se a CPU tem vídeo integrado
    if (key === 'gpu' && atual) {
        const idsTeste = { ...ids, gpu: null };
        if (_compatBuild(idsTeste, estoque)) {
            ids.gpu = null;
            return true;
        }
    }

    return false;
}

// Constrói um fallback mínimo viável dentro do orçamento (last resort)
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

            const tdpMin = Math.ceil((cpu.tdp_w || 65) * 1.2);
            const fonte = [...(estoque.fontes || [])]
                .filter(f => f.potencia_w >= tdpMin)
                .sort((a, b) => a.preco - b.preco)[0];
            if (!fonte) continue;

            const total = cpu.preco + mobo.preco + ram.preco + storage.preco + fonte.preco;
            if (total <= orcamento) {
                return {
                    cpu: cpu.id, mobo: mobo.id, ram: ram.id,
                    storage: storage.id, fonte: fonte.id, gpu: null
                };
            }
        }
    }
    return null;
}

/**
 * Garante que a build NÃO ultrapasse o orçamento informado pelo cliente.
 * Retorna { ids, total, ajustado, dentroOrcamento, mensagem }.
 */
function aplicarLimiteOrcamento(idsOriginais, estoque, orcamento) {
    const limite = Number(orcamento);
    if (!limite || limite <= 0) {
        return {
            ids: { ...idsOriginais },
            total: _calcularTotal(idsOriginais, estoque),
            ajustado: false,
            dentroOrcamento: true,
            mensagem: 'Orçamento não informado — sem limite aplicado.'
        };
    }

    let ids = { ...idsOriginais };
    let total = _calcularTotal(ids, estoque);

    if (total <= limite) {
        return { ids, total, ajustado: false, dentroOrcamento: true,
                 mensagem: `Build dentro do orçamento (R$ ${total.toFixed(2)} de R$ ${limite.toFixed(2)}).` };
    }

    let ajustado = false;
    const MAX_TENTATIVAS = 30;
    let tentativa = 0;

    while (total > limite && tentativa < MAX_TENTATIVAS) {
        tentativa++;
        let trocou = false;
        for (const key of ORDEM_DOWNGRADE) {
            if (_downgradeComponente(ids, estoque, key)) {
                trocou = true;
                ajustado = true;
                total = _calcularTotal(ids, estoque);
                if (total <= limite) break;
            }
        }
        if (!trocou) break;
    }

    if (total <= limite) {
        return { ids, total, ajustado: true, dentroOrcamento: true,
                 mensagem: `Build ajustada para caber no orçamento (R$ ${total.toFixed(2)} de R$ ${limite.toFixed(2)}).` };
    }

    // Última cartada: build mínima viável
    const fallback = _buildMinimoViavel(estoque, limite);
    if (fallback) {
        const totalFb = _calcularTotal(fallback, estoque);
        return { ids: fallback, total: totalFb, ajustado: true, dentroOrcamento: true,
                 mensagem: `Configuração da IA não cabia no orçamento — entregue build mínima viável (R$ ${totalFb.toFixed(2)}).` };
    }

    return { ids, total, ajustado: true, dentroOrcamento: false,
             mensagem: `Não foi possível montar uma build dentro de R$ ${limite.toFixed(2)}. Aumente o orçamento.` };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { aplicarLimiteOrcamento };
}
