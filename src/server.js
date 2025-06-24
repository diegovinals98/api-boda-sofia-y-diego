const { app, server } = require('./app');
const { connectDatabase } = require('./config/database');

// Conectar a la base de datos
connectDatabase();

const PORT = process.env.PORT || 3004;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
}); 