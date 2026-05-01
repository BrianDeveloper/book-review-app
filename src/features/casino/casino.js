/**
 * CASINO.JS
 * Lógica del Rincón del Azar: Ruleta, Fichas y Premios.
 */

import { getSupabase } from '../../core/api.js';
import { showToast } from '../../utils.js';
import EventBus from '../../core/EventBus.js';

// --- CONFIGURACIÓN DE PREMIOS (6 Segmentos para mejor espacio) ---
const WHEEL_PRIZES = [
    { name: '100 Monedas', icon: '💰', value: 100, type: 'coins' },
    { name: '50 XP', icon: '✨', value: 50, type: 'xp' },
    { name: 'Mala Suerte', icon: '💨', value: 0, type: 'nothing' },
    { name: '1 Ficha', icon: '🪙', value: 1, type: 'token' },
    { name: '50 Monedas', icon: '💰', value: 50, type: 'coins' },
    { name: '500 Monedas', icon: '💎', value: 500, type: 'coins' }
];

let isSpinning = false;

// Helper para acceder al estado de forma segura
const getGlobalState = () => window.AppState;

export function initCasino() {
    console.log("🎲 Inicializando Casino...");
    
    EventBus.subscribe('STATE_CASINOTOKENS_CHANGED', updateCasinoUI);
    EventBus.subscribe('STATE_USERCOINS_CHANGED', updateCasinoUI);

    renderWheel();

    document.addEventListener('click', (e) => {
        if (e.target.id === 'open-ruleta-btn' || e.target.closest('#open-ruleta-btn')) {
            switchCasinoScreen('game-screen-ruleta');
            setTimeout(renderWheel, 50);
        }
        if (e.target.id === 'casino-back-btn') {
            switchCasinoScreen('casino-lobby');
        }

        if (e.target.id === 'casino-fullscreen-btn') {
            const screen = document.getElementById('game-screen-ruleta');
            if (!document.fullscreenElement) {
                screen.requestFullscreen().catch(err => console.error(err));
            } else {
                document.exitFullscreen();
            }
        }

        if (e.target.closest('.offer-card')) {
            const qty = parseInt(e.target.closest('.offer-card').dataset.qty);
            const price = parseInt(e.target.closest('.offer-card').dataset.price);
            buyTokens(qty, price);
        }
        
        if (e.target.id === 'spin-wheel-btn') {
            handleSpinClick();
        }
    });

    updateCasinoUI();
}

function switchCasinoScreen(screenId) {
    const lobby = document.getElementById('casino-lobby');
    const ruleta = document.getElementById('game-screen-ruleta');
    if (lobby) lobby.style.display = (screenId === 'casino-lobby') ? 'flex' : 'none';
    if (ruleta) {
        if (screenId === 'game-screen-ruleta') ruleta.classList.add('active');
        else ruleta.classList.remove('active');
    }
}

function renderWheel() {
    const wheel = document.getElementById('wheel-main');
    if (!wheel) return;
    const segmentAngle = 360 / WHEEL_PRIZES.length;
    const gradientColors = WHEEL_PRIZES.map((prize, i) => {
        const color = i % 2 === 0 ? '#4a362b' : '#f9f3e5';
        return `${color} ${i * segmentAngle}deg ${(i + 1) * segmentAngle}deg`;
    }).join(', ');
    
    wheel.style.background = `conic-gradient(${gradientColors})`;
    wheel.style.borderRadius = '50%';

    let html = '';
    WHEEL_PRIZES.forEach((prize, i) => {
        const rotation = i * segmentAngle + (segmentAngle / 2);
        const textColor = i % 2 === 0 ? '#fff' : '#4a362b';
        html += `
            <div class="wheel-label" style="
                position: absolute;
                top: 0;
                left: 50%;
                width: 40%;
                height: 50%;
                margin-left: -20%;
                transform-origin: bottom center;
                transform: rotate(${rotation}deg);
                padding-top: 8cqi;
                box-sizing: border-box;
                color: ${textColor};
                font-weight: bold;
                text-align: center;
                font-size: clamp(0.5rem, 3cqi, 1.1rem);
                pointer-events: none;
                font-family: var(--font-pill);
                line-height: 1.1;
                z-index: 10;
            ">
                <div style="font-size: clamp(1rem, 6cqi, 2.2rem); margin-bottom: 2cqi; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">${prize.icon}</div>
                <div style="text-transform: uppercase; letter-spacing: 0px;">${prize.name}</div>
            </div>
        `;
    });
    wheel.innerHTML = html;
}

export function updateCasinoUI() {
    const state = getGlobalState();
    if (!state) return;

    const tokenDisplay = document.getElementById('casino-token-amount');
    if (tokenDisplay) {
        tokenDisplay.textContent = state.getKey('casinoTokens') || 0;
    }

    // Actualizar indicador de giro gratis
    const hint = document.querySelector('.wheel-hint');
    if (hint) {
        const prefs = state.getKey('userPreferences') || {};
        const lastSpinDate = prefs.last_spin_date;
        const today = new Date().toISOString().split('T')[0];
        
        if (lastSpinDate !== today) {
            hint.innerHTML = '<span class="free-badge">✨ GIRO GRATIS DISPONIBLE ✨</span><br>Tu primer giro de hoy no cuesta fichas.';
            hint.classList.add('is-free');
        } else {
            hint.innerHTML = 'Ya has usado tu giro gratis hoy.<br>Cada giro adicional cuesta 1 ficha 🪙.';
            hint.classList.remove('is-free');
        }
    }
}

async function buyTokens(qty, price) {
    const state = getGlobalState();
    if (!state) return;
    const userCoins = state.getKey('userCoins') || 0;
    if (userCoins < price) {
        showToast('No tienes suficientes monedas ❌', 'warning');
        return;
    }

    try {
        const sb = getSupabase();
        const currentUser = state.getKey('currentUser');
        if (!sb || !currentUser) return;

        const newCoins = userCoins - price;
        const prefs = JSON.parse(JSON.stringify(state.getKey('userPreferences') || {}));
        const newTokens = (prefs.casino_tokens || 0) + qty;
        prefs.casino_tokens = newTokens;

        const { error } = await sb.from('profiles').update({ coins: newCoins, preferences: prefs }).eq('id', currentUser.id);
        if (error) throw error;

        state.set({ userCoins: newCoins, userPreferences: prefs, casinoTokens: newTokens });
        showToast(`¡Has comprado ${qty} fichas! 🪙`, 'success');
    } catch (err) {
        console.error("Error al comprar fichas:", err);
        showToast("Error al procesar la compra", "error");
    }
}

async function handleSpinClick() {
    if (isSpinning) return;
    const state = getGlobalState();
    if (!state) return;
    const prefs = state.getKey('userPreferences') || {};
    const tokens = prefs.casino_tokens || 0;
    const today = new Date().toISOString().split('T')[0];
    const isFree = prefs.last_spin_date !== today;

    if (!isFree && tokens < 1) {
        showToast('Necesitas 1 ficha para girar 🪙', 'warning');
        return;
    }
    startSpin(isFree);
}

async function startSpin(isFree) {
    isSpinning = true;
    const btn = document.getElementById('spin-wheel-btn');
    const wheel = document.getElementById('wheel-main');
    if (btn) btn.disabled = true;

    const extraDegrees = Math.floor(Math.random() * 360);
    const totalDegrees = 1800 + extraDegrees;
    if (wheel) wheel.style.transform = `rotate(${totalDegrees}deg)`;

    setTimeout(async () => {
        const normalizedAngle = extraDegrees % 360;
        const prizeIndex = Math.floor(((360 - normalizedAngle) % 360) / (360 / WHEEL_PRIZES.length));
        const prize = WHEEL_PRIZES[prizeIndex];
        await processPrize(prize, isFree);
        isSpinning = false;
        if (btn) btn.disabled = false;
        if (wheel) {
            wheel.style.transition = 'none';
            wheel.style.transform = `rotate(${normalizedAngle}deg)`;
            setTimeout(() => { wheel.style.transition = 'transform 5s cubic-bezier(0.15, 0, 0.15, 1)'; }, 50);
        }
    }, 5100);
}

async function processPrize(prize, wasFree) {
    const state = getGlobalState();
    const sb = getSupabase();
    if (!state || !sb) return;
    const currentUser = state.getKey('currentUser');
    if (!currentUser) return;

    const prefs = state.getKey('userPreferences') || {};
    let updates = { preferences: prefs };
    let message = "";

    if (wasFree) prefs.last_spin_date = new Date().toISOString().split('T')[0];
    else prefs.casino_tokens = Math.max(0, (prefs.casino_tokens || 0) - 1);

    if (prize.type === 'coins') {
        updates.coins = (state.getKey('userCoins') || 0) + prize.value;
        message = `¡Felicidades! Ganaste ${prize.value} monedas 💰`;
    } else if (prize.type === 'xp') {
        if (typeof window.awardXP === 'function') await window.awardXP(prize.value);
        message = `¡Genial! Has recibido ${prize.value} XP ✨`;
    } else if (prize.type === 'token') {
        prefs.casino_tokens = (prefs.casino_tokens || 0) + prize.value;
        message = `¡Increíble! Una ficha extra para ti 🪙`;
    } else {
        message = "Esta vez no hubo suerte... 💨 ¡Inténtalo de nuevo!";
    }

    state.set({ userPreferences: prefs, casinoTokens: prefs.casino_tokens || 0 });

    try {
        try {
            // Actualizamos monedas vía RPC seguro
            const { data: stats, error: statsError } = await sb.rpc('secure_increment_stats', {
                p_coins_delta: delta,
                p_xp_delta: xpDelta
            });
            if (statsError) throw statsError;

            // Actualizamos preferencias (tokens diarios, etc) que no están bloqueados por el trigger
            const { error: prefError } = await sb.from('profiles').update({ preferences: prefs }).eq('id', currentUser.id);
            if (prefError) throw prefError;

            if (stats) {
                state.set({ userCoins: stats.coins });
                if (window.updateCurrencyUI) window.updateCurrencyUI();
            }
        } catch (err) {
            console.error('Error seguro en casino:', err);
            showToast('Error al sincronizar resultados con el servidor.', 'error');
        }
        
        showToast(message, prize.type === 'nothing' ? 'info' : 'success');
        if (typeof window.updateProfileUI === 'function') {
            const current = state.get();
            window.updateProfileUI({
                username: current.currentUsername,
                avatar_url: current.currentAvatar
            });
        }
    } catch (err) {
        console.error("Error al persistir premio:", err);
        showToast("Error al guardar tu premio", "error");
    }
}
