// --- CONFIGURATION ---

const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw9xyK1c0286Supbke7Cm3i3vDXGL2iCvBCDwWFZNv5vT71l7JNUSLhelRPwZebq1G9iA/exec';



// SUPABASE CONFIGURATION

const SUPABASE_URL = 'https://ctstufucbrtqqpakbjjw.supabase.co';

const SUPABASE_KEY = 'sb_publishable_RcPbgg_snHW8-CsHMC8e-Q_LaZRN0Ar';



// Global state

let currentUser = null;

let currentCoverUrl = '';

let currentTrackInfo = { name: '', source: '' };

let currentPlayerType = null;

let lastSearchQuery = '';

let currentResults = [];

let spotifyInfoLoaded = false; // Bandera para saber si la info de Spotify cargó

let currentIndex = 0;

let progressInterval = null;

let editingReviewId = null; // ID del libro que estamos editando



// Supabase client instance

window.supabaseInstance = null;



const initSupabase = () => {

    try {

        if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {

            window.supabaseInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

            console.log("✅ Supabase: Cliente inicializado");

        } else {

            console.error("❌ Supabase: La librería no se encontró. Verifica tu conexión a internet.");

        }

    } catch (e) {

        console.error("❌ Supabase: Error al inicializar:", e);

    }

};





document.addEventListener('DOMContentLoaded', () => {

    initSupabase();



    // --- Toast Notification System ---

    const showToast = (message, type = 'info', duration = 3000) => {

        const container = document.getElementById('toast-container');

        if (!container) return;



        const icons = {

            success: '✅',

            error: '⚠️',

            info: 'ℹ️',

            warning: '⚡'

        };



        const toast = document.createElement('div');

        toast.className = `toast ${type}`;

        toast.innerHTML = `

            <span class="toast-icon">${icons[type] || icons.info}</span>

            <span class="toast-message">${message}</span>

        `;



        container.appendChild(toast);



        // Auto-remove after duration

        setTimeout(() => {

            toast.classList.add('hiding');

            setTimeout(() => toast.remove(), 300);

        }, duration);



        // Click to dismiss

        toast.addEventListener('click', () => {

            toast.classList.add('hiding');

            setTimeout(() => toast.remove(), 300);

        });

    };



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

                    if (spotifyContainer) spotifyContainer.innerHTML = `<iframe src="https://open.spotify.com/embed/track/${id}" width="100%" height="80" frameBorder="0" allowtransparency="true" allow="encrypted-media"></iframe>`;

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



    // --- Supabase Client Access ---

    const getSupabase = () => window.supabaseInstance;



    // --- Auth & Modals Logic ---

    let isRegisterMode = false;



    const showModal = (modal) => {

        if (!modal) return;

        modal.style.display = 'flex';

        // Forzar reflow para que la transición se aplique correctamente

        // eslint-disable-next-line no-unused-expressions

        modal.offsetHeight;

        modal.classList.remove('modal-hidden');

        modal.classList.add('modal-visible');

    };



    const showFeedback = (title, message, duration = 2000) => {

        if (!feedbackModal || !feedbackTitle || !feedbackMessage) return;

        feedbackTitle.textContent = title;

        feedbackMessage.textContent = message;

        showModal(feedbackModal);

        setTimeout(() => hideModal(feedbackModal), duration);

    };



    const hideModal = (modal) => {

        if (!modal) return;

        modal.classList.remove('modal-visible');

        modal.classList.add('modal-hidden');

        setTimeout(() => {

            modal.style.display = 'none';

        }, 250);

    };



    const openModal = (mode) => {

        if (!authModal || !modalTitle || !authSubmitBtn || !authSwitch) return;

        isRegisterMode = mode === 'register';

        modalTitle.textContent = isRegisterMode ? 'Crear Cuenta' : 'Iniciar Sesión';

        authSubmitBtn.textContent = isRegisterMode ? 'REGISTRARSE ✨' : 'ENTRAR ✨';

        authSwitch.style.display = isRegisterMode ? 'none' : 'block';

        showModal(authModal);

    };



    if (loginBtn) loginBtn.addEventListener('click', () => openModal('login'));

    if (registerBtn) registerBtn.addEventListener('click', () => openModal('register'));

    // Toggle navbar en pantallas pequeñas
    if (navToggle && navbar) {
        navToggle.addEventListener('click', () => {
            navbar.classList.toggle('nav-open');
        });

        // Cerrar el menú al clickear cualquier botón dentro (mejor UX en móviles)
        navbar.querySelectorAll('.mini-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                navbar.classList.remove('nav-open');
            });
        });
    }

    closeModalElements.forEach(el => el.addEventListener('click', () => {

        if (authModal) hideModal(authModal);

        if (reviewsModal) hideModal(reviewsModal);

    }));



    if (switchToRegister) switchToRegister.addEventListener('click', () => openModal('register'));



    // Cerrar modal al hacer clic fuera

    window.addEventListener('click', (e) => {

        if (e.target === authModal) hideModal(authModal);

        if (e.target === reviewsModal) hideModal(reviewsModal);

    });



    const updateAuthUI = (user) => {

        currentUser = user;

        const guestDiv = document.getElementById('auth-guest');

        const userDiv = document.getElementById('auth-user');

        const userDisplay = document.getElementById('user-display');



        if (guestDiv) guestDiv.style.display = user ? 'none' : 'flex';

        if (userDiv) userDiv.style.display = user ? 'flex' : 'none';



        // Botones visibles solo con sesión iniciada
        if (saveReviewBtn) saveReviewBtn.style.setProperty('display', user ? 'block' : 'none', 'important');
        if (shareBtn) shareBtn.style.setProperty('display', user ? 'inline-flex' : 'none', 'important');

        if (user && userDisplay) {

            // Extraer username del email ficticio o de los metadatos

            const username = user.user_metadata?.username || user.email?.split('@')[0] || 'Usuario';

            userDisplay.textContent = `¡Hola, ${username}! 📖`;

        }

    };



    // --- Core Supabase Logic ---

    const checkSession = async () => {

        const sb = getSupabase();

        if (!sb) return;

        const { data: { session } } = await sb.auth.getSession();

        updateAuthUI(session?.user || null);

    };



    if (authForm) {

        authForm.addEventListener('submit', async (e) => {

            e.preventDefault();

            const username = document.getElementById('auth-username').value.trim().toLowerCase();

            const password = document.getElementById('auth-password').value;

            

            // Generar email ficticio a partir del username para Supabase

            const email = `${username}@bookreview.local`;

            

            const sb = getSupabase();



            if (!sb) {

                showToast('Error: Supabase no está configurado correctamente.', 'error');

                return;

            }



            if (authSubmitBtn) {

                authSubmitBtn.disabled = true;

                authSubmitBtn.textContent = 'PROCESANDO...';

            }



            try {

                if (isRegisterMode) {

                    const { error } = await sb.auth.signUp({ 

                        email, 

                        password,

                        options: {

                            data: { username: username }

                        }

                    });

                    if (error) throw error;

                    showToast('¡Cuenta creada! Tu nombre de usuario es: ' + username, 'success');

                    openModal('login');

                } else {

                    const { data, error } = await sb.auth.signInWithPassword({ email, password });

                    if (error) throw error;

                    updateAuthUI(data.user);

                    if (authModal) hideModal(authModal);

                    showFeedback('¡Bienvenido! ✨', 'Tu sesión se ha iniciado correctamente. Disfruta escribiendo en tu Diario de Libros.');

                }

            } catch (error) {

                // Personalizar mensaje de error para login
                let errorMessage = error.message;
                if (error.message === 'Invalid login credentials') {
                    errorMessage = 'Usuario o contraseña incorrectos';
                }
                
                showToast(`Error: ${errorMessage}`, 'error');

            } finally {

                if (authSubmitBtn) {

                    authSubmitBtn.disabled = false;

                    authSubmitBtn.textContent = isRegisterMode ? 'REGISTRARSE ✨' : 'ENTRAR ✨';

                }

            }

        });

    }



    if (logoutBtn) {

        logoutBtn.addEventListener('click', async () => {

            const sb = getSupabase();

            if (sb) await sb.auth.signOut();

            updateAuthUI(null);

            resetJournal();

            showFeedback('Hasta pronto 👋', 'Tu sesión se ha cerrado. Vuelve cuando quieras seguir leyendo y escribiendo.');

        });

    }



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

                resetJournal();

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

                const { data, error } = await sb.from('reviews').select('*').order('created_at', { ascending: false });

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



    const loadReviewIntoJournal = (review) => {

        console.log("🔄 Cargando reseña:", review.title);

        

        if (titleInput) titleInput.value = review.title || '';

        if (authorInput) authorInput.value = review.author || '';

        const rt = document.getElementById('review-text');

        if (rt) rt.value = review.review_text || '';

        const fq = document.getElementById('fav-quote');

        if (fq) fq.value = review.fav_quote || '';

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

                spotifyContainer.innerHTML = `<iframe src="https://open.spotify.com/embed/track/${id}" width="100%" height="80" frameBorder="0" allowtransparency="true" allow="encrypted-media"></iframe>`;

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



        // Auto-resize all

        ['title', 'author', 'review-text', 'fav-quote', 'start-date', 'end-date'].forEach(id => {

            const el = document.getElementById(id);

            if (el) resize(el);

        });



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

                    input.style.backgroundColor = 'rgba(107, 79, 63, 0.05)';

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



        if (reviewsModal) reviewsModal.style.display = 'none';

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

            if (el) el.value = '';

        });

        

        const recommendCheck = document.getElementById('recommend');

        if (recommendCheck) {

            recommendCheck.checked = false;

            const recommendText = document.getElementById('recommend-text');

            if (recommendText) recommendText.textContent = 'No';

        }



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

                    input.style.backgroundColor = 'transparent';

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
                saveReviewBtn.style.setProperty('display', currentUser ? 'block' : 'none', 'important');
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

        ['title', 'author', 'review-text', 'fav-quote', 'start-date', 'end-date'].forEach(id => {

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



    // --- Auto-resize ---

    const resize = (ta) => {

        ta.style.height = 'auto';

        let newHeight = ta.scrollHeight;

        // For review-text, we want to maintain at least 100% of container height

        if (ta.id === 'review-text') {

            const parentHeight = ta.parentElement.clientHeight;

            if (newHeight < parentHeight) newHeight = parentHeight;

        }

        ta.style.height = newHeight + 'px';

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



    ['title', 'author', 'fav-quote', 'auth-username', 'review-text', 'fav-character'].forEach(id => {

        const ta = document.getElementById(id);

        if (ta) { ta.addEventListener('input', () => resize(ta)); resize(ta); }

    });

});

