/**
 * dashboard_service.js — Capa de datos para las estadísticas del usuario.
 */

export const dashboardService = {
    /**
     * Obtiene estadísticas resumidas del usuario (Totales).
     */
    async fetchSummaryStats(sb, userId) {
        if (!sb || !userId) return null;

        try {
            // 1. Conteo de reseñas
            const { count: reviewCount, error: err1 } = await sb
                .from('reviews')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId);
            
            if (err1) throw err1;

            // 2. Suma de likes de todas sus reseñas
            // Nota: Obtenemos todas las reseñas y sus conteos de likes
            const { data: reviews, error: err2 } = await sb
                .from('reviews')
                .select('id, like_data:review_likes(count)')
                .eq('user_id', userId);

            if (err2) throw err2;

            const totalLikes = reviews.reduce((sum, rev) => {
                const count = rev.like_data?.[0]?.count || 0;
                return sum + count;
            }, 0);

            // 3. Datos del perfil (Coins, XP, Level)
            const { data: profile, error: err3 } = await sb
                .from('profiles')
                .select('coins, xp, level, username')
                .eq('id', userId)
                .single();

            if (err3) throw err3;

            return {
                reviewCount,
                totalLikes,
                coins: profile.coins,
                xp: profile.xp,
                level: profile.level,
                username: profile.username
            };
        } catch (error) {
            console.error('❌ Error en dashboardService.fetchSummaryStats:', error);
            return null;
        }
    },

    /**
     * Obtiene el listado detallado de reseñas con sus métricas individuales.
     */
    async fetchDetailedReviews(sb, userId) {
        if (!sb || !userId) return [];

        try {
            const { data, error } = await sb
                .from('reviews')
                .select(`
                    *,
                    like_data:review_likes(count)
                `)
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            return data.map(rev => ({
                ...rev,
                likeCount: rev.like_data?.[0]?.count || 0
            }));
        } catch (error) {
            console.error('❌ Error en dashboardService.fetchDetailedReviews:', error);
            return [];
        }
    }
};
