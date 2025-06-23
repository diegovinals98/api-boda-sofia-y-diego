const express = require('express');
const router = express.Router();
const weddingController = require('../controllers/weddingController');

// Obtener todos los invitados
router.get('/invitados', weddingController.getAllGuests);

// Agregar invitado
router.post('/invitados', weddingController.addGuest);

// Obtener todas las fotos
router.get('/api/fotos', weddingController.getAllPhotos);

// Agregar foto
router.post('/api/fotos', weddingController.addPhoto);

// Obtener estadísticas de fotos por categoría
router.get('/api/fotos/stats/count-by-category', weddingController.getPhotoCountByCategory);

module.exports = router; 