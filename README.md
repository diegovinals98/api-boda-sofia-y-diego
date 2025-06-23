# Family Series Track Backend

Este es el backend para la aplicación Family Series Track, una aplicación para seguimiento de series y compartir experiencias con familiares y amigos.

## Estructura del Proyecto

```
src/
├── config/           # Configuraciones (base de datos, etc.)
├── controllers/      # Controladores de la API
├── middlewares/      # Middlewares de Express
├── models/           # Modelos de datos
├── routes/           # Rutas de la API
├── services/         # Servicios (websocket, etc.)
├── utils/            # Utilidades
├── app.js            # Configuración de Express
└── server.js         # Punto de entrada
```

## Requisitos

- Node.js (v14+)
- MySQL/MariaDB
- npm o yarn
- Cuenta de AWS (para funcionalidad de S3)

## Instalación

1. Clonar el repositorio
2. Instalar dependencias:

```bash
npm install
```

3. Crear la base de datos y tablas necesarias (script SQL incluido)
4. Configurar las variables de entorno (ver sección de configuración)

## Configuración

### Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
# AWS S3 Configuration (para subida de fotos)
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your-bucket-name

# Email Configuration
EMAIL_USER=tu_correo@gmail.com
EMAIL_PASS=tu_contraseña
```

Para más detalles sobre la configuración de AWS S3, consulta el archivo `AWS_SETUP.md`.

## Ejecución

### Desarrollo

```bash
npm run dev
```

### Producción

```bash
npm start
```

## Ejecución con Docker

### Desarrollo

```bash
docker-compose up api-dev
```

### Producción

```bash
docker-compose up api-prod
```

También puedes construir y ejecutar los contenedores manualmente:

```bash
# Desarrollo
docker build -f Dockerfile.dev -t family-series-track-dev .
docker run -p 3000:3000 -v $(pwd)/src:/usr/src/app/src family-series-track-dev

# Producción
docker build -t family-series-track .
docker run -p 3000:3000 family-series-track
```

Conectarse a la maquina: ssh -i Mac.pem ec2-user@api.bodasofiaydiego.es

## API Endpoints

La API incluye endpoints para:

- Gestión de usuarios
- Gestión de grupos
- Gestión de series y visualizaciones
- Sistema de comentarios
- Favoritos
- Notificaciones
- Funcionalidades específicas para la boda

## Características

- Autenticación de usuarios
- Gestión de grupos para compartir series
- Seguimiento de series visualizadas
- Comentarios en series
- Notificaciones
- Funcionalidades de favoritos
- Websockets para actualizaciones en tiempo real
- Funcionalidades para la boda (invitados, fotos, etc.)
- **Subida de fotos a AWS S3** con URLs públicas
- **Sistema de emails automáticos** para confirmaciones de boda

## Desarrollo

Asegúrate de tener las bases de datos 'Series2' y 'BodaSofiaDiego' configuradas en tu servidor MySQL/MariaDB. 