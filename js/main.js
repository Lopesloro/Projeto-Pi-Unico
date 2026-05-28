// ============================================
// MAIN.JS - Lógica principal do Builder
// ============================================

/**
 * Gera o HTML da Seção 1 a partir dos IDs reais (enforce.ids) + estoque + justificativas da IA.
 *
 * RAZÃO DA EXISTÊNCIA: antes o HTML vinha direto da IA, que podia escrever "Ryzen 9 5900X" no
 * texto mas colocar cpu_ryzen7_5700x no JSON — gerando divergência entre Seção 1 e Seções 3+4.
 * Agora o nome de cada componente em Seção 1 é o nome do catálogo para aquele ID, garantindo
 * que as três seções mostrem SEMPRE as mesmas peças.
 */
function gerarHtmlDaBuild(ids, estoque, justificativas) {
    const j = justificativas || {};

    const CATS = [
        { key: 'cpu',     label: 'Processador',         arr: 'processadores' },
        { key: 'gpu',     label: 'Placa de Vídeo',      arr: 'placas_video'  },
        { key: 'mobo',    label: 'Placa-Mãe',           arr: 'placas_mae'    },
        { key: 'ram',     label: 'Memória RAM',          arr: 'memorias'      },
        { key: 'storage', label: 'Armazenamento',        arr: 'armazenamento' },
        { key: 'fonte',   label: 'Fonte de Alimentação', arr: 'fontes'        },
    ];

    let html = '';
    for (const cat of CATS) {
        const id = ids[cat.key];
        if (!id || id === 'null') continue;                          // GPU opcional: pula se null
        const item = (estoque[cat.arr] || []).find(p => p.id === id);
        if (!item) continue;                                         // ID inválido: pula silenciosamente

        const just = (j[cat.key] || '').trim();
        html += `<h3>${cat.label}</h3>`;
        html += `<p><strong>${item.nome}</strong>${just ? ` — ${just}` : ''}</p>`;
    }

    if (j.resumo) html += `<p>${j.resumo}</p>`;

    return html || '<p style="color:#94a3b8;">Recomendação gerada com sucesso.</p>';
}

// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

    const step1          = document.getElementById('step-1');
    const step2          = document.getElementById('step-2');
    const btnNext        = document.getElementById('btn-next');
    const btnPrev        = document.getElementById('btn-prev');
    const pcForm         = document.getElementById('pc-form');
    const progressBar    = document.getElementById('progress-bar');
    const inputOrcamento = document.getElementById('orcamento');
    const errorOrcamento = document.getElementById('error-orcamento');
    const inputObjetivo  = document.getElementById('objetivo');
    const errorObjetivo  = document.getElementById('error-objetivo');

    // Enter no campo orçamento → avança sem submeter
    inputOrcamento.addEventListener('keypress', e => {
        if (e.key === 'Enter') { e.preventDefault(); btnNext.click(); }
    });

    // Passo 1 → Passo 2
    btnNext.addEventListener('click', () => {
        const valor = Number(inputOrcamento.value);
        if (!valor || valor < 1500) {
            errorOrcamento.innerText = 'Orçamento mínimo: R$ 1.500';
            errorOrcamento.style.display = 'block';
            return;
        }
        errorOrcamento.style.display = 'none';
        step1.classList.remove('active');
        step2.classList.add('active');
        progressBar.style.width = '100%';
    });

    // Passo 2 → Passo 1
    btnPrev.addEventListener('click', () => {
        step2.classList.remove('active');
        step1.classList.add('active');
        progressBar.style.width = '50%';
    });

    // Submissão → Chama a IA
    pcForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const textoObjetivo = inputObjetivo.value.trim();
        const orcamento     = inputOrcamento.value;

        if (textoObjetivo.length < 10) {
            errorObjetivo.innerText = 'Por favor, detalhe um pouco mais o uso (mínimo 10 caracteres).';
            errorObjetivo.style.display = 'block';
            return;
        }
        errorObjetivo.style.display = 'none';

        // Esconde formulário, mostra loading
        pcForm.style.display = 'none';
        document.querySelector('.progress-container').style.display = 'none';
        const stepIndicator = document.querySelector('.step-indicator');
        if (stepIndicator) stepIndicator.style.display = 'none';
        document.getElementById('steps-visual').style.display = 'none';

        const loadingScreen = document.getElementById('loading-screen');
        const loadingText   = document.getElementById('loading-text');
        loadingScreen.classList.remove('hidden');
        loadingText.innerText = '🔍 Analisando seu objetivo...';

        try {
            const respostaEstoque = await fetch('../data/components.json');
            if (!respostaEstoque.ok) throw new Error('Não foi possível carregar o estoque de peças.');
            const estoque = await respostaEstoque.json();

            const respostaIA = await consultarIA(orcamento, textoObjetivo, estoque);

            // Extrai IDs, justificativas por componente e raciocínio geral da IA
            const { ids, justificativas, raciocinio } = parseRespostaIA(respostaIA);

            // Calcula total real pelos preços do catálogo (ignora o campo "total" da IA que pode estar errado)
            const CAMPOS = {
                cpu: 'processadores', mobo: 'placas_mae', ram: 'memorias',
                gpu: 'placas_video', storage: 'armazenamento', fonte: 'fontes'
            };
            const totalReal = Object.entries(ids).reduce((acc, [key, id]) => {
                if (!id || id === 'null') return acc;
                const item = (estoque[CAMPOS[key]] || []).find(p => p.id === id);
                return acc + (item ? Number(item.preco) : 0);
            }, 0);
            const limiteNum = Number(orcamento);
            if (totalReal > limiteNum * 1.05) {
                console.warn(`[AI] Total real R$${totalReal.toFixed(2)} excede orçamento R$${limiteNum} — enforcer irá corrigir.`);
            }

            // Enforcer: garante que a build caiba no orçamento (só downgrade, sem upgrades automáticos)
            const enforce = aplicarLimiteOrcamento(ids, estoque, limiteNum);

            // ── Gera o HTML da Seção 1 a partir dos IDs finais (enforce.ids) ─────
            // CRÍTICO: o HTML é gerado do MESMO conjunto de IDs que alimenta Seções 3 e 4.
            // Isso garante que as três seções mostrem sempre as mesmas peças.
            const htmlGerado = gerarHtmlDaBuild(enforce.ids, estoque, justificativas);

            // Persiste tudo no sessionStorage
            sessionStorage.setItem('pcBuilderResposta',   htmlGerado);          // HTML gerado dos IDs reais
            sessionStorage.setItem('pcBuilderIds',         JSON.stringify(enforce.ids));
            sessionStorage.setItem('pcBuilderOrcamento',   orcamento);
            sessionStorage.setItem('pcBuilderObjetivo',    textoObjetivo);
            sessionStorage.setItem('pcBuilderAjustado',    enforce.ajustado ? '1' : '0');
            sessionStorage.setItem('pcBuilderEnforceMsg',  enforce.mensagem || '');
            sessionStorage.setItem('pcBuilderTotal',       String(enforce.total || 0));
            sessionStorage.setItem('pcBuilderRaciocinio',  raciocinio || '');

            // ── Salva a build no banco de dados (fire-and-forget) ─────────────
            try {
                const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
                if (usuarioLogado?.email) {
                    const MAPA_LABEL = {
                        cpu: 'Processador', gpu: 'Placa de Vídeo', mobo: 'Placa-Mãe',
                        ram: 'Memória RAM', storage: 'Armazenamento', fonte: 'Fonte de Alimentação'
                    };
                    const MAPA_ARR = {
                        cpu: 'processadores', gpu: 'placas_video', mobo: 'placas_mae',
                        ram: 'memorias', storage: 'armazenamento', fonte: 'fontes'
                    };
                    const componentesParaSalvar = Object.entries(enforce.ids)
                        .filter(([, id]) => id && id !== 'null')
                        .map(([key, id]) => {
                            const item = (estoque[MAPA_ARR[key]] || []).find(p => p.id === id);
                            return {
                                componente:    MAPA_LABEL[key] || key,
                                produto:       item?.nome || id,
                                preco:         item ? Number(item.preco) : null,
                                loja:          'Catálogo',
                                justificativa: (justificativas[key] || '').trim() || null
                            };
                        });

                    fetch('/api/salvar-build', {
                        method:  'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            emailDestino: usuarioLogado.email,
                            objetivo:     textoObjetivo,
                            orcamento:    Number(orcamento),
                            total:        enforce.total || 0,
                            componentes:  componentesParaSalvar
                        })
                    }).catch(err => console.warn('[DB] Falha ao salvar build:', err.message));
                }
            } catch (errDb) {
                console.warn('[DB] Erro ao preparar dados para salvar build:', errDb.message);
            }

            loadingText.innerText = '✅ Configuração gerada! Redirecionando...';
            loadingText.style.color = '#10b981';
            const spinner = document.querySelector('.spinner');
            if (spinner) spinner.style.borderTopColor = '#10b981';

            setTimeout(() => { window.location.href = 'resultado.html'; }, 1200);

        } catch (erro) {
            loadingText.innerText = '❌ Erro ao processar. Verifique o console (F12).';
            loadingText.style.color = '#ef4444';
            const spinner = document.querySelector('.spinner');
            if (spinner) spinner.style.borderTopColor = '#ef4444';
            console.error('Erro no Builder:', erro);
        }
    });
});
