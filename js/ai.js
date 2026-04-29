// ============================================
// AI.JS - Comunicação com a API Gemini (via proxy backend)
// ============================================

async function consultarIA(orcamento, objetivo, estoque) {
    const url = '/api/gemini';

    const prompt = `
Você é um consultor sênior de hardware com foco no mercado brasileiro.
Seu objetivo: montar a MELHOR build POSSÍVEL para o cliente, dentro do orçamento.

DADOS DO CLIENTE:
- 💰 ORÇAMENTO MÁXIMO (LIMITE INVIOLÁVEL): R$ ${orcamento}
- 🎯 Objetivo/Uso: "${objetivo}"

ESTOQUE DISPONÍVEL (use SOMENTE os IDs e preços deste JSON — não invente nada):
${JSON.stringify(estoque)}

🚨 REGRA #1 — ORÇAMENTO É TETO ABSOLUTO 🚨
A soma dos campos "preco" de CPU + GPU (se houver) + Placa-Mãe + RAM + Fonte + Armazenamento DEVE ser ≤ R$ ${orcamento}.
Antes de responder, calcule o total e CONFIRME que cabe. Se passar, troque por modelos mais baratos do MESMO JSON até caber.
Se mesmo assim não couber, REMOVA a GPU (gpu:null) e use uma CPU com video_integrado=true.

🚨 REGRA #2 — APROVEITE O ORÇAMENTO AO MÁXIMO 🚨
NÃO entregue uma build muito abaixo do teto se houver opções melhores que cabem.
Procure usar pelo menos 85% do orçamento sempre que possível, priorizando o componente que mais impacta o objetivo do cliente:
- "Games" / "jogos" → priorize GPU forte (e CPU compatível); RAM mínimo 16GB
- "Edição de vídeo" / "renderização" / "streaming" → priorize CPU com mais núcleos; RAM 16-32GB; SSD NVMe
- "Programação" / "uso geral" / "escritório" → CPU equilibrada com vídeo integrado; SSD; pode dispensar GPU
- Sem GPU dedicada? Escolha CPU com video_integrado=true.

🚨 REGRA #3 — COMPATIBILIDADE OBRIGATÓRIA 🚨
- socket da CPU == socket da placa-mãe
- tipo da RAM == tipo_memoria da placa-mãe
- Fonte: potencia_w ≥ (tdp_cpu + tdp_gpu) × 1.2  (com margem de segurança)
- Sempre inclua armazenamento (preferencialmente SSD).

🚨 REGRA #4 — COERÊNCIA DE VALORES 🚨
- Use APENAS peças do JSON acima.
- NÃO mencione preços, valores ou totais no HTML — o sistema calcula e exibe os valores reais a partir do catálogo. Se você falar preço errado, gera divergência.
- O HTML deve focar em JUSTIFICATIVA TÉCNICA: por que cada peça é a melhor escolha para o objetivo, e como a build se equilibra (ex: "CPU e GPU pareados sem gargalo").

FORMATO DE RESPOSTA — siga EXATAMENTE este padrão, sem texto antes ou depois:

##COMPONENTES##
cpu:[ID_EXATO_DO_PROCESSADOR],gpu:[ID_EXATO_DA_GPU_ou_null],mobo:[ID_EXATO_DA_PLACA_MAE],ram:[ID_EXATO_DA_MEMORIA],fonte:[ID_EXATO_DA_FONTE],storage:[ID_EXATO_DO_ARMAZENAMENTO]
##HTML##
[Recomendação usando APENAS tags HTML: h3, ul, li, strong, p]
[Uma seção h3 por categoria (Processador, Placa-Mãe, Memória, Vídeo, Fonte, Armazenamento) com 1-2 frases de justificativa técnica em <p> ou <li>]
[Encerre com um <p> de resumo geral: como a build atende ao objetivo. SEM citar preços/totais.]
##FIM##

REGRAS DO HTML:
- PROIBIDO Markdown (*, **, #). Use só tags HTML.
- PROIBIDO citar valores em reais, total, "R$", "custou", "ficou em".
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
