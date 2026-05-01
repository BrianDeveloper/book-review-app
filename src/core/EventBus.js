/**
 * EventBus.js
 * Un sistema Pub/Sub ligero para desacoplar los módulos del sistema.
 */

class EventBus {
    constructor() {
        this.listeners = {};
    }

    /**
     * Suscribe un callback a un evento específico.
     * @param {string} eventName - Nombre del evento (ej: 'AUTH_LOGIN')
     * @param {Function} callback - Función a ejecutar cuando ocurra el evento
     * @returns {Function} - Función para de-suscribirse
     */
    subscribe(eventName, callback) {
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }
        
        this.listeners[eventName].push(callback);
        
        // Retorna función para remover la suscripción (útil para React/Vanilla lifecycles)
        return () => this.unsubscribe(eventName, callback);
    }

    /**
     * Remueve un callback de un evento.
     */
    unsubscribe(eventName, callback) {
        if (!this.listeners[eventName]) return;
        
        this.listeners[eventName] = this.listeners[eventName].filter(cb => cb !== callback);
    }

    /**
     * Emite un evento, ejecutando todos los callbacks suscritos con los datos proveídos.
     * @param {string} eventName 
     * @param {any} data 
     */
    publish(eventName, data) {
        if (!this.listeners[eventName]) return;
        
        // Ejecución asíncrona ligera usando setTimeout para no bloquear el call stack principal
        this.listeners[eventName].forEach(callback => {
            setTimeout(() => callback(data), 0);
        });
    }

    /**
     * Limpia todas las suscripciones (útil para pruebas o reinicios completos del sistema)
     */
    clear() {
        this.listeners = {};
    }
}

// Exportamos una instancia global única (Singleton)
const globalEventBus = new EventBus();
export default globalEventBus;
