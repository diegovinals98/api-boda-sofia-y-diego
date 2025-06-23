const mysql = require('mysql');

const dbBoda = mysql.createConnection({
  host: 'bodasofiaydiego.clmwqmqeqzw1.eu-north-1.rds.amazonaws.com', // La IP interna del contenedor MariaDB
  user: 'admin', // El usuario de la base de datos
  password: '27101998', // La contraseña de la base de datos
  database: 'BodaSofiaDiego', // El nombre de tu base de datos
  charset: 'utf8mb4'
});

const connectDatabase = () => {

  // Conectar a la base de datos
  dbBoda.connect((err) => {
    if(err) {
      console.log('----- ERROR DB boda -----')
      throw err;
    }
    const now = new Date();
    const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    console.log(`Conectado a BBDD BODA - ${now.toLocaleDateString('es-ES', options)}`);
  });
};

module.exports = {
  dbBoda,
  connectDatabase
}; 