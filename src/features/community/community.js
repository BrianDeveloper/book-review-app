import { getSupabase } from '../../api.js';
import State from '../../core/State.js';
import EventBus from '../../core/EventBus.js';
import { showToast, showModal, hideModal } from '../../utils.js';
import { isUserOnline, getPresenceHTML } from '../presence/presence.js';

export function initCommunity() {
    const currentUser = State.getKey('currentUser');
    let currentUserFriendIds = window.currentUserFriendIds || {};

    // Declaración de variables de estado locales para el sistema de chat
    let currentChatFriendId = null;
    let friendUnreadMessages = {};
    let chatSubscription = null;
    let isCurrentlyTyping = false;
    let typingTimeout = null;

    const communityFeed = document.getElementById('community-feed');

    const loadGlobalFeed = async () => {
        if (!communityFeed) return;
        communityFeed.innerHTML = '<p class="empty-msg">Cargando libros de la comunidad... 🌎</p>';
        
        const sb = getSupabase();
        if (!sb) return;

        try {
            // Carga simple para evitar error de JOIN
            let query = sb.from('reviews').select('*');
            if (currentUser) {
                query = query.neq('user_id', currentUser.id);
            }

            let { data, error } = await query
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;

            if (data && data.length > 0) {
                // Enriquecer con perfiles secuencialmente
                const uids = [...new Set(data.map(r => r.user_id))];
                const { data: profiles } = await sb.from('profiles').select('id, username, avatar_url, last_seen, show_presence').in('id', uids);
                
                if (profiles) {
                    const pMap = {};
                    profiles.forEach(p => pMap[p.id] = p);
                    data = data.map(r => ({ ...r, profiles: pMap[r.user_id] }));
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
                        <button class="mini-btn" data-user-id="${u.id}" onclick="event.stopPropagation(); sendFriendRequest('${u.id}', this)" style="padding: 2px 8px; font-size: 0.8rem;">
                            Agregar ➕
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
            .select('id, username, avatar_url, last_seen, show_presence')
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
            const isOnline = isUserOnline(u.last_seen, u.show_presence);
            const presenceDot = getPresenceHTML(isOnline);
            
            return `
                <div class="friend-search-item" onclick="window.loadPublicProfile('${u.id}')" style="cursor: pointer;">
                    <div class="avatar-wrapper">
                        <img src="${avatar}" class="community-avatar" alt="Avatar">
                        ${presenceDot}
                    </div>
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
                    solicitante:profiles!friendships_requester_id_fkey(id, username, avatar_url, last_seen, show_presence),
                    destinatario:profiles!friendships_addressee_id_fkey(id, username, avatar_url, last_seen, show_presence)
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

                const isOnline = (typeof window.isUserOnline === 'function') ? window.isUserOnline(friendData.last_seen, friendData.show_presence) : false;
                const presenceDot = (typeof window.getPresenceHTML === 'function') ? window.getPresenceHTML(isOnline) : '';

                return `
                    <div class="friend-mini-item" onclick="window.showFriendActions(event, '${friendData.id}', '${friendData.username}', '${avatar}')">
                        <div class="friend-item-wrapper avatar-wrapper">
                            <img src="${avatar}" class="community-avatar" alt="${friendData.username}">
                            ${presenceDot}
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
        if (avatarEl) {
            avatarEl.src = avatar;
            // Envolver el avatar del chat en el wrapper de presencia
            const avatarContainer = avatarEl.parentElement;
            if (avatarContainer) {
                avatarContainer.classList.add('avatar-wrapper');
                // Buscar si ya hay un indicador y actualizarlo o crearlo
                let dot = avatarContainer.querySelector('.presence-indicator');
                if (!dot) {
                    dot = document.createElement('span');
                    avatarContainer.appendChild(dot);
                }
                // Como no tenemos el last_seen aquí directamente, hacemos una consulta rápida o asumimos online si acabamos de abrir
                dot.className = 'presence-indicator presence-online'; // Por defecto verde al abrir chat
            }
        }
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
            if (!wrapper) return; // Previene el crash
            
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
            .select('*')
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

    
    // Expose globally for legacy compatibility
    window.loadGlobalFeed = loadGlobalFeed;
    window.renderCommunityCard = typeof renderCommunityCard !== 'undefined' ? renderCommunityCard : undefined;
}

document.addEventListener('DOMContentLoaded', initCommunity);
