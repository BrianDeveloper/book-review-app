/**
 * LofiPlayer Module
 * Maneja reproducción, UI y visualización de espectro de audio mediante Web Audio API.
 */
import './lofiPlayer.css';
import { supabase } from '../../core/api.js';

export const LofiPlayer = {
    tracks: [], // Ahora iniciará vacío
    currentIndex: 0,
    isPlaying: false,
    audioCtx: null,
    analyser: null,
    source: null,
    
    async init() {
        this.audioEl = document.getElementById('lofi-audio-element');
        this.playBtn = document.getElementById('lofi-play-btn');
        this.prevBtn = document.getElementById('lofi-prev-btn');
        this.nextBtn = document.getElementById('lofi-next-btn');
        this.volumeSlider = document.getElementById('lofi-volume-slider');
        this.toggleBtn = document.getElementById('lofi-toggle-btn');
        this.widget = document.getElementById('lofi-player-widget');
        this.trackName = document.getElementById('lofi-track-name');
        this.canvas = document.getElementById('lofi-visualizer');
        this.loopBtn = document.getElementById('lofi-loop-btn');
        this.isLooping = false;
        
        if (!this.widget) return;
        
        this.canvasCtx = this.canvas.getContext('2d');

        this.bindEvents();
        
        // Recuperar volumen guardado
        const savedVolume = localStorage.getItem('lofi_volume');
        if(savedVolume) {
            this.audioEl.volume = parseFloat(savedVolume);
            this.volumeSlider.value = savedVolume;
        } else {
            this.audioEl.volume = 0.5;
        }

        this.trackName.textContent = "Cargando biblioteca...";
        await this.loadTracksFromSupabase();

        this.initAdmin();

        console.log("🎧 Lofi Player Inicializado");
    },

    initAdmin() {
        const uploadBtn = document.getElementById('admin-music-upload-btn');
        if (!uploadBtn) return;

        uploadBtn.addEventListener('click', async () => {
            const titleInput = document.getElementById('admin-music-title');
            const fileInput = document.getElementById('admin-music-file');
            const statusLabel = document.getElementById('admin-music-status');

            const title = titleInput.value.trim();
            const file = fileInput.files[0];

            if (!title || !file) {
                statusLabel.textContent = "⚠️ Por favor, llena el título y selecciona un MP3.";
                return;
            }

            try {
                statusLabel.textContent = "⏳ Subiendo MP3 a Storage...";
                uploadBtn.disabled = true;

                // 1. Generar nombre de archivo único para evitar colisiones
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

                // 2. Subir a Supabase Storage (Bucket 'music')
                const { error: uploadError } = await supabase.storage
                    .from('music')
                    .upload(fileName, file, { cacheControl: '3600', upsert: false });

                if (uploadError) throw uploadError;

                statusLabel.textContent = "⏳ Registrando en Base de Datos...";

                // 3. Insertar en la tabla music_tracks
                const { error: dbError } = await supabase
                    .from('music_tracks')
                    .insert([{ name: title, storage_path: fileName, is_exclusive: false }]);

                if (dbError) throw dbError;

                statusLabel.textContent = "✅ ¡Música publicada con éxito!";
                titleInput.value = '';
                fileInput.value = '';
                
                // Recargar el reproductor
                this.loadTracksFromSupabase();
                this.loadAdminMusicList();

                setTimeout(() => statusLabel.textContent = "", 4000);

            } catch (error) {
                console.error("Error subiendo música:", error);
                statusLabel.textContent = `❌ Error: ${error.message}`;
            } finally {
                uploadBtn.disabled = false;
            }
        });

        // Cargar lista inicial
        this.loadAdminMusicList();
    },

    async loadAdminMusicList() {
        const listContainer = document.getElementById('admin-music-list');
        if (!listContainer) return;

        try {
            const { data, error } = await supabase
                .from('music_tracks')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!data || data.length === 0) {
                listContainer.innerHTML = '<p class="empty-msg">No hay canciones subidas aún.</p>';
                return;
            }

            listContainer.innerHTML = '';
            data.forEach(track => {
                const item = document.createElement('div');
                item.className = 'admin-item';
                // Añadimos gap y centrado al flex de admin-item
                item.style.alignItems = "center";
                item.style.padding = "20px"; // Más aire interno
                
                item.innerHTML = `
                    <div class="admin-item-content" style="display: flex; flex-direction: column; gap: 6px;">
                        <strong style="font-size: 1.1rem; color: var(--text-color);">${track.name}</strong>
                        <div style="font-size: 0.85rem; color: #7f8c8d; font-family: monospace;">📁 ${track.storage_path}</div>
                    </div>
                    <div class="admin-btn-group" style="display: flex; gap: 8px;">
                        <button class="edit-track-btn" data-id="${track.id}" data-name="${track.name}" 
                                style="background: var(--bg-color); color: var(--text-color); border: 2px solid var(--border-color); padding: 6px 14px; border-radius: 10px; cursor: pointer; font-family: var(--font-journal); font-size: 0.9rem; box-shadow: 2px 2px 0 var(--border-color); transition: transform 0.1s;">
                            ✏️ Editar
                        </button>
                        <button class="delete-track-btn" data-id="${track.id}" data-path="${track.storage_path}" 
                                style="background: #ff7675; color: white; border: 2px solid #d63031; padding: 6px 14px; border-radius: 10px; cursor: pointer; font-family: var(--font-journal); font-size: 0.9rem; box-shadow: 2px 2px 0 #d63031; transition: transform 0.1s;">
                            🗑️ Borrar
                        </button>
                    </div>
                `;
                
                // Efecto hover sutil para los botoncitos
                const editBtn = item.querySelector('.edit-track-btn');
                const delBtn = item.querySelector('.delete-track-btn');
                editBtn.addEventListener('mousedown', () => editBtn.style.transform = 'translate(2px, 2px)');
                editBtn.addEventListener('mouseup', () => editBtn.style.transform = 'translate(0, 0)');
                editBtn.addEventListener('mouseleave', () => editBtn.style.transform = 'translate(0, 0)');
                
                delBtn.addEventListener('mousedown', () => delBtn.style.transform = 'translate(2px, 2px)');
                delBtn.addEventListener('mouseup', () => delBtn.style.transform = 'translate(0, 0)');
                delBtn.addEventListener('mouseleave', () => delBtn.style.transform = 'translate(0, 0)');

                listContainer.appendChild(item);
            });

            // Bind events for edit and delete
            document.querySelectorAll('.edit-track-btn').forEach(btn => {
                btn.addEventListener('click', (e) => this.editTrack(e.target.dataset.id, e.target.dataset.name));
            });

            document.querySelectorAll('.delete-track-btn').forEach(btn => {
                btn.addEventListener('click', (e) => this.deleteTrack(e.target.dataset.id, e.target.dataset.path));
            });

        } catch (error) {
            console.error("Error cargando lista admin:", error);
            listContainer.innerHTML = `<p class="empty-msg" style="color:red;">Error: ${error.message}</p>`;
        }
    },

    async editTrack(id, currentName) {
        const modal = document.getElementById('edit-music-modal');
        const input = document.getElementById('edit-music-title-input');
        const saveBtn = document.getElementById('save-edit-music-btn');
        const cancelBtn = document.getElementById('cancel-edit-music-btn');

        if (!modal || !input) {
            // Fallback en caso de que no cargue el modal
            const fallbackName = prompt("Editar nombre:", currentName);
            if (fallbackName && fallbackName.trim() !== currentName) {
                this.executeEditTrack(id, fallbackName.trim());
            }
            return;
        }

        input.value = currentName;
        modal.style.display = 'flex'; // Usamos flex porque las modales de este proyecto lo usan para centrar
        input.focus();

        const closeModal = () => {
            modal.style.display = 'none';
            saveBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        cancelBtn.onclick = closeModal;
        
        saveBtn.onclick = async () => {
            const newName = input.value.trim();
            if (!newName || newName === currentName) {
                closeModal();
                return;
            }

            const originalText = saveBtn.textContent;
            saveBtn.textContent = 'Guardando...';
            saveBtn.disabled = true;

            await this.executeEditTrack(id, newName);
            
            saveBtn.textContent = originalText;
            saveBtn.disabled = false;
            closeModal();
        };
    },

    async executeEditTrack(id, newName) {
        try {
            const { error } = await supabase
                .from('music_tracks')
                .update({ name: newName })
                .eq('id', id);

            if (error) throw error;
            
            this.loadAdminMusicList();
            this.loadTracksFromSupabase(); // Update global player
        } catch (error) {
            alert("Error al editar: " + error.message);
        }
    },

    async deleteTrack(id, storagePath) {
        if (!confirm("¿Seguro que deseas eliminar esta canción? Esta acción no se puede deshacer.")) return;

        try {
            // 1. Delete from database
            const { error: dbError } = await supabase
                .from('music_tracks')
                .delete()
                .eq('id', id);

            if (dbError) throw dbError;

            // 2. Delete from storage
            const { error: storageError } = await supabase.storage
                .from('music')
                .remove([storagePath]);

            if (storageError) console.warn("Error eliminando archivo físico, pero se quitó de la BD:", storageError);

            this.loadAdminMusicList();
            this.loadTracksFromSupabase(); // Update global player
        } catch (error) {
            alert("Error al eliminar: " + error.message);
        }
    },

    async loadTracksFromSupabase() {
        try {
            const { data, error } = await supabase
                .from('music_tracks')
                .select('*')
                .order('created_at', { ascending: true });

            if (error) throw error;

            if (data && data.length > 0) {
                // Mapear los datos para obtener la URL pública del Storage
                this.tracks = data.map(track => {
                    const { data: publicUrlData } = supabase.storage
                        .from('music')
                        .getPublicUrl(track.storage_path);
                        
                    return {
                        name: track.name,
                        url: publicUrlData.publicUrl
                    };
                });
                
                this.loadTrack(0);
            } else {
                this.trackName.textContent = "No hay canciones";
                this.playBtn.disabled = true;
                this.playBtn.style.opacity = "0.5";
            }
        } catch (error) {
            console.error("Error cargando música desde Supabase:", error);
            this.trackName.textContent = "Error de conexión";
        }
    },

    bindEvents() {
        this.toggleBtn.addEventListener('click', () => {
            this.widget.classList.toggle('collapsed');
        });

        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.nextBtn.addEventListener('click', () => this.nextTrack());
        this.prevBtn.addEventListener('click', () => this.prevTrack());

        this.volumeSlider.addEventListener('input', (e) => {
            this.audioEl.volume = e.target.value;
            localStorage.setItem('lofi_volume', e.target.value);
        });

        this.audioEl.addEventListener('ended', () => {
            // No pasará por aquí si el audio está en loop, se repetirá automáticamente.
            this.nextTrack();
        });

        if (this.loopBtn) {
            this.loopBtn.addEventListener('click', () => {
                this.isLooping = !this.isLooping;
                this.audioEl.loop = this.isLooping;
                this.loopBtn.style.opacity = this.isLooping ? '1' : '0.5';
                this.loopBtn.style.color = this.isLooping ? 'var(--accent-color)' : '';
                this.loopBtn.style.transform = this.isLooping ? 'scale(1.1)' : 'scale(1)';
            });
        }
    },

    loadTrack(index) {
        this.currentIndex = index;
        this.audioEl.src = this.tracks[index].url;
        this.trackName.textContent = this.tracks[index].name;
    },

    togglePlay() {
        if (!this.audioCtx) {
            this.setupWebAudio();
        }

        if (this.audioEl.paused) {
            const playPromise = this.audioEl.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    this.isPlaying = true;
                    this.playBtn.textContent = '⏸️';
                    this.drawVisualizer();
                }).catch(error => {
                    console.error("No se pudo reproducir el audio:", error);
                    alert("Error al reproducir. Revisa la URL del audio o tu conexión.");
                });
            }
        } else {
            this.audioEl.pause();
            this.isPlaying = false;
            this.playBtn.textContent = '▶️';
        }
    },

    nextTrack() {
        this.currentIndex = (this.currentIndex + 1) % this.tracks.length;
        this.loadTrack(this.currentIndex);
        if (this.isPlaying) this.audioEl.play();
    },

    prevTrack() {
        this.currentIndex = (this.currentIndex - 1 + this.tracks.length) % this.tracks.length;
        this.loadTrack(this.currentIndex);
        if (this.isPlaying) this.audioEl.play();
    },

    setupWebAudio() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext();
            this.analyser = this.audioCtx.createAnalyser();
            
            // Solo podemos crear el MediaElementSource una vez
            if(!this.source) {
                this.source = this.audioCtx.createMediaElementSource(this.audioEl);
                this.source.connect(this.analyser);
                this.analyser.connect(this.audioCtx.destination);
            }

            this.analyser.fftSize = 64; // Bajo para barras más gruesas
            this.bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(this.bufferLength);
        } catch (e) {
            console.error("Web Audio API no soportada", e);
        }
    },

    drawVisualizer() {
        if (!this.isPlaying || !this.analyser) return;

        requestAnimationFrame(() => this.drawVisualizer());
        this.analyser.getByteFrequencyData(this.dataArray);

        this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const barWidth = (this.canvas.width / this.bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < this.bufferLength; i++) {
            const barHeight = (this.dataArray[i] / 255) * this.canvas.height;
            
            // Usamos colores temáticos de la App
            this.canvasCtx.fillStyle = `rgb(${141 + barHeight}, 110, 99)`; // Color similar al secondary-color
            this.canvasCtx.fillRect(x, this.canvas.height - barHeight, barWidth, barHeight);

            x += barWidth + 2;
        }
    }
};

// Autoinicializar en el DOM
document.addEventListener('DOMContentLoaded', () => {
    LofiPlayer.init();
});
