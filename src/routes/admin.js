const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Verificar estado del sistema
router.get('/admin/health', adminController.checkHealth);

// Obtener información de discos
router.get('/discos', adminController.getDiskInfo);

module.exports = router; 