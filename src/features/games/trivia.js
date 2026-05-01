import { getSupabase } from '../../core/api.js';
import State from '../../core/State.js';

/**
 * Módulo de Trivia Literaria: Estilo "Quién quiere ser Millonario"
 */
export const triviaGame = {
    gameState: {
        currentQuestion: null,
        isPlaying: false,
        answeredToday: 0,
        dailyLimit: 3,
        countdownInterval: null,
        jokers: {
            '5050': 1,
            'public': 1,
            'ia': 1
        },
        levels: [
            { reward: 10, label: 'Fácil' },
            { reward: 25, label: 'Media' },
            { reward: 50, label: 'Difícil' }
        ]
    },

    init() {
        console.log('🧠 Trivia Literaria Inicializada');
        this.syncInventory();
    },

    async syncInventory() {
        const sb = getSupabase();
        const user = State.get().currentUser;
        if (!sb || !user) return;

        try {
            const { data: profile, error } = await sb
                .from('profiles')
                .select('jokers, coins')
                .eq('id', user.id)
                .single();

            if (error) throw error;

            if (profile.jokers) {
                this.gameState.jokers = profile.jokers;
            }
            
            // Actualizar UI del lobby
            document.getElementById('inv-5050').textContent = this.gameState.jokers['5050'] || 0;
            document.getElementById('inv-public').textContent = this.gameState.jokers['public'] || 0;
            document.getElementById('inv-ia').textContent = this.gameState.jokers['ia'] || 0;
            
        } catch (e) {
            console.error('Error sincronizando inventario:', e);
        }
    },

    async buyJoker(type, price) {
        const sb = getSupabase();
        const user = State.get().currentUser;
        if (!sb || !user) {
            window.showToast('Inicia sesión para comprar comodines 🛍️', 'info');
            return;
        }

        const currentCoins = State.get().userCoins || 0;
        if (currentCoins < price) {
            window.showToast('No tienes suficientes monedas 💰', 'error');
            return;
        }

        try {
            const { data: stats, error: statsError } = await sb.rpc('secure_increment_stats', {
                p_coins_delta: -price,
                p_xp_delta: 0
            });

            if (statsError) throw statsError;

            // Actualizar comodines en DB (no bloqueados por el trigger si es un update parcial)
            const newJokers = { ...this.gameState.jokers };
            newJokers[type] = (newJokers[type] || 0) + 1;
            
            const { error: jokerError } = await sb.from('profiles').update({ jokers: newJokers }).eq('id', user.id);
            if (jokerError) throw jokerError;

            if (stats) {
                State.set({ userCoins: stats.coins });
                if (typeof window.updateCurrencyUI === 'function') window.updateCurrencyUI();
                
                this.gameState.jokers = newJokers;
                this.syncInventory();
                window.showToast('¡Compra realizada! 🛒', 'success');
            }
        } catch (e) {
            console.error('Error en compra segura de comodín:', e);
            window.showToast('Error al procesar la compra.', 'error');
        }
            console.error('Error en compra:', e);
            window.showToast('Error al procesar la compra.', 'error');
        }
    },

    async start() {
        const sb = getSupabase();
        if (!sb) return;

        // Limpiar contenedor
        const container = document.getElementById('game-canvas');
        if (!container) return;
        container.innerHTML = '<div class="trivia-loading">Cargando desafío... ⏳</div>';

        // Ocultar lobby y mostrar juego
        const lobby = document.querySelector('.arcade-lobby');
        if (lobby) lobby.style.display = 'none';
        
        const activeContainer = document.getElementById('active-game-container');
        if (activeContainer) activeContainer.style.display = 'flex';

        await this.loadQuestion();
    },

    async loadQuestion() {
        const sb = getSupabase();
        const user = State.get().currentUser;
        if (!sb || !user) return;

        try {
            // Obtener el inicio del día LOCAL en formato ISO para la consulta
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const isoStart = startOfDay.toISOString();
            
            // 1. Verificar respuestas de hoy para saber aciertos/fallos
            const { data: todayResponses, error: countError } = await sb
                .from('user_trivia_responses')
                .select('is_correct')
                .eq('user_id', user.id)
                .gte('answered_at', isoStart)
                .order('answered_at', { ascending: true });

            if (countError) throw countError;
            
            this.gameState.answeredToday = todayResponses ? todayResponses.length : 0;
            this.gameState.dailyResults = (todayResponses || []).map(r => r.is_correct ? 'correct' : 'wrong');

            if (this.gameState.answeredToday >= this.gameState.dailyLimit) {
                this.showLimitMessage();
                return;
            }

            // 2. Obtener pool de preguntas
            const { data: pool, error: poolError } = await sb.from('trivia_questions').select('*');
            if (poolError) throw poolError;

            // 3. Filtrar las que este usuario YA respondió (independientemente del día)
            const { data: answeredIdsData } = await sb.from('user_trivia_responses')
                .select('question_id')
                .eq('user_id', user.id);
            
            const answeredIds = (answeredIdsData || []).map(r => r.question_id);
            const availablePool = pool.filter(q => !answeredIds.includes(q.id));

            if (availablePool.length === 0) {
                this.renderMessage("¡Increíble! Has respondido todas las preguntas de nuestra biblioteca. 🏆");
                return;
            }

            // 4. Selección estricta por dificultad: 0=Fácil(10), 1=Media(25), 2=Difícil(50)
            const targetReward = this.gameState.levels[this.gameState.answeredToday].reward;
            let targetPool = availablePool.filter(q => q.reward === targetReward);
            
            // Si no hay de esa dificultad exacta, buscar la más cercana
            if (targetPool.length === 0) {
                targetPool = availablePool.sort((a, b) => Math.abs(a.reward - targetReward) - Math.abs(b.reward - targetReward));
                targetPool = [targetPool[0]]; // Tomar la más cercana
            }

            this.gameState.currentQuestion = targetPool[Math.floor(Math.random() * targetPool.length)];
            this.renderQuestion();

        } catch (e) {
            console.error('Error al cargar trivia:', e);
            this.renderMessage("Error al conectar con la biblioteca. ❌");
        }
    },

    renderQuestion() {
        const container = document.getElementById('game-canvas');
        if (!container) return;

        const q = this.gameState.currentQuestion;
        const options = Array.isArray(q.options) ? q.options : JSON.parse(q.options);
        const labels = ['A', 'B', 'C', 'D'];

        container.innerHTML = `
            <div class="trivia-stage millionaire-theme">
                <div class="trivia-header">
                    <div class="trivia-level-ladder">
                        ${this.gameState.levels.map((l, i) => {
                            let statusClass = '';
                            if (i === this.gameState.answeredToday) statusClass = 'active';
                            else if (i < this.gameState.answeredToday) {
                                statusClass = this.gameState.dailyResults[i] || 'completed';
                            }
                            return `
                                <div class="level-step ${statusClass}">
                                    ${l.reward}💰 <span class="level-label">${l.label}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    <div class="trivia-jokers">
                        <button class="joker-btn ${this.gameState.jokers['5050'] > 0 ? '' : 'disabled'}" id="joker-5050" title="50:50">🌓</button>
                        <button class="joker-btn ${this.gameState.jokers['public'] > 0 ? '' : 'disabled'}" id="joker-public" title="Público">📊</button>
                        <button class="joker-btn ${this.gameState.jokers['ia'] > 0 ? '' : 'disabled'}" id="joker-ia" title="IA">🤖</button>
                    </div>
                </div>

                <div class="trivia-question-box">
                    <div class="diamond-shape">
                        <p>${q.question}</p>
                    </div>
                </div>

                <div class="trivia-options-grid">
                    ${options.map((opt, i) => `
                        <div class="trivia-option-wrapper" data-idx="${i}">
                            <div class="diamond-option" onclick="window.triviaGame.checkAnswer(${i})">
                                <span class="option-label">${labels[i]}.</span>
                                <span class="option-text">${opt}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        this.addJokerListeners();
    },

    addJokerListeners() {
        document.getElementById('joker-5050')?.addEventListener('click', () => this.useJoker5050());
        document.getElementById('joker-public')?.addEventListener('click', () => this.useJokerPublic());
        document.getElementById('joker-ia')?.addEventListener('click', () => this.useJokerIA());
    },

    async consumeJoker(type) {
        const sb = getSupabase();
        const user = State.get().currentUser;
        if (!sb || !user) return;

        try {
            const newJokers = { ...this.gameState.jokers };
            newJokers[type] = Math.max(0, (newJokers[type] || 0) - 1);
            
            await sb.from('profiles').update({ jokers: newJokers }).eq('id', user.id);
            this.gameState.jokers = newJokers;
        } catch (e) {
            console.error('Error consumiendo comodín:', e);
        }
    },

    useJoker5050() {
        if (this.gameState.jokers['5050'] <= 0) return;
        this.consumeJoker('5050');
        const correctIdx = this.gameState.currentQuestion.correct_index;
        const options = document.querySelectorAll('.trivia-option-wrapper');
        const indices = [0, 1, 2, 3].filter(i => i !== correctIdx).sort(() => Math.random() - 0.5);
        indices.slice(0, 2).forEach(idx => {
            options[idx].classList.add('bubble-pop');
        });
        document.getElementById('joker-5050').classList.add('disabled');
    },

    useJokerPublic() {
        if (this.gameState.jokers['public'] <= 0) return;
        this.consumeJoker('public');
        const correctIdx = this.gameState.currentQuestion.correct_index;
        const options = document.querySelectorAll('.trivia-option-wrapper');
        options.forEach((opt, i) => {
            const badge = document.createElement('div');
            badge.className = 'public-percent-badge';
            const percent = i === correctIdx ? Math.floor(Math.random() * 30) + 50 : Math.floor(Math.random() * 20);
            badge.textContent = `${percent}%`;
            opt.appendChild(badge);
        });
        document.getElementById('joker-public').classList.add('disabled');
    },

    useJokerIA() {
        if (this.gameState.jokers['ia'] <= 0) return;
        this.consumeJoker('ia');

        const q = this.gameState.currentQuestion;
        const options = Array.isArray(q.options) ? q.options : JSON.parse(q.options);
        const correctIdx = q.correct_index;
        const correctText = options[correctIdx];
        
        // Simular pensamiento de IA
        const confidence = Math.floor(Math.random() * 21) + 75; // 75-95% de confianza
        const hint = `He analizado los registros de la Gran Biblioteca... \n\nMi base de datos indica con un **${confidence}% de confianza** que la respuesta correcta es la que comienza con la letra **"${correctText.charAt(0)}"**.`;
        
        window.showConfirm('Análisis del Bibliotecario Real 🤖', hint, null);

        document.getElementById('joker-ia').classList.add('disabled');
    },

    async checkAnswer(idx) {
        const sb = getSupabase();
        const user = State.get().currentUser;
        if (!sb || !user) return;

        const options = document.querySelectorAll('.diamond-option');
        options.forEach(opt => opt.style.pointerEvents = 'none');

        const isCorrect = (idx === this.gameState.currentQuestion.correct_index);
        const reward = isCorrect ? this.gameState.currentQuestion.reward : 0;

        try {
            // 1. Guardar la respuesta localmente en la base de datos
            await sb.from('user_trivia_responses').insert({
                user_id: user.id,
                question_id: this.gameState.currentQuestion.id,
                selected_index: idx,
                is_correct: isCorrect
            });

            if (isCorrect) {
                options[idx].classList.add('correct');
                
                // 2. Dar recompensa directamente
                const currentCoins = State.get().userCoins || 0;
                const newCoins = currentCoins + reward;
                
                await sb.from('profiles').update({ coins: newCoins }).eq('id', user.id);
                
                setTimeout(() => {
                    window.showConfirm('¡Respuesta Correcta! 🎉', `Has ganado ${reward}💰. ¡Siguiente nivel!`, () => {
                        this.gameState.answeredToday++;
                        this.loadQuestion();
                    });
                    State.set({ userCoins: newCoins });
                    if (typeof window.updateCurrencyUI === 'function') window.updateCurrencyUI();
                }, 1000);
            } else {
                const correctIdx = this.gameState.currentQuestion.correct_index;
                options[idx].classList.add('wrong');
                options[correctIdx].classList.add('correct');
                
                this.gameState.answeredToday++;
                setTimeout(() => {
                    if (this.gameState.answeredToday < 3) {
                        const triesLeft = 3 - this.gameState.answeredToday;
                        window.showConfirm('¡Casi! ❌', `La respuesta correcta era la ${['A','B','C','D'][correctIdx]}. Te quedan ${triesLeft} intento(s) para hoy. ¿Quieres continuar?`, () => {
                            this.loadQuestion();
                        });
                    } else {
                        window.showConfirm('¡Casi! ❌', `La respuesta correcta era la ${['A','B','C','D'][correctIdx]}. Has agotado tus intentos de hoy.`, () => {
                            this.showLimitMessage();
                        });
                    }
                }, 1500);
            }
        } catch (e) {
            console.error('Error al validar respuesta:', e);
            window.showToast('Error al conectar con el servidor.', 'error');
        }
    },

    showLimitMessage() {
        this.renderMessage(`
            <div class="trivia-limit-container">
                <div class="limit-icon">⏰</div>
                <h2>¡Límite Diario Alcanzado!</h2>
                <p>Has completado tus 3 preguntas de hoy. El desafío se reiniciará a medianoche.</p>
                <div id="trivia-countdown" class="trivia-countdown-timer">00:00:00</div>
                <button class="journal-btn" onclick="document.getElementById('back-to-arcade-btn').click()">VOLVER AL ARCADE</button>
            </div>
        `);
        this.startCountdown();
    },

    startCountdown() {
        if (this.gameState.countdownInterval) clearInterval(this.gameState.countdownInterval);
        
        const updateTimer = () => {
            const now = new Date();
            const tomorrow = new Date();
            tomorrow.setHours(24, 0, 0, 0); // Media noche local
            
            const diff = tomorrow - now;
            if (diff <= 0) {
                clearInterval(this.gameState.countdownInterval);
                this.loadQuestion(); // Recargar si ya es otro día
                return;
            }

            const h = Math.floor(diff / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diff % (1000 * 60)) / 1000);
            
            const timerEl = document.getElementById('trivia-countdown');
            if (timerEl) {
                timerEl.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            }
        };

        updateTimer();
        this.gameState.countdownInterval = setInterval(updateTimer, 1000);
    },

    renderMessage(msg) {
        const container = document.getElementById('game-canvas');
        if (container) {
            container.innerHTML = `<div class="trivia-message-overlay">${msg}</div>`;
        }
    }
};

window.triviaGame = triviaGame;
