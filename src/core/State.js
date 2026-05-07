/**
 * State.js
 * Almacén de estado global centralizado (Single Source of Truth).
 */

import EventBus from './EventBus.js';

const INITIAL_STATE = {
    // Sesión de Usuario
    currentUser: null,
    
    // Perfil y Economía
    currentUsername: '',
    currentAvatar: '',
    userCoins: 0,
    userXP: 0,
    userLevel: 1,
    userBadges: [],
    userPreferences: { genres: [], goal: 0, answered_quizzes: [] },
    
    // Cosméticos
    unlockedItems: [],
    casinoTokens: 0,
    selectedFrame: 'none',
    selectedTitle: 'none',
    selectedSkin: 'none',
    
    // Notificaciones y Social
    unreadNotificationsCount: 0,
    friendUnreadMessages: {},
    currentUserFriendIds: {},
    
    // Trivia (Temporal para compatibilidad legacy, luego pasará a módulo propio local)
    hasAnsweredToday: false,
    dailyQuestion: null,

    // Persistencia de Juegos en Servidor
    gameStates: {}
};

class StateManager {
    constructor() {
        this._state = { ...INITIAL_STATE };
    }

    /**
     * Obtiene una copia superficial del estado actual.
     * @returns {Object}
     */
    get() {
        return { ...this._state };
    }

    /**
     * Obtiene una clave específica del estado.
     * @param {string} key 
     * @returns {any}
     */
    getKey(key) {
        return this._state[key];
    }

    /**
     * Actualiza una parte del estado y emite un evento general y otro específico.
     * @param {Object} partialState - Objeto con las claves/valores a actualizar
     */
    set(partialState) {
        if (typeof partialState !== 'object' || partialState === null) {
            console.error("State.set requiere un objeto");
            return;
        }

        const changes = {};
        
        for (const [key, value] of Object.entries(partialState)) {
            if (this._state[key] !== value) {
                const prevValue = this._state[key];
                this._state[key] = value;
                changes[key] = { prev: prevValue, val: value };
                
                // Evento específico (Ej: 'STATE_USERCOINS_CHANGED')
                EventBus.publish(`STATE_${key.toUpperCase()}_CHANGED`, value);
            }
        }

        // Si hubieron cambios, emitimos un evento global
        if (Object.keys(changes).length > 0) {
            EventBus.publish('STATE_CHANGED', { state: this.get(), changes });
        }
    }

    /**
     * Limpia completamente el estado de usuario (útil para el logout).
     */
    resetUserSession() {
        this._state = { ...INITIAL_STATE };
        EventBus.publish('STATE_RESET');
        console.log("🧹 StateManager: Sesión reiniciada");
    }
}

const globalState = new StateManager();
export default globalState;
