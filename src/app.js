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

// Configuración explícita de CORS
const corsOptions = {
  origin: ['https://memories.bodasofiaydiego.es', 'http://localhost:8080', 'https://rsvp.bodasofiaydiego.es', 'https://bodasofiaydiego.es'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept'],
};

app.use(cors(corsOptions));

// Manejador explícito para todas las solicitudes OPTIONS con 200
app.options('*', (req, res) => {
  res.status(200).set({
    'Access-Control-Allow-Origin': req.headers.origin || 'http://localhost:8080',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
    'Access-Control-Allow-Credentials': 'true',
  }).send();
});

// Rutas
app.use('/', weddingRoutes);
app.use('/', adminRoutes);

// Middleware global de manejo de errores
app.use((err, req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:8080');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (err.status === 413) {
    return res.status(413).json({ error: 'Archivo demasiado grande' });
  }
  next(err);
});

module.exports = { app, server };