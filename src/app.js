// Cargar variables de entorno
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');
const { setupWebSocket } = require('./services/socketio');

// Rutas

const weddingRoutes = require('./routes/wedding');
const adminRoutes = require('./routes/admin');

const app = express();

// Crear servidor HTTP para ambos (Express y WebSocket)
const server = http.createServer(app);

// Configurar WebSocket
setupWebSocket(server);

// Middlewares
app.use(express.json());
app.use(cors());

// Rutas
app.use('/', weddingRoutes);
app.use('/', adminRoutes);

module.exports = { app, server }; 