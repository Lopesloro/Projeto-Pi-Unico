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
            }
        });
    }

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
            });

            const dados = await resposta.json();

            if (resposta.ok && dados.sucesso) {
                localStorage.setItem('usuarioLogado', JSON.stringify(dados.usuario || { email }));
                if (dados.token) localStorage.setItem('authToken', dados.token);
                window.location.href = 'pages/builder.html';
            } else {
                if (msgLogin) msgLogin.textContent = dados.mensagem || 'E-mail ou senha inválidos.';
            }
        } catch {
            if (msgLogin) msgLogin.textContent = 'Erro de conexão. Verifique se o servidor está rodando.';
        } finally {
            btnLogin.textContent = textoOriginal;
            btnLogin.disabled    = false;
        }
    });
});
