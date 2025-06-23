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

// Obtener todas las fotos con paginación y filtrado por tags
const getAllPhotos = (req, res) => {
  // Parámetros de paginación (valores predeterminados: página 1, 10 elementos por página)
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  
  // Parámetro de filtrado por tags (incluir solo fotos que contengan este tag)
  const includeTag = req.query.tags;
  
  console.log(`🔍 Filtrando fotos - Incluir solo tag: "${includeTag}"`);
  
  // Construir la consulta base
  let countQuery = 'SELECT COUNT(*) AS total FROM fotos_boda';
  let dataQuery = 'SELECT * FROM fotos_boda';
  
  // Si se especifica un tag para incluir, agregar la condición WHERE
  if (includeTag) {
    const whereCondition = `WHERE JSON_SEARCH(tags, 'one', ?, null) IS NOT NULL`;
    countQuery += ` ${whereCondition}`;
    dataQuery += ` ${whereCondition}`;
  }
  
  // Agregar ordenamiento y paginación
  dataQuery += ` ORDER BY uploaded_at DESC LIMIT ${limit} OFFSET ${offset}`;
  
  // Consulta para obtener el número total de fotos (con filtro si aplica)
  dbBoda.query(countQuery, includeTag ? [includeTag] : [], (countErr, countResults) => {
    if (countErr) {
      console.error('❌ Error al contar fotos:', countErr);
      return res.status(500).json({ error: 'Error al contar fotos' });
    }
    
    const total = countResults[0].total;
    const totalPages = Math.ceil(total / limit);
    
    console.log(`📊 Total de fotos después del filtro: ${total}`);
    
    // Consulta paginada con filtro
    dbBoda.query(dataQuery, includeTag ? [includeTag] : [], (err, results) => {
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
      if (includeTag) {
        console.log(`✅ Solo fotos que contienen el tag: "${includeTag}"`);
      }
      
      // Respuesta con metadatos de paginación
      res.json({
        fotos,
        paginacion: {
          total,
          totalPages,
          currentPage: page,
          limit
        },
        filtros: {
          includeTag: includeTag || null
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
          // Usar el tag completo en lugar de solo la categoría principal
          if (tag) {
            categoryCounts[tag] = (categoryCounts[tag] || 0) + 1;
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