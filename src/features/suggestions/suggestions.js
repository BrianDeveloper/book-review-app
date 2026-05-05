import { getSupabase } from '../../core/api.js';
import State from '../../core/State.js';
import { showToast, showModal, hideModal } from '../../utils.js';

export function initSuggestions() {
    const openBtn = document.getElementById('open-suggestions-btn');
    const modal = document.getElementById('suggestion-modal');
    const form = document.getElementById('suggestion-form');

    if (!openBtn || !modal || !form) return;

    openBtn.addEventListener('click', () => {
        const user = State.getKey('currentUser');
        if (!user) {
            showToast('Inicia sesión para dejar una sugerencia 💡', 'info');
            return;
        }
        showModal(modal);
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const user = State.getKey('currentUser');
        const category = document.getElementById('suggestion-category').value;
        const text = document.getElementById('suggestion-text').value;

        if (!text.trim()) {
            showToast('Por favor, escribe algo antes de enviar.', 'warning');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando... ⏳';

        try {
            const sb = getSupabase();
            const { error } = await sb.from('user_suggestions').insert({
                user_id: user.id,
                username: State.getKey('currentUsername') || 'Anónimo',
                suggestion: text,
                category: category
            });

            if (error) throw error;

            showToast('¡Gracias! Tu idea ha sido recibida con éxito. 🚀', 'success');
            form.reset();
            hideModal(modal);
        } catch (err) {
            console.error('Error al enviar sugerencia:', err);
            showToast('Hubo un error al enviar tu idea. Inténtalo de nuevo.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'ENVIAR MI IDEA 🚀';
        }
    });

    // Listener para recargar sugerencias (Admin)
    const refreshBtn = document.getElementById('refresh-suggestions-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadAdminSuggestions);
    }
}

export async function loadAdminSuggestions() {
    const listContainer = document.getElementById('admin-suggestions-list');
    if (!listContainer) return;

    listContainer.innerHTML = '<p class="empty-msg">Abriendo el buzón... ⏳</p>';

    try {
        const sb = getSupabase();
        const { data, error } = await sb
            .from('user_suggestions')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            listContainer.innerHTML = '<p class="empty-msg">El buzón está vacío por ahora. 🍃</p>';
            return;
        }

        listContainer.innerHTML = '';
        data.forEach(sugg => {
            const date = new Date(sugg.created_at).toLocaleDateString();
            const item = document.createElement('div');
            item.className = 'admin-item';
            item.style.flexDirection = 'column';
            item.style.alignItems = 'flex-start';
            item.style.gap = '10px';
            
            item.innerHTML = `
                <div style="width: 100%; display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <span class="badge" style="background: var(--secondary-color); font-size: 0.7rem;">${sugg.category.toUpperCase()}</span>
                        <strong style="margin-left: 5px;">@${sugg.username}</strong>
                    </div>
                    <small style="opacity: 0.6;">${date}</small>
                </div>
                <div style="background: var(--bg-color); padding: 12px; border-radius: 10px; border: 1px solid var(--border-color); width: 100%; font-size: 0.95rem; line-height: 1.4;">
                    ${sugg.suggestion}
                </div>
                <div style="width: 100%; text-align: right;">
                    <button class="mini-btn danger-btn delete-sugg-btn" data-id="${sugg.id}" style="padding: 4px 10px; font-size: 0.8rem;">Eliminar 🗑️</button>
                </div>
            `;

            item.querySelector('.delete-sugg-btn').onclick = async () => {
                if (confirm('¿Marcar sugerencia como revisada y eliminar?')) {
                    const { error: delErr } = await sb.from('user_suggestions').delete().eq('id', sugg.id);
                    if (delErr) {
                        showToast('Error al eliminar', 'error');
                    } else {
                        showToast('Sugerencia archivada', 'success');
                        loadAdminSuggestions();
                    }
                }
            };

            listContainer.appendChild(item);
        });
    } catch (err) {
        console.error('Error al cargar sugerencias admin:', err);
        listContainer.innerHTML = `<p class="empty-msg">Error al cargar las sugerencias: ${err.message || 'Error desconocido'}</p>`;
    }
}
