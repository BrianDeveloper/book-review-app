import { getSupabase } from '../../api.js';
import State from '../../core/State.js';
import EventBus from '../../core/EventBus.js';
import { showToast, showModal, hideModal } from '../../utils.js';

export function initJournal() {
    const currentUser = State.getKey('currentUser');
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
                awardXP(50); // XP por reseña
                // Trigger Mission
                if (window.checkMissions) window.checkMissions('review_written');
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

                const { data, error } = await sb.from('reviews')
                    .select('*')
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
            // Es una reseña ajena
            if (authorBadge) {
                authorBadge.style.display = 'flex';
                authorNameEl.textContent = `@${review.profiles?.username || 'lector_anónimo'}`;
            }
            if (saveReviewBtn) saveReviewBtn.style.display = 'none';
            if (journalLikeBtn) {
                journalLikeBtn.style.display = 'flex';
                journalLikeCount.textContent = review.like_count || 0;
                // Actualizar estado del corazón si ya lo dio
                journalLikeBtn.onclick = () => {
                    if (typeof window.toggleReviewLike === 'function') {
                        window.toggleReviewLike(review.id, journalLikeBtn);
                    }
                };
            }
        } else {
            // Es tu propia reseña cargada o una nueva entrada
            if (saveReviewBtn) saveReviewBtn.style.display = review.id ? 'none' : 'block';
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

            if (el) el.value = '';

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

        const saveReviewBtn = document.getElementById('save-review-btn');
        if (saveReviewBtn) saveReviewBtn.style.display = 'block';



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



    ['title', 'author', 'fav-quote', 'auth-username', 'review-text', 'fav-character', 'profile-bio'].forEach(id => {

        const ta = document.getElementById(id);

        if (ta) { ta.addEventListener('input', () => resize(ta)); resize(ta); }

    });

    
}
