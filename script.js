// --- ERROR HANDLING & DEBUGGING ---
import { dashboardService } from './src/features/profile/dashboard_service.js';
import { dashboardUI } from './src/features/profile/dashboard_ui.js';
import { triviaGame } from './src/features/games/trivia.js';
import { memoryGame } from './src/features/games/memory.js';
import { initAuthUI } from './src/features/auth/auth_ui.js';
import { initCasino } from './src/features/casino/casino.js';
import { loadAdminSuggestions } from './src/features/suggestions/suggestions.js';

window.addEventListener('error', function (event) {
    console.error('🔴 GLOBAL ERROR:', event.error);
    if (typeof showToast === 'function') {
        showToast('Error detectado: ' + (event.error ? event.error.message : 'Error desconocido'), 'error', 5000);
    }
});






// --- CONFIGURATION ---

const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw9xyK1c0286Supbke7Cm3i3vDXGL2iCvBCDwWFZNv5vT71l7JNUSLhelRPwZebq1G9iA/exec';



// CONFIGURACIÓN: Supabase ahora se gestiona en src/api.js




// Global state

// El estado de sesión (currentUser) ahora reside en src/modules/auth.js


let currentCoverUrl = '';

let currentTrackInfo = { name: '', source: '' };

let currentPlayerType = null;

let lastSearchQuery = '';

let currentResults = [];

let spotifyInfoLoaded = false; // Bandera para saber si la info de Spotify cargó

let currentIndex = 0;

let progressInterval = null;

let editingReviewId = null; // ID del libro que estamos editando

// --- ECONOMY & PROGRESS STATE ---
let currentAvatar = '';
let triviaCountdownInterval = null;
const getSupabase = () => window.supabaseInstance;

// Global references for cleanup
let notificationChannel = null;
let currentChatFriendId = null;
let chatSubscription = null;
let isCurrentlyTyping = false;
let typingTimeout = null;

// =============================================
// NOTIFICATION SYSTEM
// =============================================
async function loadNotifications() {
    const sb = getSupabase();
    if (!sb || !currentUser) return;

    try {
        console.log('🔄 Cargando lista de notificaciones...');
        // Carga simple para evitar error 400 de llaves compuestas
        let { data, error } = await sb
            .from('notifications')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        // Enriquecer manualmente con los perfiles para no perder el remitente ("Chat con Alguien")
        if (data && data.length > 0) {
            const senderIds = [...new Set(data.map(n => n.sender_id).filter(id => id))];

            if (senderIds.length > 0) {
                const { data: profiles, error: profileError } = await sb
                    .from('profiles')
                    .select('id, username, avatar_url')
                    .in('id', senderIds);

                if (!profileError && profiles) {
                    const profileMap = {};
                    profiles.forEach(p => profileMap[p.id] = p);
                    data = data.map(n => {
                        if (n.sender_id && profileMap[n.sender_id]) {
                            n.sender = profileMap[n.sender_id];
                        }
                        return n;
                    });
                }
            }
        }

        console.log(`✅ Notificaciones recuperadas: ${data?.length || 0}`);
        renderNotificationsList(data || []);
        updateGlobalBadge();
    } catch (e) {
        console.error('❌ Error crítico al cargar notificaciones:', e);
        const list = document.getElementById('notifications-list');
        if (list) list.innerHTML = '<p class="empty-msg">Error al conectar con el servidor ❌</p>';
    }
}

function getFriendlyDate(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return 'recientemente';
    const diffMins = Math.floor((new Date() - dateObj) / 60000);
    if (diffMins < 1) return 'hace un momento';
    if (diffMins < 60) return `hace ${diffMins} min`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `hace ${diffHrs} h`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `hace ${diffDays} d`;
    return dateObj.toLocaleDateString();
}
window.getRelativeTimeString = getFriendlyDate;

async function countUnreadNotifications() {
    const sb = getSupabase();
    if (!sb || !currentUser) return;
    const { count, error } = await sb
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', currentUser.id)
        .eq('is_read', false);
    if (!error) {
        unreadNotificationsCount = count || 0;
        updateGlobalBadge();
    }
}

function updateGlobalBadge() {
    const badge = document.getElementById('global-notifications-badge');
    if (!badge) return;
    if (unreadNotificationsCount > 0) {
        badge.textContent = unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function renderNotificationsList(notifications) {
    const list = document.getElementById('notifications-list');
    const markAllBtn = document.getElementById('mark-all-read-btn');
    if (!list) return;

    if (notifications.length === 0) {
        list.innerHTML = '<p class="empty-msg">No tienes notificaciones aún. ✨</p>';
        if (markAllBtn) markAllBtn.style.display = 'none';
        return;
    }

    if (markAllBtn) markAllBtn.style.display = unreadNotificationsCount > 0 ? 'block' : 'none';

    list.innerHTML = notifications.map(n => {
        const sender = n.sender || { username: 'Alguien', avatar_url: '' };
        const time = getFriendlyDate(new Date(n.created_at));
        const iconMap = { 'like': '❤️', 'friend_request': '👥', 'message': '💬' };
        const icon = iconMap[n.type] || '🔔';
        const avatar = sender.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(sender.username || 'A')}&background=ddc9a3&color=6b4f3f&rounded=true&size=40`;

        return `
                <div class="notification-item ${n.is_read ? '' : 'unread'}" style="cursor: pointer;" onclick="window.handleNotificationClick('${n.id}', '${n.type}', '${n.sender_id || n.metadata?.target_id || ''}', '${sender.username || 'Usuario'}', '${avatar || ''}')">
                    <div class="notification-icon-wrapper">${icon}</div>
                    <div class="notification-text">
                        ${n.content}
                        <span class="notification-time">${time}</span>
                    </div>
                </div>
            `;
    }).join('');
}

window.handleNotificationClick = async (notifId, type, targetId, senderName, senderAvatar) => {
    try {
        const sb = getSupabase();
        if (sb) {
            await sb.from('notifications').update({ is_read: true }).eq('id', notifId);
            const item = document.querySelector(`[onclick*="${notifId}"]`);
            if (item) item.classList.remove('unread');
            if (typeof countUnreadNotifications === 'function') countUnreadNotifications();
        }
    } catch (e) {
        console.error('Error actualizando notificacion:', e);
    }

    const notifModal = document.getElementById('notifications-modal');
    if (notifModal) notifModal.style.display = 'none';

    if (type === 'message' && targetId) {
        if (typeof window.openChat === 'function') {
            window.openChat(targetId, senderName, senderAvatar);
        } else {
            console.warn('Función openChat no disponible para manejar notificación.');
        }
    } else if (type === 'friend_request') {
        const commBtn = document.getElementById('community-btn');
        if (commBtn) {
            commBtn.click();
            setTimeout(() => {
                const reqTab = document.querySelector('[data-community-tab="tab-requests"]');
                if (reqTab) reqTab.click();
            }, 400);
        }
    } else if (type === 'reward') {
        if (typeof switchView === 'function') switchView('games-view');
    }
};

function subscribeToNotifications() {
    const sb = getSupabase();
    if (!sb || !currentUser) return;

    // Cleanup existing subscription to avoid duplicate callbacks error
    if (notificationChannel) {
        console.log('🧹 Limpiando suscripción de notificaciones previa...');
        sb.removeChannel(notificationChannel);
    }

    console.log('📡 Iniciando suscripción de notificaciones en tiempo real...');
    notificationChannel = sb.channel('user-notifications')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${currentUser.id}`
        }, payload => {
            console.log('🔔 Nueva notificación recibida:', payload.new);
            unreadNotificationsCount++;
            updateGlobalBadge();

            const notif = payload.new;

            // Mostrar Toast
            showToast(`🔔 ${notif.content}`, 'info', 6000);

            // Si el modal de notificaciones está abierto, recargar la lista
            const modal = document.getElementById('notifications-modal');
            if (modal && modal.style.display !== 'none') {
                loadNotifications();
            }

            // --- ACTUALIZACIONES REACTIVAS DE UI ---

            // 1. Si es solicitud de amistad, actualizar badge de pestaña Comunidad
            if (notif.type === 'friend_request') {
                // Si el contenido indica una aceptación, recargar lista de amigos
                if (notif.content.includes('aceptado')) {
                    if (typeof loadFriendsList === 'function') loadFriendsList();
                } else {
                    // Es una solicitud nueva
                    const badge = document.getElementById('requests-badge');
                    if (badge) {
                        const current = parseInt(badge.textContent || 0);
                        badge.textContent = current + 1;
                        badge.style.display = 'inline-block';
                    }
                }
            }

            // 2. Si es un mensaje y el chat no está abierto con esa persona, actualizar badge de chat del amigo
            if (notif.type === 'message' && notif.sender_id) {
                // Si no estamos hablando con esa persona justo ahora
                if (typeof currentChatFriendId !== 'undefined' && currentChatFriendId !== notif.sender_id) {
                    // Incrementar contador local y actualizar UI de la lista de amigos
                    if (typeof friendUnreadMessages !== 'undefined') {
                        friendUnreadMessages[notif.sender_id] = (friendUnreadMessages[notif.sender_id] || 0) + 1;
                        if (typeof updateFriendListBadges === 'function') updateFriendListBadges();
                    }
                }
            }
        })
        .subscribe((status) => {
            console.log(`📡 Estado suscripción notificaciones: ${status}`);
            if (status === 'SUBSCRIBED') {
                console.log('✅ Conectado exitosamente al canal de notificaciones.');
            }
            if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                console.warn('⚠️ Conexión de notificaciones cerrada o con error. Reintentando en 5s...');
                setTimeout(() => subscribeToNotifications(), 5000);
            }
        });
}

async function createNotification(targetUserId, type, content, metadata = {}) {
    if (!currentUser || targetUserId === currentUser.id) return;
    const sb = getSupabase();
    if (!sb) return;

    try {
        console.log(`📡 Enviando notificación a ${targetUserId}:`, content);
        const { error } = await sb.from('notifications').insert({
            user_id: targetUserId,
            sender_id: currentUser.id,
            type,
            content,
            metadata
        });

        if (error) throw error;
    } catch (e) {
        console.error('⚠️ Fallo en createNotification:', e);
    }
}

// Event Listeners para Notificaciones
document.getElementById('notifications-btn')?.addEventListener('click', () => {
    showModal(document.getElementById('notifications-modal'));
    loadNotifications();
});

document.getElementById('close-notifications-modal')?.addEventListener('click', () => {
    hideModal(document.getElementById('notifications-modal'));
});

document.getElementById('mark-all-read-btn')?.addEventListener('click', async () => {
    const sb = getSupabase();
    if (!sb || !currentUser) return;
    await sb.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id);
    unreadNotificationsCount = 0;
    updateGlobalBadge();
    loadNotifications();
});

// Las utilidades de UI (showToast, showModal, etc.) ahora residen en src/utils.js y src/modules/auth.js


//// La lógica de XP, niveles y reinicio de estado ahora reside en src/modules/auth.js

// Inicializar estado de trivia para el usuario actual
const initializeTriviaState = () => {
    if (!currentUser) { dailyQuestion = null; hasAnsweredToday = false; return; }
    dailyQuestion = null;
    hasAnsweredToday = false;
};

// --- ACHIEVEMENTS / AUTOMATED BADGES ---
const BADGE_CATALOG = [
    { id: 'b_first_review', name: 'Escritor Novel', icon: '✍️', desc: 'Publica tu primera reseña' },
    { id: 'b_reviews_10', name: 'Lector Constante', icon: '📖', desc: 'Publica 10 reseñas' },
    { id: 'b_level_10', name: 'Erudito Nivel 10', icon: '🌟', desc: 'Alcanza el nivel 10' },
    { id: 'b_level_50', name: 'Gran Maestro Lector', icon: '👑', desc: 'Alcanza el nivel 50' },
    { id: 'b_trivia_50', name: 'Mente Brillante', icon: '🧠', desc: 'Responde 50 trivias' }
];

window.checkAchievements = async (uid) => {
    const sb = getSupabase();
    if (!sb || !uid) return;

    try {
        let earnedNewBadge = false;
        let currentBadges = [...userBadges];

        const hasBadge = (badgeId) => currentBadges.some(b => b.id === badgeId);

        const awardBadge = (badgeId) => {
            if (!hasBadge(badgeId)) {
                const badgeInfo = BADGE_CATALOG.find(b => b.id === badgeId);
                if (badgeInfo) {
                    currentBadges.push({ ...badgeInfo, type: 'badge' });
                    earnedNewBadge = true;
                    showToast(`¡Nueva insignia desbloqueada: ${badgeInfo.name}! ${badgeInfo.icon}`, 'success', 5000);
                }
            }
        };

        // 1. Reseñas escritas
        if (!hasBadge('b_first_review') || !hasBadge('b_reviews_10')) {
            const { count, error } = await sb.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', uid);
            if (!error) {
                if (count >= 1) awardBadge('b_first_review');
                if (count >= 10) awardBadge('b_reviews_10');
            }
        }

        // 2. Nivel de Usuario
        if (userLevel >= 10) awardBadge('b_level_10');
        if (userLevel >= 50) awardBadge('b_level_50');

        // 3. Trivia (Total respondidas)
        if (!hasBadge('b_trivia_50')) {
            const { count, error } = await sb.from('user_trivia_responses').select('*', { count: 'exact', head: true }).eq('user_id', uid);
            if (!error && count >= 50) awardBadge('b_trivia_50');
        }

        // Si ganó alguna insignia, guardar en la base de datos
        if (earnedNewBadge) {
            userBadges = currentBadges;
            await sb.from('profiles').update({ badges: currentBadges }).eq('id', uid);
            if (typeof updateProfileUI === 'function') {
                // Forzar actualización de la UI del perfil
                const { data } = await sb.from('profiles').select('*').eq('id', uid).single();
                if (data) updateProfileUI(data);
            }
        }
    } catch (error) {
        console.error('Error verificando logros:', error);
    }
};

// --- PROFILE & ECONOMY LOGIC (GLOBAL) ---
const loadProfile = async (user) => {
    if (!user) return;

    // Delegar carga de datos al módulo auth.js (centralizado)
    if (typeof window.fetchUserProfile === 'function') {
        await window.fetchUserProfile(user.id);
    }

    // Lo demás (notificaciones, amigos) se mantiene por ahora
    try {
        const sb = getSupabase();
        if (typeof countUnreadNotifications === 'function') countUnreadNotifications();
        if (typeof subscribeToNotifications === 'function') subscribeToNotifications();
        if (typeof window.loadFriendsList === 'function') window.loadFriendsList();

        const { data } = await sb.from('profiles').select('role').eq('id', user.id).single();
        if (data) {
            const adminBtn = document.getElementById('admin-btn');
            if (adminBtn) adminBtn.style.display = (data.role === 'admin') ? 'inline-block' : 'none';
        }
    } catch (e) {
        console.error('Error en carga complementaria de perfil:', e);
    }
};

window.updateProfileUI = (profile) => {
    const ud = document.getElementById('user-display');
    const na = document.getElementById('current-avatar');
    const pnd = document.getElementById('profile-username-display');
    if (profile.username) {
        if (ud) ud.textContent = `¡Hola, ${profile.username}! 📖`;
        if (pnd) pnd.textContent = profile.username;
        const dashUser = document.getElementById('dash-username');
        if (dashUser) dashUser.textContent = profile.username;
        const quickActions = document.getElementById('dash-quick-actions');
        if (quickActions) quickActions.style.display = 'block';

        const dashGrid = document.querySelector('.dashboard-grid');
        if (dashGrid) dashGrid.classList.remove('no-session');

        const guestCTA = document.getElementById('dash-guest-cta');
        if (guestCTA) guestCTA.style.display = 'none';
    }
    if (profile.avatar_url && na) {
        na.src = profile.avatar_url;
    } else if (na) {
        na.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.username || 'Lector')}&background=ddc9a3&color=6b4f3f&rounded=true&size=80`;
    }
    const pcd = document.getElementById('profile-coins-display'); if (pcd) pcd.textContent = profile.coins || 0;
    const pbc = document.getElementById('profile-badges-container');
    if (pbc) {
        const userBadgesList = profile.badges || [];
        
        // Renderizar TODO el catálogo (estilo Steam)
        pbc.innerHTML = BADGE_CATALOG.map(badge => {
            const hasIt = userBadgesList.some(ub => ub.id === badge.id);
            const titleText = hasIt ? `${badge.name}: ${badge.desc}` : `BLOQUEADO: ${badge.desc}`;
            return `
                <div class="badge-item ${hasIt ? 'earned' : 'locked'}" title="${titleText}">
                    <span class="badge-icon">${badge.icon}</span>
                    <span class="badge-name-mini">${badge.name}</span>
                </div>
            `;
        }).join('');
    }
    const goalInput = document.getElementById('profile-goal');
    const genresInput = document.getElementById('profile-genres');
    if (goalInput) goalInput.value = (profile.preferences?.goal) || '';
    if (genresInput) genresInput.value = (profile.preferences?.genres || []).join(', ');
};

/* --- COSMETICS: APPLY & EQUIP --- */
// La lógica de cosméticos (applyCosmetics) ahora reside en src/modules/store.js


// La lógica de personalización (equipItem), economía (addCoins, spendCoins) y el catálogo de la tienda ahora residen en src/modules/auth.js y src/modules/store.js




// Supabase ya es inicializado por src/main.js (npm) y expuesto en window.supabaseInstance.
// La función initSupabase() del CDN ha sido eliminada en la Fase Final de modularización.





document.addEventListener('DOMContentLoaded', () => {

    // initSupabase() eliminado — Supabase ya está disponible en window.supabaseInstance
    // gracias a src/main.js que se carga primero.



    // (showToast moved to global scope)



    // --- Selectores Globales ---

    const starRating = document.getElementById('star-rating');

    const cells = document.querySelectorAll('.star-cell');

    const hitboxes = document.querySelectorAll('.star-hitbox');

    const authModal = document.getElementById('auth-modal');

    const authForm = document.getElementById('auth-form');

    const modalTitle = document.getElementById('modal-title');

    const authSubmitBtn = document.getElementById('auth-submit-btn');

    const authSwitch = document.getElementById('auth-switch');

    const switchToRegister = document.getElementById('switch-to-register');

    const closeModalElements = document.querySelectorAll('.close-modal');

    const loginBtn = document.getElementById('login-btn');

    const registerBtn = document.getElementById('register-btn');

    const logoutBtn = document.getElementById('logout-btn');

    const newEntryBtn = document.getElementById('new-entry-btn');

    const myReviewsBtn = document.getElementById('my-reviews-btn');

    const saveReviewBtn = document.getElementById('save-review-btn');

    const reviewsModal = document.getElementById('reviews-modal');

    const reviewsList = document.getElementById('reviews-list');

    const titleInput = document.getElementById('title');

    const authorInput = document.getElementById('author');

    const searchBtn = document.getElementById('search-cover-btn');

    const photoPreview = document.getElementById('photo-preview');

    const musicLink = document.getElementById('music-link');

    const musicFile = document.getElementById('music-file');

    const musicFileTrigger = document.getElementById('music-file-trigger');

    const playPauseBtn = document.getElementById('play-pause-btn');

    const progressBar = document.getElementById('progress-bar');

    const volumeBar = document.getElementById('volume-bar');

    const trackNameDisplay = document.getElementById('track-name-display');

    const photoBox = document.getElementById('photo-box');

    const photoInput = document.getElementById('photo-input');

    const customPlayerUI = document.getElementById('custom-player');

    const spotifyContainer = document.getElementById('spotify-container');

    const noPlayerMsg = document.getElementById('no-player-msg');

    const musicInputGroup = document.querySelector('.music-input-group');

    const musicResetBtn = document.getElementById('music-reset-btn');

    const navToggle = document.getElementById('nav-toggle');

    const navbar = document.querySelector('.navbar');

    const feedbackModal = document.getElementById('feedback-modal');

    const feedbackTitle = document.getElementById('feedback-title');

    const feedbackMessage = document.getElementById('feedback-message');
    const themeToggle = document.getElementById('theme-toggle');
    const profileBtn = document.getElementById('profile-btn');
    const profileModal = document.getElementById('profile-modal');
    const profileForm = document.getElementById('profile-form');
    const closeProfileModal = document.getElementById('close-profile-modal');

    // --- Restored Nav Selectors ---
    const triviaBtn = document.getElementById('trivia-btn');
    const challengesBtn = document.getElementById('challenges-btn');
    const communityBtn = document.getElementById('community-btn');
    const dropdownToggleBtn = document.getElementById('dropdown-toggle-btn');
    const userDropdown = document.querySelector('.user-dropdown');

    // --- ADMIN SYSTEM SELECTORS ---
    const adminBtn = document.getElementById('admin-btn');
    const adminTabBtns = document.querySelectorAll('.admin-tab-btn');
    const adminTabContents = document.querySelectorAll('.admin-tab-content');
    const adminTriviaForm = document.getElementById('admin-trivia-form');
    const adminReviewsList = document.getElementById('admin-reviews-list');
    const adminUsersList = document.getElementById('admin-users-list');


    if (navToggle) {
        navToggle.addEventListener('click', (e) => {
            console.log('✅ Hamburguesa clicada!');
            e.stopPropagation(); // Evitar cualquier interferencia superior
            const navbarEl = document.querySelector('.navbar');
            if (navbarEl) {
                const isOpen = navbarEl.classList.toggle('nav-open');
                console.log('🍔 Menú ahora está:', isOpen ? 'Abierto' : 'Cerrado');
            }
        });
    }

    // --- Star Rating Logic ---


    const setRating = (val) => {

        if (!starRating) return;

        starRating.dataset.rating = val;

        cells.forEach(cell => {

            const index = parseInt(cell.dataset.index);

            cell.classList.remove('full', 'half', 'preview-full', 'preview-half');

            if (val >= index) cell.classList.add('full');

            else if (val >= index - 0.5) cell.classList.add('half');

        });

    };



    // Preview visual en hover (no afecta el valor real)

    const previewRating = (val) => {

        if (!starRating) return;

        const currentRating = parseFloat(starRating.dataset.rating || 0);

        cells.forEach(cell => {

            const index = parseInt(cell.dataset.index);

            cell.classList.remove('full', 'half');

            // Aplicar clases de preview

            if (val >= index) {

                cell.classList.add('preview-full');

                cell.classList.remove('preview-half');

            } else if (val >= index - 0.5) {

                cell.classList.add('preview-half');

                cell.classList.remove('preview-full');

            } else {

                cell.classList.remove('preview-full', 'preview-half');

            }

        });

    };



    // Restaurar al valor real cuando el mouse sale

    const restoreRating = () => {

        if (!starRating) return;

        const currentRating = parseFloat(starRating.dataset.rating || 0);

        // Limpiar clases de preview

        cells.forEach(cell => {

            cell.classList.remove('preview-full', 'preview-half');

        });

        // Restaurar clases reales

        setRating(currentRating);

    };



    hitboxes.forEach(hb => {

        const val = parseFloat(hb.dataset.value);

        hb.addEventListener('click', () => setRating(val));

        hb.addEventListener('mouseenter', () => {

            console.log('Hitbox hover:', val, hb.classList.contains('left') ? 'left' : 'right');

            previewRating(val);

        });

    });



    // Limpiar preview cuando el mouse sale de cualquier hitbox

    document.querySelectorAll('.star-cell').forEach(cell => {

        cell.addEventListener('mouseleave', () => {

            restoreRating();

        });

    });



    // --- Photo Box Logic ---

    if (photoBox && photoInput && photoPreview) {

        photoBox.addEventListener('click', () => photoInput.click());

        photoInput.addEventListener('change', function () {

            const file = this.files[0];

            if (file) {

                const reader = new FileReader();

                reader.onload = (e) => {

                    const url = e.target.result;

                    photoPreview.innerHTML = `<img src="${url}" alt="Preview">`;

                    currentCoverUrl = url;

                };

                reader.readAsDataURL(file);

            }

        });

    }



    // --- Cover Search Logic ---

    let localCurrentResults = []; // Renamed to avoid conflict with global currentResults

    let localCurrentIndex = -1; // Renamed to avoid conflict with global currentIndex

    let localLastSearchQuery = ''; // Renamed to avoid conflict with global lastSearchQuery



    const displayCover = async (idx) => {

        if (idx < 0 || idx >= localCurrentResults.length) return;

        if (photoPreview) photoPreview.classList.add('loading');

        try {

            const res = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?proxyId=${localCurrentResults[idx]}`);

            const data = await res.text();

            if (data.startsWith('Error')) throw new Error(data);

            currentCoverUrl = data;

            if (photoPreview) photoPreview.innerHTML = `<img src="${data}" alt="Cover">`;

        } catch (e) {

            if (photoPreview) photoPreview.innerHTML = `<div style="padding:20px;">Error al cargar.</div>`;

        } finally {

            if (photoPreview) photoPreview.classList.remove('loading');

        }

    };



    if (searchBtn && titleInput && authorInput) {

        searchBtn.addEventListener('click', async () => {

            const title = titleInput.value.trim();

            const author = authorInput.value.trim();



            if (!title || !author) {

                showToast('Por favor, escribe el TÍTULO y el AUTOR para buscar la portada.', 'warning');

                return;

            }



            const q = `${title} ${author}`;

            if (q === localLastSearchQuery && localCurrentResults.length) {

                localCurrentIndex = (localCurrentIndex + 1) % localCurrentResults.length;

                await displayCover(localCurrentIndex);

                return;

            }

            searchBtn.textContent = 'BUSCANDO...';

            try {

                const res = await fetch(`${GOOGLE_APPS_SCRIPT_URL}?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`);

                const data = await res.json();

                if (data.items?.length) {

                    localCurrentResults = data.items;

                    localCurrentIndex = 0;

                    localLastSearchQuery = q;

                    await displayCover(0);

                } else {

                    showToast('No se encontraron portadas. Intenta ajustar el título o autor.', 'warning');

                }

            } catch (e) {

                console.error('Error en búsqueda:', e);

                showToast('Hubo un error al buscar la portada. Intenta de nuevo.', 'error');

            } finally {

                searchBtn.textContent = 'BUSCAR PORTADA ✨';

            }

        });

    }



    // --- Music Player Logic ---

    let localAudio = new Audio();



    const stopAll = () => {

        localAudio.pause();

        localAudio.src = '';

        if (spotifyContainer) spotifyContainer.innerHTML = '';

        clearInterval(progressInterval);

        currentPlayerType = null;

        if (playPauseBtn) playPauseBtn.textContent = '▶️';

    };



    const showUI = (type) => {

        if (customPlayerUI) customPlayerUI.style.display = (type === 'yt' || type === 'local') ? 'flex' : 'none';

        if (spotifyContainer) spotifyContainer.style.display = (type === 'spotify') ? 'block' : 'none';

        if (noPlayerMsg) noPlayerMsg.style.display = (type === null) ? 'block' : 'none';



        if (musicInputGroup && musicResetBtn) {

            if (type !== null) {

                musicInputGroup.style.display = 'none';

                musicResetBtn.style.display = 'block';

            } else {

                musicInputGroup.style.display = 'flex';

                musicResetBtn.style.display = 'none';

                if (musicLink) musicLink.value = '';

            }

        }

        currentPlayerType = type;

    };



    if (musicResetBtn) {

        musicResetBtn.addEventListener('click', () => {

            stopAll();

            showUI(null);

            currentTrackInfo = { name: '', source: '' };

        });

    }



    const startTimer = () => {

        clearInterval(progressInterval);

        progressInterval = setInterval(() => {

            if (progressBar) {

                if (currentPlayerType === 'local') {

                    progressBar.value = (localAudio.currentTime / localAudio.duration) * 100 || 0;

                }

            }

        }, 500);

    };



    if (playPauseBtn) {

        playPauseBtn.addEventListener('click', () => {

            if (currentPlayerType === 'local') {

                if (localAudio.paused) { localAudio.play(); playPauseBtn.textContent = '⏸️'; startTimer(); }

                else { localAudio.pause(); playPauseBtn.textContent = '▶️'; }

            }

        });

    }



    if (progressBar) {

        progressBar.addEventListener('input', (e) => {

            const v = parseFloat(e.target.value);

            if (currentPlayerType === 'local') localAudio.currentTime = (v / 100) * localAudio.duration;

        });

    }



    if (volumeBar) {

        volumeBar.addEventListener('input', (e) => {

            const v = parseInt(e.target.value);

            localAudio.volume = v / 100;

        });

    }



    // Obtener título (y autor) de una pista de Spotify vía oEmbed (público, sin API key)

    const fetchSpotifyTrackInfo = async (trackUrl) => {

        const oembedUrl = 'https://open.spotify.com/oembed?url=' + encodeURIComponent(trackUrl);

        try {

            const res = await fetch(oembedUrl);

            if (!res.ok) return null;

            const data = await res.json();

            const title = data.title || null; // p. ej. "Song Name - Artist Name"

            return title;

        } catch (e) {

            console.warn('Spotify oEmbed no disponible:', e.message);

            return null;

        }

    };



    if (musicLink && trackNameDisplay) {

        musicLink.addEventListener('input', (e) => {

            const url = e.target.value.trim();

            stopAll();

            spotifyInfoLoaded = false; // Resetear bandera cuando cambia el enlace

            if (!url) { showUI(null); return; }



            if (url.includes('spotify.com')) {

                const parts = url.split('/');

                const idWithQuery = parts[parts.length - 1];

                const id = idWithQuery.split('?')[0];



                if (id && id.length > 10) {

                    if (spotifyContainer) spotifyContainer.innerHTML = `<iframe src="https://open.spotify.com/embed/track/${id}" width="100%" height="80" frameBorder="0" allowtransparency="true" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;

                    showUI('spotify');

                    currentTrackInfo.name = 'Canción de Spotify';

                    currentTrackInfo.source = 'Spotify';

                    if (trackNameDisplay) trackNameDisplay.textContent = 'Cargando...';

                    (async () => {

                        const title = await fetchSpotifyTrackInfo(url);

                        if (title) {

                            // Extraer artista y nombre de la canción

                            let songName = title;

                            let artistName = 'Spotify';



                            if (title && title.includes(' - ')) {

                                const parts = title.split(' - ');

                                songName = parts[0]; // Primera parte: nombre de la canción

                                artistName = parts[1]; // Segunda parte: artista

                            }



                            currentTrackInfo.name = songName;

                            currentTrackInfo.source = artistName;

                            spotifyInfoLoaded = true; // Marcar que la info de Spotify cargó

                            if (trackNameDisplay) trackNameDisplay.textContent = title;

                        } else {

                            if (trackNameDisplay) trackNameDisplay.textContent = 'Canción de Spotify';

                        }

                    })();

                    console.log('✅ Spotify: Track cargado correctamente');

                }

            } else if (url.includes('youtube.com') || url.includes('youtu.be')) {

                showToast('YouTube ya no está soportado aquí. Usa Spotify o un archivo MP3 local. 🎵', 'warning');

                showUI(null);

            }

        });

    }



    if (musicFileTrigger && musicFile && volumeBar && trackNameDisplay) {

        musicFileTrigger.addEventListener('click', () => musicFile.click());

        musicFile.addEventListener('change', function () {

            const f = this.files[0];

            if (f) {

                stopAll();

                localAudio.src = URL.createObjectURL(f);

                localAudio.volume = volumeBar.value / 100;

                showUI('local');

                trackNameDisplay.textContent = f.name;

                currentTrackInfo = { name: f.name, source: 'Archivo local' };

            }

        });

    }



    localAudio.onended = () => { if (playPauseBtn) playPauseBtn.textContent = '▶️'; if (progressBar) progressBar.value = 0; clearInterval(progressInterval); };



    // --- Capture Logic ---

    const shareBtn = document.getElementById('share-whatsapp-btn');

    if (shareBtn) {

        shareBtn.addEventListener('click', async () => {

            if (typeof html2canvas === 'undefined') return;

            const orig = shareBtn.innerHTML;

            shareBtn.textContent = 'GENERANDO...';

            shareBtn.disabled = true;



            // Esperar a que la info de Spotify cargue si hay un track

            if (currentTrackInfo.name && currentTrackInfo.name.includes(' - ')) {

                let attempts = 0;

                const maxAttempts = 20; // Máximo 2 segundos esperando

                console.log('🎵 Iniciando espera - spotifyInfoLoaded:', spotifyInfoLoaded);

                while (!spotifyInfoLoaded && attempts < maxAttempts) {

                    await new Promise(resolve => setTimeout(resolve, 100));

                    attempts++;

                    console.log(`🎵 Esperando ${attempts}/${maxAttempts} - spotifyInfoLoaded:`, spotifyInfoLoaded);

                }

                console.log('🎵 Espera finalizada - spotifyInfoLoaded:', spotifyInfoLoaded);

            }



            try {

                const canvas = await html2canvas(document.getElementById('capture-area'), {

                    scale: 2, backgroundColor: '#f9f3e5',

                    onclone: (doc) => {

                        const area = doc.getElementById('capture-area');

                        area.querySelectorAll('textarea').forEach(ta => {

                            const div = doc.createElement('div');

                            div.textContent = ta.value || ta.placeholder;

                            div.className = 'capture-mirror' + (ta.value ? '' : ' mirror-placeholder');

                            div.style.minHeight = ta.offsetHeight + 'px';

                            ta.parentNode.replaceChild(div, ta);

                        });

                        const sec = area.querySelector('.music-section');

                        if (sec) {

                            const inputGroupClone = sec.querySelector('.music-input-group');

                            if (inputGroupClone) inputGroupClone.style.display = 'none';



                            const playerClone = sec.querySelector('#player-container');



                            // html2canvas no puede dibujar iframes de otros dominios (Spotify).

                            // Para Spotify y archivo local: reemplazamos por un bloque visual con la info.

                            if (playerClone && currentTrackInfo.name) {

                                const trackName = currentTrackInfo.name;

                                const source = currentTrackInfo.source || 'Spotify';



                                // Extraer artista y nombre de la canción (formato "Song Name - Artist Name")

                                let songName = trackName;

                                let artistName = source;



                                if (trackName && trackName.includes(' - ')) {

                                    const parts = trackName.split(' - ');

                                    songName = parts[0]; // Primera parte: nombre de la canción

                                    artistName = parts[1]; // Segunda parte: artista

                                }



                                playerClone.innerHTML = `

                                    <div class="music-capture-mirror">

                                        <div class="note-icon">🎵</div>

                                        <div class="track-info">

                                            <div class="track-name">${songName}</div>

                                            <div class="track-source">${artistName}</div>

                                        </div>

                                    </div>`;

                            } else if (playerClone) {

                                sec.style.display = 'none';

                            }

                        }

                    }

                });

                const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));

                if (navigator.clipboard?.write) {

                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);

                    showToast('¡Imagen copiada al portapapeles! 📋', 'success');

                } else {

                    const a = document.createElement('a'); a.download = 'reseña.png'; a.href = canvas.toDataURL(); a.click();

                }

            } finally { shareBtn.innerHTML = orig; shareBtn.disabled = false; }

        });

    }





    // --- Auth & Modals Logic (Modularizado) ---
    const updateAuthUI = (user) => {
        if (currentUser && user && currentUser.id === user.id) {
            currentUser = user;
            return;
        }
        currentUser = user;
        const guestDiv = document.getElementById('auth-guest');
        const userDiv = document.getElementById('auth-user');
        const userDisplay = document.getElementById('user-display');
        if (guestDiv) guestDiv.style.display = user ? 'none' : 'flex';
        if (userDiv) userDiv.style.display = user ? 'flex' : 'none';

        if (saveReviewBtn) saveReviewBtn.style.setProperty('display', user ? 'flex' : 'none', 'important');
        if (shareBtn) shareBtn.style.setProperty('display', user ? 'inline-flex' : 'none', 'important');

        if (user && userDisplay) {
            const username = user.user_metadata?.username || user.email?.split('@')[0] || 'Lector';
            userDisplay.textContent = `¡Hola, ${username}! 📖`;
            if (typeof resetUserGlobals === 'function') resetUserGlobals();
            if (typeof resetJournal === 'function') resetJournal();
            if (typeof loadProfile === 'function') loadProfile(user);
            if (typeof initializeTriviaState === 'function') initializeTriviaState();
        } else {
            if (typeof resetUserGlobals === 'function') resetUserGlobals();
            if (typeof resetJournal === 'function') resetJournal();
        }
    };
    window.updateAuthUI = updateAuthUI;

    // Inicializar listeners modulares
    if (typeof window.initAuthUI === 'function') {
        window.initAuthUI();
    }

    // --- Core Supabase Logic ---
    const checkSession = async () => {
        const sb = getSupabase();
        if (!sb) return;

        // Detección manual de redirección de recuperación (Fallback)
        // Esto es necesario porque a veces Supabase dispara primero SIGNED_IN o INITIAL_SESSION
        // antes de PASSWORD_RECOVERY, o el evento se pierde en la recarga.
        if (window.location.hash.includes('type=recovery') || window.location.hash.includes('access_token')) {
            const modal = document.getElementById('update-password-modal');
            if (modal) {
                console.log('🔄 Redirección de recuperación detectada manualmente.');
                setTimeout(() => showModal(modal), 500); // Pequeño delay para asegurar que el DOM y modales estén listos
            }
        }

        const { data: { session } } = await sb.auth.getSession();
        updateAuthUI(session?.user || null);

        sb.auth.onAuthStateChange(async (event, sess) => {
            console.log('🔔 Auth Event:', event, 'Session User:', sess?.user?.email);
            if (sess?.user) {
                console.log('🛡️ User Metadata:', sess.user.user_metadata);
                console.log('📧 Email Confirmed At:', sess.user.email_confirmed_at);
            }
            
            if (event === 'PASSWORD_RECOVERY') {
                const modal = document.getElementById('update-password-modal');
                if (modal) showModal(modal);
            }
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
                updateAuthUI(sess?.user || null);
                const authModal = document.getElementById('auth-modal');
                if (authModal) hideModal(authModal);
            } else if (event === 'SIGNED_OUT') {
                updateAuthUI(null);
            }
        });
    };
    // Llamada inicial
    checkSession();

    // --- Restored Nav Logic ---
    if (triviaBtn) triviaBtn.addEventListener('click', () => {
        if (typeof switchView === 'function') switchView('games-view');
    });

    if (challengesBtn) challengesBtn.addEventListener('click', () => {
        const modal = document.getElementById('challenges-modal');
        if (modal) {
            if (typeof showModal === 'function') showModal(modal);
        }
    });

    // --- Gestión Global de Modales (Cierre) ---
    const handleCloseModal = (e) => {
        if (e.target.classList.contains('close-modal')) {
            const modal = e.target.closest('.modal');
            if (modal) hideModal(modal);
        }
        if (e.target.classList.contains('modal')) {
            hideModal(e.target);
        }
    };
    document.addEventListener('click', handleCloseModal);



    if (communityBtn) communityBtn.addEventListener('click', () => {
        if (typeof switchView === 'function') switchView('community-view');
        // Reset to global tab
        const globalTabBtn = document.querySelector('[data-community-tab="tab-global"]');
        if (globalTabBtn) globalTabBtn.click();
    });

    // --- Auth & Arcade Initialization ---
    initAuthUI();

    const playTriviaBtn = document.getElementById('play-trivia-btn');
    if (playTriviaBtn) {
        playTriviaBtn.onclick = () => triviaGame.start();
    }

    const playMemoryBtn = document.getElementById('play-memory-btn');
    if (playMemoryBtn) {
        playMemoryBtn.onclick = () => memoryGame.start();
    }
    
    if (window.triviaGame) window.triviaGame.init();
    if (window.memoryGame) window.memoryGame.init();

    if (dropdownToggleBtn && userDropdown) {
        dropdownToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('active');
            const menu = userDropdown.querySelector('.dropdown-menu');
            if (menu) menu.classList.toggle('show');
        });
    }

    // Cerrar dropdown al hacer click fuera
    window.addEventListener('click', (e) => {
        if (userDropdown && !userDropdown.contains(e.target)) {
            userDropdown.classList.remove('active');
            const menu = userDropdown.querySelector('.dropdown-menu');
            if (menu) menu.classList.remove('show');
        }
    });



    // --- Review Storage Logic ---

    if (saveReviewBtn && titleInput && authorInput && starRating && musicLink) {

        saveReviewBtn.addEventListener('click', async () => {

            if (!currentUser) return;

            const sb = getSupabase();

            if (!sb) return;



            // Validación de campos obligatorios (excepto soundtrack)

            const reviewTextEl = document.getElementById('review-text');

            const favQuoteEl = document.getElementById('fav-quote');

            const startDateEl = document.getElementById('start-date');

            const endDateEl = document.getElementById('end-date');

            const recommendEl = document.getElementById('recommend');



            const titleVal = titleInput.value.trim();

            const authorVal = authorInput.value.trim();

            const reviewTextVal = reviewTextEl ? reviewTextEl.value.trim() : '';

            const favQuoteVal = favQuoteEl ? favQuoteEl.value.trim() : '';

            const startDateVal = startDateEl ? startDateEl.value.trim() : '';

            const endDateVal = endDateEl ? endDateEl.value.trim() : '';

            const ratingVal = parseFloat(starRating.dataset.rating || 0);



            const missing = [];

            if (!titleVal) missing.push('título');

            if (!authorVal) missing.push('autor');

            if (!favQuoteVal) missing.push('frase favorita');

            if (!reviewTextVal) missing.push('reseña');

            if (!startDateVal) missing.push('fecha de inicio');

            if (!endDateVal) missing.push('fecha de término');

            if (!ratingVal || ratingVal <= 0) missing.push('calificación');

            if (!currentCoverUrl) missing.push('portada del libro');



            if (missing.length > 0) {

                showToast(

                    `Por favor completa: ${missing.join(', ')} antes de guardar la reseña.`,

                    'warning'

                );

                return;

            }



            // Verificar si el usuario ya tiene una reseña del mismo libro (solo si no está editando)

            if (!editingReviewId) {

                try {

                    const { data: existingReviews, error: checkError } = await sb

                        .from('reviews')

                        .select('id, title, author')

                        .eq('user_id', currentUser.id);



                    if (checkError) throw checkError;



                    if (existingReviews && existingReviews.length > 0) {

                        // Comprobar si coincide el título O el autor con similitud
                        const isDuplicate = existingReviews.some(review => {

                            const titleSimilarity = calculateSimilarity(review.title, titleVal);
                            const authorSimilarity = calculateSimilarity(review.author, authorVal);

                            // Umbral de similitud: 0.8 (80% similar)
                            return titleSimilarity >= 0.8 || authorSimilarity >= 0.8;
                        });



                        if (isDuplicate) {

                            showToast('Ya tienes una reseña para este libro. Solo puedes tener una reseña por libro. 📚', 'warning');

                            return;

                        }

                    }

                } catch (error) {

                    console.error('Error verificando reseña existente:', error);

                    showToast('Error al verificar si ya existe una reseña de este libro.', 'error');

                    return;

                }

            }



            const reviewData = {

                user_id: currentUser.id,

                title: titleVal,

                author: authorVal,

                rating: ratingVal,

                review_text: reviewTextVal,

                fav_quote: favQuoteVal,

                start_date: startDateVal,

                end_date: endDateVal,

                recommend: recommendEl ? recommendEl.checked : false,

                photo_url: currentCoverUrl || '',

                music_link: musicLink.value,

                music_info: JSON.stringify(currentTrackInfo),

                fav_character: document.getElementById('fav-character')?.value.trim() || ''

            };



            // Si estamos editando, incluimos el ID para sobreescribir (upsert)

            if (editingReviewId) {

                reviewData.id = editingReviewId;

            }



            console.log("💾 Guardando reseña (Upsert) con portada:", currentCoverUrl);



            saveReviewBtn.disabled = true;

            saveReviewBtn.textContent = 'GUARDANDO...';



            try {

                const { error } = await sb.from('reviews').upsert([reviewData]);

                if (error) throw error;
                showToast('¡Reseña guardada con éxito en tu biblioteca! 📚✨', 'success');

                // --- ECONOMÍA: XP y Misiones solo por reseñas NUEVAS y de CALIDAD ---
                if (!editingReviewId) {
                    if (reviewTextVal.length >= 100) {
                        awardXP(50); // XP por reseña nueva
                        if (window.checkMissions) window.checkMissions('review_written');
                        console.log("📈 Recompensa de XP otorgada por reseña nueva.");
                    } else {
                        showToast('Reseña muy corta. Escribe al menos 100 caracteres para ganar XP. ✍️', 'info');
                    }
                }

                resetJournal();
                // Verificar logros e insignias tras guardar
                checkAchievements(currentUser.id);

            } catch (error) {

                console.error('Save error:', error);

                showToast('Error al guardar: ' + error.message, 'error');

            } finally {

                saveReviewBtn.disabled = false;

                saveReviewBtn.textContent = 'GUARDAR EN MIS LIBROS 💾';

            }

        });

    }



    if (myReviewsBtn && reviewsModal && reviewsList) {

        myReviewsBtn.addEventListener('click', async () => {

            showModal(reviewsModal);

            reviewsList.innerHTML = '<p class="no-player">Cargando tus libros...</p>';



            const sb = getSupabase();

            if (!sb) return;

            try {

                const { data, error } = await sb.from('reviews')
                    .select('*, like_count')
                    .eq('user_id', currentUser.id)
                    .order('created_at', { ascending: false });

                if (error) throw error;



                if (data.length === 0) {

                    reviewsList.innerHTML = '<p class="no-player">Aún no has guardado ningún libro. 📖</p>';

                    return;

                }



                reviewsList.innerHTML = '';

                data.forEach(review => {

                    const card = document.createElement('div');

                    card.className = 'review-card';

                    card.innerHTML = `

                        <img src="${review.photo_url || 'https://via.placeholder.com/150x200?text=Sin+Portada'}" alt="Portada">

                        <h4>${review.title || 'Sin Título'}</h4>

                        <p style="font-size: 0.8em; opacity: 0.7;">${review.author || 'Anónimo'}</p>

                        <p style="color: var(--secondary-color); font-weight: bold;">${'⭐'.repeat(Math.floor(review.rating))}${review.rating % 1 !== 0 ? '½' : ''}</p>

                    `;

                    card.addEventListener('click', () => loadReviewIntoJournal(review));

                    reviewsList.appendChild(card);

                });

            } catch (error) {

                reviewsList.innerHTML = `<p class="no-player">Error al cargar: ${error.message}</p>`;

            }

        });

    }



    let currentViewBeforeJournal = 'dashboard-view'; // Track for back button

    const loadReviewIntoJournal = async (review) => {
        const sb = getSupabase();
        if (sb && review.id) {
            // --- Fuente de Verdad: Conteo Real de la Tabla de Likes ---
            const { count, error: countErr } = await sb.from('review_likes')
                .select('*', { count: 'exact', head: true })
                .eq('review_id', review.id);

            if (!countErr) review.like_count = count;

            // Verificar si el usuario actual ha dado like realmente
            if (currentUser) {
                const { data: hasLike } = await sb.from('review_likes')
                    .select('id')
                    .eq('review_id', review.id)
                    .eq('user_id', currentUser.id)
                    .maybeSingle();
                review.userLiked = !!hasLike;
            }
        }

        console.log("🔄 Cargando reseña:", review.title);



        if (titleInput) titleInput.value = review.title || '';

        if (authorInput) authorInput.value = review.author || '';

        const rt = document.getElementById('review-text');

        if (rt) rt.value = review.review_text || '';

        const fq = document.getElementById('fav-quote');

        if (fq) {
            fq.value = review.fav_quote || '';
            // Técnica de espejo: actualizar el atributo del padre para el auto-resize por CSS
            if (fq.parentNode) fq.parentNode.dataset.replicatedValue = fq.value;
            // fav-quote ahora se gestiona por CSS Grid (espejo), no necesita resize() manual
        }

        const sd = document.getElementById('start-date');

        if (sd) sd.value = review.start_date || '';

        const ed = document.getElementById('end-date');

        if (ed) ed.value = review.end_date || '';

        const recommendCheck = document.getElementById('recommend');

        if (recommendCheck) {

            recommendCheck.checked = review.recommend === true || review.recommend === 'true' || review.recommend === 'Sí';

            const recommendText = document.getElementById('recommend-text');

            if (recommendText) {

                recommendText.textContent = recommendCheck.checked ? 'Sí' : 'No';

            }

        }



        const fc = document.getElementById('fav-character');

        if (fc) fc.value = review.fav_character || '';



        editingReviewId = review.id; // Marcamos que estamos editando este ID

        setRating(review.rating || 0);

        currentCoverUrl = review.photo_url;

        if (photoPreview) {

            if (review.photo_url) {

                photoPreview.innerHTML = `<img src="${review.photo_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 20px;">`;

            } else {

                photoPreview.innerHTML = '<span class="photo-label">PORTADA</span><span class="photo-label">AQUÍ</span>';

            }

        }



        if (musicLink) musicLink.value = review.music_link || '';



        // Cargar widget de Spotify si hay un enlace valido

        if (musicLink && review.music_link && review.music_link.includes('open.spotify.com')) {

            const url = review.music_link;

            let id = null;



            if (url.includes('/track/')) {

                const parts = url.split('/track/');

                if (parts.length > 1) {

                    const idWithQuery = parts[1].split('?')[0];

                    id = idWithQuery.split('/')[0];

                }

            }



            if (id && id.length > 10 && spotifyContainer) {

                spotifyContainer.innerHTML = `<iframe src="https://open.spotify.com/embed/track/${id}" width="100%" height="80" frameBorder="0" allowtransparency="true" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;

                if (showUI) showUI('spotify');

                currentTrackInfo.name = 'Canción de Spotify';

                currentTrackInfo.source = 'Spotify';

                if (trackNameDisplay) trackNameDisplay.textContent = 'Cargando...';

                (async () => {

                    const title = await fetchSpotifyTrackInfo(url);

                    if (title) {

                        // Extraer artista y nombre de la canción

                        let songName = title;

                        let artistName = 'Spotify';



                        if (title && title.includes(' - ')) {

                            const parts = title.split(' - ');

                            songName = parts[0]; // Primera parte: nombre de la canción

                            artistName = parts[1]; // Segunda parte: artista

                        }



                        currentTrackInfo.name = songName;

                        currentTrackInfo.source = artistName;

                        spotifyInfoLoaded = true; // Marcar que la info de Spotify cargó

                        if (trackNameDisplay) trackNameDisplay.textContent = title;

                    } else {

                        if (trackNameDisplay) trackNameDisplay.textContent = 'Canción de Spotify';

                    }

                })();

            }

        }



        if (review.music_info) {

            try {

                const parsed = JSON.parse(review.music_info);

                if (parsed && parsed.name && parsed.name !== 'Canción de Spotify' && parsed.name !== 'Cancion de Spotify') {

                    currentTrackInfo = parsed;

                    if (trackNameDisplay) trackNameDisplay.textContent = parsed.name;

                }

            } catch (e) { console.error('Error parsing music info', e); }

        }



        // --- Autoría y Botones de Comunidad ---
        const authorBadge = document.getElementById('journal-author-badge');
        const authorNameEl = document.getElementById('journal-author-name');
        const journalLikeBtn = document.getElementById('journal-like-btn');
        const journalLikeCount = document.getElementById('journal-like-count');
        const saveReviewBtn = document.getElementById('save-review-btn');
        const backBtn = document.getElementById('journal-back-btn');

        // Reset visibility
        if (authorBadge) authorBadge.style.display = 'none';
        if (journalLikeBtn) journalLikeBtn.style.display = 'none';

        const isCommunity = review.user_id && currentUser && review.user_id !== currentUser.id;

        if (isCommunity) {
            // --- VISTA COMUNIDAD ---
            if (authorBadge) authorBadge.style.display = 'flex';
            if (authorNameEl) authorNameEl.textContent = `@${review.profiles?.username || 'lector_anónimo'}`;

            if (saveReviewBtn) saveReviewBtn.style.display = 'none';
            if (journalLikeBtn) journalLikeBtn.style.display = 'none'; // Ocultar el del footer

            // Botón de copiar solo para dueño
            const shareBtn = document.getElementById('share-whatsapp-btn');
            if (shareBtn) shareBtn.style.display = 'none';
        }

        // --- GESTIÓN DE ACCIONES (BARRA UNIFICADA) ---
        const shareBtn = document.getElementById('share-whatsapp-btn');
        const socialContainer = document.getElementById('journal-social-container');

        if (isCommunity) {
            // --- VISTA COMUNIDAD (AJENA) ---
            if (shareBtn) shareBtn.style.display = 'none';
            if (saveReviewBtn) saveReviewBtn.style.display = 'none';
            
            if (socialContainer) {
                socialContainer.style.display = 'flex';
                socialContainer.innerHTML = `
                    <div class="social-left" style="display: flex; align-items: center; gap: 15px;">
                        <button class="social-aside-btn like-btn ${review.userLiked ? 'liked' : ''}" onclick="toggleReviewLike('${review.id}', this)">
                            ${review.userLiked ? '❤️' : '🤍'} <span id="like-count-${review.id}">${review.like_count || 0}</span>
                        </button>
                        <span style="font-family: var(--font-hand); opacity: 0.8; font-size: 1.1rem;">¡Me gusta!</span>
                    </div>
                    <div class="social-right" style="display: flex; align-items: center; gap: 20px;">
                        <span class="tip-label" style="font-family: var(--font-hand); font-size: 1.1rem; color: var(--secondary-color);">Invitar a un café:</span>
                        <div class="tip-options" style="display: flex; gap: 12px;">
                            <button class="tip-btn" onclick="sendDonation('${review.id}', 5)" style="min-width: 90px;">5 💰</button>
                            <button class="tip-btn" onclick="sendDonation('${review.id}', 20)" style="min-width: 90px;">20 💰</button>
                        </div>
                    </div>
                `;
            }
        } else {
            // --- VISTA PROPIA ---
            if (socialContainer) {
                socialContainer.style.display = 'none';
                socialContainer.innerHTML = ''; 
            }

            // Copiar texto: Solo si ya está guardada (tiene ID)
            if (shareBtn) {
                shareBtn.style.display = review.id ? 'flex' : 'none';
            }

            // Guardar: Solo si es una reseña nueva (no tiene ID)
            if (saveReviewBtn) {
                saveReviewBtn.style.display = review.id ? 'none' : 'flex';
            }
        }

        if (backBtn) {
            backBtn.onclick = () => {
                if (typeof window.switchView === 'function') {
                    window.switchView(currentViewBeforeJournal);
                }
            };
        }

        // Auto-resize will be handled after switchView to ensure DOM is visible



        // Hacer formulario de solo lectura y deshabilitar botones

        const makeFormReadOnly = () => {

            console.log("🔒 Aplicando modo solo lectura...");



            // Excluir inputs del modal de autenticación

            const authModal = document.getElementById('auth-modal');

            const authInputs = authModal ? Array.from(authModal.querySelectorAll('input, textarea')) : [];

            console.log("📝 Inputs de auth a excluir:", authInputs.length);



            // Deshabilitar todos los inputs y textareas excepto los del modal de auth

            const inputs = document.querySelectorAll('input[type="text"], input[type="password"], textarea');

            console.log("📝 Total inputs encontrados:", inputs.length);



            inputs.forEach(input => {

                // Solo deshabilitar si no está en el modal de autenticación

                if (!authInputs.includes(input)) {

                    input.readOnly = true;
                    input.style.cursor = 'not-allowed';
                    // El fondo se gestiona preferiblemente por CSS para no romper las líneas del cuaderno

                    console.log("🔒 Input deshabilitado:", input.id || input.name || 'sin-id');

                }

            });



            // Deshabilitar el sistema de estrellas

            const hitboxes = document.querySelectorAll('.star-hitbox');

            hitboxes.forEach(hitbox => {

                hitbox.style.pointerEvents = 'none';

                hitbox.style.cursor = 'not-allowed';

            });

            console.log("⭐ Sistema de estrellas deshabilitado");



            // Ocultar botón de guardar

            if (saveReviewBtn) {

                saveReviewBtn.style.display = 'none';

                console.log("💾 Botón de guardar oculto");

            }



            // Deshabilitar botón de buscar portada

            if (searchBtn) {

                searchBtn.disabled = true;

                searchBtn.style.opacity = '0.5';

                searchBtn.style.cursor = 'not-allowed';

                console.log("🔍 Botón de buscar portada deshabilitado");

            }



            // Deshabilitar clic en la photo box

            if (photoBox) {

                photoBox.style.cursor = 'default';

                photoBox.onclick = null;

                console.log("📸 Photo box deshabilitado");

            }



            // Deshabilitar controles de música

            if (musicFileTrigger) {

                musicFileTrigger.disabled = true;

                musicFileTrigger.style.opacity = '0.5';

                musicFileTrigger.style.cursor = 'not-allowed';

            }

            if (musicLink) {

                musicLink.readOnly = true;

                musicLink.style.cursor = 'not-allowed';

            }

            if (musicResetBtn) {

                musicResetBtn.disabled = true;

                musicResetBtn.style.opacity = '0.5';

                musicResetBtn.style.cursor = 'not-allowed';

            }



            // Deshabilitar controles del reproductor

            if (playPauseBtn) {

                playPauseBtn.disabled = true;

                playPauseBtn.style.cursor = 'not-allowed';

            }

            if (progressBar) {

                progressBar.disabled = true;

                progressBar.style.cursor = 'not-allowed';

            }

            if (volumeBar) {

                volumeBar.disabled = true;

                volumeBar.style.cursor = 'not-allowed';

            }



            // Deshabilitar checkbox de recomendación

            const recommendCheck = document.getElementById('recommend');

            if (recommendCheck) {

                recommendCheck.disabled = true;

                recommendCheck.style.cursor = 'not-allowed';

                const recommendText = document.getElementById('recommend-text');

                if (recommendText) recommendText.style.opacity = '1';

            }



            console.log("✅ Modo solo lectura aplicado completamente");

        };



        makeFormReadOnly();



        if (reviewsModal) {
            if (typeof hideModal === 'function') hideModal(reviewsModal);
            else reviewsModal.style.display = 'none';
        }

        if (typeof window.switchView === 'function') {
            window.switchView('journal-view');

            // Re-redimensionar después de un breve delay para asegurar que el cuaderno sea visible
            // Esto corrige que el texto no se vea porscrollHeight 0 cuando está oculto
            setTimeout(() => {
                ['title', 'author', 'review-text', 'fav-quote', 'start-date', 'end-date', 'fav-character'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el && typeof resize === 'function') resize(el);
                });
                console.log("📏 Re-dimensionado de cuaderno completado.");
            }, 100);
        }

        showToast(`Reseña "${review.title}" cargada en modo solo lectura. Usa "Nueva Entrada" para crear una nueva reseña.`, 'info', 3000);
    };



    checkSession();



    // --- Nueva Entrada / Reset ---

    const resetJournal = () => {

        editingReviewId = null;

        if (titleInput) titleInput.value = '';

        if (authorInput) authorInput.value = '';

        const fields = ['review-text', 'fav-quote', 'start-date', 'end-date', 'fav-character'];

        fields.forEach(id => {

            const el = document.getElementById(id);

            if (el) {
                el.value = '';
                if (id === 'fav-quote' && el.parentNode) {
                    el.parentNode.dataset.replicatedValue = '';
                } else if (typeof resize === 'function') {
                    resize(el);
                }
            }

        });



        const recommendCheck = document.getElementById('recommend');

        if (recommendCheck) {

            recommendCheck.checked = false;

            const recommendText = document.getElementById('recommend-text');

            if (recommendText) recommendText.textContent = 'No';

        }

        // Ocultar distintivo de autor de otros usuarios y botón de like
        const authorBadge = document.getElementById('journal-author-badge');
        if (authorBadge) authorBadge.style.display = 'none';

        const journalLikeBtn = document.getElementById('journal-like-btn');
        if (journalLikeBtn) journalLikeBtn.style.display = 'none';

        const socialAside = document.getElementById('journal-social-container');
        if (socialAside) {
            socialAside.style.display = 'none';
            socialAside.innerHTML = ''; // Vaciar para activar regla :empty
        }

        const saveReviewBtn = document.getElementById('save-review-btn');
        if (saveReviewBtn) saveReviewBtn.style.display = 'flex';



        setRating(0);

        currentCoverUrl = '';

        if (photoPreview) {

            photoPreview.innerHTML = '<span class="photo-label">PORTADA</span><span class="photo-label">AQUÍ</span>';

        }



        musicLink.value = '';

        stopAll();

        showUI(null);

        currentTrackInfo = { name: '', source: '' };



        // Restaurar formulario a estado editable

        const makeFormEditable = () => {

            // Excluir inputs del modal de autenticación

            const authModal = document.getElementById('auth-modal');

            const authInputs = authModal ? Array.from(authModal.querySelectorAll('input, textarea')) : [];



            // Habilitar todos los inputs y textareas excepto los del modal de auth

            const inputs = document.querySelectorAll('input[type="text"], input[type="password"], textarea');

            inputs.forEach(input => {

                // Solo habilitar si no está en el modal de autenticación

                if (!authInputs.includes(input)) {

                    input.readOnly = false;
                    input.style.cursor = 'text';
                    // El fondo se gestiona por CSS

                }

            });



            // Habilitar el sistema de estrellas

            const hitboxes = document.querySelectorAll('.star-hitbox');

            hitboxes.forEach(hitbox => {

                hitbox.style.pointerEvents = 'auto';

                hitbox.style.cursor = 'pointer';

            });



            // Mostrar botón de guardar solo si hay sesión
            if (saveReviewBtn) {
                saveReviewBtn.style.setProperty('display', currentUser ? 'flex' : 'none', 'important');
            }



            // Habilitar botón de buscar portada

            if (searchBtn) {

                searchBtn.disabled = false;

                searchBtn.style.opacity = '1';

                searchBtn.style.cursor = 'pointer';

            }



            // Restaurar clic en la photo box

            if (photoBox && photoInput) {

                photoBox.style.cursor = 'pointer';

                photoBox.onclick = () => photoInput.click();

            }



            // Habilitar controles de música

            if (musicFileTrigger) {

                musicFileTrigger.disabled = false;

                musicFileTrigger.style.opacity = '1';

                musicFileTrigger.style.cursor = 'pointer';

            }

            if (musicLink) {

                musicLink.readOnly = false;

                musicLink.style.cursor = 'text';

            }

            if (musicResetBtn) {

                musicResetBtn.disabled = false;

                musicResetBtn.style.opacity = '1';

                musicResetBtn.style.cursor = 'pointer';

            }



            // Habilitar controles del reproductor

            if (playPauseBtn) {

                playPauseBtn.disabled = false;

                playPauseBtn.style.cursor = 'pointer';

            }

            if (progressBar) {

                progressBar.disabled = false;

                progressBar.style.cursor = 'pointer';

            }

            if (volumeBar) {

                volumeBar.disabled = false;

                volumeBar.style.cursor = 'pointer';

            }



            // Habilitar checkbox de recomendación

            const recommendCheck = document.getElementById('recommend');

            if (recommendCheck) {

                recommendCheck.disabled = false;

                recommendCheck.style.cursor = 'pointer';

                const recommendText = document.getElementById('recommend-text');

                if (recommendText) recommendText.style.opacity = '1';

            }

        };



        makeFormEditable();



        // Resize all empty

        ['title', 'author', 'review-text', 'fav-quote', 'start-date', 'end-date', 'fav-character'].forEach(id => {

            const el = document.getElementById(id);

            if (el) resize(el);

        });



        console.log("✨ Diario reseteado para nueva entrada");

    };



    if (newEntryBtn) {

        newEntryBtn.addEventListener('click', () => {

            // Guardar estado actual antes de limpiar

            const previousState = {

                title: titleInput?.value || '',

                author: authorInput?.value || '',

                reviewText: document.getElementById('review-text')?.value || '',

                favQuote: document.getElementById('fav-quote')?.value || '',

                startDate: document.getElementById('start-date')?.value || '',

                endDate: document.getElementById('end-date')?.value || '',

                rating: starRating?.dataset?.rating || '0',

                recommend: document.getElementById('recommend')?.checked || false,

                coverUrl: currentCoverUrl,

                musicLink: musicLink?.value || '',

                trackInfo: { ...currentTrackInfo }

            };



            // Limpiar el formulario inmediatamente

            resetJournal();



            // Mostrar toast simple sin boton de Deshacer

            showToast('Nueva entrada iniciada 🗑️', 'info');

        });

    }



    // --- UI Helpers ---

    document.querySelectorAll('.pill-input').forEach(pill => {

        pill.addEventListener('click', () => {

            const input = pill.querySelector('input, textarea');

            if (input) input.focus();

        });

    });



    // --- Botón para revelar contraseña ---

    const togglePasswordBtn = document.getElementById('toggle-password');

    const authPassword = document.getElementById('auth-password');

    if (togglePasswordBtn && authPassword) {

        togglePasswordBtn.addEventListener('click', () => {

            const type = authPassword.getAttribute('type') === 'password' ? 'text' : 'password';

            authPassword.setAttribute('type', type);

            togglePasswordBtn.textContent = type === 'password' ? '👁️' : '🙈';

        });

    }



    // --- Checkbox de recomendación ---

    const recommendCheck = document.getElementById('recommend');

    if (recommendCheck) {

        recommendCheck.addEventListener('change', () => {

            const recommendText = document.getElementById('recommend-text');

            if (recommendText) {

                recommendText.textContent = recommendCheck.checked ? 'Sí' : 'No';

            }

        });

    }



    // --- Similitud de texto para detección de duplicados ---

    const calculateSimilarity = (str1, str2) => {

        // Convertir a minúsculas y eliminar espacios extra

        const s1 = str1.toLowerCase().trim();

        const s2 = str2.toLowerCase().trim();



        // Si son exactamente iguales, similitud 100%

        if (s1 === s2) return 1.0;



        // Si uno está contenido en el otro, alta similitud

        if (s1.includes(s2) || s2.includes(s1)) return 0.9;



        // Calcular distancia de Levenshtein simplificada

        const longer = s1.length > s2.length ? s1 : s2;

        const shorter = s1.length > s2.length ? s2 : s1;



        if (longer.length === 0) return 1.0;



        const editDistance = levenshteinDistance(longer, shorter);

        return (longer.length - editDistance) / longer.length;

    };



    const levenshteinDistance = (str1, str2) => {

        const matrix = [];



        for (let i = 0; i <= str2.length; i++) {

            matrix[i] = [i];

        }



        for (let j = 0; j <= str1.length; j++) {

            matrix[0][j] = j;

        }



        for (let i = 1; i <= str2.length; i++) {

            for (let j = 1; j <= str1.length; j++) {

                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {

                    matrix[i][j] = matrix[i - 1][j - 1];

                } else {

                    matrix[i][j] = Math.min(

                        matrix[i - 1][j - 1] + 1,

                        matrix[i][j - 1] + 1,

                        matrix[i - 1][j] + 1

                    );

                }

            }

        }



        return matrix[str2.length][str1.length];

    };





    // --- Date Validation ---

    const validateDateFormat = (value) => {

        // Regex for DD/MM/AAAA or DD/MM/AA

        const dateRegex = /^\d{2}\/\d{2}\/(\d{2}|\d{4})$/;

        if (!dateRegex.test(value)) return false;



        const [day, month, year] = value.split('/').map(Number);



        // Basic validation

        if (month < 1 || month > 12) return false;

        if (day < 1 || day > 31) return false;



        // Days per month

        const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];



        // Leap year check for February

        let fullYear = year;

        if (year < 100) {

            fullYear = year < 50 ? 2000 + year : 1900 + year;

        }

        const isLeap = (fullYear % 4 === 0 && fullYear % 100 !== 0) || (fullYear % 400 === 0);

        if (isLeap) daysInMonth[1] = 29;



        if (day > daysInMonth[month - 1]) return false;



        return true;

    };



    const setupDateValidation = (inputId) => {

        const input = document.getElementById(inputId);

        if (!input) return;



        // Validate on blur (when leaving the field)

        input.addEventListener('blur', () => {

            const value = input.value.trim();

            if (!value) return; // Empty is OK



            if (!validateDateFormat(value)) {

                showToast('Formato inválido. Usa DD/MM/AAAA (ej: 15/03/2024)', 'warning');

                input.style.borderColor = '#ff6b6b';

            } else {

                input.style.borderColor = '';

            }

        });



        // Clear error on focus

        input.addEventListener('focus', () => {

            input.style.borderColor = '';

        });



        // Auto-format while typing (add slashes)

        input.addEventListener('input', (e) => {

            let value = input.value.replace(/\D/g, ''); // Remove non-digits



            if (value.length >= 2) {

                value = value.substring(0, 2) + '/' + value.substring(2);

            }

            if (value.length >= 5) {

                value = value.substring(0, 5) + '/' + value.substring(5, 9);

            }



            input.value = value;

        });

    };



    setupDateValidation('start-date');

    setupDateValidation('end-date');



    ['title', 'author', 'auth-username', 'fav-character', 'profile-bio'].forEach(id => {
        const ta = document.getElementById(id);
        if (ta) {
            ta.addEventListener('input', () => resize(ta));
            resize(ta);
        }
    });

    // Asegurar que review-text NO tenga altura inline para que mande el CSS
    const reviewTextEl = document.getElementById('review-text');
    if (reviewTextEl) reviewTextEl.style.height = '';

    // --- Theme Logic ---

    const initTheme = () => {
        const savedTheme = localStorage.getItem('theme') || 'light';
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
            const toggle = document.getElementById('theme-toggle');
            if (toggle) toggle.textContent = '☀️';
        }
    };

    initTheme();

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isDark = document.body.classList.toggle('dark-mode');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            themeToggle.textContent = isDark ? '☀️' : '🌙';
            showToast(`Modo ${isDark ? 'oscuro' : 'claro'} activado`, 'info', 1500);
        });
    }

    // --- Profile Logic ---

    // (loadProfile moved to global scope)

    // (updateProfileUI moved to global scope)

    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            if (currentUser) {
                loadProfile(currentUser);
                showModal(profileModal);
            }
        });
    }

    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser) return;

            const sb = getSupabase();
            const usernameInput = document.getElementById('profile-username');
            const avatarUrlInput = document.getElementById('profile-avatar-url');
            const bioInput = document.getElementById('profile-bio');

            const username = usernameInput ? usernameInput.value.trim() : '';
            let avatar_url = avatarUrlInput ? avatarUrlInput.value.trim() : '';
            const avatarFileInput = document.getElementById('profile-avatar-file');
            const bio = bioInput ? bioInput.value.trim() : '';

            const goalInput = document.getElementById('profile-goal');
            const genresInput = document.getElementById('profile-genres');

            const goal = goalInput ? parseInt(goalInput.value) || 0 : 0;
            const genres = genresInput ? genresInput.value.split(',').map(g => g.trim()).filter(g => g) : [];

            const saveBtn = document.getElementById('save-profile-btn');
            const origText = saveBtn.textContent;
            saveBtn.textContent = 'GUARDANDO...';
            saveBtn.disabled = true;

            try {
                // Si hay un archivo seleccionado, subirlo primero
                if (avatarFileInput && avatarFileInput.files[0]) {
                    const file = avatarFileInput.files[0];
                    if (file.size > 2 * 1024 * 1024) throw new Error("La imagen supera los 2MB permitidos.");
                    if (!file.type.startsWith('image/')) throw new Error("Archivo no válido.");

                    saveBtn.textContent = 'SUBIENDO IMAGEN...';
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${currentUser.id}_${Date.now()}.${fileExt}`;
                    const filePath = `avatars/${fileName}`;

                    const { error: uploadError } = await sb.storage
                        .from('avatars')
                        .upload(filePath, file, { upsert: true });

                    if (uploadError) throw uploadError;

                    const { data: publicUrlData } = sb.storage.from('avatars').getPublicUrl(filePath);
                    avatar_url = publicUrlData.publicUrl;
                }

                const showPresence = document.getElementById('profile-show-presence')?.checked !== false;

                const { error } = await sb.from('profiles').upsert({
                    id: currentUser.id,
                    username,
                    avatar_url,
                    bio,
                    show_presence: showPresence,
                    preferences: { ...userPreferences, goal, genres },
                    updated_at: new Date().toISOString()
                });

                if (error) throw error;

                updateProfileUI({
                    username,
                    avatar_url,
                    coins: userCoins,
                    badges: userBadges,
                    preferences: { ...userPreferences, goal, genres }
                });
                showToast('Perfil actualizado con éxito ✨', 'success');
                if (profileModal) hideModal(profileModal);

                // Limpiar el input de archivo después de subir
                if (avatarFileInput) avatarFileInput.value = '';

            } catch (err) {
                console.error("❌ Error al guardar perfil:", err);
                showToast('Error: ' + err.message, 'error');
            } finally {
                saveBtn.textContent = origText;
                saveBtn.disabled = false;
            }
        });
    }

    // --- Avatar Upload Listeners ---
    const avatarTrigger = document.getElementById('upload-avatar-trigger');
    const avatarFile = document.getElementById('profile-avatar-file');
    if (avatarTrigger && avatarFile) {
        avatarTrigger.onclick = () => avatarFile.click();
        avatarFile.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                // Previsualización local inmediata
                const reader = new FileReader();
                reader.onload = (event) => {
                    const preview = document.getElementById('current-avatar');
                    if (preview) preview.src = event.target.result;
                };
                reader.readAsDataURL(file);
                showToast('Imagen seleccionada. No olvides Guardar Cambios 💾', 'info');
            }
        };
    }

    // --- ECONOMY & TRIVIA SYSTEMS MOVED TO MODULES ---
    // (LÓGICA DE TRIVIA Y TIENDA IMPLEMENTADA EN src/modules/trivia.js y src/modules/store.js)


    const communityFeed = document.getElementById('community-feed');

    const loadGlobalFeed = async () => {
        if (!communityFeed) return;
        communityFeed.innerHTML = '<p class="empty-msg">Cargando libros de la comunidad... 🌎</p>';

        const sb = getSupabase();
        if (!sb) return;

        try {
            // Carga con contador de likes incluido
            let query = sb.from('reviews').select('*, like_data:review_likes(count)');

            // Usar window.currentUser para mayor compatibilidad con el sistema de proxy
            const activeUser = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);

            if (activeUser && activeUser.id) {
                console.log('🔍 Filtrando reseñas del usuario:', activeUser.id);
                query = query.neq('user_id', activeUser.id);
            }

            let { data, error } = await query
                .order('created_at', { ascending: false })
                .limit(30); // Subimos un poco el límite por si el filtro neq no fuera suficiente

            if (error) throw error;

            // Filtro manual de seguridad (Double-check)
            if (data && activeUser && activeUser.id) {
                data = data.filter(r => r.user_id !== activeUser.id);
            }

            if (data && data.length > 0) {
                // Enriquecer con perfiles secuencialmente
                const uids = [...new Set(data.map(r => r.user_id))];
                const { data: profiles } = await sb.from('profiles').select('id, username, avatar_url').in('id', uids);

                if (profiles) {
                    const pMap = {};
                    profiles.forEach(p => pMap[p.id] = p);
                    data = data.map(r => ({
                        ...r,
                        profiles: pMap[r.user_id],
                        like_count: r.like_data?.[0]?.count || 0
                    }));
                }

                // --- SINCRONIZACIÓN ROBUSTA DE AMISTADES ---
                // Asegurar que sabemos quiénes son amigos o solicitudes pendientes antes de dibujar el feed
                if (currentUser) {
                    const { data: friendships } = await sb
                        .from('friendships')
                        .select('requester_id, addressee_id, status')
                        .or(`requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id}`);

                    if (friendships) {
                        currentUserFriendIds = {}; // Reiniciar mapa
                        friendships.forEach(f => {
                            const friendId = (f.requester_id === currentUser.id) ? f.addressee_id : f.requester_id;
                            currentUserFriendIds[friendId] = f.status;
                        });
                        console.log(`✅ Sincronizados ${Object.keys(currentUserFriendIds).length} estados de amistad para el feed global.`);
                    }
                }
            }

            if (!data || data.length === 0) {
                communityFeed.innerHTML = '<p class="empty-msg">La comunidad está muy callada... ¡Sé el primero en compartir! ✍️</p>';
                return;
            }

            communityFeed.className = 'community-feed-grid';
            communityFeed.innerHTML = '';
            data.forEach(review => renderCommunityCard(review, communityFeed, true));

        } catch (e) {
            console.error('❌ Error crítico al cargar el feed global:', e);
            communityFeed.innerHTML = `
                <div class="empty-msg">
                    <p>Error al conectar con la comunidad ❌</p>
                    <p style="font-size: 0.8rem; opacity: 0.7;">Detalle: ${e.message || 'Error desconocido'}</p>
                    <p style="font-size: 0.8rem; color: var(--secondary-color); margin-top: 10px;">
                        Tip: Verifica las políticas RLS en Supabase para la tabla "reviews".
                    </p>
                </div>`;
        }
    };



    // =============================================
    // SOCIAL SYSTEM — FRIENDS & REVIEW INTERACTIONS
    // =============================================
    // --- Community Tab Switching ---
    const communityTabBtns = document.querySelectorAll('[data-community-tab]');
    communityTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.communityTab;
            communityTabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.community-tab-content').forEach(c => c.style.display = 'none');
            btn.classList.add('active');
            const targetEl = document.getElementById(target);
            if (targetEl) targetEl.style.display = 'block';
            if (target === 'tab-global') loadGlobalFeed();
            if (target === 'tab-friends') {
                loadFriendsFeed();
                loadFriendsList();
                loadFriendSuggestions();
            }
            if (target === 'tab-requests') loadPendingRequests();
            if (target === 'tab-ranking') loadLeaderboard();
        });
    });

    const loadFriendSuggestions = async () => {
        return; // TEMPORALMENTE DESACTIVADO (BUG EN SUGERENCIAS)
        const container = document.getElementById('friend-suggestions-rail');
        const section = document.getElementById('friend-suggestions-section');
        if (!container || !currentUser) return;

        const sb = getSupabase();
        try {
            // 1. Obtener una muestra más amplia de perfiles para asegurar diversidad
            const { data: profiles, error } = await sb
                .from('profiles')
                .select('id, username, avatar_url')
                .neq('id', currentUser.id)
                .limit(100);

            if (error) throw error;
            if (!profiles || profiles.length === 0) {
                if (section) section.style.display = 'none';
                return;
            }

            // 2. Filtrar: Excluimos amigos aceptados y pendientes, pero INCLUIMOS rechazados (por si fue error)
            const suggestions = profiles.filter(p => {
                const status = currentUserFriendIds[p.id];
                return !status || status === 'rejected';
            })
                .sort(() => 0.5 - Math.random()) // Aleatorizar
                .slice(0, 15); // Mostrar hasta 15 sugerencias en el carrusel

            if (suggestions.length === 0) {
                if (section) section.style.display = 'none';
                return;
            }

            // 3. Renderizar
            if (section) section.style.display = 'block';
            container.innerHTML = suggestions.map(u => {
                const avatar = u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username || 'A')}&background=ddc9a3&color=6b4f3f&rounded=true&size=60`;
                return `
                    <div class="suggestion-card" onclick="window.loadPublicProfile('${u.id}')" style="cursor: pointer;">
                        <img src="${avatar}" class="suggestion-avatar" alt="Avatar">
                        <span class="suggestion-username" title="@${u.username}">@${u.username}</span>
                        <button class="add-friend-mini-btn" data-user-id="${u.id}" onclick="event.stopPropagation(); sendFriendRequest('${u.id}', this)" title="Agregar Amigo" style="margin-top: 5px;">
                            +👥
                        </button>
                    </div>
                `;
            }).join('');

        } catch (e) {
            console.error('Error al cargar sugerencias:', e);
            if (section) section.style.display = 'none';
        }
    };

    // --- User Search ---
    const communityUserSearch = document.getElementById('community-user-search');
    const userSearchResults = document.getElementById('user-search-results');
    let searchDebounce = null;
    if (communityUserSearch) {
        communityUserSearch.addEventListener('input', () => {
            clearTimeout(searchDebounce);
            const q = communityUserSearch.value.trim();
            if (q.length < 2) { userSearchResults.innerHTML = ''; return; }
            searchDebounce = setTimeout(() => searchUsers(q), 350);
        });
    }

    const searchUsers = async (query) => {
        const sb = getSupabase();
        if (!sb || !currentUser) return;
        const { data, error } = await sb
            .from('profiles')
            .select('id, username, avatar_url')
            .ilike('username', `%${query}%`)
            .neq('id', currentUser.id)
            .limit(8);
        if (error || !data) return;
        if (data.length === 0) {
            userSearchResults.innerHTML = '<p class="empty-msg" style="font-size:0.85rem; padding: 5px;">No se encontraron usuarios.</p>';
            return;
        }
        // Also fetch current user's friendships to show correct button state
        const { data: myFriendships } = await sb
            .from('friendships')
            .select('addressee_id, requester_id, status')
            .or(`requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id}`);
        const friendshipMap = {};
        (myFriendships || []).forEach(f => {
            const otherId = f.requester_id === currentUser.id ? f.addressee_id : f.requester_id;
            friendshipMap[otherId] = f.status;
        });

        userSearchResults.innerHTML = data.map(u => {
            const status = friendshipMap[u.id];
            let btnHtml = '';
            if (!status || status === 'rejected') btnHtml = `<button class="mini-btn icon-only-btn" data-user-id="${u.id}" onclick="sendFriendRequest('${u.id}', this)" title="Agregar Amigo">+👥</button>`;
            else if (status === 'pending') btnHtml = `<span style="opacity:0.6; font-size:0.85rem;">Pendiente ⏳</span>`;
            else if (status === 'accepted') btnHtml = `<span style="opacity:0.6; font-size:0.85rem;">✅ Amigos</span>`;
            const avatar = u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username || 'A')}&background=ddc9a3&color=6b4f3f&rounded=true&size=32`;
            return `
                <div class="friend-search-item" onclick="window.loadPublicProfile('${u.id}')" style="cursor: pointer;">
                    <img src="${avatar}" class="community-avatar" alt="Avatar">
                    <span class="community-username">@${u.username || 'usuario'}</span>
                    <div onclick="event.stopPropagation()">${btnHtml}</div>
                </div>`;
        }).join('');
    };

    window.sendFriendRequest = async (targetId, btn) => {
        console.log(`📡 [DEBUG AMISTAD] Intentando enviar solicitud a: ${targetId}`);
        const sb = getSupabase();
        if (!sb) { console.error('❌ Supabase no inicializado'); return; }
        if (!currentUser) {
            console.error('❌ Usuario no autenticado. No se puede enviar solicitud.');
            showToast('Inicia sesión para agregar amigos 👤', 'info');
            return;
        }
        if (!targetId) { console.error('❌ ID de destino no proporcionado'); return; }

        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = 'Enviando...';

        try {
            // Paso 1: Intentar borrar cualquier relación previa en ambos sentidos para limpiar conflictos de RLS
            // Nota: El borrado a veces está permitido por políticas de "owner" cuando el update no lo está.
            console.log('🧹 [RLS BYPASS] Intentando limpiar registros previos para evitar error 409/403...');
            await sb.from('friendships')
                .delete()
                .or(`and(requester_id.eq.${currentUser.id},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${currentUser.id})`);

            // Paso 2: Insertar la nueva solicitud desde cero
            const { error } = await sb.from('friendships').insert({
                requester_id: currentUser.id,
                addressee_id: targetId,
                status: 'pending'
            });
            if (error) {
                console.error('❌ Error de base de datos al enviar solicitud:', error);
                showToast('Error al enviar solicitud ❌', 'error');
                btn.disabled = false;
                btn.textContent = originalText;
            } else {
                // Actualizar estado local para sincronía inmediata
                if (typeof currentUserFriendIds !== 'undefined') {
                    currentUserFriendIds[targetId] = 'pending';
                }

                btn.outerHTML = '<span style="opacity:0.6; font-size:0.85rem;">Pendiente ⏳</span>';
                showToast('Solicitud enviada 📨', 'success');

                // --- SINCRONIZACIÓN GLOBAL ---
                // Buscamos todos los botones que pertenezcan a este usuario en cualquier parte de la UI
                document.querySelectorAll(`[data-user-id="${targetId}"]`).forEach(b => {
                    b.outerHTML = '<span style="opacity:0.6; font-size:0.85rem;">Pendiente ⏳</span>';
                });

                // Notificar al destinatario
                createNotification(
                    targetId,
                    'friend_request',
                    `<b>@${currentUsername}</b> te envió una solicitud de amistad.`,
                    { target_id: currentUser.id }
                );
            }
        } catch (e) {
            console.error('❌ Error inesperado en sendFriendRequest:', e);
            showToast('Error de conexión 🚀', 'error');
            btn.disabled = false;
            btn.textContent = originalText;
        }
    };

    window.handleFeedAddFriend = async (targetId, btn) => {
        await window.sendFriendRequest(targetId, btn);
    };

    // --- Load Pending Requests ---
    const loadPendingRequests = async () => {
        const pendingList = document.getElementById('pending-requests-list');
        const badge = document.getElementById('requests-badge');
        if (!pendingList) return;
        const sb = getSupabase();
        if (!sb || !currentUser) return;
        const { data, error } = await sb
            .from('friendships')
            .select('id, requester_id, profiles:requester_id(username, avatar_url)')
            .eq('addressee_id', currentUser.id)
            .eq('status', 'pending');
        if (error) return;
        if (badge) {
            if (data && data.length > 0) { badge.textContent = data.length; badge.style.display = 'inline'; }
            else { badge.style.display = 'none'; }
        }
        if (!data || data.length === 0) {
            pendingList.innerHTML = '<p class="empty-msg">No tienes solicitudes pendientes ✨</p>';
            return;
        }
        pendingList.innerHTML = data.map(req => {
            const profile = req.profiles || { username: 'Usuario', avatar_url: '' };
            const avatar = profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.username || 'A')}&background=ddc9a3&color=6b4f3f&rounded=true&size=32`;
            return `
            <div class="friend-request-item">
                <img src="${avatar}" class="community-avatar" alt="Avatar">
                <span class="community-username">@${profile.username}</span>
                <div class="request-btn-group">
                    <button class="request-action-btn accept-btn" onclick="respondToRequest('${req.id}', 'accepted', this.parentElement.parentElement)">✅ Aceptar</button>
                    <button class="request-action-btn reject-btn" onclick="respondToRequest('${req.id}', 'rejected', this.parentElement.parentElement)">❌ Rechazar</button>
                </div>
            </div>`;
        }).join('');
    };

    window.respondToRequest = async (requestId, status, row) => {
        const sb = getSupabase();
        if (!sb || !currentUser) return;

        try {
            // Obtener el ID del solicitante para notificarle
            const { data: friendship, error: fetchErr } = await sb
                .from('friendships')
                .select('requester_id')
                .eq('id', requestId)
                .single();

            if (fetchErr) throw fetchErr;

            const { error } = await sb.from('friendships').update({ status }).eq('id', requestId);
            if (error) throw error;

            row.remove();
            showToast(status === 'accepted' ? '¡Nuevo amigo! 🎉' : 'Solicitud rechazada', status === 'accepted' ? 'success' : 'info');

            if (friendship.requester_id) {
                if (status === 'accepted') {
                    // Sincronía local inmediata
                    if (typeof currentUserFriendIds !== 'undefined') {
                        currentUserFriendIds[friendship.requester_id] = 'accepted';
                    }
                    createNotification(
                        friendship.requester_id,
                        'friend_request',
                        `¡<b>@${currentUsername}</b> ha aceptado tu solicitud de amistad! 🤝`,
                        { target_id: currentUser.id }
                    );
                } else if (status === 'rejected') {
                    if (typeof currentUserFriendIds !== 'undefined') {
                        delete currentUserFriendIds[friendship.requester_id];
                    }
                }
            }

            if (typeof loadFriendsList === 'function') loadFriendsList();
            if (typeof loadPendingRequests === 'function') loadPendingRequests();
        } catch (e) {
            console.error('Error al responder solicitud:', e);
            showToast('Error al procesar la solicitud', 'error');
        }
    };

    // --- PRIVATE CHAT SYSTEM ---
    async function loadFriendsList() {
        const listEl = document.getElementById('friends-list');
        if (!listEl || !currentUser) return;
        
        // Estado de carga inicial para evitar el parpadeo
        listEl.innerHTML = '<p class="empty-msg" style="font-size: 0.9rem;">Cargando amigos... ⏳</p>';

        const sb = getSupabase();
        try {
            const { data: friendships, error } = await sb
                .from('friendships')
                .select(`
                    id,
                    status,
                    requester_id,
                    addressee_id,
                    solicitante:profiles!friendships_requester_id_fkey(id, username, avatar_url),
                    destinatario:profiles!friendships_addressee_id_fkey(id, username, avatar_url)
                `)
                .or(`requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id}`)
                .eq('status', 'accepted');

            if (error) throw error;
            if (!friendships || friendships.length === 0) {
                listEl.innerHTML = '<p class="empty-msg">No tienes amigos agregados aún.</p>';
                currentUserFriendIds = {};
                return;
            }

            // Obtener mensajes no leídos
            const { data: unreadMsgs } = await sb
                .from('chat_messages')
                .select('sender_id')
                .eq('receiver_id', currentUser.id)
                .eq('is_read', false);

            friendUnreadMessages = {};
            (unreadMsgs || []).forEach(m => {
                friendUnreadMessages[m.sender_id] = (friendUnreadMessages[m.sender_id] || 0) + 1;
            });

            // Actualizar mapa global de estados de amistad
            currentUserFriendIds = {};
            friendships.forEach(f => {
                const friendId = f.requester_id === currentUser.id ? f.addressee_id : f.requester_id;
                currentUserFriendIds[friendId] = f.status;
            });

            listEl.innerHTML = friendships.map(f => {
                const friendInfo = f.requester_id === currentUser.id ? f.destinatario : f.solicitante;
                const friendData = Array.isArray(friendInfo) ? friendInfo[0] : friendInfo;

                if (!friendData || friendData.id === currentUser.id) return '';

                const avatar = friendData.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(friendData.username || 'A')}&background=ddc9a3&color=6b4f3f&rounded=true&size=32`;
                const unreadCount = friendUnreadMessages[friendData.id] || 0;
                const badgeHtml = unreadCount > 0 ? `<span class="friend-chat-badge">${unreadCount > 9 ? '9+' : unreadCount}</span>` : '';

                return `
                    <div class="friend-mini-item" onclick="showFriendActions(event, '${friendData.id}', '${friendData.username}', '${avatar}')">
                        <div class="friend-item-wrapper">
                            <img src="${avatar}" class="community-avatar" alt="${friendData.username}">
                            ${badgeHtml}
                        </div>
                        <span class="friend-username-mini">@${friendData.username}</span>
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.error("❌ Error cargando lista de amigos:", e);
            listEl.innerHTML = '<p class="empty-msg" style="color:red;">Error al cargar amigos</p>';
        }
    }



    window.openChat = async (friendId, friendName, avatar) => {
        currentChatFriendId = friendId;
        const modal = document.getElementById('chat-modal');
        const nameEl = document.getElementById('chat-friend-name');
        const avatarEl = document.getElementById('chat-friend-avatar');
        const container = document.getElementById('chat-messages-container');
        if (nameEl) nameEl.textContent = `Chat con ${friendName}`;
        if (avatarEl) avatarEl.src = avatar;
        if (container) container.innerHTML = '<p class="empty-msg">Cargando mensajes...</p>';
        showModal(modal);

        // Mark messages as read
        const sb = getSupabase();
        if (sb && currentUser) {
            await sb.from('chat_messages')
                .update({ is_read: true })
                .eq('receiver_id', currentUser.id)
                .eq('sender_id', friendId)
                .eq('is_read', false);

            // Clear local badge count
            friendUnreadMessages[friendId] = 0;
            updateFriendListBadges();
        }

        await loadMessages(friendId);
        subscribeToMessages(friendId);

        const input = document.getElementById('chat-input');
        if (input) {
            input.removeEventListener('input', handleTypingEvent);
            input.addEventListener('input', handleTypingEvent);

            // Forzar enfoque en móviles ante cualquier interacción táctil
            const forceFocus = (e) => {
                console.log("📱 Forzando enfoque en input de chat (evento móvil)");
                input.focus();
            };
            input.addEventListener('touchstart', forceFocus, { passive: true });
            input.addEventListener('mousedown', forceFocus);
        }
    };

    const loadMessages = async (friendId) => {
        const sb = getSupabase();
        if (!sb || !currentUser) return;
        const { data, error } = await sb
            .from('chat_messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true });
        if (error) { console.error("Error cargando mensajes:", error); return; }
        renderMessages(data);
    };

    function getFriendlyDate(date) {
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        if (date.toDateString() === today.toDateString()) return 'Hoy';
        if (date.toDateString() === yesterday.toDateString()) return 'Ayer';

        return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    }

    const renderMessages = (messages) => {
        const container = document.getElementById('chat-messages-container');
        if (!container) return;

        if (messages.length === 0) {
            container.innerHTML = '<p class="empty-msg">No hay mensajes aún. ¡Di hola!</p>';
            return;
        }

        let lastDate = null;
        let htmlContent = '';

        messages.forEach(m => {
            const msgDate = new Date(m.created_at);
            const dateStr = msgDate.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

            if (dateStr !== lastDate) {
                const displayDate = getFriendlyDate(msgDate);
                htmlContent += `<div class="chat-date-separator">${displayDate}</div>`;
                lastDate = dateStr;
            }

            const isSent = m.sender_id === currentUser.id;
            const time = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const check = isSent ? '<span class="chat-check">✓</span>' : '';
            const liked = m.is_liked ? '<div class="chat-reaction-heart">❤️</div>' : '';

            htmlContent += `
                <div id="msg-${m.id}" class="chat-bubble ${isSent ? 'chat-sent' : 'chat-received'}" 
                     ondblclick="toggleMessageLike('${m.id}', ${m.is_liked})">
                    <div class="chat-content">${m.content}</div>
                    <span class="chat-timestamp">${time} ${check}</span>
                    ${liked}
                </div>
            `;
        });

        container.innerHTML = htmlContent;
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    };

    const sendChatMessage = async () => {
        const input = document.getElementById('chat-input');
        const content = input?.value.trim();
        if (!content || !currentChatFriendId || !currentUser) return;
        const sb = getSupabase();
        const { error } = await sb.from('chat_messages').insert({
            sender_id: currentUser.id,
            receiver_id: currentChatFriendId,
            content: content
        });
        if (error) showToast("Error al enviar mensaje", "error");
        else {
            input.value = '';
            // Crear entrada de notificación para el historial global
            createNotification(
                currentChatFriendId,
                'message',
                `<b>@${currentUsername}</b> te envió un mensaje: "${content.substring(0, 30)}${content.length > 30 ? '...' : ''}"`,
                { target_id: currentChatFriendId }
            );
        }
    };

    const updateFriendListBadges = () => {
        // Esta función actualiza visualmente los badges sin recargar toda la lista
        Object.keys(friendUnreadMessages).forEach(friendId => {
            // Buscamos específicamente dentro de la lista de amigos para no chocar con el botón del perfil
            const friendListContainer = document.getElementById('friends-list');
            if (!friendListContainer) return;
            
            const friendItem = friendListContainer.querySelector(`[onclick*="openChat(\'${friendId}\'"]`);
            if (!friendItem) return;

            const wrapper = friendItem.querySelector('.friend-item-wrapper');
            if (!wrapper) return; // Previene el crash si la estructura del DOM no coincide

            let badge = wrapper.querySelector('.friend-chat-badge');
            const count = friendUnreadMessages[friendId];

            if (count > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'friend-chat-badge';
                    wrapper.appendChild(badge);
                }
                badge.textContent = count > 9 ? '9+' : count;
            } else if (badge) {
                badge.remove();
            }
        });
    };

    window.toggleMessageLike = async (messageId, currentIsLiked) => {
        const sb = getSupabase();
        if (!sb || !currentUser) return;

        // Obtener info del mensaje para notificar
        const { data: msgData } = await sb.from('chat_messages').select('sender_id, content').eq('id', messageId).single();

        // Optimistic UI for immediate feedback
        const msgEl = document.getElementById(`msg-${messageId}`);
        if (msgEl) {
            const hasHeart = msgEl.querySelector('.chat-reaction-heart');
            if (currentIsLiked && hasHeart) hasHeart.remove();
            else if (!currentIsLiked && !hasHeart) {
                const heart = document.createElement('div');
                heart.className = 'chat-reaction-heart';
                heart.textContent = '❤️';
                msgEl.appendChild(heart);

                // Notificar si es de otro usuario
                if (msgData && msgData.sender_id !== currentUser.id) {
                    createNotification(
                        msgData.sender_id,
                        'like',
                        `A <b>@${currentUsername}</b> le gustó tu mensaje: "${msgData.content.substring(0, 20)}..."`,
                        { target_id: messageId }
                    );
                }
            }
        }

        const { error } = await sb
            .from('chat_messages')
            .update({ is_liked: !currentIsLiked })
            .eq('id', messageId);

        if (error) {
            console.error("Error al dar like:", error);
            // Re-render if error to fix UI
            showToast("No se pudo guardar la reacción", "info");
        }
    };

    const subscribeToMessages = (friendId) => {
        if (chatSubscription) chatSubscription.unsubscribe();
        const sb = getSupabase();

        // Canal global para mensajes en tiempo real
        chatSubscription = sb.channel('chat_channel')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'chat_messages'
            }, payload => {
                const msg = payload.new || payload.old;
                if (payload.eventType === 'INSERT') {
                    console.log("📩 Nuevo mensaje recibido:", msg);
                    const isFromCurrentFriend = (msg.sender_id === friendId && msg.receiver_id === currentUser.id);
                    const isFromMe = (msg.sender_id === currentUser.id && msg.receiver_id === friendId);

                    if (isFromCurrentFriend || isFromMe) {
                        appendSingleMessage(msg);
                        // Si estoy en este chat, marcar como leído inmediatamente
                        if (isFromCurrentFriend) {
                            sb.from('chat_messages').update({ is_read: true }).eq('id', msg.id);
                        }
                    } else if (msg.receiver_id === currentUser.id) {
                        // Mensaje de otro amigo o chat cerrado -> Incrementar badge
                        friendUnreadMessages[msg.sender_id] = (friendUnreadMessages[msg.sender_id] || 0) + 1;
                        updateFriendListBadges();

                        // Notificación global si el chat no es con este amigo
                        const senderName = document.querySelector(`[onclick*="openChat(\'${msg.sender_id}\'"] .friend-username-mini`)?.textContent || 'Un amigo';
                        showToast(`💬 Nuevo mensaje de ${senderName}`, 'info');
                    }
                } else if (payload.eventType === 'UPDATE') {
                    const msgEl = document.getElementById(`msg-${msg.id}`);
                    if (msgEl) {
                        const existingHeart = msgEl.querySelector('.chat-reaction-heart');
                        if (msg.is_liked && !existingHeart) {
                            const h = document.createElement('div');
                            h.className = 'chat-reaction-heart';
                            h.textContent = '❤️';
                            msgEl.appendChild(h);
                        } else if (!msg.is_liked && existingHeart) {
                            existingHeart.remove();
                        }
                        // Update the ondblclick status for future clicks
                        msgEl.setAttribute('ondblclick', `toggleMessageLike('${msg.id}', ${msg.is_liked})`);
                    }
                }
            })
            .on('broadcast', { event: 'typing' }, payload => {
                const { isTyping, senderId } = payload.payload;
                if (senderId === friendId) {
                    const indicator = document.getElementById('chat-typing-indicator');
                    if (indicator) indicator.style.display = isTyping ? 'flex' : 'none';
                    // Auto scroll al recibir aviso de escritura si estamos al final
                    const container = document.getElementById('chat-messages-container');
                    if (container && isTyping) {
                        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                    }
                }
            })
            .subscribe((status) => {
                console.log("📡 Estado de suscripción Realtime:", status);
            });
    };

    const handleTypingEvent = () => {
        if (!chatSubscription || !currentUser || !currentChatFriendId) return;

        if (!isCurrentlyTyping) {
            isCurrentlyTyping = true;
            chatSubscription.send({
                type: 'broadcast',
                event: 'typing',
                payload: { isTyping: true, senderId: currentUser.id }
            });
        }

        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            isCurrentlyTyping = false;
            chatSubscription.send({
                type: 'broadcast',
                event: 'typing',
                payload: { isTyping: false, senderId: currentUser.id }
            });
        }, 3000);
    };

    const appendSingleMessage = (m) => {
        const container = document.getElementById('chat-messages-container');
        if (!container) return;

        const empty = container.querySelector('.empty-msg');
        if (empty) empty.remove();

        const msgDate = new Date(m.created_at);
        const displayDate = getFriendlyDate(msgDate);

        const separators = container.querySelectorAll('.chat-date-separator');
        const lastSeparator = separators.length > 0 ? separators[separators.length - 1] : null;

        if (!lastSeparator || lastSeparator.textContent !== displayDate) {
            const sep = document.createElement('div');
            sep.className = 'chat-date-separator';
            sep.textContent = displayDate;
            container.appendChild(sep);
        }

        const isSent = m.sender_id === currentUser.id;
        const time = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const check = isSent ? '<span class="chat-check">✓</span>' : '';
        const liked = m.is_liked ? '<div class="chat-reaction-heart">❤️</div>' : '';

        const div = document.createElement('div');
        div.id = `msg-${m.id}`;
        div.className = `chat-bubble ${isSent ? 'chat-sent' : 'chat-received'}`;
        div.setAttribute('ondblclick', `toggleMessageLike('${m.id}', ${m.is_liked})`);
        div.innerHTML = `
            <div class="chat-content">${m.content}</div>
            <span class="chat-timestamp">${time} ${check}</span>
            ${liked}
        `;

        container.appendChild(div);
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    };

    document.getElementById('send-chat-btn')?.addEventListener('click', sendChatMessage);
    document.getElementById('chat-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });
    document.getElementById('close-chat-modal')?.addEventListener('click', () => {
        hideModal(document.getElementById('chat-modal'));
        if (chatSubscription) chatSubscription.unsubscribe();
    });

    // --- Friends Feed ---
    const loadFriendsFeed = async () => {
        const friendsFeedEl = document.getElementById('friends-feed');
        if (!friendsFeedEl) return;
        friendsFeedEl.innerHTML = '<p class="empty-msg">Cargando lecturas de tus amigos... 📖</p>';
        const sb = getSupabase();
        if (!sb || !currentUser) return;

        // Get accepted friendships
        const { data: friendships } = await sb
            .from('friendships')
            .select('requester_id, addressee_id')
            .or(`requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id}`)
            .eq('status', 'accepted');

        if (!friendships || friendships.length === 0) {
            friendsFeedEl.innerHTML = '<p class="empty-msg">Aún no tienes amigos. ¡Busca lectores en la pestaña Amigos! 🔍</p>';
            return;
        }

        const friendIds = friendships.map(f => f.requester_id === currentUser.id ? f.addressee_id : f.requester_id);

        let { data, error } = await sb
            .from('reviews')
            .select('*, like_count')
            .in('user_id', friendIds)
            .order('created_at', { ascending: false })
            .limit(30);

        if (error) {
            console.error('Error al cargar feed de amigos:', error);
            friendsFeedEl.innerHTML = '<p class="empty-msg">Error al cargar las reseñas 📚</p>';
            return;
        }

        if (!data || data.length === 0) {
            friendsFeedEl.innerHTML = '<p class="empty-msg">Tus amigos aún no han publicado reseñas 📚</p>';
            return;
        }

        // Cargar perfiles secuencialmente para evitar 400 Bad Request
        const { data: profiles } = await sb.from('profiles').select('id, username, avatar_url').in('id', friendIds);
        if (profiles) {
            const pMap = {};
            profiles.forEach(p => pMap[p.id] = p);
            data = data.map(r => ({ ...r, profiles: pMap[r.user_id] }));
        }

        friendsFeedEl.className = 'community-feed-grid';
        friendsFeedEl.innerHTML = '';
        data.forEach(review => renderCommunityCard(review, friendsFeedEl, false));
    };

    // --- LEADERBOARD / RANKING ---
    const loadLeaderboard = async () => {
        const container = document.getElementById('ranking-container');
        if (!container) return;
        container.innerHTML = '<p class="empty-msg">Cargando el salón de la fama... 🏆</p>';

        const sb = getSupabase();
        if (!sb) return;

        try {
            const { data, error } = await sb
                .from('profiles')
                .select('id, username, xp, level, avatar_url, selected_frame, selected_title, last_seen, show_presence')
                .order('xp', { ascending: false })
                .limit(10);

            if (error) throw error;

            if (!data || data.length === 0) {
                container.innerHTML = '<p class="empty-msg">Aún no hay leyendas en este club... 🕯️</p>';
                return;
            }

            container.innerHTML = data.map((u, i) => {
                const posClass = i < 3 ? `pos-${i + 1}` : '';
                const frameClass = u.selected_frame && u.selected_frame !== 'none' ? `frame-${u.selected_frame}` : '';

                let titleText = '';
                if (u.selected_title && u.selected_title !== 'none') {
                    if (typeof storeItems !== 'undefined') {
                        const cosmeticItem = storeItems.find(it => it.id === u.selected_title);
                        titleText = cosmeticItem ? (cosmeticItem.value || cosmeticItem.name) : u.selected_title;
                    } else {
                        titleText = u.selected_title;
                    }
                }

                const avatar = u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username || 'A')}&background=ddc9a3&color=6b4f3f&rounded=true&size=50`;

                return `
                    <div class="ranking-item" onclick="window.loadPublicProfile('${u.id}')" style="cursor: pointer;">
                        <div class="ranking-pos ${posClass}">${i + 1}</div>
                        <div class="frame-wrapper mini-frame ${frameClass}">
                            <div class="avatar-wrapper">
                                <img src="${avatar}" class="ranking-avatar" alt="${u.username}">
                                ${window.getPresenceHTML ? window.getPresenceHTML(window.isUserOnline(u.last_seen, u.show_presence)) : ''}
                            </div>
                        </div>
                        <div class="ranking-info">
                            <span class="ranking-name">@${u.username}</span>
                            <small class="user-cosmetic-title" style="font-size: 0.8rem; margin:0;">${titleText}</small>
                            <div class="ranking-xp">Nivel ${u.level} • ${u.xp} XP</div>
                        </div>
                    </div>
                `;
            }).join('');

        } catch (e) {
            console.error('Error al cargar ranking:', e);
            container.innerHTML = '<p class="empty-msg">Error al conectar con la cumbre ❌</p>';
        }
    };

    // --- MISSIONS SYSTEM ---
    const MISSIONS_DEF = {
        'daily_review': { title: 'Lector Activo', desc: 'Escribe 1 reseña hoy', goal: 1, reward_coins: 20, reward_xp: 50 },
        'daily_trivia': { title: 'Maestro de Trivia', desc: 'Responde 2 preguntas', goal: 2, reward_coins: 15, reward_xp: 30 }
    };

    const EPIC_MISSIONS_DEF = [
        { id: 'b_reviews_10', title: 'Lector Constante', desc: 'Escribe 10 reseñas publicadas', goal: 10, icon: '📖', type: 'reviews' },
        { id: 'b_trivia_50', title: 'Mente Brillante', desc: 'Responde 50 preguntas de trivia', goal: 50, icon: '🧠', type: 'trivia' },
        { id: 'b_level_10', title: 'Erudito', desc: 'Alcanza el Nivel 10 de Experiencia', goal: 10, icon: '🌟', type: 'level' },
        { id: 'b_level_50', title: 'Gran Maestro', desc: 'Alcanza el Nivel 50 de Experiencia', goal: 50, icon: '👑', type: 'level' }
    ];


    const loadMissions = async () => {
        const container = document.getElementById('challenges-missions-container');
        if (!container || !currentUser) return;

        const sb = getSupabase();
        if (!sb) return;

        try {
            // Check if missions exist for today, otherwise create them
            const { data, error } = await sb
                .from('user_missions')
                .select('*')
                .eq('user_id', currentUser.id);

            if (error) throw error;

            // Simple reset logic: if not present, insert
            if (!data || data.length === 0) {
                const initialMissions = Object.keys(MISSIONS_DEF).map(id => ({
                    user_id: currentUser.id,
                    mission_id: id,
                    required: MISSIONS_DEF[id].goal,
                    reward_coins: MISSIONS_DEF[id].reward_coins,
                    reward_xp: MISSIONS_DEF[id].reward_xp,
                    last_reset: new Date().toISOString()
                }));
                const { error: insErr } = await sb.from('user_missions').insert(initialMissions);
                if (insErr) {
                    console.error('Error al insertar misiones iniciales:', insErr);
                    return;
                }
                loadMissions();
                return;
            }

            // CRITICAL: Daily Reset Logic
            const today = new Date().toISOString().split('T')[0];
            const missionsToUpdate = [];

            for (const m of data) {
                const lastResetDate = m.last_reset ? m.last_reset.split('T')[0] : '';
                if (lastResetDate !== today) {
                    missionsToUpdate.push(m.id);
                }
            }

            if (missionsToUpdate.length > 0) {
                console.log('🔄 Sincronizando misiones diarias (Reset)...');
                await sb.from('user_missions')
                    .update({ progress: 0, completed: false, last_reset: new Date().toISOString() })
                    .in('id', missionsToUpdate);
                loadMissions();
                return;
            }

            const dailyHtml = data.map(m => {
                const def = MISSIONS_DEF[m.mission_id] || { title: 'Misión', desc: 'Progreso' };
                const pct = Math.min(100, (m.progress / m.required) * 100);
                return `
                    <div class="mission-card ${m.completed ? 'completed' : ''}">
                        <div class="mission-header">
                            <span class="mission-title">${def.title}</span>
                            <span class="mission-reward">${m.reward_coins}💰 | ${m.reward_xp}✨</span>
                        </div>
                        <p style="font-size: 0.8rem; margin: 2px 0;">${def.desc}</p>
                        <div class="mission-progress-container">
                            <div class="mission-progress-fill" style="width: ${pct}%"></div>
                        </div>
                        <div class="mission-status">${m.progress}/${m.required}</div>
                    </div>
                `;
            }).join('');

            // Cargar progreso de misiones épicas (logros)
            const { count: reviewCount } = await sb.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id);
            const { count: triviaCount } = await sb.from('user_trivia_responses').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id);

            const epicHtml = EPIC_MISSIONS_DEF.map(m => {
                let progress = 0;
                if (m.type === 'reviews') progress = reviewCount || 0;
                else if (m.type === 'trivia') progress = triviaCount || 0;
                else if (m.type === 'level') progress = userLevel || 1;

                const isCompleted = progress >= m.goal;
                const pct = Math.min(100, (progress / m.goal) * 100);

                return `
                    <div class="mission-card epic-card ${isCompleted ? 'completed' : ''}">
                        <div class="mission-header">
                            <span class="mission-title">${m.title}</span>
                            <span class="mission-reward epic-reward">${m.icon} Insignia</span>
                        </div>
                        <p style="font-size: 0.8rem; margin: 2px 0;">${m.desc}</p>
                        <div class="mission-progress-container">
                            <div class="mission-progress-fill" style="width: ${pct}%; background: ${isCompleted ? '#4caf50' : 'var(--primary-color)'};"></div>
                        </div>
                        <div class="mission-status" style="${isCompleted ? 'color: #4caf50; font-weight: bold;' : ''}">
                            ${isCompleted ? 'Reclamado ✅' : `${progress}/${m.goal}`}
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = `
                <h4 style="margin-bottom: 10px; color: var(--text-color);">Misiones Diarias 📅</h4>
                ${dailyHtml}
                <div style="height: 1px; background: var(--border-color); margin: 20px 0; opacity: 0.5;"></div>
                <h4 style="margin-bottom: 10px; color: var(--text-color);">Logros Épicos 🏆</h4>
                ${epicHtml}
            `;

        } catch (e) {
            console.error('Error al cargar misiones:', e);
        }
    };

    window.checkMissions = async (actionType) => {
        if (!currentUser) return;
        const sb = getSupabase();
        if (!sb) return;

        console.log(`🎯 Comprobando misión para: ${actionType}`);

        // Map action to mission_id
        const actionMap = { 'review_written': 'daily_review', 'trivia_answered': 'daily_trivia' };
        const missionId = actionMap[actionType];
        if (!missionId) return;

        try {
            const { data, error } = await sb
                .from('user_missions')
                .select('*')
                .eq('user_id', currentUser.id)
                .eq('mission_id', missionId)
                .single();

            if (error || !data || data.completed) return;

            const newProgress = data.progress + 1;
            const isNowCompleted = newProgress >= data.required;

            const { error: upErr } = await sb
                .from('user_missions')
                .update({
                    progress: newProgress,
                    completed: isNowCompleted
                })
                .eq('id', data.id);

            if (upErr) throw upErr;

            if (isNowCompleted) {
                showToast(`¡Misión completada: ${MISSIONS_DEF[missionId].title}! 🏆`, 'success');
                // Give rewards (simplified here, in a real app better via RPC or Trigger)
                await sb.rpc('increment_user_stats', {
                    user_id: currentUser.id,
                    add_coins: data.reward_coins,
                    add_xp: data.reward_xp
                });

                // Actualizar UI local si es necesario
                const { data: updatedProfile } = await sb.from('profiles').select('coins, xp, level').eq('id', currentUser.id).single();
                if (updatedProfile) {
                    userCoins = updatedProfile.coins;
                    userXP = updatedProfile.xp;
                    userLevel = updatedProfile.level;
                    updateProfileUI(updatedProfile);
                }
            }

            loadMissions();
        } catch (e) {
            console.error('Error al actualizar misión:', e);
        }
    };

    // --- Shared card renderer ---
    const renderCommunityCard = (review, container, isGlobal = false) => {
        const profile = review.profiles || { username: 'Lector Anónimo', avatar_url: '' };
        const card = document.createElement('div');
        card.className = 'community-card';
        card.style.cursor = 'pointer';
        const starsHtml = review.rating ? window.getRatingStarsHTML(review.rating, 16) : '<span style="opacity:0.5">—</span>';

        let addBtnHtml = '';
        if (isGlobal && currentUser && review.user_id !== currentUser.id) {
            const status = currentUserFriendIds[review.user_id];

            if (!status || status === 'rejected') {
                addBtnHtml = `<button class="add-friend-mini-btn" data-user-id="${review.user_id}" title="Añadir a amigos">+👥</button>`;
            }
        }

        let reviewTextHtml = '';
        if (review.review_text) {
            reviewTextHtml = `<p class="community-review-text">${review.review_text}</p>`;
        }

        // Lógica de presencia (usando funciones globales expuestas en main.js)
        const isOnline = (typeof window.isUserOnline === 'function') ? window.isUserOnline(profile.last_seen, profile.show_presence) : false;
        const presenceDot = (typeof window.getPresenceHTML === 'function') ? window.getPresenceHTML(isOnline) : '';

        card.innerHTML = `
            <div class="community-user-info" style="display: flex; align-items: center; gap: 8px; position: relative;">
                <div class="profile-trigger" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <div class="avatar-wrapper">
                        <img src="${profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.username || 'A')}&background=ddc9a3&color=6b4f3f&rounded=true&size=32`}" class="community-avatar" alt="Avatar">
                        ${presenceDot}
                    </div>
                    <span class="community-username">@${profile.username || 'lector_anónimo'}</span>
                </div>
                ${addBtnHtml}
            </div>
            <div class="community-cover-box">
                <img src="${review.photo_url || 'https://via.placeholder.com/200x280?text=📖'}" alt="Portada de ${review.title}">
            </div>
            <div class="community-content">
                <h4 class="community-title">${review.title || 'Sin Título'}</h4>
                <p class="community-author">✒️ ${review.author || 'Autor desconocido'}</p>
                <div class="community-stars">${starsHtml}</div>
                ${reviewTextHtml}
            </div>
        `;

        const profileTrigger = card.querySelector('.profile-trigger');
        if (profileTrigger) {
            profileTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof window.loadPublicProfile === 'function') {
                    window.loadPublicProfile(review.user_id);
                }
            });
        }

        const addBtn = card.querySelector('.add-friend-mini-btn');
        if (addBtn) {
            console.log(`✅ [UI DEBUG] Botón 'Agregar' renderizado para: @${profile.username} (${review.user_id})`);
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log(`🖱️ [UI DEBUG] Click en 'Agregar' para: ${review.user_id}`);
                if (typeof window.sendFriendRequest === 'function') {
                    window.sendFriendRequest(review.user_id, addBtn);
                } else {
                    console.error('❌ window.sendFriendRequest no está definida');
                }
            });
        }



        card.addEventListener('click', () => {
            currentViewBeforeJournal = 'community-view';
            loadReviewIntoJournal(review);
        });
        container.appendChild(card);
    };

    // --- Review Detail Modal ---
    const reviewDetailModal = document.getElementById('review-detail-modal');
    const reviewDetailContent = document.getElementById('review-detail-content');
    const closeReviewDetailBtn = document.getElementById('close-review-detail');
    if (closeReviewDetailBtn) closeReviewDetailBtn.addEventListener('click', () => hideModal(reviewDetailModal));

    const openReviewDetail = async (review) => {
        if (!reviewDetailModal || !reviewDetailContent) return;
        showModal(reviewDetailModal);
        const sb = getSupabase();
        const profile = review.profiles || { username: 'Lector Anónimo', avatar_url: '' };
        const avatar = profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.username || 'A')}&background=ddc9a3&color=6b4f3f&rounded=true&size=32`;
        // Get like count + whether current user liked
        let likeCount = 0;
        let userLiked = false;
        if (sb) {
            const { count } = await sb.from('review_likes').select('*', { count: 'exact', head: true }).eq('review_id', review.id);
            likeCount = count || 0;
            if (currentUser) {
                const { data: likeData } = await sb.from('review_likes').select('id').eq('review_id', review.id).eq('user_id', currentUser.id).maybeSingle();
                userLiked = !!likeData;
            }
        }
        const starsHtml = review.rating ? window.getRatingStarsHTML(review.rating, 24) : '—';
        reviewDetailContent.innerHTML = `
            <div class="review-detail-header" style="justify-content: flex-start; gap: 15px; border-bottom: 2px dashed rgba(107, 79, 63, 0.2); padding-bottom: 10px; margin-bottom: 20px;">
                <img src="${avatar}" class="community-avatar" alt="Avatar" style="width: 50px; height: 50px;">
                <div>
                    <span class="community-username" style="display:block; font-size: 1.1rem;">@${profile.username || 'lector_anónimo'}</span>
                    <small style="opacity: 0.7;">Publicado el ${getFriendlyDate(new Date(review.created_at))}</small>
                </div>
            </div>

            <div class="notebook-card" style="box-shadow: none; max-width: 100%; border: 1px solid rgba(107, 79, 63, 0.1);">
                <header class="card-header">
                    <div class="title-section">
                        <div class="journal-input" style="font-size: 1.8em; font-weight: bold; border:none; padding:0; height:auto; font-family:var(--font-journal);">${review.title || 'Sin Título'}</div>
                        <div style="font-family: var(--font-journal); font-style: normal; opacity: 0.8; font-size: 1.2rem; margin-top:5px;">by <span style="font-style: italic;">${review.author || 'Anónimo'}</span></div>
                    </div>
                </header>

                <section class="main-content" style="gap: 20px;">
                    <div class="content-left">
                        <div class="photo-box" style="margin-bottom: 10px; padding: 5px; border-radius: 8px;">
                            <img src="${review.photo_url || 'https://via.placeholder.com/200x280?text=📖'}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;" alt="Portada">
                        </div>
                        <div class="community-stars" style="font-size: 1.5rem; text-align: center;">${starsHtml}</div>
                        <div class="review-like-bar" style="justify-content: center; flex-wrap: wrap; gap: 10px; margin-top: 15px;">
                            <button id="like-btn-${review.id}" class="like-btn ${userLiked ? 'liked' : ''}" onclick="toggleReviewLike('${review.id}', this)" style="background: var(--bg-paper); border: 2px solid var(--primary-color);">
                                ${userLiked ? '❤️' : '🤍'} <span id="like-count-${review.id}">${likeCount}</span>
                            </button>
                            
                            <div class="donation-group" style="display: flex; gap: 5px; align-items: center;">
                                <span style="font-size: 0.8rem; opacity: 0.7;">Dar propina:</span>
                                <button class="mini-btn donation-btn" onclick="sendDonation('${review.id}', 5)" style="background: #ddc9a3; border: 1px solid #6b4f3f;">5💰</button>
                                <button class="mini-btn donation-btn" onclick="sendDonation('${review.id}', 10)" style="background: #ddc9a3; border: 1px solid #6b4f3f;">10💰</button>
                            </div>
                        </div>
                    </div>
                    <div class="content-right" style="display:flex; flex-direction:column; height: 100%;">
                        <div class="review-box" style="flex-grow: 1; background-image: linear-gradient(transparent 31px, var(--border-color) 1px); background-size: 100% 32px; background-attachment: local;">
                            <textarea readonly style="width:100%; height:100%; min-height:300px; resize:none; border:none; background:transparent; font-family: var(--font-journal); font-size: 1.3rem; line-height: 32px; padding: 2px 0; scrollbar-width: thin; pointer-events: auto;">${review.review_text || 'Sin reseña escrita.'}</textarea>
                        </div>
                    </div>
                </section>
            </div>
        `;
    };

    window.sendDonation = async (reviewId, amount) => {
        const sb = getSupabase();
        if (!sb || !currentUser) return;

        // Validar saldo propio
        if (userCoins < amount) {
            showToast('No tienes suficientes monedas para donar 💸', 'warning');
            return;
        }

        const { data: revData } = await sb.from('reviews').select('user_id, title').eq('id', reviewId).single();
        if (!revData) return;

        if (revData.user_id === currentUser.id) {
            showToast('No puedes donarte a ti mismo 😂', 'info');
            return;
        }

        const modal = document.getElementById('donation-confirm-modal');
        const msgEl = document.getElementById('donation-confirm-msg');
        const confirmBtn = document.getElementById('confirm-donation-btn');
        const cancelBtn = document.getElementById('cancel-donation-btn');
        const closeBtn = document.getElementById('close-donation-modal');

        if (!modal || !confirmBtn) {
            // Fallback si el HTML no está
            if (!confirm(`¿Quieres enviar una propina de ${amount}💰 a @${revData.profiles?.username || 'este autor'}?`)) return;
            executeDonation(sb, currentUser, revData, amount, reviewId);
            return;
        }

        // Configurar modal
        msgEl.innerHTML = `¿Quieres enviar una propina de <span style="font-weight:bold">${amount}💰</span> a @${revData.profiles?.username || 'este autor'}?`;

        // Limpiar listeners previos (clonando botón)
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        showModal(modal);

        const closeModalHandler = () => hideModal(modal);
        if (cancelBtn) cancelBtn.onclick = closeModalHandler;
        if (closeBtn) closeBtn.onclick = closeModalHandler;

        newConfirmBtn.onclick = async () => {
            newConfirmBtn.disabled = true;
            newConfirmBtn.textContent = "Enviando...";
            await executeDonation(sb, currentUser, revData, amount, reviewId);
            hideModal(modal);
            newConfirmBtn.disabled = false;
            newConfirmBtn.textContent = "Confirmar";
        };
    };

    // Función extraída para la transacción real
    const executeDonation = async (sb, currentUser, revData, amount, reviewId) => {
        try {
            // 1. Descontar monedas al donante
            const { error: err1 } = await sb.rpc('increment_user_stats', {
                user_id: currentUser.id,
                add_coins: -amount,
                add_xp: 0
            });
            if (err1) throw err1;

            // 2. Sumar monedas al autor
            const { error: err2 } = await sb.rpc('increment_user_stats', {
                user_id: revData.user_id,
                add_coins: amount,
                add_xp: 0
            });
            if (err2) throw err2;

            // 3. Notificar
            createNotification(
                revData.user_id,
                'system',
                `¡<b>@${currentUsername}</b> te ha enviado una propina de ${amount}💰 por tu reseña!`,
                { target_id: reviewId }
            );

            // 4. Actualizar estado local
            userCoins -= amount;
            if (typeof updateCurrencyUI === 'function') updateCurrencyUI();

            showToast(`¡Propina de ${amount}💰 enviada! ✨`, 'success');
            console.log(`🎁 Donación exitosa: ${amount} de ${currentUser.id} a ${revData.user_id}`);

        } catch (e) {
            console.error('Error en donación:', e);
            showToast('Error al procesar la donación', 'error');
        }
    };

    window.toggleReviewLike = async (reviewId, btn) => {
        const sb = getSupabase();
        if (!sb || !currentUser) {
            showToast('Inicia sesión para dar me gusta', 'info');
            return;
        }

        // Obtener datos de la reseña para saber quién es el dueño
        const { data: revData } = await sb.from('reviews').select('user_id, title').eq('id', reviewId).single();
        if (!revData) return;

        // --- PROTECCIÓN 1: No auto-like ---
        if (revData.user_id === currentUser.id) {
            showToast('¡No puedes dar me gusta a tu propia reseña! 😉', 'warning');
            return;
        }

        btn.disabled = true;
        const alreadyLiked = btn.classList.contains('liked');
        const countEl = document.getElementById(`like-count-${reviewId}`);
        const currentCount = parseInt(countEl?.textContent || 0);

        try {
            if (alreadyLiked) {
                // QUITAR LIKE
                await sb.from('review_likes').delete().eq('review_id', reviewId).eq('user_id', currentUser.id);
                btn.classList.remove('liked');
                if (countEl) countEl.textContent = Math.max(0, currentCount - 1);
                btn.innerHTML = `🤍 <span id="like-count-${reviewId}">${Math.max(0, currentCount - 1)}</span>`;
            } else {
                // DAR LIKE
                await sb.from('review_likes').insert({ review_id: reviewId, user_id: currentUser.id });
                btn.classList.add('liked');
                if (countEl) countEl.textContent = currentCount + 1;
                btn.innerHTML = `❤️ <span id="like-count-${reviewId}">${currentCount + 1}</span>`;

                // --- ECONOMÍA: Recompensa para el autor (Blindada) ---
                // Intentamos registrar la recompensa en la tabla de historial (Unique Constraint)
                const { error: rewardHistoryError } = await sb
                    .from('rewarded_likes')
                    .insert({ liker_id: currentUser.id, review_id: reviewId });

                if (!rewardHistoryError) {
                    // Si no hay error, es la primera vez que est usuario da like a esta reseña
                    const rewardAmount = 2;

                    // 1. Notificar al dueño
                    createNotification(
                        revData.user_id,
                        'like',
                        `A <b>@${currentUsername}</b> le gustó tu reseña de "${revData.title}" (+${rewardAmount}💰)`,
                        { target_id: reviewId }
                    );

                    // 2. Dar monedas al dueño
                    await sb.rpc('increment_user_stats', {
                        user_id: revData.user_id,
                        add_coins: rewardAmount,
                        add_xp: 5
                    });

                    console.log(`💰 [Éxito] Recompensa entregada: +2 monedas para el autor.`);
                } else {
                    console.log(`ℹ️ [Anti-Cheat] El autor ya recibió su recompensa previa por este usuario.`);
                }
            }
        } catch (err) {
            console.error('Error al procesar Like:', err);
            showToast('Error al procesar el Me Gusta', 'error');
        } finally {
            btn.disabled = false;
        }
    };

    // Override loadGlobalFeed card generation to use shared renderer
    const originalLoadGlobalFeed = loadGlobalFeed;


    if (closeProfileModal) {
        closeProfileModal.addEventListener('click', () => {
            if (profileModal) hideModal(profileModal);
        });
    }

    // Tab Switching
    adminTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            if (!target) return; // Guard for mismatched classes
            adminTabBtns.forEach(b => b.classList.remove('active'));
            adminTabContents.forEach(c => c.style.display = 'none');
            btn.classList.add('active');
            const targetEl = document.getElementById(target);
            if (targetEl) targetEl.style.display = 'block';

            if (target === 'tab-moderation') loadAdminReviews();
            if (target === 'tab-users') loadAdminUsers();
            if (target === 'tab-suggestions') loadAdminSuggestions();
        });
    });

    if (adminBtn) {
        adminBtn.addEventListener('click', () => {
            switchView('admin-view');
        });
    }




    const loadAdminReviews = async () => {
        if (!adminReviewsList) return;
        adminReviewsList.innerHTML = '<p class="empty-msg">Cargando todas las reseñas... ⏳</p>';
        const sb = getSupabase();
        try {
            const { data, error } = await sb
                .from('reviews')
                .select(`
                    *,
                    profiles:user_id ( username )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            adminReviewsList.innerHTML = '';

            if (!data || data.length === 0) {
                adminReviewsList.innerHTML = '<p class="empty-msg">No hay reseñas para moderar. 🍃</p>';
                return;
            }

            data.forEach(rev => {
                const item = document.createElement('div');
                item.className = 'admin-item';
                const username = rev.profiles?.username || 'Anónimo';
                const snippet = (rev.review_text || '').substring(0, 50);

                item.innerHTML = `
                    <div>
                        <strong>${rev.title || 'Sin Título'}</strong> por ${username}<br>
                        <small>${snippet}${snippet.length >= 50 ? '...' : ''}</small>
                    </div>
                    <button class="mini-btn danger-btn delete-rev-btn" data-id="${rev.id}">Eliminar 🗑️</button>
                `;
                item.querySelector('.delete-rev-btn').onclick = async () => {
                    if (confirm('¿Seguro que quieres borrar esta reseña?')) {
                        const { error: delErr } = await sb.from('reviews').delete().eq('id', rev.id);
                        if (delErr) {
                            console.error('Error delete:', delErr);
                            showToast('Error al borrar: ' + delErr.message, 'error');
                        } else {
                            showToast('Reseña eliminada', 'success');
                            loadAdminReviews();
                        }
                    }
                };
                adminReviewsList.appendChild(item);
            });
        } catch (e) {
            console.error('Admin Moderation Error:', e);
            adminReviewsList.innerHTML = `<p class="empty-msg">Error: ${e.message || 'Error al cargar'}</p>`;
        }
    };

    const loadAdminUsers = async () => {
        if (!adminUsersList) return;
        adminUsersList.innerHTML = '<p class="empty-msg">Cargando usuarios... ⏳</p>';
        const sb = getSupabase();
        try {
            const { data, error } = await sb.from('profiles').select('*').order('username');
            if (error) throw error;
            adminUsersList.innerHTML = '';
            data.forEach(u => {
                const item = document.createElement('div');
                item.className = 'admin-item';
                item.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="${u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username || 'U')}&background=ddc9a3&color=6b4f3f&rounded=true&size=30`}" style="width: 30px; height: 30px; border-radius: 50%;">
                        <div>
                            <strong>${u.username || 'Usuario'}</strong> (${u.role || 'user'})<br>
                            <small>${u.coins || 0} monedas | ${(u.badges || []).length} insignias</small>
                        </div>
                    </div>
                    <div class="admin-btn-group" style="display: flex; gap: 5px;">
                        <button class="mini-btn toggle-role-btn" data-id="${u.id}">${u.role === 'admin' ? 'Bajar a User' : 'Subir a Admin'}</button>
                        <button class="mini-btn danger-btn reset-avatar-btn" data-id="${u.id}">Reset Avatar 🔄</button>
                    </div>
                `;
                item.querySelector('.toggle-role-btn').onclick = async () => {
                    const newRole = u.role === 'admin' ? 'user' : 'admin';
                    const { error: upErr } = await sb.from('profiles').update({ role: newRole }).eq('id', u.id);
                    if (upErr) showToast('Error al cambiar rol', 'error');
                    else { showToast('Rol actualizado', 'success'); loadAdminUsers(); }
                };
                item.querySelector('.reset-avatar-btn').onclick = () => {
                    showConfirm(
                        'Reiniciar Avatar',
                        `¿Estás seguro de que deseas eliminar el avatar de @${u.username}?`,
                        async () => {
                            const { error: upErr } = await sb.from('profiles').update({ avatar_url: null }).eq('id', u.id);
                            if (upErr) {
                                showToast('Error al reiniciar avatar', 'error');
                            } else {
                                showToast('Avatar reiniciado con éxito ✨', 'success');
                                loadAdminUsers();
                            }
                        }
                    );
                };
                adminUsersList.appendChild(item);
            });
        } catch (e) {
            console.error('Admin Users Error:', e);
            adminUsersList.innerHTML = `<p class="empty-msg">Error: ${e.message || 'Error al cargar'}</p>`;
        }
    };

    if (adminTriviaForm) {
        adminTriviaForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const q = document.getElementById('admin-q-text').value;
            const correct = parseInt(document.getElementById('admin-q-correct').value);
            const reward = parseInt(document.getElementById('admin-q-reward').value) || 10;

            // Recoger opciones desde la lista de inputs
            const optInputs = document.querySelectorAll('.admin-q-opt');
            const options = Array.from(optInputs).map(input => input.value.trim());

            if (options.some(o => o === "")) {
                showToast('Todas las opciones son requeridas', 'warning');
                return;
            }

            const sb = getSupabase();
            try {
                const { error } = await sb.from('trivia_questions').insert([{
                    question: q,
                    options: options,
                    correct_index: correct,
                    reward: reward
                }]);
                if (error) throw error;
                showToast('¡Pregunta añadida al pool! 🚀', 'success');
                adminTriviaForm.reset();
            } catch (err) {
                console.error('Submit Trivia Error:', err);
                showToast('Error al subir pregunta', 'error');
            }
        });
    }

    const aiGenBtn = document.getElementById('admin-generate-ai-btn');
    const aiTopicInput = document.getElementById('admin-ai-topic');
    const aiDifficultySelect = document.getElementById('admin-ai-difficulty');
    const aiLoader = document.getElementById('ai-generation-loader');

    // --- BATCH GENERATION CONTROLS ---
    const aiBatchGenBtn = document.getElementById('ai-batch-generate-btn');
    const aiBatchTopics = document.getElementById('ai-batch-topics');
    const aiBatchSize = document.getElementById('ai-batch-size');
    const aiBatchLoader = document.getElementById('ai-batch-loader');
    const aiBatchResults = document.getElementById('ai-batch-results');
    const aiBatchContainer = document.getElementById('batch-results-container');
    const aiBatchSaveBtn = document.getElementById('batch-save-all-btn');
    let pendingBatchResults = [];

    // --- COLLAPSIBLE SECTIONS ---
    const initCollapsibleSections = () => {
        const headers = document.querySelectorAll('.collapsible-header');
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const targetId = header.dataset.target;
                const content = document.getElementById(targetId);

                if (content) {
                    header.classList.toggle('collapsed');
                    content.classList.toggle('collapsed');
                }
            });
        });
    };

    if (aiGenBtn) {
        aiGenBtn.addEventListener('click', async () => {
            console.log("🚀 Iniciando generación con IA vía Supabase...");
            const topic = aiTopicInput?.value.trim();
            const difficulty = aiDifficultySelect?.value;

            // Tema opcional: si está vacío, se aplica uno aleatorio
            const finalTopic = topic || getRandomTopics(1)[0];
            if (!topic) {
                showToast(`Tema automático: ${finalTopic} 🎲`, 'info');
                if (aiTopicInput) aiTopicInput.value = finalTopic;
            }

            aiGenBtn.disabled = true;

            const singleResultContainer = document.getElementById('ai-single-result-container');
            if (singleResultContainer) {
                singleResultContainer.style.display = 'block';
                singleResultContainer.innerHTML = `
                    <div class="loading-stat-card">
                        <div class="book-loader">📖</div>
                        <h4 class="loading-title">Redactando Trivia...</h4>
                        <div style="width: 100%; border-top: 1px dashed var(--border-color); margin: 5px 0;"></div>
                        <p class="loading-detail"><strong>Generando Pregunta Única</strong></p>
                        <p class="loading-detail">Tema: <em>${finalTopic}</em></p>
                        <p class="loading-detail">Nivel: ${getDifficultyLabel(difficulty)}</p>
                    </div>
                `;
            }

            try {
                const sb = getSupabase();
                if (!sb) throw new Error("Supabase no está inicializado");

                console.log("📡 Llamando a Edge Function (generate-trivia)...");
                const { data: result, error } = await sb.functions.invoke('generate-trivia', {
                    body: { topic: finalTopic, difficulty }
                });

                if (error) {
                    throw new Error(`Error del servidor: ${error.message}`);
                }

                console.log("📜 Respuesta procesada:", result);

                // Renderizar como tarjeta independiente (estilo lote)
                if (singleResultContainer) {
                    singleResultContainer.innerHTML = `
                        <div class="batch-item success" style="margin-bottom: 15px;">
                            <div class="batch-content" style="width: 100%;">
                                <strong>✅ Tema: ${finalTopic}</strong>
                                <div class="batch-preview">
                                    <em>${result.question}</em>
                                    <small>${result.options.length} opciones • Nivel: ${getDifficultyLabel(difficulty)} • ${getRewardForDifficulty(difficulty)}💰</small>
                                </div>
                            </div>
                        </div>
                        <button id="ai-single-save-btn" class="journal-btn ai-btn" style="width: 100%; margin-top: 10px;">GUARDAR PREGUNTA 💾</button>
                    `;

                    // Agregar listener de guardado auto-validable
                    const saveBtn = document.getElementById('ai-single-save-btn');
                    saveBtn.addEventListener('click', async () => {
                        saveBtn.disabled = true;
                        saveBtn.textContent = 'GUARDANDO...';

                        try {
                            const newOpts = Array.isArray(result.options) ? result.options : JSON.parse(result.options);
                            const newAnswer = newOpts[result.correct_index]?.toLowerCase()?.trim() || "";

                            const existingAnswers = cachedQuestions.map(q => {
                                const opts = Array.isArray(q.options) ? q.options : JSON.parse(q.options);
                                return opts[q.correct_index]?.toLowerCase()?.trim() || "";
                            });

                            if (existingAnswers.includes(newAnswer)) {
                                showToast('⚠️ Pregunta descartada: La respuesta ya existe en tu BD', 'warning');
                                singleResultContainer.style.display = 'none';
                                return;
                            }

                            const { error: insertErr } = await sb.from('trivia_questions').insert([{
                                question: result.question,
                                options: result.options,
                                correct_index: result.correct_index,
                                reward: getRewardForDifficulty(difficulty)
                            }]);

                            if (insertErr) throw insertErr;

                            showToast('¡Pregunta guardada exitosamente! 🎉', 'success');
                            singleResultContainer.style.display = 'none';
                            loadExistingQuestions();
                        } catch (err) {
                            console.error('Error guardando individual:', err);
                            showToast('Error al guardar: ' + err.message, 'error');
                            saveBtn.disabled = false;
                            saveBtn.textContent = 'GUARDAR PREGUNTA 💾';
                        }
                    });
                }

                showToast('¡Pregunta lista para revisión! 🎯', 'success');
            } catch (err) {
                console.error('💥 Error AI Gen:', err);
                showToast('Error al generar pregunta: ' + err.message, 'error');
            } finally {
                aiGenBtn.disabled = false;
            }
        });
    }

    // El adminBtn ya está configurado arriba para switchView('admin-view')

    // Initialize collapsible sections
    initCollapsibleSections();

    // Cargar preguntas automáticamente cuando se abre la sección "Ver Preguntas"
    const viewQuestionsHeader = document.querySelector('[data-target="view-questions"]');
    if (viewQuestionsHeader) {
        viewQuestionsHeader.addEventListener('click', () => {
            setTimeout(() => {
                loadExistingQuestions();
            }, 300); // Pequeña pausa para que el contenido se muestre primero
        });
    }

    // Botón de recarga manual
    const reloadQuestionsBtn = document.getElementById('reload-questions-btn');
    if (reloadQuestionsBtn) {
        reloadQuestionsBtn.addEventListener('click', () => {
            console.log("🔄 Recarga manual de preguntas");
            loadExistingQuestions();
        });
    }

    // --- LOAD EXISTING QUESTIONS ---
    let cachedQuestions = [];

    const loadExistingQuestions = async () => {
        console.log("🔍 Cargando preguntas existentes...");
        const container = document.getElementById('admin-questions-container');
        if (!container) {
            console.error("❌ Container no encontrado");
            return;
        }

        container.innerHTML = '<p class="empty-msg">Cargando preguntas...</p>';

        try {
            const sb = getSupabase();
            if (!sb) {
                console.error("❌ Supabase no está inicializado");
                throw new Error("Supabase no está inicializado");
            }

            console.log("✅ Supabase inicializado, consultando tabla trivia_questions...");

            const { data: questions, error } = await sb
                .from('trivia_questions')
                .select('*')
                .order('created_at', { ascending: false });

            console.log("📊 Resultado de consulta:", { questions, error });

            if (error) {
                console.error("❌ Error en consulta:", error);
                throw error;
            }

            if (!questions || questions.length === 0) {
                console.log("📭 No hay preguntas guardadas");
                container.innerHTML = '<p class="empty-msg">No hay preguntas guardadas aún.</p>';
                document.getElementById('admin-questions-count').textContent = 'Total: 0 preguntas';
                return;
            }

            console.log(`✅ Se encontraron ${questions.length} preguntas`);
            cachedQuestions = questions;
            renderQuestions(questions);
            document.getElementById('admin-questions-count').textContent = `Total: ${questions.length} preguntas`;

        } catch (err) {
            console.error('💥 Error cargando preguntas:', err);
            container.innerHTML = '<p class="empty-msg">Error al cargar preguntas.</p>';
        }
    };

    const renderQuestions = (questionsToDisplay) => {
        const container = document.getElementById('admin-questions-container');
        if (!container) return;

        if (questionsToDisplay.length === 0) {
            container.innerHTML = '<p class="empty-msg">No hay preguntas que coincidan con el filtro.</p>';
            return;
        }

        container.innerHTML = questionsToDisplay.map((q, index) => `
            <div class="question-item">
                <div class="question-header">
                    <span class="question-number">#${q.id.toString().substring(0, 4)}...</span>
                    <span class="question-reward">${q.reward}💰</span>
                    <button class="delete-question-btn" data-id="${q.id}">🗑️</button>
                </div>
                <div class="question-content">
                    <p><strong>Pregunta:</strong> ${q.question}</p>
                    <div class="question-options">
                        ${q.options.map((opt, i) => `
                            <div class="option-item ${i === q.correct_index ? 'correct' : ''}">
                                ${String.fromCharCode(65 + i)}. ${opt} ${i === q.correct_index ? '✅' : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `).join('');

        // Añadir event listeners para botones de eliminar
        container.querySelectorAll('.delete-question-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('¿Estás seguro de eliminar esta pregunta?')) {
                    await deleteQuestion(btn.dataset.id);
                }
            });
        });
    };

    const applyQuestionFilters = () => {
        const searchTerm = document.getElementById('admin-search-questions')?.value.toLowerCase() || "";
        const difficultyFilter = document.getElementById('admin-filter-difficulty')?.value || "all";

        const filtered = cachedQuestions.filter(q => {
            const matchesSearch = q.question.toLowerCase().includes(searchTerm);
            const matchesDifficulty = difficultyFilter === "all" || q.reward.toString() === difficultyFilter;
            return matchesSearch && matchesDifficulty;
        });

        renderQuestions(filtered);
    };

    // Event listeners para filtros
    document.getElementById('admin-search-questions')?.addEventListener('input', applyQuestionFilters);
    document.getElementById('admin-filter-difficulty')?.addEventListener('change', applyQuestionFilters);

    const deleteQuestion = async (questionId) => {
        try {
            const sb = getSupabase();
            if (!sb) throw new Error("Supabase no está inicializado");

            const { error } = await sb
                .from('trivia_questions')
                .delete()
                .eq('id', questionId);

            if (error) throw error;

            showToast('Pregunta eliminada correctamente', 'success');
            loadExistingQuestions(); // Recargar la lista

        } catch (err) {
            console.error('Error eliminando pregunta:', err);
            showToast('Error al eliminar pregunta', 'error');
        }
    };

    // --- BATCH GENERATION LOGIC ---
    if (aiBatchGenBtn) {
        aiBatchGenBtn.addEventListener('click', async () => {
            console.log("📋 Iniciando generación en lote...");
            let topics = aiBatchTopics?.value.split('\n').filter(t => t.trim());
            const batchSize = parseInt(aiBatchSize?.value) || 6;
            const batchDifficulty = document.getElementById('ai-batch-difficulty')?.value || 'mixed';

            // Si no hay temas, usar temas aleatorios
            if (!topics || topics.length === 0) {
                topics = getRandomTopics(batchSize);
                showToast('Generando con temas aleatorios 🎲', 'info');
            }

            aiBatchGenBtn.disabled = true;
            aiBatchLoader.style.display = 'block';
            aiBatchResults.style.display = 'block';
            aiBatchContainer.innerHTML = '<p class="empty-msg">Generando preguntas...</p>';
            aiBatchSaveBtn.style.display = 'none';
            pendingBatchResults = []; // Limpiar lote anterior

            const results = [];
            let successCount = 0;
            let errorCount = 0;

            try {
                const sb = getSupabase();
                if (!sb) throw new Error("Supabase no está inicializado");

                // Generar exactamente la cantidad solicitada
                for (let i = 0; i < batchSize; i++) {
                    // Ciclar temas si hay menos temas que preguntas
                    const topicIndex = i % topics.length;
                    const topic = topics[topicIndex].trim();

                    // Dificultad variable: distribuida equitativamente
                    let difficulty = 'medium';
                    if (batchDifficulty === 'mixed') {
                        // Dificultad variable: distribuida equitativamente
                        const difficultiesPool = ['easy', 'medium', 'hard'];
                        difficulty = difficultiesPool[i % 3];
                    } else {
                        // Respetar dificultad forzada
                        difficulty = batchDifficulty;
                    }

                    // Actualizar progreso
                    aiBatchContainer.innerHTML = `
                        <div class="loading-stat-card">
                            <div class="book-loader">📖</div>
                            <h4 class="loading-title">Redactando Trivia...</h4>
                            <div style="width: 100%; border-top: 1px dashed var(--border-color); margin: 5px 0;"></div>
                            <p class="loading-detail"><strong>Generando [${i + 1}/${batchSize}]</strong></p>
                            <p class="loading-detail">Tema: <em>${topic}</em></p>
                            <p class="loading-detail">Nivel: ${getDifficultyLabel(difficulty)}</p>
                        </div>
                    `;

                    try {
                        const { data, error } = await sb.functions.invoke('generate-trivia', {
                            body: { topic, difficulty }
                        });

                        if (error) throw error;

                        results.push({ ...data, topic, difficulty, index: i, success: true, reward: getRewardForDifficulty(difficulty) });
                        successCount++;

                        // Pequeña pausa entre llamadas para no sobrecargar Gemini
                        await new Promise(resolve => setTimeout(resolve, 1000));

                    } catch (err) {
                        console.error(`Error en ${topic}:`, err);
                        results.push({ error: err.message, topic, difficulty, index: i, success: false });
                        errorCount++;
                    }
                }

                // Mostrar resultados finales
                // Al final de la generación, guardamos en la variable global
                pendingBatchResults = results;
                displayBatchResults(results);

                const message = `✅ ${successCount} generadas, ❌ ${errorCount} con errores`;
                showToast(message, successCount > errorCount ? 'success' : 'warning');

            } catch (err) {
                console.error('💥 Error en generación lote:', err);
                showToast('Error en generación lote: ' + err.message, 'error');
            } finally {
                aiBatchGenBtn.disabled = false;
                aiBatchLoader.style.display = 'none';
            }
        });
    }

    // --- HELPER FUNCTIONS ---
    const getRandomTopics = (count) => {
        const allTopics = [
            "Harry Potter", "Don Quijote", "1984", "Orgullo y Prejuicio", "El Señor de los Anillos",
            "Sherlock Holmes", "Romeo y Julieta", "Dune", "Las Crónicas de Narnia", "Un mundo feliz",
            "Gabriel García Márquez", "J.R.R. Tolkien", "George Orwell", "Jane Austen", "Agatha Christie",
            "Ciencia ficción", "Fantasía épica", "Novela romántica", "Misterio", "Distopía",
            "Poesía", "Teatro clásico", "Novela histórica", "Aventuras", "Terror gótico",
            "Literatura latinoamericana", "Novela contemporánea", "Clásicos universales", "Best-sellers", "Premios Nobel"
        ];

        const shuffled = [...allTopics].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    };

    const getRandomDifficulty = () => {
        const difficulties = ['easy', 'medium', 'hard'];
        return difficulties[Math.floor(Math.random() * difficulties.length)];
    };

    const getDifficultyLabel = (difficulty) => {
        const labels = {
            'easy': 'Fácil (10💰)',
            'medium': 'Media (25💰)',
            'hard': 'Difícil (50💰)'
        };
        return labels[difficulty] || 'Media (25💰)';
    };

    const getRewardForDifficulty = (difficulty) => {
        const rewards = {
            'easy': 10,
            'medium': 25,
            'hard': 50
        };
        return rewards[difficulty] || 25;
    };

    // --- DISPLAY BATCH RESULTS ---
    const displayBatchResults = (results) => {
        if (!aiBatchContainer) return;

        aiBatchContainer.innerHTML = results.map((result, index) => {
            if (result.success) {
                return `
                    <div class="batch-item success">
                        <input type="checkbox" class="batch-checkbox" data-index="${index}" checked>
                        <div class="batch-content">
                            <strong>✅ ${result.topic}</strong>
                            <div class="batch-preview">
                                <em>${result.question.substring(0, 50)}${result.question.length > 50 ? '...' : ''}</em>
                                <small>${result.options.length} opciones • ${getDifficultyLabel(result.difficulty)} • ${result.reward}💰</small>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                return `
                    <div class="batch-item error">
                        <input type="checkbox" class="batch-checkbox" data-index="${index}" disabled>
                        <div class="batch-content">
                            <strong>❌ ${result.topic}</strong>
                            <div class="batch-error">
                                <em>Error: ${result.error}</em>
                                <small>Intento: ${getDifficultyLabel(result.difficulty)}</small>
                            </div>
                        </div>
                    </div>
                `;
            }
        }).join('');

        // Mostrar botón de guardar si hay preguntas exitosas
        const hasSuccessful = results.some(r => r.success);
        if (aiBatchSaveBtn) aiBatchSaveBtn.style.display = hasSuccessful ? 'block' : 'none';
    };

    // --- SAVE ALL BATCH RESULTS ---
    if (aiBatchSaveBtn) {
        aiBatchSaveBtn.addEventListener('click', async () => {
            const checkboxes = document.querySelectorAll('.batch-checkbox:checked');
            const selectedResults = [];

            checkboxes.forEach(checkbox => {
                const index = parseInt(checkbox.dataset.index);
                if (!isNaN(index) && pendingBatchResults[index] && pendingBatchResults[index].success) {
                    selectedResults.push(pendingBatchResults[index]);
                }
            });

            if (selectedResults.length === 0) {
                showToast('Selecciona al menos una pregunta para guardar', 'warning');
                return;
            }

            try {
                const sb = getSupabase();
                if (!sb) throw new Error("Supabase no está inicializado");

                aiBatchSaveBtn.disabled = true;
                aiBatchSaveBtn.textContent = 'GUARDANDO...';

                // 1. Extraer respuestas correctas existentes en DB
                const existingAnswers = cachedQuestions.map(q => {
                    const opts = Array.isArray(q.options) ? q.options : JSON.parse(q.options);
                    return opts[q.correct_index]?.toLowerCase()?.trim() || "";
                });

                let savedCount = 0;
                let skippedCount = 0;

                // 2. Guardar cada pregunta validando duplicados
                for (const question of selectedResults) {
                    const newOpts = Array.isArray(question.options) ? question.options : JSON.parse(question.options);
                    const newAnswer = newOpts[question.correct_index]?.toLowerCase()?.trim() || "";

                    if (existingAnswers.includes(newAnswer)) {
                        console.log(`Omitida por respuesta duplicada: "${newAnswer}" en pregunta: ${question.question}`);
                        skippedCount++;
                        continue;
                    }

                    const { error } = await sb.from('trivia_questions').insert([{
                        question: question.question,
                        options: question.options,
                        correct_index: question.correct_index,
                        reward: question.reward
                    }]);

                    if (error) {
                        console.error('Error guardando:', error);
                        throw error;
                    }

                    savedCount++;
                    existingAnswers.push(newAnswer); // Evitar duplicados dentro del propio lote
                }

                if (skippedCount > 0) {
                    showToast(`✅ ${savedCount} guardadas. ⚠️ ${skippedCount} omitidas (repetidas)`, 'warning');
                } else {
                    showToast(`¡${savedCount} preguntas guardadas exitosamente! 🎉`, 'success');
                }

                // Recargar lista global para incluir las nuevas y mantener la validación actualizada
                loadExistingQuestions();

                // Limpiar formulario
                if (aiBatchTopics) aiBatchTopics.value = '';
                if (aiBatchResults) aiBatchResults.style.display = 'none';
                if (aiBatchSaveBtn) aiBatchSaveBtn.style.display = 'none';

            } catch (err) {
                console.error('Error guardando lote:', err);
                showToast('Error al guardar: ' + err.message, 'error');
            } finally {
                if (aiBatchSaveBtn) {
                    aiBatchSaveBtn.disabled = false;
                    aiBatchSaveBtn.textContent = 'GUARDAR SELECCIONADAS 💾';
                }
            }
        });
    }

    checkSession();

    // Auto-load missions after session check
    setTimeout(() => {
        if (currentUser) loadMissions();
    }, 2000);


    // --- LOGICA DE DROPDOWN (DELEGADA) ---
    document.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('#dropdown-toggle-btn');
        const menu = document.getElementById('user-dropdown-menu');
        const wrapper = document.querySelector('.user-dropdown');

        if (toggleBtn) {
            e.preventDefault();
            e.stopPropagation();
            const isShowing = menu.classList.toggle('show');
            if (wrapper) wrapper.classList.toggle('active', isShowing);
            console.log("🖱️ Dropdown toggle (delegado):", isShowing);
        } else if (menu && menu.classList.contains('show')) {
            // Si el clic es en un item, cerrar. Si es fuera, cerrar.
            if (!menu.contains(e.target)) {
                menu.classList.remove('show');
                if (wrapper) wrapper.classList.remove('active');
                console.log("☁️ Cerrando dropdown por clic fuera");
            }
        }
    });

    // Lógica para los items del menú (delegada también)
    document.body.addEventListener('click', (e) => {
        if (e.target.classList.contains('dropdown-item')) {
            const menu = document.getElementById('user-dropdown-menu');
            const wrapper = document.querySelector('.user-dropdown');
            if (menu) menu.classList.remove('show');
            if (wrapper) wrapper.classList.remove('active');
            console.log("📍 Item clickeado (delegado):", e.target.textContent);
        }
    });




    // --- FASE 1: LOGICA DE VISTAS SPA (MINIMALISTA) ---
    const dashboardView = document.getElementById('dashboard-view');
    const journalView = document.getElementById('journal-view');
    const journalFooter = document.getElementById('journal-footer');

    function switchView(targetViewId) {
        console.log("🔄 Cambiando a vista:", targetViewId);
        
        // Resetear scroll siempre al cambiar de vista (comportamiento estándar SPA)
        window.scrollTo(0, 0);

        // Ocultar todas las vistas
        document.querySelectorAll('.view-content').forEach(view => {
            view.classList.remove('active');
            view.style.display = 'none';
        });

        // Mostrar la vista objetivo
        const targetView = document.getElementById(targetViewId);
        const appViewport = document.getElementById('app-viewport');

        if (targetView) {
            // Si es la vista de admin, ocultamos el viewport principal para liberar espacio
            if (targetViewId === 'admin-view' && appViewport) {
                appViewport.style.display = 'none';
                document.body.classList.add('admin-mode');
            } else if (appViewport) {
                appViewport.style.display = 'flex';
                document.body.classList.remove('admin-mode');
            }

            targetView.style.display = 'block';
            setTimeout(() => targetView.classList.add('active'), 10);
        }

        // Lógica especial para el badge del diario
        const authorBadge = document.getElementById('journal-author-badge');
        if (authorBadge && targetViewId !== 'journal-view') {
            authorBadge.style.display = 'none';
        }

        // Sincronizar inventario si entramos al Arcade
        if (targetViewId === 'games-view') {
            if (window.triviaGame) window.triviaGame.init();
            if (window.arcadeRankings && typeof window.arcadeRankings.checkPendingClaims === 'function') {
                window.arcadeRankings.checkPendingClaims();
            }
        }

        // AUTO-RESIZE: Si entramos al diario, forzar ajuste de textareas cargados
        if (targetViewId === 'journal-view') {
            setTimeout(() => {
                ['title', 'author', 'review-text', 'fav-quote', 'start-date', 'end-date', 'fav-character'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        if (id === 'fav-quote' && el.parentNode) {
                            el.parentNode.dataset.replicatedValue = el.value;
                        } else if (typeof resize === 'function') {
                            resize(el);
                        }
                    }
                });
                console.log("📏 [switchView] Redimensionado de campos del diario completado.");
            }, 150);
        }
    }
    window.switchView = switchView;

    const dashNewReviewBtn = document.getElementById('dash-new-review');
    const dashStatsBtn = document.getElementById('dash-stats');
    const profileStatsBtn = document.getElementById('profile-stats-btn');
    const dashCommunityBtn = document.getElementById('dash-community');

    if (dashStatsBtn) dashStatsBtn.onclick = () => openDashboard();
    if (profileStatsBtn) profileStatsBtn.onclick = () => {
        const modal = document.getElementById('profile-modal');
        if (modal && typeof hideModal === 'function') hideModal(modal);
        openDashboard();
    };

    async function openDashboard() {
        const sb = getSupabase();
        if (!sb || !currentUser) {
            if (typeof showToast === 'function') showToast('Inicia sesión para ver tus estadísticas 📊', 'info');
            return;
        }

        switchView('profile-stats-view');
        const container = document.getElementById('profile-stats-view');
        if (container) {
            container.innerHTML = '<p class="empty-msg">Cargando tus métricas... ⏳</p>';

            const stats = await dashboardService.fetchSummaryStats(sb, currentUser.id);
            const reviews = await dashboardService.fetchDetailedReviews(sb, currentUser.id);

            dashboardUI.render(container, stats, reviews);
        }
    }
    window.openDashboard = openDashboard;

    window.openReviewFromDashboard = async (reviewId) => {
        // Intentar carga instantánea desde el cache del dashboard
        const cached = window.cachedDashboardReviews?.find(r => r.id === reviewId);

        if (cached) {
            console.log("⚡ Carga instantánea desde cache");
            if (typeof loadReviewIntoJournal === 'function') {
                loadReviewIntoJournal(cached); // No esperamos el fetch interno de likes para mostrar la vista
                switchView('journal-view');
            }
            return;
        }

        // Fallback si no hay cache (no debería ocurrir normalmente)
        const sb = getSupabase();
        if (!sb) return;
        const { data, error } = await sb.from('reviews').select('*, profiles:user_id(username)').eq('id', reviewId).single();
        if (error || !data) {
            if (typeof showToast === 'function') showToast('No se pudo cargar la reseña', 'error');
            return;
        }
        if (typeof loadReviewIntoJournal === 'function') {
            await loadReviewIntoJournal(data);
            switchView('journal-view');
        }
    };

    const publicProfileBackBtn = document.getElementById('public-profile-back-btn');
    if (publicProfileBackBtn) {
        publicProfileBackBtn.onclick = () => switchView('dashboard-view');
    }

    /**
     * FASE 2: Carga los datos públicos de un usuario y los muestra en la SPA.
     */
    window.loadPublicProfile = async (userId) => {
        const sb = getSupabase();
        if (!sb || !userId) return;

        console.log("👤 Cargando perfil público avanzado para:", userId);
        
        // 1. Mostrar vista y poner en "Cargando"
        switchView('public-profile-view');
        document.getElementById('public-author-name').textContent = "Cargando...";
        document.getElementById('public-author-bio').textContent = "Buscando información del autor...";
        document.getElementById('public-author-reviews-list').innerHTML = '<p class="empty-msg">Buscando bibliografía... ⏳</p>';
        document.getElementById('public-author-badges').innerHTML = '';
        document.getElementById('public-profile-social-actions').innerHTML = '';

        try {
            // 2. Obtener datos del perfil
            const { data: profile, error } = await sb.from('profiles').select('*').eq('id', userId).single();
            if (error || !profile) throw error || new Error("Perfil no encontrado");

            // 3. Rellenar Identidad
            document.getElementById('public-author-name').textContent = profile.username || "Usuario Desconocido";
            document.getElementById('public-author-bio').textContent = profile.bio || "Este autor prefiere mantener su biografía en secreto. 🤫";
            document.getElementById('public-author-level').textContent = profile.level || 1;
            document.getElementById('public-author-avatar').src = profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.username || 'A')}&background=ddc9a3&color=6b4f3f&rounded=true&size=150`;
            
            // --- NUEVO: ESTADO DE PRESENCIA Y ÚLTIMA CONEXIÓN ---
            const lastSeenEl = document.getElementById('public-author-last-seen');
            const avatarContainer = document.querySelector('#public-author-avatar')?.parentElement;
            
            const isOnline = (typeof window.isUserOnline === 'function') ? window.isUserOnline(profile.last_seen, profile.show_presence) : false;
            
            // Nota: El punto de presencia se ha omitido en esta vista por diseño, ya que se muestra el texto de estado debajo.

            if (lastSeenEl) {
                if (isOnline) {
                    lastSeenEl.innerHTML = '<span class="status-online-tag">🟢 En línea ahora</span>';
                } else if (profile.last_seen && profile.show_presence !== false) {
                    const timeAgo = window.getRelativeTimeString(new Date(profile.last_seen));
                    lastSeenEl.innerHTML = `<span class="status-offline-tag">Visto por última vez ${timeAgo}</span>`;
                } else {
                    lastSeenEl.innerHTML = '<span class="status-offline-tag">Estado de conexión privado</span>';
                }
            }
            
            // 4. Aplicar Cosméticos (Marcos, Títulos, Skins)
            applyPublicCosmetics(profile);

            // 5. Antigüedad (Ahora desde la tabla profiles sincronizada)
            const rawDate = profile.created_at;
            let formattedDate = "Recientemente";
            
            if (rawDate) {
                const joinedDate = new Date(rawDate);
                if (!isNaN(joinedDate.getTime())) {
                    // Formato elegante: "mayo de 2024"
                    formattedDate = joinedDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
                }
            }
            document.getElementById('public-author-joined').textContent = `Lector desde ${formattedDate}`;

            // 6. Cargar Insignias
            loadPublicAuthorBadges(userId);

            // 7. Acciones Sociales (Si no es el propio usuario)
            if (currentUser && userId !== currentUser.id) {
                loadPublicProfileSocialActions(userId, profile.username, profile.avatar_url);
            } else {
                document.getElementById('public-author-joined').textContent += " (Tú)";
            }

            // 8. Cargar Reseñas
            if (typeof window.loadPublicAuthorReviews === 'function') {
                window.loadPublicAuthorReviews(userId);
            }

        } catch (e) {
            console.error("❌ Error cargando perfil público:", e);
            showToast("No pudimos encontrar este perfil", "error");
            switchView('community-view');
        }
    };

    /**
     * Carga las insignias desbloqueadas por el autor desde el campo 'badges' del perfil.
     */
    async function loadPublicAuthorBadges(userId) {
        const sb = getSupabase();
        const container = document.getElementById('public-author-badges');
        if (!sb || !container) return;

        // Recuperar el perfil de nuevo para asegurar que tenemos el campo badges actualizado
        const { data: profile, error } = await sb.from('profiles').select('badges').eq('id', userId).single();
        
        if (error || !profile || !profile.badges || profile.badges.length === 0) {
            container.innerHTML = '<p style="opacity: 0.5; font-size: 0.8rem;">Sin insignias aún.</p>';
            return;
        }

        // El catálogo completo para que coincida con el sistema de insignias de la app
        const BADGE_CATALOG_MAP = {
            'b_first_review': { icon: '✍️', name: 'Escritor Novel' },
            'b_reviews_10': { icon: '📖', name: 'Lector Constante' },
            'b_level_10': { icon: '🌟', name: 'Erudito Nivel 10' },
            'b_level_50': { icon: '👑', name: 'Gran Maestro' },
            'b_trivia_50': { icon: '🧠', name: 'Mente Brillante' }
        };

        container.innerHTML = profile.badges.map(b => {
            const info = BADGE_CATALOG_MAP[b.id] || { icon: '🏆', name: b.name || 'Logro' };
            return `<span class="public-badge-icon" title="${info.name}">${info.icon}</span>`;
        }).join('');
    }

    /**
     * Gestiona el estado social (Agregar/Mensaje) desde el perfil.
     */
    async function loadPublicProfileSocialActions(userId, username, avatar) {
        const sb = getSupabase();
        const container = document.getElementById('public-profile-social-actions');
        if (!sb || !container || !currentUser) return;

        const { data: friendship } = await sb
            .from('friendships')
            .select('status, requester_id')
            .or(`and(requester_id.eq.${currentUser.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${currentUser.id})`)
            .single();

        if (!friendship) {
            container.innerHTML = `<button class="profile-social-btn btn-add" onclick="sendFriendRequest('${userId}', this)"><span>👤+</span> Agregar Amigo</button>`;
        } else if (friendship.status === 'pending') {
            container.innerHTML = `<span class="pending-tag">⏳ Solicitud Pendiente</span>`;
        } else if (friendship.status === 'accepted') {
            container.innerHTML = `<button class="profile-social-btn" onclick="window.openChat('${userId}', '${username}', '${avatar}')"><span>💬</span> Enviar Mensaje</button>`;
        }
    }

    /**
     * Aplica los cosméticos del usuario visitado a su ficha de autor.
     */
    function applyPublicCosmetics(profile) {
        const frameContainer = document.getElementById('public-author-frame');
        const titleDisplay = document.getElementById('public-author-title');
        const skinContainer = document.getElementById('public-author-skin');

        // Importamos dinámicamente el catálogo si es necesario
        const items = (typeof storeItems !== 'undefined') ? storeItems : [];

        // Marco
        const frameId = profile.selected_frame || 'none';
        const frameItem = items.find(i => i.id === frameId);
        // Limpiar marcos previos
        const frameClasses = items.filter(i => i.type === 'frame').map(i => i.css);
        if (frameContainer) {
            frameClasses.forEach(c => frameContainer.classList.remove(c));
            if (frameItem && frameItem.css) frameContainer.classList.add(frameItem.css);
        }

        // Título
        const titleId = profile.selected_title || 'none';
        const titleItem = items.find(i => i.id === titleId);
        if (titleDisplay) titleDisplay.textContent = titleItem ? titleItem.value : "";

        // Skin (Aplicar solo al contenedor de la tarjeta)
        const skinId = profile.selected_skin || 'none';
        const skinItem = items.find(i => i.id === skinId);
        const skinClasses = items.filter(i => i.type === 'skin').map(i => i.css);
        if (skinContainer) {
            skinClasses.forEach(c => { if(c) skinContainer.classList.remove(c); });
            if (skinItem && skinItem.css) skinContainer.classList.add(skinItem.css);
        }
    }

    /**
     * FASE 3: Carga las 3 reseñas más recientes del autor y las renderiza en la columna derecha.
     */
    window.loadPublicAuthorReviews = async (userId) => {
        const sb = getSupabase();
        const container = document.getElementById('public-author-reviews-list');
        if (!sb || !container || !userId) return;

        try {
            const { data, error } = await sb
                .from('reviews')
                .select('*, profiles:user_id(username)')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(3);

            if (error) throw error;

            if (!data || data.length === 0) {
                container.innerHTML = '<p class="empty-msg">Este autor aún no ha publicado ninguna reseña. 📚</p>';
                document.getElementById('public-author-reviews-count').textContent = "0";
                return;
            }

            // Actualizar contador
            document.getElementById('public-author-reviews-count').textContent = data.length;

            // 2. Renderizar tarjetas
            container.innerHTML = data.map(rev => {
                const cover = rev.photo_url || 'https://via.placeholder.com/60x90?text=Sin+Portada';
                const snippet = rev.review_text ? (rev.review_text.substring(0, 100) + '...') : "Sin descripción.";
                
                return `
                    <div class="public-review-item" onclick="openReviewFromDashboard('${rev.id}')" style="cursor: pointer;">
                        <img src="${cover}" class="mini-cover" alt="${rev.title}">
                        <div class="mini-review-content">
                            <h4>${rev.title}</h4>
                            <p style="font-size: 0.8rem; opacity: 0.7; margin-bottom: 5px;">${rev.author}</p>
                            <div class="mini-review-text">${snippet}</div>
                                ${window.getRatingStarsHTML(rev.rating || 0, 14)}
                        </div>
                    </div>
                `;
            }).join('');

        } catch (e) {
            console.error("❌ Error cargando reseñas públicas:", e);
            container.innerHTML = '<p class="empty-msg">Error al cargar la bibliografía.</p>';
        }
    };

    /**
     * FASE 4: Muestra un menú de acciones para un amigo.
     */
    window.showFriendActions = (e, friendId, username, avatar) => {
        e.stopPropagation();
        
        // Cerrar menús previos si existen
        const oldMenu = document.querySelector('.floating-action-menu');
        if (oldMenu) oldMenu.remove();

        const menu = document.createElement('div');
        menu.className = 'floating-action-menu';
        
        // Posicionamiento inteligente cerca del clic
        menu.style.left = `${e.clientX - 80}px`;
        menu.style.top = `${e.clientY + 15}px`;

        menu.innerHTML = `
            <button class="action-menu-item" id="act-view-profile">
                <span>👤</span> Ver Perfil
            </button>
            <button class="action-menu-item" id="act-open-chat">
                <span>💬</span> Abrir Chat
            </button>
        `;

        document.body.appendChild(menu);

        // Eventos
        menu.querySelector('#act-view-profile').onclick = () => {
            menu.remove();
            if (typeof window.loadPublicProfile === 'function') window.loadPublicProfile(friendId);
        };

        menu.querySelector('#act-open-chat').onclick = () => {
            menu.remove();
            if (typeof window.openChat === 'function') window.openChat(friendId, username, avatar);
        };

        // Cerrar al hacer clic fuera
        const closeMenu = (ev) => {
            if (!menu.contains(ev.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 10);
    };

    const dashChallengesBtn = document.getElementById('dash-challenges');
    const goHomeLogoBtn = document.getElementById('go-home-btn');
    const navNewEntryBtn = document.getElementById('new-entry-btn');

    if (dashNewReviewBtn) dashNewReviewBtn.onclick = () => {
        if (typeof resetJournal === 'function') resetJournal();
        if (typeof makeFormEditable === 'function') makeFormEditable();
        switchView('journal-view');
    };
    if (dashCommunityBtn) dashCommunityBtn.onclick = () => {
        if (typeof switchView === 'function') switchView('community-view');
        // Reset to global tab
        const globalTabBtn = document.querySelector('[data-community-tab="tab-global"]');
        if (globalTabBtn) globalTabBtn.click();
    };
    if (dashChallengesBtn) dashChallengesBtn.onclick = () => {
        const modal = document.getElementById('challenges-modal');
        if (typeof showModal === 'function') showModal(modal);
    };

    if (goHomeLogoBtn) goHomeLogoBtn.onclick = () => switchView('dashboard-view');
    if (navNewEntryBtn) navNewEntryBtn.onclick = () => {
        if (typeof resetJournal === 'function') resetJournal();
        if (typeof makeFormEditable === 'function') makeFormEditable();
        switchView('journal-view');
    };

    // --- LÓGICA DE MINIMIZAR Y CERRAR CHAT ---
    const chatModal = document.getElementById('chat-modal');
    const chatHeader = document.querySelector('#chat-modal .chat-header');
    const closeChatBtn = document.getElementById('close-chat-action');

    if (chatModal && chatHeader) {
        chatHeader.onclick = (e) => {
            // No colapsar si se hace clic en el botón de cerrar
            if (e.target.id === 'close-chat-action') return;
            chatModal.classList.toggle('collapsed');
        };
    }

    if (closeChatBtn) {
        closeChatBtn.onclick = () => {
            if (chatModal) {
                chatModal.style.display = 'none';
                chatModal.classList.remove('collapsed'); // Reset state for next open
            }
        };
    }


    // --- LÓGICA DEL SALÓN DE JUEGOS (ARCADE) ---


    const backToArcadeBtn = document.getElementById('back-to-arcade-btn');
    const gamesLobby = document.querySelector('.arcade-lobby');
    const activeGameContainer = document.getElementById('active-game-container');
    const fullscreenBtn = document.getElementById('fullscreen-game-btn');
    if (fullscreenBtn && activeGameContainer) {
        fullscreenBtn.onclick = () => {
            if (!document.fullscreenElement) {
                activeGameContainer.requestFullscreen().catch(err => {
                    console.error(`Error al entrar en pantalla completa: ${err.message}`);
                });
            } else {
                document.exitFullscreen();
            }
        };

        // Cambiar icono según estado
        document.addEventListener('fullscreenchange', () => {
            if (document.fullscreenElement) {
                fullscreenBtn.textContent = '✖'; // Icono de cerrar/salir
                fullscreenBtn.title = "Salir de Pantalla Completa";
            } else {
                fullscreenBtn.textContent = '⛶'; // Icono de expandir
                fullscreenBtn.title = "Pantalla Completa";
            }
        });
    }

    if (backToArcadeBtn) {
        backToArcadeBtn.onclick = () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            }
            if (gamesLobby) gamesLobby.style.display = 'block';
            if (activeGameContainer) activeGameContainer.style.display = 'none';
            // Refrescar info al volver
            if (window.memoryGame) window.memoryGame.renderLobbyInfo();
        };
    }

    // --- NAVEGACIÓN CASINO ---
    const casinoNavBtn = document.getElementById('casino-nav-btn');
    if (casinoNavBtn) {
        casinoNavBtn.onclick = () => switchView('casino-view');
    }

    // Inicializar Casino
    initCasino();

    // Redirección Perfil Público -> Comunidad
    const publicBackBtn = document.getElementById('public-profile-back-btn');
    if (publicBackBtn) {
        publicBackBtn.onclick = () => {
            if (typeof switchView === 'function') switchView('community-view');
        };
    }
});






