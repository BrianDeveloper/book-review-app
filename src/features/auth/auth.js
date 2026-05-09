/**
 * auth.js — Módulo de autenticación y gestión del perfil de usuario.
 * Maneja el estado de sesión, login/registro y actualización de UI post-login.
 */

import { getSupabase } from '../../core/api.js';
import { showToast, showModal, hideModal } from '../../utils.js';
import State from '../../core/State.js';

// =============================================
// ESTADO GLOBAL DEL USUARIO
// (Exportado para que otros módulos lo lean)
// =============================================

export let currentUser = null;
export let userCoins = 0;
export let userBadges = [];
export let userPreferences = { genres: [], goal: 0, answered_quizzes: [] };
export let userXP = 0;
export let userLevel = 1;
export let currentUsername = '';
export let currentAvatar = '';
export let unlockedItems = [];
export let selectedFrame = 'none';
export let selectedTitle = 'none';
export let selectedSkin = 'none';
export let unreadNotificationsCount = 0;
export let friendUnreadMessages = {};
export let currentUserFriendIds = {};

// Setters para que otros módulos puedan mutar el estado
export const setCurrentUser = (u) => { currentUser = u; };
export const setCoins = (n) => { userCoins = n; updateCurrencyUI(); };
export const setXP = (n) => { userXP = n; updateLevelUI(); };
export const setLevel = (n) => { userLevel = n; updateLevelUI(); };
export const setBadges = (v) => { userBadges = v; };
export const setPreferences = (v) => { userPreferences = v; };
export const setUsername = (v) => { currentUsername = v; };
export const setAvatar = (v) => { currentAvatar = v; };
export const setUnlockedItems = (v) => { unlockedItems = v; };
export const setSelectedFrame = (v) => { selectedFrame = v; };
export const setSelectedTitle = (v) => { selectedTitle = v; };
export const setSelectedSkin = (v) => { selectedSkin = v; };
export const setUnreadNotifications = (v) => { unreadNotificationsCount = v; };
export const setFriendUnreadMessages = (v) => { friendUnreadMessages = v; };
export const setCurrentUserFriendIds = (v) => { currentUserFriendIds = v; };

/**
 * Solicita un correo de restablecimiento de contraseña.
 * @param {string} email 
 */
export const requestPasswordReset = async (email) => {
    const sb = getSupabase();
    if (!sb) return { error: 'Supabase no inicializado' };
    
    const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
    });
    return { error };
};

/**
 * Actualiza la contraseña del usuario actual.
 * @param {string} newPassword 
 */
export const updatePassword = async (newPassword) => {
    const sb = getSupabase();
    if (!sb) return { error: 'Supabase no inicializado' };

    const { error } = await sb.auth.updateUser({ password: newPassword });
    return { error };
};


// =============================================
// CÁLCULO DE XP Y NIVELES
// =============================================

export const calculateNextLevelXP = (lvl) => Math.floor(100 * Math.pow(lvl, 1.5));

export const updateLevelUI = () => {
    const nextLimit = calculateNextLevelXP(userLevel);
    const prevLimit = userLevel > 1 ? calculateNextLevelXP(userLevel - 1) : 0;
    const progress = userXP - prevLimit;
    const needed = nextLimit - prevLimit;
    const percent = Math.min(100, Math.floor((progress / needed) * 100));

    const profLvl = document.getElementById('profile-level-display');
    const profXPText = document.getElementById('profile-xp-text');
    const profXPFill = document.getElementById('profile-xp-fill');
    const profXPStat = document.getElementById('profile-xp-display');

    if (profLvl) profLvl.textContent = userLevel;
    if (profXPText) profXPText.textContent = `${userXP} / ${nextLimit} XP`;
    if (profXPFill) profXPFill.style.width = `${percent}%`;
    if (profXPStat) profXPStat.textContent = userXP;
};

export const updateCurrencyUI = () => {
    const coinDisplays = ['profile-coins-display', 'store-user-coins', 'quiz-user-coins', 'hub-user-coins'];
    const currentCoins = State.getKey('userCoins') || 0;
    
    coinDisplays.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = currentCoins;
    });
};

export const awardXP = async (amount) => {
    if (!currentUser) return;
    const sb = getSupabase();
    if (!sb) return;

    userXP += amount;

    // Calcular nivel localmente
    while (userXP >= Math.floor(100 * Math.pow(userLevel, 1.5))) {
        userLevel++;
        showToast(`🎊 ¡NIVEL ${userLevel}! ¡Felicidades, sigues creciendo como lector!`, 'success', 3500);
    }

    if (window.AppState) {
        window.AppState.set({ userXP, userLevel });
    }
    updateLevelUI();

    try {
        await sb.from('profiles').update({ xp: userXP, level: userLevel }).eq('id', currentUser.id);
        if (typeof window.checkAchievements === 'function') window.checkAchievements(currentUser.id);
    } catch (err) {
        console.error('💥 Error guardando XP:', err);
    }
};

// =============================================
// SESIÓN DE USUARIO
// =============================================

export const fetchUserProfile = async (uid) => {
    const sb = getSupabase();
    if (!sb || !uid) return;

    // Validación básica de UUID para evitar errores 400 en la base de datos
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    // Algunos UIDs de Supabase Auth pueden no ser v4 estrictos en entornos locales, 
    // así que usamos una versión más relajada si es necesario, o simplemente comprobamos que no sea "undefined"
    if (uid === 'undefined' || uid === 'null' || typeof uid !== 'string') {
        console.warn('⚠️ UID inválido detectado en fetchUserProfile:', uid);
        return;
    }

    try {
        // Usamos limit(1) para obtener un array y evitar el error 406 de .single() cuando no hay filas
        let { data: results, error } = await sb.from('profiles').select('*').eq('id', uid).limit(1);
        
        if (error) {
            console.error('❌ Error de base de datos al buscar perfil:', error);
            // Si el error es 400, es probable que sea por una columna inexistente o tipo de dato
            throw error;
        }

        let data = results?.[0] || null;
        
        // Si el perfil no existe, lo creamos
        if (!data) {
            console.log('🌱 Usuario nuevo detectado, intentando crear perfil...');
            
            // Aseguramos que tenemos al menos un nombre base
            const baseUsername = currentUser?.user_metadata?.username || 
                               currentUser?.email?.split('@')[0] || 
                               'Lector_' + uid.substring(0, 5);
            
            let finalUsername = baseUsername;

            const newProfile = {
                id: uid,
                username: finalUsername,
                xp: 0,
                level: 1,
                coins: 0,
                badges: [],
                preferences: { genres: [], goal: 0, answered_quizzes: [], casino_tokens: 0 },
                avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(finalUsername)}&background=ddc9a3&color=6b4f3f&rounded=true&size=80`,
                show_presence: true,
                game_states: {},
                role: 'user',
                jokers: [],
                last_seen: new Date().toISOString()
            };

            // Intentamos insertar. Usamos insert() en lugar de upsert() para ser más explícitos con nuevos usuarios
            let { data: insertedData, error: insertError } = await sb.from('profiles').insert([newProfile]).select();

            // Manejo de errores de inserción
            if (insertError) {
                // Conflicto de username (23505)
                if (insertError.code === '23505' || insertError.message?.includes('username')) {
                    console.warn('⚠️ Conflicto de nombre de usuario, reintentando con sufijo...');
                    finalUsername = `${baseUsername}${Math.floor(Math.random() * 9999)}`;
                    newProfile.username = finalUsername;
                    newProfile.avatar_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(finalUsername)}&background=ddc9a3&color=6b4f3f&rounded=true&size=80`;
                    
                    const { data: retryData, error: retryError } = await sb.from('profiles').insert([newProfile]).select();
                    if (retryError) throw retryError;
                    data = retryData?.[0];
                } 
                // Error de RLS o similar (403 o 406)
                else if (insertError.status === 406 || insertError.code === '406') {
                    console.error('❌ Error 406 en inserción: Posible problema de RLS o esquema.');
                    // En caso de error crítico de red/RLS, usamos el objeto local para no romper la app
                    data = newProfile;
                }
                else {
                    throw insertError;
                }
            } else {
                data = insertedData?.[0] || newProfile;
            }

            console.log('✨ Perfil preparado para nuevo usuario:', finalUsername);
        }

        if (data) {
            userCoins = data.coins || 0;
            userXP = data.xp || 0;
            userLevel = data.level || 1;
            userBadges = data.badges || [];
            userPreferences = data.preferences || { genres: [], goal: 0, answered_quizzes: [] };
            unlockedItems = data.unlocked_items || [];
            selectedFrame = data.selected_frame || 'none';
            selectedTitle = data.selected_title || 'none';
            selectedSkin = data.selected_skin || 'none';
            currentUsername = data.username || currentUser?.user_metadata?.username || 'Lector';
            currentAvatar = data.avatar_url || '';
            const gameStates = data.game_states || {};

            // --- Enviar al State Global ---
            if (window.AppState) {
                window.AppState.set({
                    userCoins, userXP, userLevel, userBadges, userPreferences,
                    unlockedItems, selectedFrame, selectedTitle, selectedSkin,
                    currentUsername, currentAvatar, currentUser,
                    casinoTokens: data.preferences?.casino_tokens || 0,
                    showPresence: data.show_presence !== false,
                    gameStates: gameStates
                });
            }

            // Sincronizar UI
            updateCurrencyUI();
            updateLevelUI();

            // Sincronizar UI de perfil extendida
            const mapping = {
                'profile-username': data.username || '',
                'profile-username-display': data.username || 'Usuario',
                'profile-avatar-url': data.avatar_url || '',
                'profile-bio': data.bio || '',
                'profile-email-display': currentUser?.email || 'Sin correo',
                'dash-username': data.username || 'LECTOR'
            };

            for (const [id, val] of Object.entries(mapping)) {
                const el = document.getElementById(id);
                if (el) {
                    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = val;
                    else el.textContent = val;
                }
            }

            const presenceToggle = document.getElementById('profile-show-presence');
            if (presenceToggle) {
                presenceToggle.checked = data.show_presence !== false;
            }

            // Mostrar secciones legacy del Dashboard
            const quickActions = document.getElementById('dash-quick-actions');
            if (quickActions) quickActions.style.display = 'block';

            const dashGrid = document.querySelector('.dashboard-grid');
            if (dashGrid) dashGrid.classList.remove('no-session');

            const guestCTA = document.getElementById('dash-guest-cta');
            if (guestCTA) guestCTA.style.display = 'none';

            const avatarImg = document.getElementById('current-avatar');
            if (avatarImg) {
                avatarImg.src = data.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.username || 'A')}&background=ddc9a3&color=6b4f3f&rounded=true&size=80`;
            }

            // Notificamos mediante Pub/Sub
            if (window.EventBus) {
                window.EventBus.publish('PROFILE_LOADED', data);
            }

            // Llamar a la actualización de UI legacy
            if (typeof window.updateProfileUI === 'function') {
                window.updateProfileUI(data);
            }

            console.log(`👤 Perfil cargado para ${currentUsername}: Nivel ${userLevel}, ${userXP} XP`);
            return data;
        }
    } catch (e) {
        console.error('❌ Error en fetchUserProfile:', e);
    }
};

export const checkSession = async (onSessionLoaded) => {
    const sb = getSupabase();
    if (!sb) return;

    const { data: { session } } = await sb.auth.getSession();
    if (session?.user) {
        currentUser = session.user;
        await fetchUserProfile(session.user.id);
        if (typeof onSessionLoaded === 'function') onSessionLoaded(session.user);
    }

    sb.auth.onAuthStateChange(async (event, sess) => {
        if (sess?.user) {
            currentUser = sess.user;
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                await fetchUserProfile(sess.user.id);
            }
            if (typeof onSessionLoaded === 'function') onSessionLoaded(sess.user);
        } else {
            currentUser = null;
        }
    });
};

// =============================================
// RESET DEL ESTADO GLOBAL
// =============================================

export const resetUserGlobals = () => {
    userCoins = 0;
    userBadges = [];
    userPreferences = { genres: [], goal: 0, answered_quizzes: [] };
    userXP = 0;
    userLevel = 1;
    currentUsername = '';
    currentAvatar = '';
    unreadNotificationsCount = 0;
    friendUnreadMessages = {};
    currentUserFriendIds = {};
    unlockedItems = [];
    selectedFrame = 'none';
    selectedTitle = 'none';
    selectedSkin = 'none';

    if (window.AppState) window.AppState.resetUserSession();

    updateCurrencyUI();
    updateLevelUI();
    if (typeof applyCosmetics === 'function') applyCosmetics({});

    // Resetear Dashboard y UI legacy
    const dashUser = document.getElementById('dash-username');
    if (dashUser) dashUser.textContent = 'LECTOR';
    const quickActions = document.getElementById('dash-quick-actions');
    if (quickActions) quickActions.style.display = 'none';

    const dashGrid = document.querySelector('.dashboard-grid');
    if (dashGrid) dashGrid.classList.add('no-session');

    // Resetear visualización del perfil
    const avatarDisplay = document.getElementById('current-avatar');
    if (avatarDisplay) avatarDisplay.src = 'https://ui-avatars.com/api/?name=Lector&background=ddc9a3&color=6b4f3f&rounded=true&size=80';
    
    const usernameDisplay = document.getElementById('profile-username-display');
    if (usernameDisplay) usernameDisplay.textContent = 'Lector';

    console.log('🧹 Estado global y UI del usuario reiniciados');
};

export const addCoins = async (amount) => {
    if (!currentUser) return;
    const sb = getSupabase(); if (!sb) return;
    try {
        const newBalance = userCoins + amount;
        const { error } = await sb.from('profiles').update({ coins: newBalance }).eq('id', currentUser.id);
        if (error) throw error;
        userCoins = newBalance;
        if (window.AppState) window.AppState.set({ userCoins });
        updateCurrencyUI();
        showToast(`¡Has ganado ${amount} monedas! 💰`, 'success');
        return true;
    } catch (e) {
        console.error('Error al añadir monedas:', e);
        return false;
    }
};

export const spendCoins = async (amount) => {
    if (!currentUser) return;
    if (userCoins < amount) {
        showToast('No tienes suficientes monedas ❌', 'warning');
        return false;
    }
    const sb = getSupabase(); if (!sb) return;
    try {
        const newBalance = userCoins - amount;
        const { error } = await sb.from('profiles').update({ coins: newBalance }).eq('id', currentUser.id);
        if (error) throw error;
        userCoins = newBalance;
        if (window.AppState) window.AppState.set({ userCoins });
        updateCurrencyUI();
        showToast(`Has gastado ${amount} monedas 💸`, 'info');
        return true;
    } catch (e) {
        console.error('Error al gastar monedas:', e);
        return false;
    }
};



// Necesario para exportar variables mutables de forma segura (para este script)
const auth_exports = { selectedFrame, selectedTitle, selectedSkin };
window.addCoins = addCoins; window.spendCoins = spendCoins;
window.awardXP = awardXP;
