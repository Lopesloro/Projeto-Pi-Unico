<<<<<<< HEAD
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const btnLogin  = document.querySelector('.btn-login');
    const msgLogin  = document.getElementById('msg-login');
    const BASE_URL  = window.location.origin;

    const linkForgot = document.querySelector('.link-forgot');
    if (linkForgot) {
        linkForgot.addEventListener('click', e => {
            e.preventDefault();
            if (msgLogin) {
                msgLogin.style.color = '#94a3b8';
                msgLogin.textContent = 'Recuperação de senha ainda não implementada.';
=======
// ============================================
// LOGIN.JS - Gerencia Login e Cadastro
// ============================================
// CORREÇÕES APLICADAS:
// 1. Conecta ao backend (server.js) em vez de usar localStorage
// 2. Detecta automaticamente a URL do servidor
// 3. Alterna entre modo Login e Cadastro
// 4. Tratamento de erros robusto
// 5. Link "Esqueceu a senha?" funcional
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const linkRegister = document.querySelector('.link-register');
    const linkForgot = document.querySelector('.link-forgot');
    const btnLogin = document.querySelector('.btn-login');
    const tituloForm = document.querySelector('.form-container h2');
    const subtituloForm = document.querySelector('.form-container .subtitle');

    let modoCadastro = false;

    // Detecta a URL base do servidor automaticamente
    const BASE_URL = window.location.origin;

    // ==========================================
    // Alternar entre Login e Cadastro
    // ==========================================
    if (linkRegister) {
        linkRegister.addEventListener('click', (e) => {
            e.preventDefault();
            modoCadastro = !modoCadastro;

            if (modoCadastro) {
                tituloForm.innerText = "Criar Nova Conta";
                subtituloForm.innerText = "Cadastre-se para montar seu PC";
                btnLogin.innerText = "➔ Cadastrar";
                linkRegister.innerText = "Já tem conta? Fazer Login";
                if (linkForgot) linkForgot.style.display = 'none';
            } else {
                tituloForm.innerText = "Bem-vindo de volta";
                subtituloForm.innerText = "Entre para montar o setup dos seus sonhos";
                btnLogin.innerText = "➔ Entrar";
                linkRegister.innerText = "Criar conta";
                if (linkForgot) linkForgot.style.display = 'block';
>>>>>>> 618b7376aa19224b5993fd2f9b1071ebf2b98ae7
            }
        });
    }

<<<<<<< HEAD
    loginForm.addEventListener('submit', async e => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim();
        const senha = document.getElementById('senha').value;

        if (msgLogin) msgLogin.textContent = '';

        if (!email || !senha) {
            if (msgLogin) msgLogin.textContent = 'Preencha todos os campos.';
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            if (msgLogin) msgLogin.textContent = 'Formato de e-mail inválido.';
            return;
        }

        const textoOriginal = btnLogin.textContent;
        btnLogin.textContent = 'Entrando...';
        btnLogin.disabled    = true;

        try {
            const resposta = await fetch(`${BASE_URL}/api/login`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ email, senha })
=======
    // ==========================================
    // Esqueceu a senha
    // ==========================================
    if (linkForgot) {
        linkForgot.addEventListener('click', (e) => {
            e.preventDefault();
            alert('📧 Funcionalidade de recuperação de senha ainda não implementada.\nEntre em contato com o suporte.');
        });
    }

    // ==========================================
    // Submit do formulário (Login ou Cadastro)
    // ==========================================
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim();
        const senha = document.getElementById('senha').value.trim();

        // Validação local
        if (!email || !senha) {
            alert("⚠️ Preencha todos os campos!");
            return;
        }

        if (!email.includes('@')) {
            alert("⚠️ Digite um e-mail válido!");
            return;
        }

        if (modoCadastro && senha.length < 8) {
            alert("⚠️ A senha deve ter pelo menos 8 caracteres!");
            return;
        }

        // Desabilitar botão durante requisição
        const textoOriginal = btnLogin.innerText;
        btnLogin.innerText = "⏳ Aguarde...";
        btnLogin.disabled = true;

        // Define a URL da API
        const urlDaApi = modoCadastro
            ? `${BASE_URL}/api/cadastro`
            : `${BASE_URL}/api/login`;

        try {
            console.log("📡 Conectando em:", urlDaApi);

            const resposta = await fetch(urlDaApi, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ email, senha })
>>>>>>> 618b7376aa19224b5993fd2f9b1071ebf2b98ae7
            });

            const dados = await resposta.json();

            if (resposta.ok && dados.sucesso) {
<<<<<<< HEAD
                localStorage.setItem('usuarioLogado', JSON.stringify(dados.usuario || { email }));
                window.location.href = 'pages/builder.html';
            } else {
                if (msgLogin) msgLogin.textContent = dados.mensagem || 'E-mail ou senha inválidos.';
            }
        } catch {
            if (msgLogin) msgLogin.textContent = 'Erro de conexão. Verifique se o servidor está rodando.';
        } finally {
            btnLogin.textContent = textoOriginal;
            btnLogin.disabled    = false;
=======
                if (modoCadastro) {
                    alert("✅ " + dados.mensagem + "\nAgora faça o login.");
                    window.location.reload();
                } else {
                    // Salva dados do usuário logado (para uso no builder)
                    sessionStorage.setItem('usuarioLogado', JSON.stringify(dados.usuario || { email }));
                    
                    // Redireciona para o montador de PC
                    window.location.href = "pages/builder.html";
                }
            } else {
                alert("❌ " + (dados.mensagem || "Erro desconhecido."));
            }

        } catch (erro) {
            console.error("❌ Erro de conexão:", erro);
            alert("❌ Erro de conexão com o servidor.\n\nVerifique se o servidor Node.js está rodando:\n→ npm start");
        } finally {
            btnLogin.innerText = textoOriginal;
            btnLogin.disabled = false;
>>>>>>> 618b7376aa19224b5993fd2f9b1071ebf2b98ae7
        }
    });
});
