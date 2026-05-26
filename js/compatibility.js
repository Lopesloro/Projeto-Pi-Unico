// ============================================
// COMPATIBILITY.JS - Sistema Especialista de Regras
// Verifica compatibilidade entre peças e detecta gargalo (bottleneck)
// ============================================

function verificarCompatibilidadeSocket(cpu, mobo) {
    if (!cpu || !mobo) return { ok: false, msg: 'Dados insuficientes para verificar socket.' };
    const ok = cpu.socket === mobo.socket;
    return {
        ok,
        msg: ok
            ? `Socket compatível: ${cpu.socket}`
            : `Sockets incompatíveis — CPU usa ${cpu.socket}, mas a placa-mãe é ${mobo.socket}`
    };
}

function verificarCompatibilidadeMemoria(ram, mobo) {
    if (!ram || !mobo) return { ok: false, msg: 'Dados insuficientes para verificar memória.' };
    const ok = ram.tipo === mobo.tipo_memoria;
    return {
        ok,
        msg: ok
            ? `Memória compatível: ${ram.tipo}`
            : `Memória incompatível — RAM é ${ram.tipo}, mas a placa-mãe aceita apenas ${mobo.tipo_memoria}`
    };
}

function verificarPotenciaFonte(fonte, tdpTotal) {
    if (!fonte || !tdpTotal) return { ok: false, msg: 'Dados insuficientes para verificar fonte.' };
    const tdpMinimo = Math.ceil(tdpTotal * 1.3);
    const ok = fonte.potencia_w >= tdpMinimo;
    return {
        ok,
        msg: ok
            ? `Fonte suficiente: ${fonte.potencia_w}W (mínimo recomendado com 30% de margem: ${tdpMinimo}W)`
            : `Fonte insuficiente: ${fonte.potencia_w}W — mínimo recomendado é ${tdpMinimo}W (30% de margem)`
    };
}

function calcularBottleneck(cpu, gpu) {
    if (!cpu || !gpu || cpu.score == null || gpu.score == null) return null;

    const cpuScore = cpu.score;
    const gpuScore = gpu.score;
    const diff     = gpuScore - cpuScore; // positivo = GPU mais forte (CPU é o gargalo)
                                           // negativo = CPU mais forte (GPU é o gargalo)

    // Gargalo na CPU (GPU > CPU): mais comum em setups gamer
    const bottleneckCPU = diff > 0
        ? Math.round((diff / gpuScore) * 100)
        : 0;

    // Gargalo na GPU (CPU > GPU): CPU ociosa, GPU é o ponto fraco
    const bottleneckGPU = diff < 0
        ? Math.round((-diff / cpuScore) * 100)
        : 0;

    const percentual = Math.max(bottleneckCPU, bottleneckGPU);
    const gargaloCPU = bottleneckCPU >= bottleneckGPU;

    let nivel, cor, titulo, descricao;

    if (percentual >= 30) {
        nivel = 'critico'; cor = '#ef4444';
        if (gargaloCPU) {
            titulo    = 'Gargalo Severo no Processador';
            descricao = `O processador (score ${cpuScore}) está limitando significativamente a GPU (score ${gpuScore}). A placa de vídeo opera bem abaixo do potencial. Considere trocar por uma CPU mais potente.`;
        } else {
            titulo    = 'Gargalo Severo na Placa de Vídeo';
            descricao = `A GPU (score ${gpuScore}) está muito abaixo do processador (score ${cpuScore}). Você não aproveitará todo o poder da CPU em jogos e aplicativos gráficos. Considere uma GPU mais potente.`;
        }
    } else if (percentual >= 20) {
        nivel = 'alto'; cor = '#f97316';
        if (gargaloCPU) {
            titulo    = 'Gargalo Moderado no Processador';
            descricao = `Desequilíbrio notável: CPU score ${cpuScore} vs GPU score ${gpuScore}. Em títulos pesados você pode sentir queda de FPS causada pelo processador.`;
        } else {
            titulo    = 'Gargalo Moderado na Placa de Vídeo';
            descricao = `CPU score ${cpuScore} está acima da GPU score ${gpuScore}. Parte do desempenho do processador ficará ocioso em cargas gráficas.`;
        }
    } else if (percentual >= 10) {
        nivel = 'leve'; cor = '#eab308';
        titulo    = 'Gargalo Leve (Aceitável)';
        descricao = `Pequeno desequilíbrio entre CPU (score ${cpuScore}) e GPU (score ${gpuScore}). Para a maioria dos jogos e aplicativos o impacto é mínimo e dentro do esperado.`;
    } else {
        nivel = 'ok'; cor = '#10b981';
        titulo    = 'Combinação Equilibrada ✓';
        descricao = `Ótima dupla! CPU (score ${cpuScore}) e GPU (score ${gpuScore}) estão bem balanceadas. Você aproveita o máximo de ambas as peças sem desperdício.`;
    }

    return { nivel, cor, titulo, descricao, percentual, cpuScore, gpuScore };
}

function rodarTodasVerificacoes(componentes, estoque) {
    const { cpuId, gpuId, moboId, ramId, fonteId } = componentes;

    const cpu   = estoque.processadores?.find(p => p.id === cpuId)    || null;
    const gpu   = gpuId && gpuId !== 'null' ? estoque.placas_video?.find(g => g.id === gpuId) || null : null;
    const mobo  = estoque.placas_mae?.find(m => m.id === moboId)       || null;
    const ram   = estoque.memorias?.find(r => r.id === ramId)          || null;
    const fonte = estoque.fontes?.find(f => f.id === fonteId)          || null;

    const resultados = [];

    if (cpu && mobo) resultados.push({ label: 'Socket CPU × Placa-Mãe', ...verificarCompatibilidadeSocket(cpu, mobo) });
    if (ram && mobo) resultados.push({ label: 'Tipo de Memória RAM',     ...verificarCompatibilidadeMemoria(ram, mobo) });
    if (fonte && (cpu || gpu)) {
        const tdp = (cpu?.tdp_w || 0) + (gpu?.tdp_w || 0);
        resultados.push({ label: 'Potência da Fonte',                    ...verificarPotenciaFonte(fonte, tdp) });
    }

    const bottleneck = (cpu && gpu) ? calcularBottleneck(cpu, gpu) : null;

    return { resultados, bottleneck, cpu, gpu, mobo, ram, fonte };
}
