// ============================================
// AI.JS - Comunicação com a API Gemini (via proxy backend)
// ============================================

async function consultarIA(orcamento, objetivo, estoque) {
    const url = '/api/gemini';

    const prompt = `
Você é um especialista em montagem de computadores com anos de experiência no mercado brasileiro.
Um cliente precisa de ajuda com:
- Orçamento máximo: R$ ${orcamento}
- Objetivo/Uso: "${objetivo}"

Estoque disponível (JSON):
${JSON.stringify(estoque)}

REGRAS OBRIGATÓRIAS:
1. Use SOMENTE peças do JSON acima. NUNCA invente peças ou IDs que não existam.
2. GARANTA compatibilidade: socket da CPU deve ser IGUAL ao socket da placa-mãe; tipo da RAM deve ser IGUAL ao tipo_memoria da placa-mãe.
3. A fonte deve ter potencia_w suficiente: pelo menos (tdp_cpu + tdp_gpu) * 1.2 watts.
4. Se o orçamento for baixo, priorize os componentes essenciais (CPU, placa-mãe, RAM, armazenamento). GPU é opcional se a CPU tiver video_integrado.
5. Escolha a melhor custo-benefício dentro do orçamento.

FORMATO DE RESPOSTA — siga EXATAMENTE este padrão, sem nenhum texto antes ou depois:

##COMPONENTES##
cpu:[ID_EXATO_DO_PROCESSADOR],gpu:[ID_EXATO_DA_GPU_ou_null],mobo:[ID_EXATO_DA_PLACA_MAE],ram:[ID_EXATO_DA_MEMORIA],fonte:[ID_EXATO_DA_FONTE],storage:[ID_EXATO_DO_ARMAZENAMENTO]
##HTML##
[AQUI VAI SUA RECOMENDAÇÃO COMPLETA USANDO APENAS TAGS HTML VÁLIDAS: h3, ul, li, strong, p]
[Explique por que escolheu cada peça, considerando o objetivo do cliente]
[Na última linha, destaque o VALOR TOTAL em um parágrafo com a tag <strong>]
##FIM##

REGRAS DO HTML:
- PROIBIDO usar Markdown (*, **, #, ##). Use SOMENTE tags HTML.
- Organize por seções: h3 para cada categoria (Processador, Memória, etc.)
- Termine com um parágrafo de resumo e o valor total em destaque.
`;

    try {
        const resposta = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            const mensagemErro = dados.error?.message || "Erro desconhecido na API.";
            throw new Error(mensagemErro);
        }

        const textoGerado = dados.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textoGerado) throw new Error("A IA não retornou nenhuma resposta.");

        return textoGerado;

    } catch (erro) {
        console.error("Erro ao consultar a IA:", erro);
        throw erro;
    }
}

// Separa a resposta da IA em IDs de componentes + HTML de recomendação
function parseRespostaIA(texto) {
    const idsMatch  = texto.match(/##COMPONENTES##\s*([\s\S]*?)\s*##HTML##/);
    const htmlMatch = texto.match(/##HTML##\s*([\s\S]*?)\s*##FIM##/);

    let ids = { cpu: null, gpu: null, mobo: null, ram: null, fonte: null, storage: null };

    if (idsMatch) {
        idsMatch[1].trim().split(',').forEach(part => {
            const [key, value] = part.trim().split(':');
            if (key && value) ids[key.trim()] = value.trim() === 'null' ? null : value.trim();
        });
    }

    // Fallback: se o modelo não seguiu o formato, usa o texto inteiro como HTML
    let html = htmlMatch
        ? htmlMatch[1].trim()
        : texto.replace(/##COMPONENTES##[\s\S]*?##HTML##/g, '').replace(/##FIM##/g, '').trim();

    // Limpa possíveis blocos de código markdown que o modelo pode ter incluído
    html = html.replace(/```html\s*/gi, '').replace(/```\s*/gi, '');

    return { ids, html };
}
