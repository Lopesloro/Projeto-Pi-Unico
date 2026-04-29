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
<<<<<<< HEAD
=======
    const currentStepText= document.getElementById('current-step');
>>>>>>> 618b7376aa19224b5993fd2f9b1071ebf2b98ae7
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
<<<<<<< HEAD
=======
        currentStepText.innerText = '2';
>>>>>>> 618b7376aa19224b5993fd2f9b1071ebf2b98ae7
    });

    // Passo 2 → Passo 1
    btnPrev.addEventListener('click', () => {
        step2.classList.remove('active');
        step1.classList.add('active');
        progressBar.style.width = '50%';
<<<<<<< HEAD
=======
        currentStepText.innerText = '1';
>>>>>>> 618b7376aa19224b5993fd2f9b1071ebf2b98ae7
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
<<<<<<< HEAD
        const stepIndicator = document.querySelector('.step-indicator');
        if (stepIndicator) stepIndicator.style.display = 'none';
        document.getElementById('steps-visual').style.display = 'none';
=======
        document.querySelector('.step-indicator').style.display = 'none';
>>>>>>> 618b7376aa19224b5993fd2f9b1071ebf2b98ae7

        const loadingScreen = document.getElementById('loading-screen');
        const loadingText   = document.getElementById('loading-text');
        loadingScreen.classList.remove('hidden');

        const mensagens = [
            '🔍 Analisando seu objetivo...',
            '📦 Verificando melhores peças...',
            '🔧 Garantindo a compatibilidade...',
            '📊 Calculando possíveis gargalos...',
            '✨ Finalizando a sua montagem...'
        ];
        let idx = 0;
<<<<<<< HEAD
        loadingText.innerText = mensagens[0];
=======
>>>>>>> 618b7376aa19224b5993fd2f9b1071ebf2b98ae7
        const intervalo = setInterval(() => {
            idx++;
            if (idx < mensagens.length) loadingText.innerText = mensagens[idx];
        }, 2500);

        try {
            const respostaEstoque = await fetch('../data/components.json');
            if (!respostaEstoque.ok) throw new Error('Não foi possível carregar o estoque de peças.');
            const estoque = await respostaEstoque.json();

            const respostaIA = await consultarIA(orcamento, textoObjetivo, estoque);

            // Separa IDs dos componentes do HTML da recomendação
            const { ids, html } = parseRespostaIA(respostaIA);

<<<<<<< HEAD
            // ──────────────────────────────────────────────
            // ENFORCER DE ORÇAMENTO (REGRA OBRIGATÓRIA)
            // O total da build NUNCA pode passar do valor do cliente.
            // ──────────────────────────────────────────────
            const enforce = aplicarLimiteOrcamento(ids, estoque, Number(orcamento));

            // Persiste tudo no sessionStorage para a página de resultado
            sessionStorage.setItem('pcBuilderResposta',   html);
            sessionStorage.setItem('pcBuilderIds',        JSON.stringify(enforce.ids));
            sessionStorage.setItem('pcBuilderOrcamento',  orcamento);
            sessionStorage.setItem('pcBuilderObjetivo',   textoObjetivo);
            sessionStorage.setItem('pcBuilderAjustado',   enforce.ajustado ? '1' : '0');
            sessionStorage.setItem('pcBuilderEnforceMsg', enforce.mensagem || '');
            sessionStorage.setItem('pcBuilderTotal',      String(enforce.total || 0));
=======
            // Persiste tudo no sessionStorage para a página de resultado
            sessionStorage.setItem('pcBuilderResposta',  html);
            sessionStorage.setItem('pcBuilderIds',       JSON.stringify(ids));
            sessionStorage.setItem('pcBuilderOrcamento', orcamento);
            sessionStorage.setItem('pcBuilderObjetivo',  textoObjetivo);
>>>>>>> 618b7376aa19224b5993fd2f9b1071ebf2b98ae7

            clearInterval(intervalo);
            loadingText.innerText = '✅ Configuração gerada! Redirecionando...';
            loadingText.style.color = '#10b981';
            document.querySelector('.spinner').style.borderTopColor = '#10b981';

            setTimeout(() => { window.location.href = 'resultado.html'; }, 1200);

        } catch (erro) {
            clearInterval(intervalo);
            loadingText.innerText = '❌ Erro ao processar. Verifique o console (F12).';
            loadingText.style.color = '#ef4444';
            document.querySelector('.spinner').style.borderTopColor = '#ef4444';
            console.error('Erro no Builder:', erro);
        }
    });
});
