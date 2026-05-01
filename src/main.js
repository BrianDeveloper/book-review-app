import { supabase } from './core/api.js';
import * as utils from './utils.js';
import * as auth from './features/auth/auth.js';
import { initAuthUI } from './features/auth/auth_ui.js';
import * as store from './features/store/store.js';
import { memoryGame } from './features/games/memory.js';
import '../script.js'; // Unificar legacy en el bundle principal

// --- CORE INFRASTRUCTURE ---
import EventBus from './core/EventBus.js';
import State from './core/State.js';

// Exponer a global para migración progresiva
window.EventBus = EventBus;
window.AppState = State;

// Test Reactividad Simple
EventBus.subscribe('STATE_USERCOINS_CHANGED', (val) => {
    console.log('⚡ [Pub/Sub] El valor de las monedas cambió a:', val);
});
// =============================================
// PUENTE DE COMPATIBILIDAD (BRIDGE)
// =============================================

// 1. Supabase
window.supabaseInstance = supabase;

// 2. Utilidades de UI (Globales)
window.showToast = utils.showToast;
window.showModal = utils.showModal;
window.hideModal = utils.hideModal;
window.showFeedback = utils.showFeedback;
window.showConfirm = utils.showConfirm;
window.getFriendlyDate = utils.getFriendlyDate;
window.resize = utils.resize;

// 3. Funciones de Negocio (Wrappers para inyectar estado automáticamente)
window.awardXP = auth.awardXP;
window.addCoins = auth.addCoins;
window.spendCoins = auth.spendCoins;
window.equipItem = store.equipItem;
window.updateLevelUI = auth.updateLevelUI;
window.updateCurrencyUI = auth.updateCurrencyUI;
window.calculateNextLevelXP = auth.calculateNextLevelXP;
window.resetUserGlobals = auth.resetUserGlobals;
window.fetchUserProfile = auth.fetchUserProfile;
window.requestPasswordReset = auth.requestPasswordReset;
window.updatePassword = auth.updatePassword;
window.initAuthUI = initAuthUI;


// 4. Catálogos
window.storeItems = store.storeItems;
window.memoryGame = memoryGame;

// 5. Estado Global Reactivo (Proxy para script.js) -> Migrando a State.js
const stateProps = [
    'currentUser', 'userCoins', 'userXP', 'userLevel', 'userBadges', 
    'userPreferences', 'currentUsername', 'currentAvatar', 'unlockedItems', 
    'selectedFrame', 'selectedTitle', 'selectedSkin', 'unreadNotificationsCount',
    'currentUserFriendIds', 'friendUnreadMessages', 'hasAnsweredToday', 'dailyQuestion'
];

stateProps.forEach(prop => {
    Object.defineProperty(window, prop, {
        get: () => {
            // Priority to new State, fallback to auth
            const stateVal = State.getKey(prop);
            if (stateVal !== undefined) return stateVal;
            if (prop in auth) return auth[prop];
            return undefined;
        },
        set: (val) => {
            // Actualizamos en la nueva arquitectura
            State.set({ [prop]: val });

            // Y por seguridad (hasta que eliminemos los módulos viejos) actualizamos los legacy
            if (prop === 'currentUser') auth.setCurrentUser(val);
            else if (prop === 'userCoins') auth.setCoins(val);
            else if (prop === 'userXP') auth.setXP(val);
            else if (prop === 'userLevel') auth.setLevel(val);
            else if (prop === 'userBadges') auth.setBadges(val);
            else if (prop === 'userPreferences') auth.setPreferences(val);
            else if (prop === 'currentUsername') auth.setUsername(val);
            else if (prop === 'currentAvatar') auth.setAvatar(val);
            else if (prop === 'unlockedItems') auth.setUnlockedItems(val);
            else if (prop === 'selectedFrame') auth.setSelectedFrame(val);
            else if (prop === 'selectedTitle') auth.setSelectedTitle(val);
            else if (prop === 'selectedSkin') auth.setSelectedSkin(val);
            else if (prop === 'unreadNotificationsCount') auth.setUnreadNotifications(val);
            else if (prop === 'friendUnreadMessages') auth.setFriendUnreadMessages(val);
            else if (prop === 'currentUserFriendIds') auth.setCurrentUserFriendIds(val);
        },
        configurable: true
    });
});

console.log('✅ main.js: Puente de compatibilidad reforzado.');
