# 🚀 QA Management Dashboard

Un potente sistema centralizado y monolítico para la gestión integral de Calidad de Software (QA). Diseñado para equipos ágiles, permite estructurar, ejecutar y reportar pruebas manuales, integrándose perfectamente con Jira para el seguimiento de defectos.

## 🌟 Características Principales

- **Gestión Jerárquica:** Organización mediante Proyectos > Casos de Uso > Historias de Usuario > Test Suites > Test Cases.
- **Ejecuciones de Pruebas:** Diferentes modos de ejecución (Smoke, Regresión, Exploratoria) con recolección de evidencias (imágenes/videos) por paso.
- **Integración con Jira:** Creación y seguimiento de tickets (Bugs/Epic) directamente desde la plataforma gracias a una sincronización bidireccional.
- **Importación Inteligente:** Carga masiva de Casos de Prueba e Historias de Usuario vía archivos `.xlsx` o `.csv`.
- **RBAC Avanzado:** Sistema de usuarios con roles y permisos granulares (Ejecución, Creación, Gestión de Jira, etc.).
- **Reportes y Métricas:** Visualización de cobertura y defectos a través de paneles dinámicos.

## 🛠️ Stack Tecnológico

- **Backend:** Node.js, Express.js
- **Base de Datos:** PostgreSQL (Optimizado para Supabase)
- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3 nativo (sin frameworks pesados para máxima velocidad).
- **Autenticación:** JWT (JSON Web Tokens) en Cookies seguras.

---

## 🚦 Configuración Inicial (Instalación Local)

Sigue estos pasos para levantar el entorno de desarrollo en tu máquina local.

### 1. Clonar el repositorio
\`\`\`bash
git clone https://github.com/tu-usuario/tu-repo.git
cd tu-repo
\`\`\`

### 2. Instalar dependencias
Asegúrate de tener [Node.js](https://nodejs.org/) instalado.
\`\`\`bash
npm install
\`\`\`

### 3. Variables de Entorno
Crea un archivo \`.env\` en la raíz del proyecto basándote en el siguiente formato.

\`\`\`env
# Puerto del servidor local
PORT=3001

# String de conexión a tu base de datos PostgreSQL (ej: Supabase)
DATABASE_URL=postgresql://postgres:[TU_PASSWORD]@db.[ID_PROYECTO].supabase.co:5432/postgres

# Llave secreta para firmar los tokens JWT (Genera una cadena segura de 64 caracteres)
JWT_SECRET=tu_cadena_secreta_aleatoria_aqui

# Llave para cifrar los tokens de Jira en la BD (Genera una cadena segura)
JIRA_ENCRYPTION_KEY=tu_llave_de_cifrado_aqui
\`\`\`

### 4. Migración de Base de Datos
La aplicación está configurada para ejecutar automáticamente scripts `ALTER TABLE` si las columnas necesarias no existen al arrancar. Para inicializar todo simplemente inicia el servidor:

\`\`\`bash
npm start
\`\`\`
*(Opcional: Si usas `nodemon`, puedes ejecutar `npm run dev` si está configurado en tu `package.json`).*

### 5. Acceso
Abre tu navegador y dirígete a:
\`\`\`text
http://localhost:3001
\`\`\`

---

## 🔒 Seguridad y Buenas Prácticas

- **Cifrado de Credenciales:** Los tokens de la API de Jira proporcionados por los usuarios se almacenan cifrados en la base de datos usando `JIRA_ENCRYPTION_KEY`.
- **Prevención XSS:** El backend incluye sanitización de inputs para evitar inyecciones HTML en componentes críticos.
- **Autorización:** Todo endpoint está protegido por un middleware de validación JWT y verificación estricta de permisos granulares.

## 🤝 Contribución

Si deseas contribuir, por favor sigue el flujo estándar de *Fork -> Feature Branch -> Pull Request*. 

1. Haz un fork del proyecto.
2. Crea tu rama para la nueva funcionalidad (`git checkout -b feature/NuevaFuncionalidad`).
3. Haz commit de tus cambios (`git commit -m 'Añadir nueva funcionalidad'`).
4. Sube los cambios (`git push origin feature/NuevaFuncionalidad`).
5. Abre un Pull Request.

---
*Desarrollado para potenciar y simplificar los ciclos de vida de control de calidad (QA).*
