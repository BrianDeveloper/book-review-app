/**
 * dashboard_ui.js — Renderizado de la interfaz de estadísticas.
 */

import { getFriendlyDate, getRatingStarsHTML } from '../../utils.js';

export const dashboardUI = {
    /**
     * Renderiza el contenido principal del dashboard en el contenedor provisto.
     */
    render(container, stats, reviews) {
        if (!container || !stats) return;

        // Cachear reviews para carga instantánea al pulsar "Ver"
        window.cachedDashboardReviews = reviews;

        container.innerHTML = `
            <div class="dashboard-header">
                <h2>Panel de Control: @${stats.username}</h2>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <span class="stat-icon">📚</span>
                    <div class="stat-info">
                        <span class="stat-value">${stats.reviewCount}</span>
                        <span class="stat-label">Reseñas Totales</span>
                    </div>
                </div>
                <div class="stat-card">
                    <span class="stat-icon">❤️</span>
                    <div class="stat-info">
                        <span class="stat-value">${stats.totalLikes}</span>
                        <span class="stat-label">Likes Recibidos</span>
                    </div>
                </div>
                <div class="stat-card">
                    <span class="stat-icon">💰</span>
                    <div class="stat-info">
                        <span class="stat-value">${stats.coins}</span>
                        <span class="stat-label">Saldo Actual</span>
                    </div>
                </div>
                <div class="stat-card">
                    <span class="stat-icon">⭐</span>
                    <div class="stat-info">
                        <span class="stat-value">Lvl ${stats.level}</span>
                        <span class="stat-label">${stats.xp} XP acumulada</span>
                    </div>
                </div>
            </div>

            <div class="detailed-section">
                <h3>Rendimiento Individual por Reseña</h3>
                <div class="reviews-table-container">
                    <table class="dashboard-table">
                        <thead>
                            <tr>
                                <th>Libro / Autor</th>
                                <th>Fecha</th>
                                <th class="hide-mobile">⭐ Calif.</th>
                                <th>❤️ Likes</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${reviews.length > 0 ? reviews.map(rev => `
                                <tr>
                                    <td>
                                        <div class="table-book-info">
                                            <span class="book-title">${rev.title}</span>
                                            <span class="book-author">${rev.author}</span>
                                        </div>
                                    </td>
                                    <td>${getFriendlyDate(rev.created_at)}</td>
                                    <td class="hide-mobile">${getRatingStarsHTML(rev.rating, 14)}</td>
                                    <td><span class="table-likes">${rev.likeCount}</span></td>
                                    <td><button class="mini-btn view-review-btn icon-only" onclick="openReviewFromDashboard('${rev.id}')" title="Ver reseña">👁️</button></td>
                                </tr>
                            `).join('') : `<tr><td colspan="5" class="empty-table">Aún no tienes reseñas. ¡Escribe la primera!</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Asignar eventos de volver si existieran otros controles
    }
};
