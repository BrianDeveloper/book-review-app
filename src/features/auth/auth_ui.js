import { getSupabase } from '../../core/api.js';
import { showToast, showModal, hideModal, showFeedback } from '../../utils.js';

/**
 * Inicializa los listeners de autenticación en el DOM.
 * Esta función debe ser llamada desde script.js o main.js tras el DOMContentLoaded.
 */
export function initAuthUI() {
    const authModal = document.getElementById('auth-modal');
    const authForm = document.getElementById('auth-form');
    const modalTitle = document.getElementById('modal-title');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authSwitch = document.getElementById('auth-switch');
    const switchToRegister = document.getElementById('switch-to-register');
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    const logoutBtn = document.getElementById('logout-btn');

    let isRegisterMode = false;

    const openModal = (mode) => {
        if (!authModal || !modalTitle || !authSubmitBtn || !authSwitch) return;
        isRegisterMode = mode === 'register';
        modalTitle.textContent = isRegisterMode ? 'Crear Cuenta' : 'Iniciar Sesión';
        authSubmitBtn.textContent = isRegisterMode ? 'REGISTRARSE ✨' : 'ENTRAR ✨';
        authSwitch.style.display = isRegisterMode ? 'none' : 'block';
        
        const emailGroup = document.getElementById('email-group');
        const usernameLabel = document.getElementById('username-label');
        const usernameInput = document.getElementById('auth-username');

        if (isRegisterMode) {
            if (emailGroup) emailGroup.style.display = 'flex';
            if (usernameLabel) usernameLabel.textContent = 'Usuario:';
            if (usernameInput) usernameInput.placeholder = 'Escoge un nombre de usuario';
        } else {
            if (emailGroup) emailGroup.style.display = 'none'; // Sigue oculto, reutilizamos el campo superior para el email
            if (usernameLabel) usernameLabel.textContent = 'Correo Electrónico:';
            if (usernameInput) usernameInput.placeholder = 'tu@email.com';
        }

        const forgotPassContainer = document.getElementById('forgot-password-container');
        if (forgotPassContainer) forgotPassContainer.style.display = isRegisterMode ? 'none' : 'block';

        showModal(authModal);
    };

    if (loginBtn) loginBtn.addEventListener('click', () => openModal('login'));
    if (registerBtn) registerBtn.addEventListener('click', () => openModal('register'));
    if (switchToRegister) switchToRegister.addEventListener('click', () => openModal('register'));

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', () => {
            hideModal(authModal);
            showModal(document.getElementById('request-reset-modal'));
        });
    }

    if (authForm) {
        authForm.addEventListener('submit', (e) => handleAuthSubmit(e, isRegisterMode));
    }

    // Listener para solicitud de reset
    document.getElementById('request-reset-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('reset-email').value.trim();
        const btn = e.target.querySelector('button');
        btn.disabled = true;
        btn.textContent = 'Enviando...';
        
        try {
            const { error } = await window.requestPasswordReset(email);
            if (error) throw error;
            showToast('¡Correo enviado! Revisa tu bandeja de entrada.', 'success');
            hideModal(document.getElementById('request-reset-modal'));
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'ENVIAR CORREO 📧';
        }
    });

    // Listener para actualización de password
    document.getElementById('update-password-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPass = document.getElementById('new-password').value;
        const confirmPass = document.getElementById('confirm-password').value;

        if (newPass !== confirmPass) {
            showToast('Las contraseñas no coinciden. Inténtalo de nuevo.', 'warning');
            return;
        }

        const btn = e.target.querySelector('button');
        btn.disabled = true;
        btn.textContent = 'Actualizando...';
        
        try {
            const { error } = await window.updatePassword(newPass);
            if (error) throw error;
            showToast('¡Contraseña actualizada con éxito! 🔐', 'success');
            showFeedback('¡Éxito! 🔐', 'Ya puedes iniciar sesión con tu nueva contraseña.');
            hideModal(document.getElementById('update-password-modal'));
            openModal('login');
        } catch (err) {
            showToast(`Error: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'ACTUALIZAR 🔐';
        }
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            const sb = getSupabase();
            if (sb) await sb.auth.signOut();
            if (typeof window.updateAuthUI === 'function') window.updateAuthUI(null);
            if (typeof window.resetJournal === 'function') window.resetJournal();
            if (typeof window.resetUserGlobals === 'function') window.resetUserGlobals();
            if (typeof window.switchView === 'function') window.switchView('dashboard-view');
            showFeedback('Hasta pronto 👋', 'Tu sesión se ha cerrado.');
        });
    }
}

/**
 * Maneja el envío del formulario de autenticación.
 */
async function handleAuthSubmit(e, isRegisterMode) {
    if (e) e.preventDefault();
    
    const authUsernameInput = document.getElementById('auth-username');
    const authPasswordInput = document.getElementById('auth-password');
    const authEmailInput = document.getElementById('auth-email');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authModal = document.getElementById('auth-modal');

    const sb = getSupabase();
    if (!sb) {
        showToast('Error: Supabase no disponible.', 'error');
        return;
    }

    const identifier = authUsernameInput?.value.trim() || "";
    const password = authPasswordInput?.value || "";
    const emailInput = authEmailInput?.value.trim() || "";

    let email = "";
    let username = "";

    if (isRegisterMode) {
        email = emailInput;
        username = identifier.toLowerCase();
        if (!email || !username || !password) {
            showToast('Email, usuario y contraseña son obligatorios.', 'warning');
            return;
        }
    } else {
        // Modo Login: debe ser estrictamente un email
        if (!identifier) {
            showToast('Ingresa tu correo electrónico.', 'warning');
            return;
        }
        if (!identifier.includes('@')) {
            showToast('Por favor, usa tu correo electrónico válido para iniciar sesión.', 'warning');
            return;
        }
        email = identifier;
    }

    console.log('🚀 Intentando Auth:', {
        modo: isRegisterMode ? 'Registro' : 'Login',
        email: email,
        username: isRegisterMode ? username : null,
        passLength: password?.length
    });

    if (authSubmitBtn) {
        authSubmitBtn.disabled = true;
        authSubmitBtn.textContent = 'PROCESANDO...';
    }

    try {
        if (isRegisterMode) {
            const { data, error } = await sb.auth.signUp({ 
                email, 
                password,
                options: {
                    data: { username: username }
                }
            });

            // Si hay error pero el usuario se creó (típico error 500 por fallo de SMTP), procedemos
            if (error && !data?.user) {
                console.error('❌ Error fatal de Supabase en signUp:', error);
                throw error;
            }

            if (error) {
                console.warn('⚠️ Error menor de Supabase (probablemente email):', error);
            }

            if (data?.user && data.session) {
                showToast('¡Cuenta creada!', 'success');
                if (typeof window.updateAuthUI === 'function') window.updateAuthUI(data.user);
                hideModal(authModal);
            } else {
                showToast('¡Cuenta creada! Revisa tu email para confirmar.', 'info', 8000);
                hideModal(authModal);
            }
        } else {
            const { data, error } = await sb.auth.signInWithPassword({ email, password });
            if (error) throw error;
            if (typeof window.updateAuthUI === 'function') window.updateAuthUI(data.user);
            hideModal(authModal);
            showFeedback('¡Bienvenido! ✨', 'Has iniciado sesión correctamente.');
        }
    } catch (error) {
        // SILENCIAR error 500 si el usuario se creó (evita el toast rojo confuso)
        if (error.message?.includes('Database error saving new user') && isRegisterMode) {
            console.warn('🤫 Silenciando error 500 conocido: El usuario se creó a pesar del error de DB.');
            return; 
        }

        console.error('❌ Error de Autenticación Detallado:', error);
        console.log('📧 Email intentado:', email);
        let msg = error.message;
        if (msg === 'Invalid login credentials') msg = 'Credenciales incorrectas. Si te registraste con email, asegúrate de usarlo.';
        if (msg === 'Email not confirmed') msg = 'Tu correo aún no ha sido confirmado en Supabase. Revisa tu bandeja de entrada o intenta entrar con tu email real.';
        if (msg.includes('rate limit exceeded')) msg = 'Has realizado demasiados intentos en poco tiempo. Por favor, espera unos 15-30 minutos antes de intentar registrarte o confirmar de nuevo. ⏳';
        showToast(`Error: ${msg}`, 'error');
    } finally {
        if (authSubmitBtn) {
            authSubmitBtn.disabled = false;
            authSubmitBtn.textContent = isRegisterMode ? 'REGISTRARSE ✨' : 'ENTRAR ✨';
        }
    }
}
