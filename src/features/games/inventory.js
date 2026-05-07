import { getSupabase } from '../../core/api.js';
import State from '../../core/State.js';
import { showModal, hideModal, showToast } from '../../utils.js';
import { storeItems } from '../store/store.js';

export const userInventory = {
    init() {
        const invBtn = document.getElementById('my-inventory-btn');
        if (invBtn) {
            invBtn.onclick = () => this.openInventoryModal();
        }
    },

    async openInventoryModal() {
        const modal = document.getElementById('ranking-modal'); // Reutilizamos el modal de rankings
        const body = document.getElementById('ranking-modal-body');
        if (!modal || !body) return;

        body.innerHTML = `
            <div class="inventory-modal-container">
                <div class="inventory-header">
                    <h3>🎒 Mi Mochila de Aventurero</h3>
                    <div class="inventory-tabs">
                        <button class="inv-tab active" data-filter="all">🎒 Todo</button>
                        <button class="inv-tab" data-filter="cosmetico">👕 Estilo</button>
                    </div>
                </div>
                <div id="inventory-list-container" class="inventory-list">
                    <div class="loading-ranking">Abriendo mochila... ⏳</div>
                </div>
            </div>
        `;

        // Lógica de pestañas
        body.querySelectorAll('.inv-tab').forEach(tab => {
            tab.onclick = () => {
                body.querySelectorAll('.inv-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.loadInventory(tab.dataset.filter);
            };
        });

        showModal(modal);
        this.loadInventory('all');
    },

    async loadInventory(filter = 'all') {
        const container = document.getElementById('inventory-list-container');
        if (!container) return;

        const user = State.getKey('currentUser');
        if (!user) {
            container.innerHTML = '<div class="empty-ranking">Inicia sesión para ver tu inventario.</div>';
            return;
        }

        const sb = getSupabase();
        try {
            let query = sb.from('user_inventory').select('*').eq('user_id', user.id);
            
            if (filter === 'cosmetico') {
                query = query.eq('category', 'cosmetico');
            } else if (filter === 'rpg') {
                query = query.in('category', ['herramienta', 'material', 'consumible']);
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) throw error;

            if (!data || data.length === 0) {
                container.innerHTML = `
                    <div class="empty-inventory">
                        <div style="font-size: 3rem; margin-bottom: 15px;">🏜️</div>
                        <p>Tu inventario está vacío.</p>
                        <p style="font-size: 0.8rem; opacity: 0.7;">¡Gana partidas y sube al ranking para conseguir objetos exclusivos!</p>
                    </div>
                `;
                return;
            }

            this.renderInventoryList(data);
        } catch (e) {
            console.error("Error cargando inventario:", e);
            container.innerHTML = '<div class="error-ranking">No se pudo abrir la mochila.</div>';
        }
    },

    renderInventoryList(items) {
        const container = document.getElementById('inventory-list-container');
        let html = '';

        items.forEach((item) => {
            const isEquipped = item.is_equipped;
            const duration = item.metadata?.duration_days ? `${item.metadata.duration_days} días` : 'Permanente';
            
            // Buscar nombre real en el catálogo si es un item migrado o genérico
            const catalogItem = storeItems.find(si => si.id === item.item_id);
            const displayName = catalogItem ? catalogItem.name : item.item_name;
            const displayIcon = catalogItem ? catalogItem.icon : this.getIconByCategory(item.category, item.item_id);

            const btnText = isEquipped ? 'DESEQUIPAR' : 'EQUIPAR';
            const btnClass = isEquipped ? 'equipped' : '';

            html += `
                <div class="inventory-item ${isEquipped ? 'is-equipped' : ''}">
                    <div class="item-icon">${displayIcon}</div>
                    <div class="item-info">
                        <span class="item-name">${displayName}</span>
                        <span class="item-type">${item.category}</span>
                        <span class="item-duration">Duración: ${duration}</span>
                    </div>
                    <button class="equip-btn ${btnClass}" 
                            onclick="userInventory.toggleEquip('${item.id}', '${item.item_id}', '${item.category}', ${isEquipped})">
                        ${btnText}
                    </button>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    getIconByCategory(category, itemId) {
        if (itemId.includes('pico')) return '⛏️';
        if (itemId.includes('caña')) return '🎣';
        if (category === 'cosmetico') return '🖼️';
        if (category === 'material') return '📦';
        return '📦';
    },

    checkIfEquipped(item) {
        if (item.type === 'frame') return State.getKey('selectedFrame') === item.id;
        if (item.type === 'title') return State.getKey('selectedTitle') === item.id;
        return false;
    },

    async toggleEquip(rowId, itemId, category, currentlyEquipped) {
        const sb = getSupabase();
        const user = State.getKey('currentUser');
        if (!sb || !user) return;

        try {
            if (currentlyEquipped) {
                // Lógica de DESEQUIPAR
                await sb.from('user_inventory').update({ is_equipped: false }).eq('id', rowId);
                
                if (category === 'cosmetico') {
                    const updates = {};
                    if (itemId.startsWith('f_') || itemId.startsWith('frame_')) updates.selected_frame = 'none';
                    else if (itemId.startsWith('t_') || itemId.startsWith('title_')) updates.selected_title = 'none';
                    else if (itemId.startsWith('s_') || itemId.startsWith('skin_')) updates.selected_skin = 'none';
                    await sb.from('profiles').update(updates).eq('id', user.id);

                    // Actualizar State
                    if (itemId.includes('f_')) State.set({ selectedFrame: 'none' });
                    else if (itemId.includes('t_')) State.set({ selectedTitle: 'none' });
                    else if (itemId.includes('s_')) State.set({ selectedSkin: 'none' });
                }
                showToast('Objeto desequipado.', 'info');
            } else {
                // Lógica de EQUIPAR (con auto-desequipamiento de similares)
                
                // 1. Identificar sub-tipo para no desequipar TODO lo cosmético
                let subTypeFilter = null;
                if (itemId.startsWith('f_') || itemId.startsWith('frame_')) subTypeFilter = 'f_';
                else if (itemId.startsWith('t_') || itemId.startsWith('title_')) subTypeFilter = 't_';
                else if (itemId.startsWith('s_') || itemId.startsWith('skin_')) subTypeFilter = 's_';

                // 2. Desequipar objetos del mismo sub-tipo en la DB
                if (subTypeFilter) {
                    // Nota: Usamos item_id like para filtrar por f_, t_, s_
                    await sb.from('user_inventory')
                        .update({ is_equipped: false })
                        .eq('user_id', user.id)
                        .ilike('item_id', `${subTypeFilter}%`);
                }

                // 3. Equipar el objeto seleccionado
                const { error } = await sb.from('user_inventory')
                    .update({ is_equipped: true })
                    .eq('id', rowId);

                if (error) throw error;

                // 4. Actualizar perfiles para compatibilidad legacy
                if (category === 'cosmetico') {
                    const updates = {};
                    if (subTypeFilter === 'f_') updates.selected_frame = itemId;
                    else if (subTypeFilter === 't_') updates.selected_title = itemId;
                    else if (subTypeFilter === 's_') updates.selected_skin = itemId;
                    
                    await sb.from('profiles').update(updates).eq('id', user.id);
                    
                    // Actualizar State
                    if (subTypeFilter === 'f_') State.set({ selectedFrame: itemId });
                    else if (subTypeFilter === 't_') State.set({ selectedTitle: itemId });
                    else if (subTypeFilter === 's_') State.set({ selectedSkin: itemId });
                }

                showToast('¡Objeto equipado con éxito! ✨', 'success');
            }

            this.loadInventory();

            // Refrescar cosméticos en tiempo real (Avatar, Títulos, Temas)
            if (typeof window.applyCosmetics === 'function') {
                window.applyCosmetics();
            }
        } catch (e) {
            console.error("Error al gestionar equipo:", e);
            showToast('No se pudo realizar la acción.', 'error');
        }
    }
};

window.userInventory = userInventory;
