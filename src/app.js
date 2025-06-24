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
app.use(cors({
  origin: ['https://memories.bodasofiaydiego.es', 'http://localhost:3000'],
  credentials: true
}));

// Rutas
app.use('/', weddingRoutes);
app.use('/', adminRoutes);

// Middleware global de manejo de errores para forzar headers de CORS
app.use((err, req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || 'https://memories.bodasofiaydiego.es');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (err.status === 413) {
    return res.status(413).json({ error: 'Archivo demasiado grande' });
  }
  next(err);
});

module.exports = { app, server }; 