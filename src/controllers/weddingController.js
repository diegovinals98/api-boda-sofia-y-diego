const { dbBoda } = require('../config/database');
const { insertarInvitado, insertarFoto } = require('../services/socketio');

// Obtener todos los invitados
const getAllGuests = (req, res) => {
  console.log("Seleccion de todos los invitados");
  sql = 'SELECT * FROM invitados';
  dbBoda.query(sql, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error al obtener invitados' });
    }
    console.log("Resulados: " + results);
    res.json(results);
  });
};

// Agregar invitado
const addGuest = (req, res) => {
  const data = req.body;
  insertarInvitado(data, res);
};

// Obtener todas las fotos con paginación
const getAllPhotos = (req, res) => {
  // Parámetros de paginación (valores predeterminados: página 1, 10 elementos por página)
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  
  // Consulta para obtener el número total de fotos
  dbBoda.query('SELECT COUNT(*) AS total FROM fotos_boda', (countErr, countResults) => {
    if (countErr) {
      console.error('❌ Error al contar fotos:', countErr);
      return res.status(500).json({ error: 'Error al contar fotos' });
    }
    
    const total = countResults[0].total;
    const totalPages = Math.ceil(total / limit);
    
    // Consulta paginada
    const query = `SELECT * FROM fotos_boda ORDER BY uploaded_at DESC LIMIT ${limit} OFFSET ${offset}`;
    
    dbBoda.query(query, (err, results) => {
      if (err) {
        console.error('❌ Error al obtener fotos:', err);
        return res.status(500).json({ error: 'Error al obtener fotos' });
      }

      // Transformar los datos para que coincidan con el formato esperado
      const fotos = results.map(foto => {
        console.log("ID de foto:", foto.id);
        return {
          id: foto.id,
          imageUrl: foto.url,
          title: foto.title,
          tags: JSON.parse(foto.tags || '[]'),
          metadata: JSON.parse(foto.metadata || '{}'),
          uploadedAt: foto.uploaded_at
        };
      });

      // Usar JSON.stringify para ver el contenido real de las fotos
      console.log("Fotos detalladas:", JSON.stringify(fotos.slice(0, 1), null, 2));
      
      console.log(`✅ Se han recuperado ${fotos.length} fotos (página ${page} de ${totalPages})`);
      
      // Respuesta con metadatos de paginación
      res.json({
        fotos,
        paginacion: {
          total,
          totalPages,
          currentPage: page,
          limit
        }
      });
    });
  });
};

// Agregar foto
const addPhoto = (req, res) => {
  const data = req.body;
  insertarFoto(data, res);
};

const getPhotoCountByCategory = (req, res) => {
  const query = 'SELECT tags FROM fotos_boda';
  dbBoda.query(query, (err, results) => {
    if (err) {
      console.error('❌ Error al obtener etiquetas de fotos:', err);
      return res.status(500).json({ error: 'Error al obtener datos de fotos' });
    }

    const categoryCounts = {};

    results.forEach(row => {
      try {
        const tags = JSON.parse(row.tags || '[]');
        tags.forEach(tag => {
          // Si el tag tiene un formato "Categoría/Subcategoría", nos quedamos con la categoría principal
          const mainCategory = tag.split('/')[0];
          if (mainCategory) {
            categoryCounts[mainCategory] = (categoryCounts[mainCategory] || 0) + 1;
          }
        });
      } catch (parseError) {
        console.error('❌ Error al parsear etiquetas JSON:', parseError);
      }
    });

    console.log('✅ Conteo de fotos por categoría:', categoryCounts);
    res.json(categoryCounts);
  });
};

module.exports = {
  getAllGuests,
  addGuest,
  getAllPhotos,
  addPhoto,
  getPhotoCountByCategory
}; 