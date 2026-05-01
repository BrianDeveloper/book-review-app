/**
 * store.js — Módulo de la Tienda de Recompensas.
 * Gestiona el catálogo, la compra y el equipamiento de cosméticos.
 */

import { getSupabase } from '../../core/api.js';
import { showToast } from '../../utils.js';
import State from '../../core/State.js';
import EventBus from '../../core/EventBus.js';

// =============================================
// CATÁLOGO DE ARTÍCULOS
// =============================================

export const storeItems = [
    // --- MARCOS (Frames) ---
    { id: 'f_vintage', name: 'Marco Vintage', price: 150, type: 'frame', css: 'frame-vintage', icon: '📜' },
    { id: 'f_gold', name: 'Marco Dorado', price: 350, type: 'frame', css: 'frame-gold', icon: '⭐' },
    { id: 'f_vintage_pg', name: 'Páginas Antiguas', price: 600, type: 'frame', css: 'frame-vintage-pages', icon: '📖' },
    { id: 'f_fire', name: 'Marco de Fuego', price: 1200, type: 'frame', css: 'frame-fire', icon: '🔥' },
    { id: 'f_quill', name: 'Tinta y Pluma', price: 1800, type: 'frame', css: 'frame-quill', icon: '🖋️' },
    { id: 'f_spellbook', name: 'Grimorio Mágico', price: 3500, type: 'frame', css: 'frame-spellbook', icon: '🔮' },

    // --- COLECCIÓN PRIDE (Precio Unificado: Apoyo) ---
    { id: 'f_pride_gay', name: 'Marco: Orgullo', price: 200, type: 'frame', css: 'frame-pride-gay', icon: '<div class="mini-flag flag-gay"></div>' },
    { id: 'f_pride_bi', name: 'Marco: Bisexual', price: 200, type: 'frame', css: 'frame-pride-bi', icon: '<div class="mini-flag flag-bi"></div>' },
    { id: 'f_pride_trans', name: 'Marco: Trans', price: 200, type: 'frame', css: 'frame-pride-trans', icon: '<div class="mini-flag flag-trans"></div>' },
    { id: 'f_pride_lesbian', name: 'Marco: Lésbico', price: 200, type: 'frame', css: 'frame-pride-lesbian', icon: '<div class="mini-flag flag-lesbian"></div>' },
    { id: 'f_pride_pan', name: 'Marco: Pansexual', price: 200, type: 'frame', css: 'frame-pride-pan', icon: '<div class="mini-flag flag-pan"></div>' },
    { id: 'f_pride_nonbinary', name: 'Marco: No Binario', price: 200, type: 'frame', css: 'frame-pride-nonbinary', icon: '<div class="mini-flag flag-nonbinary"></div>' },
    { id: 'f_pride_ace', name: 'Marco: Asexual', price: 200, type: 'frame', css: 'frame-pride-ace', icon: '<div class="mini-flag flag-ace"></div>' },
    { id: 'f_pride_vincian', name: 'Marco: Gay', price: 200, type: 'frame', css: 'frame-pride-vincian', icon: '<div class="mini-flag flag-vincian"></div>' },

    // --- TÍTULOS ---
    { id: 't_worm', name: 'Devoralibros', price: 100, type: 'title', value: 'Devoralibros 🐛', icon: '🐛' },
    { id: 't_collector', name: 'Coleccionista', price: 300, type: 'title', value: 'Coleccionista de Historias 📚', icon: '📚' },
    { id: 't_critic', name: 'Crítico Implacable', price: 800, type: 'title', value: 'Crítico Implacable 🧐', icon: '🧐' },
    { id: 't_sage', name: 'El Erudito', price: 2000, type: 'title', value: 'El Erudito 🧙‍♂️', icon: '🧙‍♂️' },
    { id: 't_nobel', name: 'Premio Nobel', price: 3000, type: 'title', value: 'Premio Nobel 🏆', icon: '🏆' },
    { id: 't_explorer', name: 'Explorador', price: 1500, type: 'title', value: 'Explorador de Géneros 🧭', icon: '🧭' },

    // --- TEMAS ---
    { id: 's_parchment', name: 'Tema: Pergamino', price: 2500, type: 'skin', css: 'skin-parchment', icon: '📜' },
];

export let currentStoreCategory = 'frame';

// =============================================
// INICIALIZACIÓN Y REACTIVIDAD
// =============================================

export function initStore() {
    initStoreTabs();

    // Suscribir al EventBus para reactividad automática
    EventBus.subscribe('STATE_USERCOINS_CHANGED', loadStore);
    EventBus.subscribe('STATE_UNLOCKEDITEMS_CHANGED', loadStore);

    // Cuando el perfil es cargado inicialmente, aplicar los cosméticos
    EventBus.subscribe('PROFILE_LOADED', () => {
        applyCosmetics();
    });

    // Detectar clicks externos que pidan recargar la tienda (Pestaña del hub interactuada)
    const storeTabBtnInChallenges = document.querySelector('[data-challenge-tab="tab-store"]');
    if (storeTabBtnInChallenges) {
        storeTabBtnInChallenges.addEventListener('click', loadStore);
    }
}

export function initStoreTabs() {
    const tabContainer = document.getElementById('store-category-tabs');
    if (!tabContainer) return;

    tabContainer.querySelectorAll('.store-tab-btn').forEach(btn => {
        btn.onclick = () => {
            tabContainer.querySelectorAll('.store-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentStoreCategory = btn.getAttribute('data-store-cat');
            loadStore();
        };
    });
}

// =============================================
// RENDERIZADO DE LA TIENDA
// =============================================

export function loadStore() {
    const grid = document.getElementById('store-grid') || document.getElementById('challenges-store-items');
    if (!grid) return;

    const userCoins = State.getKey('userCoins') || 0;
    const unlockedItems = State.getKey('unlockedItems') || [];

    // Actualizar texto de saldo en el Hub
    const balanceEl = document.getElementById('hub-user-coins');
    if (balanceEl) {
        balanceEl.textContent = userCoins;
    }

    // Actualizar otros marcadores globales si existen
    if (typeof window.updateCurrencyUI === 'function') {
        window.updateCurrencyUI();
    }

    const filtered = storeItems.filter(i => i.type === currentStoreCategory);
    grid.innerHTML = '';

    const categoryTitles = {
        'frame': 'Marcos Literarios 🖼️',
        'skin': 'Temas Globales 🎨',
        'title': 'Títulos de Prestigio 🎖️'
    };

    const header = document.createElement('h4');
    header.className = 'sub-title';
    header.style.cssText = 'font-size: 1.3rem; margin: 0 0 15px 0; color: var(--secondary-color); text-align: left; width: 100%; border-bottom: 2px solid var(--border-color); padding-bottom: 5px;';
    header.textContent = categoryTitles[currentStoreCategory] || 'Tienda';
    grid.appendChild(header);

    const itemsGrid = document.createElement('div');
    itemsGrid.className = 'store-items-grid';
    itemsGrid.style.marginBottom = '25px';

    filtered.forEach(item => {
        const owned = Array.isArray(unlockedItems)
            ? unlockedItems.some(ui => (typeof ui === 'string' ? ui === item.id : ui.id === item.id))
            : false;

        const card = document.createElement('div');
        card.className = 'store-item';
        card.innerHTML = `
            <div class="item-icon">${item.icon}</div>
            <div class="item-name">${item.name}</div>
            <div class="item-price">${item.price} 💰</div>
            <button class="journal-btn buy-btn ${owned ? 'owned' : ''}" ${owned ? 'disabled' : ''}>
                ${owned ? 'OBTENIDO' : 'COMPRAR'}
            </button>
        `;

        const btn = card.querySelector('button');
        if (!owned) {
            btn.onclick = () => buyItem(item.id);
        } else if (item.type !== 'badge') {
            btn.textContent = 'EQUIPAR 🛡️';
            btn.disabled = false;
            btn.classList.remove('owned');
            btn.style.background = 'var(--secondary-color)';
            btn.onclick = () => equipItem(item.id, item.type);
        }
        itemsGrid.appendChild(card);
    });

    grid.appendChild(itemsGrid);
}

// =============================================
// LÓGICA DE COMPRA Y EQUIPAMIENTO
// =============================================

export async function buyItem(itemId) {
    const item = storeItems.find(i => i.id === itemId);
    const currentUser = State.getKey('currentUser');
    const userCoins = State.getKey('userCoins');
    const unlockedItems = State.getKey('unlockedItems') || [];

    if (!item || !currentUser) return;

    if (userCoins < item.price) {
        showToast('¡No tienes suficientes monedas! 💸', 'error');
        return;
    }

    const sb = getSupabase();
    if (!sb) return;

    try {
        const newCoins = userCoins - item.price;
        const newItems = [...unlockedItems, item.id];

        const { error } = await sb.from('profiles').update({
            coins: newCoins,
            unlocked_items: newItems
        }).eq('id', currentUser.id);

        if (error) throw error;

        State.set({ userCoins: newCoins, unlockedItems: newItems });
        if (typeof window.updateCurrencyUI === 'function') window.updateCurrencyUI();
        if (typeof window.updateProfileUI === 'function') {
            const current = State.get();
            window.updateProfileUI({
                username: current.currentUsername,
                avatar_url: current.currentAvatar
            });
        }
        showToast(`¡${item.name} desbloqueado! 🎉`, 'success');

    } catch (e) {
        console.error('❌ Error comprando artículo:', e);
        showToast('Error al procesar la compra.', 'error');
    }
}

export const equipItem = async (itemId, type) => {
    const sb = getSupabase();
    const currentUser = State.getKey('currentUser');

    if (!sb || !currentUser) return;

    let updateData = {};
    if (type === 'frame') updateData.selected_frame = itemId;
    else if (type === 'title') updateData.selected_title = itemId;
    else if (type === 'skin') updateData.selected_skin = itemId;

    try {
        const { error } = await sb.from('profiles').update(updateData).eq('id', currentUser.id);
        if (error) throw error;

        showToast('¡Personalización aplicada! ✨', 'success');

        State.set({
            selectedFrame: type === 'frame' ? itemId : State.getKey('selectedFrame'),
            selectedTitle: type === 'title' ? itemId : State.getKey('selectedTitle'),
            selectedSkin: type === 'skin' ? itemId : State.getKey('selectedSkin')
        });

        applyCosmetics();

    } catch (e) {
        console.error('Error equipando item:', e);
        showToast('Error al equipar el artículo.', 'error');
    }
};

export const applyCosmetics = () => {
    // 1. Aplicar Marco (Frame)
    const profileFrame = document.getElementById('profile-frame');
    const navFrame = document.getElementById('nav-frame');
    const frameId = State.getKey('selectedFrame') || 'none';
    const frameItem = storeItems.find(i => i.id === frameId);

    // Limpiar clases de marco anteriores
    const frameClasses = storeItems.filter(i => i.type === 'frame').map(i => i.css);
    [profileFrame, navFrame].forEach(el => {
        if (!el) return;
        frameClasses.forEach(c => el.classList.remove(c));
        if (frameItem && frameItem.css) el.classList.add(frameItem.css);
    });

    // 2. Aplicar Título (Title)
    const titleDisplay = document.getElementById('profile-title-display');
    const titleId = State.getKey('selectedTitle') || 'none';
    const titleItem = storeItems.find(i => i.id === titleId);
    if (titleDisplay) {
        titleDisplay.textContent = titleItem ? titleItem.value : '';
    }

    // 3. Aplicar Skin (Tema)
    const skinId = State.getKey('selectedSkin') || 'none';
    const skinItem = storeItems.find(i => i.id === skinId);
    // Remover todas las skins
    const skinClasses = storeItems.filter(i => i.type === 'skin').map(i => i.css);

    // Safe removal
    skinClasses.forEach(c => {
        if (c) document.body.classList.remove(c);
    });

    if (skinItem && skinItem.css) {
        document.body.classList.add(skinItem.css);
    }
};

// Autoinicialización para conectar listeners globales al cargar script
document.addEventListener('DOMContentLoaded', initStore);
