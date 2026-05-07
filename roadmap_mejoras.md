# 🗺️ Roadmap de Evolución: Book Review App

Este documento sirve como guía estratégica para las futuras mejoras del proyecto, organizadas por impacto y complejidad técnica.

---

## 🚀 Fase 1: Gamificación y Feedback (Impacto Inmediato)
*Objetivo: Aumentar la retención y el engagement visual.*

- [ ] **Sistema de Medallas (Badges):**
    - [ ] Crear tabla `badges` en Supabase.
    - [ ] Lógica para otorgar medallas automáticamente (ej: "Primer Reseña", "Rey del Casino").
    - [ ] Mostrar medallas en el Perfil Público.
- [ ] **Efectos Visuales (Wow Factor):**
    - [ ] Implementar animaciones de confeti al ganar en el Casino.
    - [ ] Añadir sonidos suaves de UI (pasar página, click tipo papel).
- [ ] **Skeletons de Carga:**
    - [ ] Reemplazar "Cargando..." por placeholders animados para avatares y libros.

---

## 🤝 Fase 2: Social y Real-Time (Conexión)
*Objetivo: Convertir la app en una comunidad activa.*

- [ ] **Estados y Presencia Avanzada:**
    - [ ] Permitir "Estado de Humor" o "Libro Actual" en el indicador de presencia.
    - [ ] Notificaciones Push en el navegador para mensajes nuevos.
- [ ] **Salas de Lectura (Temáticas):**
    - [ ] Crear canales de chat por géneros literarios.
    - [ ] Indicador de "X personas debatiendo ahora" en cada sala.
- [ ] **Gráficos de Perfil:**
    - [ ] Visualización de hábitos de lectura (géneros más leídos, progreso mensual).

---

## 🛠️ Fase 3: Robustez y Escalabilidad (Arquitectura)
*Objetivo: Profesionalizar el código y mejorar la velocidad.*

- [ ] **Migración a TypeScript:**
    - [ ] Definir interfaces para `Profile`, `Review` y `Notification`.
    - [ ] Eliminar errores de tipo en tiempo de ejecución.
- [ ] **Optimización Offline:**
    - [ ] Implementar caché de Supabase con `localStorage` para carga instantánea.
    - [ ] Soporte básico para lectura de reseñas sin conexión.
- [ ] **Limpieza de Código:**
    - [ ] Fragmentar `script.js` en servicios modulares en `src/core/` y `src/features/`.

---

## 🎨 Fase 4: Experiencia de Usuario (Estética)
*Objetivo: Comodidad y personalización.*

- [ ] **Modos de Lectura:**
    - [ ] Tema "Sepia" y "Papel Viejo".
    - [ ] Ajuste dinámico de tamaño de fuente en reseñas.
- [ ] **Carrusel 3D de Libros:**
    - [ ] Nueva vista para la estantería del perfil público con rotación 3D.

---

> [!IMPORTANT]
> **Prioridad Actual:** Se recomienda iniciar con la **Fase 1 (Medallas)** ya que utiliza la infraestructura existente de Supabase y genera una recompensa visual inmediata para el usuario.
