#!/usr/bin/env node

// Archivo de debug para el servidor
const { spawn } = require('child_process');
const path = require('path');

console.log('🐛 Iniciando servidor en modo debug...');
console.log('📁 Directorio actual:', process.cwd());
console.log('⏰ Timestamp:', new Date().toISOString());

// Configuración de debugging
const debugOptions = [
  '--inspect=0.0.0.0:9229',  // Habilitar inspector de Node.js
  '--trace-warnings',        // Mostrar stack traces de warnings
  '--trace-uncaught',        // Mostrar stack traces de errores no capturados
  'src/server.js'            // Archivo principal
];

// Variables de entorno para debugging
const env = {
  ...process.env,
  NODE_ENV: 'development',
  DEBUG: '*',                // Habilitar todos los logs de debug
  PORT: process.env.PORT || '3001'
};

console.log('🔧 Opciones de debug:', debugOptions);
console.log('🌍 Puerto:', env.PORT);
console.log('🔍 Inspector disponible en: http://localhost:9229');

// Ejecutar el servidor con debugging
const child = spawn('node', debugOptions, {
  stdio: 'inherit',
  env: env,
  cwd: process.cwd()
});

// Manejar eventos del proceso hijo
child.on('error', (error) => {
  console.error('❌ Error al iniciar el servidor:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  console.log(`\n🔄 Servidor terminado con código: ${code}`);
  if (code !== 0) {
    console.log('💡 Sugerencias de debugging:');
    console.log('   - Verifica que el puerto no esté en uso');
    console.log('   - Revisa los logs de error arriba');
    console.log('   - Usa el inspector en http://localhost:9229');
  }
});

// Manejar señales de terminación
process.on('SIGINT', () => {
  console.log('\n🛑 Recibida señal SIGINT, terminando servidor...');
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Recibida señal SIGTERM, terminando servidor...');
  child.kill('SIGTERM');
});

console.log('✅ Servidor iniciado. Presiona Ctrl+C para detener.'); 