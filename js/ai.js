// ============================================
// AI.JS - Comunicação com a API Gemini (via proxy backend)
// ============================================

async function consultarIA(orcamento, objetivo, estoque) {
    const url = '/api/gemini';

    const prompt = `
Você é um especialista em montagem de computadores com anos de experiência no mercado brasileiro.
Um cliente precisa de ajuda com:
- 💰 ORÇAMENTO MÁXIMO (LIMITE INVIOLÁVEL): R$ ${orcamento}
- Objetivo/Uso: "${objetivo}"

Estoque disponível (JSON):
${JSON.stringify(estoque)}

🚨 REGRA #1 — ORÇAMENTO É LIMITE ABSOLUTO 🚨
O VALOR INFORMADO PELO CLIENTE (R$ ${orcamento}) É O TETO MÁXIMO ABSOLUTO DA BUILD.
A SOMA dos "preco" de CPU + GPU + Placa-Mãe + RAM + Fonte + Armazenamento
TEM QUE SER ≤ R$ ${orcamento}.
NUNCA, EM HIPÓTESE ALGUMA, entregue uma build cujo total ultrapasse R$ ${orcamento}.
Antes de responder você DEVE somar mentalmente os preços e CONFIRMAR que o total cabe.
Se não couber, troque peças por modelos mais baratos do MESMO JSON até caber.
Se nem assim couber, REMOVA a GPU e use uma CPU com video_integrado=true.

DEMAIS REGRAS OBRIGATÓRIAS:
1. Use SOMENTE peças do JSON acima. NUNCA invente peças ou IDs que não existam.
2. GARANTA compatibilidade: socket da CPU deve ser IGUAL ao socket da placa-mãe; tipo da RAM deve ser IGUAL ao tipo_memoria da placa-mãe.
3. A fonte deve ter potencia_w suficiente: pelo menos (tdp_cpu + tdp_gpu) * 1.2 watts.
4. Se o orçamento for baixo, priorize os componentes essenciais (CPU, placa-mãe, RAM, armazenamento). GPU é opcional se a CPU tiver video_integrado.
5. Escolha a melhor custo-benefício dentro do orçamento.
6. Aproveite o orçamento — fique o mais perto possível do teto sem ultrapassá-lo.

FORMATO DE RESPOSTA — siga EXATAMENTE este padrão, sem nenhum texto antes ou depois:

##COMPONENTES##
cpu:[ID_EXATO_DO_PROCESSADOR],gpu:[ID_EXATO_DA_GPU_ou_null],mobo:[ID_EXATO_DA_PLACA_MAE],ram:[ID_EXATO_DA_MEMORIA],fonte:[ID_EXATO_DA_FONTE],storage:[ID_EXATO_DO_ARMAZENAMENTO]
##HTML##
[AQUI VAI SUA RECOMENDAÇÃO COMPLETA USANDO APENAS TAGS HTML VÁLIDAS: h3, ul, li, strong, p]
[Explique por que escolheu cada peça, considerando o objetivo do cliente]
[Termine com um parágrafo de resumo da build, SEM mencionar valor total — o total será calculado automaticamente pelo sistema]
##FIM##

REGRAS DO HTML:
- PROIBIDO usar Markdown (*, **, #, ##). Use SOMENTE tags HTML.
- Organize por seções: h3 para cada categoria (Processador, Memória, etc.)
- NÃO inclua valor total ou preços no HTML — apenas a justificativa técnica de cada escolha.
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
