/**
 * utils.js — Funciones de utilidad globales compartidas por todos los módulos.
 * Centraliza helpers de UI como toasts, modales y formateadores de fecha.
 */

// =============================================
// SISTEMA DE TOASTS (NOTIFICACIONES FLOTANTES)
// =============================================

const TOAST_ICONS = { success: '✅', error: '⚠️', info: 'ℹ️', warning: '⚡' };

export function showToast(message, type = 'info', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    // Si estamos en pantalla completa, mover el contenedor dentro del elemento fullscreen
    if (document.fullscreenElement && !document.fullscreenElement.contains(container)) {
        document.fullscreenElement.appendChild(container);
    } else if (!document.fullscreenElement && !document.body.contains(container)) {
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span><span class="toast-message">${message}</span>`;
    container.appendChild(toast);
    const remove = () => { toast.classList.add('hiding'); setTimeout(() => toast.remove(), 300); };
    setTimeout(remove, duration);
    toast.addEventListener('click', remove);
}

// =============================================
// SISTEMA DE MODALES
// =============================================

export function showModal(modal) {
    if (!modal) { console.warn('⚠️ Intento de abrir modal nulo'); return; }
    
    // Si estamos en pantalla completa, mover el modal dentro del elemento fullscreen para que sea visible
    if (document.fullscreenElement && !document.fullscreenElement.contains(modal)) {
        document.fullscreenElement.appendChild(modal);
    }

    modal.style.display = 'flex';
    modal.offsetHeight; // force reflow
    modal.classList.remove('modal-hidden');
    modal.classList.add('modal-visible');
}

export function hideModal(modal) {
    if (!modal) return;
    modal.classList.remove('modal-visible');
    modal.classList.add('modal-hidden');
    setTimeout(() => { 
        modal.style.display = 'none';
        // Al cerrar, si estamos fuera de fullscreen, devolver al body para mantener orden
        if (!document.fullscreenElement && modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
    }, 250);
}

export function showFeedback(title, message, duration = 2000) {
    const modal = document.getElementById('feedback-modal');
    const t = document.getElementById('feedback-title');
    const m = document.getElementById('feedback-message');
    if (!modal || !t || !m) return;
    t.textContent = title;
    m.textContent = message;
    showModal(modal);
    setTimeout(() => hideModal(modal), duration);
}

export function showConfirm(title, message, onConfirm) {
    const modal = document.getElementById('generic-confirm-modal');
    const t = document.getElementById('confirm-title');
    const m = document.getElementById('confirm-message');
    const acceptBtn = document.getElementById('confirm-accept-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    
    if (!modal || !t || !m || !acceptBtn || !cancelBtn) return;
    
    t.textContent = title;
    m.textContent = message;
    
    const handleConfirm = () => {
        hideModal(modal);
        if (onConfirm) onConfirm();
        cleanup();
    };
    
    const handleCancel = () => {
        hideModal(modal);
        cleanup();
    };
    
    const cleanup = () => {
        acceptBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
    };
    
    acceptBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    
    showModal(modal);
}

// =============================================
// FORMATEADORES DE FECHA (DEDUPLICADOS)
// Antes había ~3 versiones de esta función en el código.
// =============================================

export function getFriendlyDate(date) {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'ahora mismo';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    if (diff < 604800) return `hace ${Math.floor(diff / 86400)} días`;
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}

// =============================================
// RESIZE DE TEXTAREAS
// =============================================

export function resize(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    const newHeight = ta.scrollHeight;
    if (newHeight > 0) {
        ta.style.height = newHeight + 'px';
    }
}
// =============================================
// RENDERIZADO DE CALIFICACIONES (STARS)
// =============================================

/**
 * Genera el HTML para mostrar una calificación de estrellas.
 * Soporta medias estrellas (0.5).
 */
export function getRatingStarsHTML(rating, size = 18) {
    const r = parseFloat(rating) || 0;
    let html = `<div class="stars-display-wrapper" style="display: flex; gap: 3px; align-items: center; justify-content: center;">`;
    
    for (let i = 1; i <= 5; i++) {
        let fillPercent = 0;
        if (r >= i) {
            fillPercent = 100;
        } else if (r >= i - 0.5) {
            fillPercent = 50;
        }

        html += `
            <div class="star-container-mini" style="width: ${size}px; height: ${size}px; position: relative; display: flex; align-items: center; justify-content: center;">
                <!-- Estrella de Fondo (Outline) -->
                <svg viewBox="0 0 24 24" style="width: 100%; height: 100%; fill: none; stroke: var(--border-color); stroke-width: 1.5px; position: absolute;">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
                <!-- Estrella de Relleno (Clip) -->
                <div style="width: ${fillPercent}%; height: 100%; overflow: hidden; position: absolute; left: 0; top: 0; display: flex;">
                    <svg viewBox="0 0 24 24" style="width: ${size}px; height: ${size}px; fill: var(--secondary-color); flex-shrink: 0;">
                        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                    </svg>
                </div>
            </div>`;
    }
    
    html += `</div>`;
    return html;
}
