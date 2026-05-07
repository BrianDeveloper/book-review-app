import { getSupabase } from '../../core/api.js';
import State from '../../core/State.js';

/**
 * Módulo de Minijuego: Memorama Literario
 */
export const memoryGame = {
    pairs: [
        { a: 'Cervantes', b: 'Don Quijote' },
        { a: 'Gabriel García Márquez', b: '100 años de soledad' },
        { a: 'Jane Austen', b: 'Orgullo y prejuicio' },
        { a: 'George Orwell', b: '1984' },
        { a: 'Virginia Woolf', b: 'Al faro' },
        { a: 'Jorge Luis Borges', b: 'El Aleph' },
        { a: 'Julio Cortázar', b: 'Rayuela' },
        { a: 'Agatha Christie', b: 'Diez negritos' },
        { a: 'Isabel Allende', b: 'La casa de los espíritus' },
        { a: 'Franz Kafka', b: 'La metamorfosis' },
        { a: 'Oscar Wilde', b: 'El retrato de Dorian Gray' },
        { a: 'Herman Melville', b: 'Moby Dick' },
        { a: 'Antoine de Saint-Exupéry', b: 'El Principito' },
        { a: 'Mary Shelley', b: 'Frankenstein' },
        { a: 'Bram Stoker', b: 'Drácula' },
        { a: 'Edgar Allan Poe', b: 'El cuervo' },
        { a: 'Ernest Hemingway', b: 'El viejo y el mar' },
        { a: 'Victor Hugo', b: 'Los miserables' },
        { a: 'Charles Dickens', b: 'Oliver Twist' },
        { a: 'Mark Twain', b: 'Tom Sawyer' },
        { a: 'Emily Brontë', b: 'Cumbres borrascosas' },
        { a: 'James Joyce', b: 'Ulises' },
        { a: 'F. Scott Fitzgerald', b: 'El gran Gatsby' },
        { a: 'J.R.R. Tolkien', b: 'El Hobbit' },
        { a: 'Stephen King', b: 'It (Eso)' },
        { a: 'J.K. Rowling', b: 'Harry Potter' },
        { a: 'Homero', b: 'La Odisea' },
        { a: 'Dante Alighieri', b: 'La Divina Comedia' },
        { a: 'Mario Vargas Llosa', b: 'La ciudad y los perros' },
        { a: 'Leo Tolstoy', b: 'Guerra y Paz' },
        { a: 'William Shakespeare', b: 'Hamlet' }
    ],
    
    gameState: {
        cards: [],
        flippedCards: [],
        matches: 0,
        moves: 0,
        isPlaying: false,
        dailyLimit: 5,
        remainingPlays: 0,
        difficulty: 'normal',
        elapsedTime: 0,
        timerInterval: null,
        config: {
            easy: { pairs: 6, cols: 3, reward: 10, bonusThresh: [10, 15] },
            normal: { pairs: 8, cols: 4, reward: 20, bonusThresh: [15, 22] },
            hard: { pairs: 10, cols: 5, reward: 35, bonusThresh: [22, 32] },
            expert: { pairs: 12, cols: 6, reward: 55, bonusThresh: [28, 42] }
        }
    },

    init() {
        console.log('🃏 Memorama Inicializado');
        this.renderLobbyInfo();
        if (typeof EventBus !== 'undefined') {
            EventBus.subscribe('STATE_GAMESTATES_CHANGED', () => this.updateLobbyPersistenceUI());
        }
    },

    async renderLobbyInfo() {
        const limitDisplay = document.getElementById('daily-games-left');
        if (!limitDisplay) return;

        const sb = getSupabase();
        if (!sb) return;

        // Verificar si hay sesión activa antes de llamar al RPC
        const { data: { session } } = await sb.auth.getSession();
        if (!session) {
            limitDisplay.textContent = '-- (Inicia sesión)';
            return;
        }

        try {
            const startOfDay = new Date();
            startOfDay.setUTCHours(0, 0, 0, 0);
            const isoStart = startOfDay.toISOString();

            const { data, error } = await sb.rpc('get_arcade_status', {
                p_start_of_day: isoStart
            });
            
            if (error) {
                // Si la función no existe, probablemente no se aplicó la migración
                if (error.code === 'P0001' || error.message.includes('function')) {
                    console.warn('RPC get_arcade_status no encontrado. ¿Olvidaste aplicar la migración?');
                    this.gameState.remainingPlays = 5; // Fallback para dev
                    limitDisplay.textContent = '5 (Modo Local)';
                    return;
                }
                throw error;
            }

            if (data && data.authenticated) {
                this.gameState.remainingPlays = data.remaining;
                this.gameState.dailyLimit = data.daily_limit;
                limitDisplay.textContent = data.remaining;
            } else {
                limitDisplay.textContent = 'Inicia sesión';
            }

            // --- Actualización de botón "Continuar" ---
            this.updateLobbyPersistenceUI();

        } catch (e) {
            console.error('Error al obtener estado del arcade:', e);
            limitDisplay.textContent = 'Error';
        }
    },

    updateLobbyPersistenceUI() {
        const playBtn = document.getElementById('play-memory-btn');
        const diffSelect = document.getElementById('memory-difficulty');
        const diffLabel = diffSelect?.previousElementSibling;
        const gameStates = State.getKey('gameStates') || {};
        const hasSavedGame = !!gameStates.memory;

        if (playBtn) {
            playBtn.textContent = hasSavedGame ? 'CONTINUAR PARTIDA ↩️' : '¡JUGAR AHORA!';
            playBtn.style.background = hasSavedGame ? 'var(--secondary-color)' : '';
            playBtn.style.color = hasSavedGame ? 'white' : '';
        }

        if (diffSelect) diffSelect.style.display = hasSavedGame ? 'none' : 'block';
        if (diffLabel) diffLabel.style.display = hasSavedGame ? 'none' : 'block';
    },

    async canPlay() {
        // Si aún no tenemos info, intentamos cargarla rápido
        if (this.gameState.remainingPlays === 0 && document.getElementById('daily-games-left')?.textContent === '--') {
            await this.renderLobbyInfo();
        }
        return this.gameState.remainingPlays > 0;
    },

    async start() {
        if (!(await this.canPlay())) {
            window.showToast('Has agotado tus partidas de Memorama por hoy. ¡Vuelve mañana! 🌙', 'info');
            return;
        }

        const user = State.get().currentUser;
        const gameStates = State.getKey('gameStates') || {};
        const savedState = gameStates.memory;

        if (savedState) {
            try {
                console.log("🌍 Memorama: Reanudando partida guardada del servidor...");
                this.gameState.cards = savedState.cards;
                this.gameState.moves = savedState.moves;
                this.gameState.matches = savedState.matches;
                this.gameState.difficulty = savedState.difficulty;
                this.gameState.elapsedTime = savedState.elapsedTime || 0;
                this.gameState.isPlaying = true;
                this.gameState.flippedCards = []; // Siempre resetear volteadas al cargar
                
                this.renderBoard();
                this.syncBoardVisuals(); // Asegurar que las ya emparejadas se vean bien
                this.startTimer();
                
                this.toggleGameVisibility(true);
                return;
            } catch (e) {
                console.error("Error al cargar partida guardada del servidor:", e);
                this.updateServerState(null);
            }
        }

        const diffSelect = document.getElementById('memory-difficulty');
        this.gameState.difficulty = diffSelect ? diffSelect.value : 'normal';

        this.gameState.cards = this.generateCards();
        this.gameState.flippedCards = [];
        this.gameState.matches = 0;
        this.gameState.moves = 0;
        this.gameState.elapsedTime = 0;
        this.gameState.isPlaying = true;

        this.saveState(); // Guardar estado inicial
        this.renderBoard();
        this.startTimer();
        this.toggleGameVisibility(true);
    },

    toggleGameVisibility(show) {
        const lobby = document.querySelector('.arcade-lobby');
        const container = document.getElementById('active-game-container');
        if (lobby) lobby.style.display = show ? 'none' : 'block';
        if (container) container.style.display = show ? 'flex' : 'none';
    },

    saveState() {
        const stateToSave = {
            cards: this.gameState.cards,
            moves: this.gameState.moves,
            matches: this.gameState.matches,
            difficulty: this.gameState.difficulty,
            elapsedTime: this.gameState.elapsedTime
        };
        this.updateServerState(stateToSave);
    },

    startTimer() {
        if (this.gameState.timerInterval) clearInterval(this.gameState.timerInterval);
        this.gameState.timerInterval = setInterval(() => {
            if (!this.gameState.isPlaying) return;
            this.gameState.elapsedTime++;
            this.updateTimerUI();
            // Guardamos el tiempo cada 10 segundos para no saturar, o solo al final/pausa
            if (this.gameState.elapsedTime % 10 === 0) this.saveState();
        }, 1000);
    },

    updateTimerUI() {
        const timerEl = document.getElementById('mem-timer');
        if (timerEl) {
            const mins = Math.floor(this.gameState.elapsedTime / 60);
            const secs = this.gameState.elapsedTime % 60;
            timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    },

    async updateServerState(state) {
        const sb = getSupabase();
        const user = State.getKey('currentUser');
        if (!sb || !user) return;

        try {
            const currentGameStates = State.getKey('gameStates') || {};
            const newGameStates = {
                ...currentGameStates,
                memory: state
            };

            // Actualización optimista
            State.set({ gameStates: newGameStates });

            const { error } = await sb
                .from('profiles')
                .update({ game_states: newGameStates })
                .eq('id', user.id);

            if (error && error.message.includes('column "game_states" of relation "profiles" does not exist')) {
                console.warn("⚠️ Servidor: La columna game_states no existe en profiles. Usando localStorage como respaldo.");
                if (state) localStorage.setItem(`memory_active_state_${user.id}`, JSON.stringify(state));
                else localStorage.removeItem(`memory_active_state_${user.id}`);
            }
        } catch (e) {
            console.error("Error al sincronizar estado de Memorama:", e);
        }
    },

    syncBoardVisuals() {
        // Después de renderBoard, aplicar estilos a las cartas que ya están matched
        const cards = document.querySelectorAll('.memory-card');
        this.gameState.cards.forEach((card, idx) => {
            if (card.matched) {
                const el = cards[idx];
                const inner = el.querySelector('.memory-card-inner');
                const back = inner.querySelector('.memory-card-back');
                
                inner.style.transform = 'rotateY(180deg)';
                inner.style.transition = 'none'; // Sin animación al cargar
                inner.style.boxShadow = '0 0 25px rgba(46, 204, 113, 0.8), inset 0 0 15px rgba(46, 204, 113, 0.3)';
                back.style.background = '#f0fff4';
                
                if (!back.querySelector('.match-check')) {
                    const check = document.createElement('div');
                    check.className = 'match-check';
                    check.innerHTML = '✅';
                    check.style.position = 'absolute';
                    check.style.top = '5px';
                    check.style.right = '5px';
                    check.style.fontSize = '0.8rem';
                    back.appendChild(check);
                }
            }
        });
        
        document.getElementById('mem-moves').textContent = this.gameState.moves;
        document.getElementById('mem-matches').textContent = this.gameState.matches;
        this.updateTimerUI();
    },

    generateCards() {
        const config = this.gameState.config[this.gameState.difficulty];
        const shuffledPool = [...this.pairs].sort(() => Math.random() - 0.5);
        
        const selectedPairs = [];
        const seenAuthors = new Set();

        for (const pair of shuffledPool) {
            if (selectedPairs.length >= config.pairs) break;

            // Normalizar el nombre del autor para evitar "García Márquez" vs "Gabriel García Márquez"
            // Tomamos el último nombre (apellido) como identificador único si es posible
            const nameParts = pair.a.toLowerCase().trim().split(' ');
            const authorKey = nameParts[nameParts.length - 1]; 

            if (!seenAuthors.has(authorKey)) {
                seenAuthors.add(authorKey);
                selectedPairs.push(pair);
            }
        }

        let cards = [];
        selectedPairs.forEach((pair, index) => {
            cards.push({ id: index, content: pair.a, type: 'author', pairId: index });
            cards.push({ id: index + 100, content: pair.b, type: 'book', pairId: index });
        });
        
        return cards.sort(() => Math.random() - 0.5);
    },

    renderBoard() {
        const container = document.getElementById('game-canvas');
        if (!container) return;

        const config = this.gameState.config[this.gameState.difficulty];
        const maxPairs = config.pairs;

        container.innerHTML = `
            <div style="display: flex; justify-content: center; gap: 40px; align-items: center; margin-bottom: 25px; font-family: var(--font-journal); width: 100%; font-size: 1.1rem; font-weight: bold;">
                <div>Movimientos: <span id="mem-moves">0</span></div>
                <div>Tiempo: <span id="mem-timer">0:00</span></div>
                <div>Parejas: <span id="mem-matches">0</span> / ${maxPairs}</div>
            </div>
            <div class="memory-grid" style="display: grid; grid-template-columns: repeat(${config.cols}, 1fr); gap: 12px; width: 100%; max-width: ${config.cols * 150}px; margin: 0 auto;">
                ${this.gameState.cards.map((card, idx) => `
                    <div class="memory-card" data-idx="${idx}" style="aspect-ratio: 1 / 1; perspective: 1000px; cursor: pointer; min-width: 70px;">
                        <div class="memory-card-inner" style="position: relative; width: 100%; height: 100%; transition: transform 0.6s; transform-style: preserve-3d;">
                            <div class="memory-card-front" style="position: absolute; width: 100%; height: 100%; backface-visibility: hidden; background: #ddc9a3; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; border-radius: 8px; border: 2px solid var(--secondary-color); box-shadow: 0 4px 8px rgba(0,0,0,0.1);">📖</div>
                            <div class="memory-card-back" style="position: absolute; width: 100%; height: 100%; backface-visibility: hidden; background: white; transform: rotateY(180deg); display: flex; align-items: center; justify-content: center; padding: 5px; text-align: center; font-family: var(--font-journal); font-size: 0.8rem; font-weight: bold; color: var(--text-color); border-radius: 8px; border: 2px solid var(--secondary-color); line-height: 1.1; overflow: hidden;">
                                ${card.content}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        // Agregar eventos
        container.querySelectorAll('.memory-card').forEach(card => {
            card.onclick = () => this.handleCardClick(card);
        });
    },

    handleCardClick(cardEl) {
        const idx = cardEl.dataset.idx;
        const card = this.gameState.cards[idx];

        if (this.gameState.flippedCards.length === 2 || card.matched || this.gameState.flippedCards.includes(idx)) return;

        // Voltear visualmente
        cardEl.querySelector('.memory-card-inner').style.transform = 'rotateY(180deg)';
        this.gameState.flippedCards.push(idx);

        if (this.gameState.flippedCards.length === 2) {
            this.gameState.moves++;
            document.getElementById('mem-moves').textContent = this.gameState.moves;
            this.saveState(); // Guardar tras cada movimiento
            this.checkMatch();
        }
    },

    checkMatch() {
        const [idx1, idx2] = this.gameState.flippedCards;
        const card1 = this.gameState.cards[idx1];
        const card2 = this.gameState.cards[idx2];

        if (card1.pairId === card2.pairId) {
            // ¡Match!
            card1.matched = true;
            card2.matched = true;
            this.gameState.matches++;
            document.getElementById('mem-matches').textContent = this.gameState.matches;
            this.gameState.flippedCards = [];
            this.saveState(); // Guardar tras encontrar pareja

            // Feedback visual de acierto (esperar a que termine el giro 0.6s)
            setTimeout(() => {
                const cards = document.querySelectorAll('.memory-card');
                [idx1, idx2].forEach(idx => {
                    const inner = cards[idx].querySelector('.memory-card-inner');
                    const back = inner.querySelector('.memory-card-back');
                    
                    // Efecto de brillo potente (externo e interno)
                    inner.style.boxShadow = '0 0 25px rgba(46, 204, 113, 0.8), inset 0 0 15px rgba(46, 204, 113, 0.3)';
                    
                    // Tinte de fondo sutil para indicar éxito
                    back.style.background = '#f0fff4'; 
                    
                    // Añadir checkmark dinámico si no existe
                    if (!back.querySelector('.match-check')) {
                        const check = document.createElement('div');
                        check.className = 'match-check';
                        check.innerHTML = '✅';
                        check.style.position = 'absolute';
                        check.style.top = '5px';
                        check.style.right = '5px';
                        check.style.fontSize = '0.8rem';
                        back.appendChild(check);
                    }
                    
                    inner.classList.add('match-pulse');
                });
            }, 600);

            const config = this.gameState.config[this.gameState.difficulty];
            if (this.gameState.matches === config.pairs) {
                this.victory();
            }
        } else {
            // No hay match
            setTimeout(() => {
                document.querySelectorAll('.memory-card')[idx1].querySelector('.memory-card-inner').style.transform = 'rotateY(0)';
                document.querySelectorAll('.memory-card')[idx2].querySelector('.memory-card-inner').style.transform = 'rotateY(0)';
                this.gameState.flippedCards = [];
            }, 1000);
        }
    },

    async victory() {
        this.gameState.isPlaying = false;
        if (this.gameState.timerInterval) clearInterval(this.gameState.timerInterval);

        // Salir de pantalla completa para que el modal sea visible
        if (document.fullscreenElement) {
            await document.exitFullscreen().catch(err => console.warn("Error al salir de fullscreen:", err));
        }

        const moves = this.gameState.moves;
        const config = this.gameState.config[this.gameState.difficulty];
        
        // Calcular recompensa según dificultad y maestría
        let reward = config.reward;
        let bonusText = "";

        const [gold, silver] = config.bonusThresh;

        if (moves < gold) {
            const bonus = Math.round(config.reward * 0.5);
            reward += bonus;
            bonusText = ` ¡Bono de Maestro Literario (+${bonus}💰)!`;
        } else if (moves < silver) {
            const bonus = Math.round(config.reward * 0.25);
            reward += bonus;
            bonusText = ` ¡Bono de Buena Memoria (+${bonus}💰)!`;
        }
        
        const sb = getSupabase();
        if (!sb) return;

        try {
            const startOfDay = new Date();
            startOfDay.setUTCHours(0, 0, 0, 0);
            const isoStart = startOfDay.toISOString();

            // Registrar sesión en servidor
            const { data, error } = await sb.rpc('record_game_session', {
                p_game_type: 'memory',
                p_score: moves,
                p_reward: reward,
                p_time_spent: this.gameState.elapsedTime, // Nuevo parámetro de tiempo
                p_start_of_day: isoStart
            });

            if (error) throw error;

            if (data.success) {
                // Actualizar estado local
                State.set({ userCoins: data.new_total_coins });
                this.gameState.remainingPlays = data.remaining;
                
                // Limpiar persistencia ya que la partida terminó
                this.updateServerState(null);
                this.updateLobbyPersistenceUI();

                const mins = Math.floor(this.gameState.elapsedTime / 60);
                const secs = this.gameState.elapsedTime % 60;
                const timeStr = `${mins}m ${secs}s`;

                setTimeout(() => {
                    window.showConfirm(
                        '¡Victoria Literaria! 🎉',
                        `Has encontrado todas las parejas en ${moves} movimientos y un tiempo de ${timeStr}.${bonusText} total: ${reward}💰.`,
                        () => {
                            document.getElementById('back-to-arcade-btn').click();
                            this.renderLobbyInfo();
                        }
                    );
                }, 500);
            } else {
                window.showToast(data.message || 'Error al registrar la partida', 'error');
            }

        } catch (e) {
            console.error('Error al registrar victoria:', e);
            window.showToast('Error al conectar con el servidor para tu recompensa.', 'error');
        }
    }
};
