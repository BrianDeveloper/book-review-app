import { getSupabase } from '../../core/api.js';
import State from '../../core/State.js';
import { showModal, hideModal, showToast, showConfirm } from '../../utils.js';

export const arcadeRankings = {
    async openRankingModal() {
        const modal = document.getElementById('ranking-modal');
        const body = document.getElementById('ranking-modal-body');
        if (!modal || !body) return;

        body.innerHTML = `
            <div class="ranking-modal-container">
                <div class="ranking-header">
                    <h3>🏆 Salón de la Fama Semanal</h3>
                    <div class="ranking-tabs">
                        <button class="rank-tab active" data-type="global">Global</button>
                        <button class="rank-tab" data-type="memory">Memorama</button>
                        <button class="rank-tab" data-type="trivia">Trivia</button>
                    </div>
                </div>
                <div id="ranking-claim-banner"></div>
                <div id="ranking-list-container" class="ranking-list">
                    <div class="loading-ranking">Cargando leyendas... ⏳</div>
                </div>
                <div class="ranking-footer">
                    <p>Los rankings se reinician cada lunes a las 00:00 UTC</p>
                </div>
            </div>
        `;

        showModal(modal);
        this.checkPendingClaims();
        
        // Agregar eventos a los tabs
        document.querySelectorAll('.rank-tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.rank-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.loadRankings(tab.dataset.type);
            };
        });

        this.loadRankings('global');
    },

    async checkPendingClaims() {
        const banner = document.getElementById('ranking-claim-banner');
        const user = State.getKey('currentUser');
        if (!banner || !user) return;

        const sb = getSupabase();
        try {
            const { data, error } = await sb.from('reward_claims')
                .select('*')
                .eq('user_id', user.id)
                .is('claimed_at', null)
                .order('created_at', { ascending: false });

            if (!error && data && data.length > 0) {
                banner.innerHTML = `
                    <div class="pending-claim-alert">
                        <div class="claim-text">
                            <span>🎁 ¡Tienes <strong>${data.length}</strong> premio(s) pendiente(s)!</span>
                        </div>
                        <button class="claim-all-btn" onclick="arcadeRankings.claimReward('${data[0].id}')">
                            RECLAMAR PREMIO 💰
                        </button>
                    </div>
                `;
            } else {
                banner.innerHTML = '';
            }
        } catch (e) {
            console.error("Error checking claims:", e);
        }
    },

    async claimReward(claimId) {
        const sb = getSupabase();
        try {
            const { data, error } = await sb.rpc('claim_weekly_reward', { p_claim_id: claimId });
            if (error) throw error;

            if (data.success) {
                showToast(`¡Premio reclamado! +${data.coins_added}💰 y un objeto nuevo.`, 'success');
                State.set({ userCoins: data.new_total_coins });
                this.checkPendingClaims();
                // Notificar al inventario que se recargue si está abierto
                if (window.userInventory) window.userInventory.loadInventory();
            } else {
                showToast(data.message || 'No se pudo reclamar el premio.', 'error');
            }
        } catch (e) {
            console.error("Error claiming reward:", e);
            showToast('Error de conexión al reclamar premio.', 'error');
        }
    },

    async loadRankings(type) {
        const container = document.getElementById('ranking-list-container');
        if (!container) return;

        container.innerHTML = '<div class="loading-ranking">Cargando leyendas... ⏳</div>';

        const sb = getSupabase();
        if (!sb) return;

        try {
            const { data, error } = await sb.rpc('get_weekly_arcade_ranking', {
                p_game_type: type
            });

            if (error) throw error;

            if (!data || data.length === 0) {
                container.innerHTML = '<div class="empty-ranking">Aún no hay registros esta semana. ¡Sé el primero! 🚀</div>';
                return;
            }

            this.renderRankingList(data, type);
        } catch (e) {
            console.error("Error cargando rankings:", e);
            container.innerHTML = '<div class="error-ranking">No se pudieron cargar los rankings.</div>';
        }
    },

    renderRankingList(data, type) {
        const container = document.getElementById('ranking-list-container');
        const currentUser = State.getKey('currentUser');

        let html = '';
        data.forEach((row, index) => {
            const isMe = currentUser?.username === row.username; // Ajustar si tienes el ID en el row
            const rankClass = index === 0 ? 'rank-gold' : index === 1 ? 'rank-silver' : index === 2 ? 'rank-bronze' : '';
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${row.rank}`;
            
            const timeStr = row.best_time ? `${Math.floor(row.best_time / 60)}:${(row.best_time % 60).toString().padStart(2, '0')}` : '--';

            html += `
                <div class="ranking-item ${rankClass} ${isMe ? 'is-me' : ''}">
                    <div class="rank-number">${medal}</div>
                    <img src="${row.avatar_url || 'https://ui-avatars.com/api/?name=' + row.username}" class="rank-avatar">
                    <div class="rank-info">
                        <span class="rank-username">${row.username}</span>
                        <span class="rank-stats">Partidas: ${row.games_played}</span>
                    </div>
                    <div class="rank-score">
                        <div class="rank-coins">${row.total_coins} 💰</div>
                        ${type === 'memory' ? `<div class="rank-time">⏱️ ${timeStr}</div>` : ''}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    /**
     * FUNCIÓN ADMINISTRATIVA: Genera los reclamos de premios para el ranking actual.
     * Normalmente esto correría en un Cron Job, pero lo habilitamos para pruebas del Admin.
     */
    async generateWeeklyRewards() {
        const sb = getSupabase();
        
        const proceed = await new Promise(resolve => {
            showConfirm("🏆 Generar Premios", "¿Deseas generar los premios para el Top 3 actual? Esto creará registros en 'reward_claims'.", () => resolve(true));
            // Nota: showConfirm usualmente no es async en este proyecto, así que esto es un placeholder de lógica
        });
        
        // Simulación de confirmación (asumiendo que el usuario acepta)
        try {
            console.log("🚀 Iniciando generación de premios semanales...");
            
            // 1. Obtener el ranking global actual
            const { data: ranking, error: rankError } = await sb.rpc('get_weekly_arcade_ranking', { p_game_type: 'global' });
            if (rankError) throw rankError;

            if (!ranking || ranking.length === 0) {
                showToast("No hay jugadores en el ranking esta semana.", "warning");
                return;
            }

            const now = new Date();
            const weekNumber = this.getWeekNumber(now);
            const year = now.getUTCFullYear();

            let createdCount = 0;
            let errors = 0;

            // 2. Generar premios para los 3 primeros
            for (let i = 0; i < Math.min(3, ranking.length); i++) {
                const player = ranking[i];
                const rewardType = i === 0 ? 'gold' : i === 1 ? 'silver' : 'bronze';

                console.log(`🎁 Generando premio ${rewardType} para ${player.username}...`);

                const { error: insertError } = await sb.from('reward_claims').insert({
                    user_id: player.user_id,
                    week_number: weekNumber,
                    year: year,
                    game_type: 'global',
                    reward_type: rewardType
                });

                if (insertError) {
                    if (insertError.code === '23505') { // Unique violation
                        console.warn(`⚠️ El usuario ${player.username} ya tiene un premio para esta semana.`);
                    } else {
                        console.error(`❌ Error al crear premio para ${player.username}:`, insertError);
                        errors++;
                    }
                } else {
                    createdCount++;
                    // Notificar al usuario
                    await sb.from('notifications').insert({
                        user_id: player.user_id,
                        type: 'reward',
                        content: `🏆 ¡Felicidades! Has ganado un premio de ${rewardType === 'gold' ? 'Oro' : rewardType === 'silver' ? 'Plata' : 'Bronce'} en el ranking semanal.`,
                        metadata: { view: 'games-view' }
                    });
                }
            }

            showToast(`Generación completada: ${createdCount} premios creados. ${errors} errores.`, createdCount > 0 ? 'success' : 'info');
            this.checkPendingClaims(); // Refrescar si el admin es uno de los ganadores

        } catch (e) {
            console.error("💥 Error fatal en generación de premios:", e);
            showToast(`Error: ${e.message || 'No se pudo generar los premios'}`, 'error');
        }
    },

    getWeekNumber(d) {
        // Usamos UTC para que coincida con el servidor de Supabase
        d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return weekNo;
    },

    /**
     * Otorga un premio manual a un usuario (Testing/Admin)
     */
    async awardManualReward(userId, rewardType = 'gold') {
        const sb = getSupabase();
        if (!sb) return;

        const week = this.getWeekNumber(new Date());
        const year = new Date().getUTCFullYear();

        try {
            const { error } = await sb.from('reward_claims').insert({
                user_id: userId,
                week_number: week,
                year: year,
                game_type: 'global',
                reward_type: rewardType
            });

            if (error) {
                if (error.code === '23505') {
                    showToast("Este usuario ya tiene un premio asignado para esta semana.", "warning");
                } else {
                    throw error;
                }
            } else {
                // Crear notificación
                await sb.from('notifications').insert({
                    user_id: userId,
                    type: 'reward',
                    content: `🏆 ¡Admin te ha otorgado un premio de ${rewardType === 'gold' ? 'Oro' : rewardType === 'silver' ? 'Plata' : 'Bronce'}!`,
                    metadata: { view: 'games-view' }
                });

                showToast("🏆 Premio otorgado manualmente con éxito.", "success");
                // Si el usuario es el actual, refrescar el ranking para que vea el banner
                if (typeof this.checkPendingClaims === 'function') this.checkPendingClaims();
            }
        } catch (err) {
            console.error("Error al otorgar premio manual:", err);
            showToast("Error al otorgar premio manual.", "error");
        }
    }
};

window.arcadeRankings = arcadeRankings;
window.openArcadeRankings = () => arcadeRankings.openRankingModal();
