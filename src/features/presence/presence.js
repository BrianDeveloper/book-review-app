import { getSupabase } from '../../core/api.js';
import State from '../../core/State.js';

let presenceInterval = null;

/**
 * Inicializa el rastreo de presencia del usuario.
 */
export function initPresenceTracking() {
    const sb = getSupabase();
    if (!sb) return;

    // Escuchar cuando el perfil se cargue para iniciar el rastreo inmediatamente
    if (window.EventBus) {
        window.EventBus.subscribe('PROFILE_LOADED', () => {
            console.log('📡 Perfil detectado, activando señal de presencia...');
            updatePresence();
            startPresenceInterval();
        });
    }

    // Intentar actualización inicial por si el perfil ya estaba cargado
    updatePresence();
    startPresenceInterval();

    // También actualizar cuando la pestaña vuelve a estar activa
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            updatePresence();
        }
    });
}

function startPresenceInterval() {
    if (presenceInterval) clearInterval(presenceInterval);
    // Pulso cada 30 segundos para máxima precisión
    presenceInterval = setInterval(() => {
        if (!document.hidden) {
            updatePresence();
        }
    }, 30000); 
}

/**
 * Actualiza el timestamp 'last_seen' en el perfil del usuario actual.
 */
async function updatePresence() {
    const user = State.getKey('currentUser');
    if (!user) return;

    try {
        const sb = getSupabase();
        const { error } = await sb
            .from('profiles')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', user.id);

        if (error) {
            console.warn('Presence sync failed:', error.message);
        }
    } catch (err) {
        console.error('Presence error:', err);
    }
}

/**
 * Determina si un usuario está "Online" basado en su last_seen.
 * @param {string} lastSeen ISO string
 * @param {boolean} showPresence Si el usuario permite mostrar su estado
 * @returns {boolean}
 */
export function isUserOnline(lastSeen, showPresence = true) {
    if (showPresence === false || !lastSeen) return false;
    
    const lastDate = new Date(lastSeen);
    const now = new Date();
    const diffSeconds = Math.abs((now - lastDate) / 1000);
    
    // Consideramos online si hubo señal en los últimos 90 segundos
    const isOnline = diffSeconds < 90;
    
    if (window.debugPresence) {
        console.log(`[Presence] diff=${Math.round(diffSeconds)}s, online=${isOnline}, userTime=${lastDate.toLocaleTimeString()}`);
    }
    
    return isOnline;
}

/**
 * Genera el HTML del indicador de presencia.
 * @param {boolean} online 
 * @returns {string} HTML string
 */
export function getPresenceHTML(online) {
    return `<span class="presence-indicator ${online ? 'presence-online' : 'presence-offline'}"></span>`;
}
