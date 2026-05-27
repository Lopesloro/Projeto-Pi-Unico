// ============================================
// MAIN.JS - Lógica principal do Builder
// ============================================

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

            // Separa IDs dos componentes, HTML de recomendação e raciocínio da IA
            const { ids, html, raciocinio } = parseRespostaIA(respostaIA);

            // ── Fix 2: Verifica o total real ANTES do enforcer ──────────────
            // A IA pode mentir no campo "total" — calculamos pelos preços reais.
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

            // ── Enforcer: garante que a build caiba no orçamento e o maximize ──
            const enforce = aplicarLimiteOrcamento(ids, estoque, limiteNum);

            // ── Persiste a build final (enforce.ids) no sessionStorage ─────────
            // enforce.ids é sempre a build final: dentro do orçamento e maximizada.
            // Gargalo e tabela de preços usam esses IDs — nunca peças acima do teto.
            // O HTML da IA (seção 1) descreve a recomendação original; o painel de
            // orçamento indica se houve ajuste.
            sessionStorage.setItem('pcBuilderResposta',    html);
            sessionStorage.setItem('pcBuilderIds',         JSON.stringify(enforce.ids));
            sessionStorage.setItem('pcBuilderOrcamento',   orcamento);
            sessionStorage.setItem('pcBuilderObjetivo',    textoObjetivo);
            sessionStorage.setItem('pcBuilderAjustado',    enforce.ajustado ? '1' : '0');
            sessionStorage.setItem('pcBuilderEnforceMsg',  enforce.mensagem || '');
            sessionStorage.setItem('pcBuilderTotal',       String(enforce.total || 0));
            sessionStorage.setItem('pcBuilderRaciocinio',  raciocinio || '');

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
