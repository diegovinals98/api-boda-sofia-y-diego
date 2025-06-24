const { dbBoda } = require('../config/database');
const { insertarInvitado, insertarFoto } = require('../services/socketio');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');

// Configuración de AWS S3 v3
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

console.log('[S3 CONFIG v3]', {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ? '***HIDDEN***' : 'MISSING',
  region: process.env.AWS_REGION,
  bucket: process.env.AWS_S3_BUCKET_NAME
});

// Función helper para subir archivo a S3
const uploadToS3 = async (buffer, key, mimetype, metadata = {}) => {
  const uploadParams = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
    Metadata: metadata
  };

  const command = new PutObjectCommand(uploadParams);
  await s3Client.send(command);
  
  return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

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
          imageUrlThumb: foto.imageUrlThumb || foto.url, // Usar miniatura si existe, sino la original
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

// Subir foto a S3 y devolver el enlace
const uploadPhotoToS3 = async (req, res) => {
  try {
    console.log('📸 Iniciando subida de foto a S3');
    console.log('🔍 Variables de entorno S3:', {
      bucket: process.env.AWS_S3_BUCKET_NAME,
      region: process.env.AWS_REGION,
      accessKey: process.env.AWS_ACCESS_KEY_ID ? 'PRESENT' : 'MISSING'
    });
    
    // Verificar si se recibió el archivo
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No se proporcionó ningún archivo',
        message: 'Debe enviar una imagen en el campo "photo"'
      });
    }

    const { title, tags, metadata } = req.body;
    
    // Generar nombre único para el archivo
    const timestamp = Date.now();
    const fileName = `fotos-boda/${timestamp}-${title || 'foto'}.jpg`;
    const thumbnailFileName = `fotos-boda/thumbnails/${timestamp}-${title || 'foto'}.jpg`;
    
    console.log('📁 Nombre del archivo generado:', fileName);
    console.log('🖼️ Nombre de la miniatura:', thumbnailFileName);
    
    // Convertir metadata a string para S3
    const stringifiedMetadata = {};
    if (metadata) {
      try {
        const parsedMetadata = JSON.parse(metadata);
        Object.keys(parsedMetadata).forEach(key => {
          if (typeof parsedMetadata[key] !== 'object') {
            stringifiedMetadata[key] = String(parsedMetadata[key]);
          }
        });
      } catch (error) {
        console.warn('⚠️ Error al parsear metadata, usando como string:', error);
        stringifiedMetadata.raw = metadata;
      }
    }

    // Metadata común para ambas imágenes
    const commonMetadata = {
      title: title || 'Foto de boda',
      tags: JSON.stringify(tags ? tags.split(',') : []),
      uploadedAt: new Date().toISOString(),
      ...stringifiedMetadata
    };

    console.log('🚀 Generando miniatura...');
    
    // Generar miniatura con Sharp
    const thumbnailBuffer = await sharp(req.file.buffer)
      .rotate() // Preservar orientación EXIF
      .resize(300, 300, { 
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    console.log('✅ Miniatura generada, tamaño:', thumbnailBuffer.length, 'bytes');

    // Subir imagen original y miniatura en paralelo
    console.log('🚀 Subiendo imagen original y miniatura a S3...');
    
    const [imageUrl, thumbnailUrl] = await Promise.all([
      uploadToS3(req.file.buffer, fileName, req.file.mimetype, commonMetadata),
      uploadToS3(thumbnailBuffer, thumbnailFileName, 'image/jpeg', {
        ...commonMetadata,
        isThumbnail: 'true'
      })
    ]);
    
    console.log('✅ Imagen original subida:', imageUrl);
    console.log('✅ Miniatura subida:', thumbnailUrl);
    
    // Respuesta exitosa
    res.status(200).json({ 
      success: true,
      message: 'Foto y miniatura subidas a S3 con éxito 🎉',
      data: {
        imageUrl: imageUrl,
        imageUrlThumb: thumbnailUrl,
        fileName: fileName,
        thumbnailFileName: thumbnailFileName,
        title: title,
        tags: tags ? tags.split(',') : [],
        metadata: metadata ? JSON.parse(metadata) : {},
        uploadedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Error al subir foto a S3:', error);
    console.error('❌ Error details:', {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      requestId: error.requestId
    });
    
    res.status(500).json({ 
      success: false,
      error: 'Error al subir foto a S3',
      message: error.message,
      details: error.code || 'Unknown error'
    });
  }
};

module.exports = {
  getAllGuests,
  addGuest,
  getAllPhotos,
  addPhoto,
  getPhotoCountByCategory,
  uploadPhotoToS3
}; 