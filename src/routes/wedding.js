const express = require('express');
const router = express.Router();
const multer = require('multer');
const weddingController = require('../controllers/weddingController');

// Configuración de multer para manejar archivos en memoria
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB máximo
  },
  fileFilter: (req, file, cb) => {
    // Verificar que sea una imagen
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  }
});

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

// Subir foto a S3
router.post('/upload-photo', upload.single('photo'), weddingController.uploadPhotoToS3);

// Middleware para manejar errores de multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'Archivo demasiado grande',
        message: 'El archivo no puede ser mayor a 10MB'
      });
    }
  }
  
  if (error.message === 'Solo se permiten archivos de imagen') {
    return res.status(400).json({
      success: false,
      error: 'Tipo de archivo no permitido',
      message: 'Solo se permiten archivos de imagen (jpg, png, gif, etc.)'
    });
  }
  
  next(error);
});

module.exports = router; 