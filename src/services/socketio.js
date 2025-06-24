const { Server } = require('socket.io');
const { dbBoda } = require('../config/database');
const nodemailer = require('nodemailer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');

// Variable global para el servidor Socket.IO
let io;

// Configuración del transportador de correo
const transporter = nodemailer.createTransport({
  service: 'gmail',  // Puedes cambiar a otro servicio de correo
  auth: {
    user: process.env.EMAIL_USER || 'tu_correo@gmail.com',
    pass: process.env.EMAIL_PASS || 'tu_contraseña'
  }
});

// Configuración de AWS S3 v3
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const setupWebSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log('📡 Nuevo cliente conectado a Socket.IO');
    console.log('🔗 Clientes conectados actualmente:', io.engine.clientsCount);

    // Manejar evento para unirse a rooms de tags
    socket.on('join_tag_rooms', (tags) => {
      console.log('🏷️ Cliente se une a rooms de tags:', tags);
      if (Array.isArray(tags)) {
        tags.forEach(tag => {
          if (tag && typeof tag === 'string') {
            socket.join(tag);
            console.log(`✅ Cliente unido al room: ${tag}`);
          }
        });
      }
    });

    // Manejar evento para salir de rooms de tags
    socket.on('leave_tag_rooms', (tags) => {
      console.log('🚪 Cliente sale de rooms de tags:', tags);
      if (Array.isArray(tags)) {
        tags.forEach(tag => {
          if (tag && typeof tag === 'string') {
            socket.leave(tag);
            console.log(`✅ Cliente salió del room: ${tag}`);
          }
        });
      }
    });

    // Manejar evento de nuevo invitado
    socket.on('nuevo_invitado', (data) => {
      console.log("Tipo socket nuevo invitado");
      insertarInvitado(data, null, socket);
    });

    // Manejar evento de nueva foto
    socket.on('photo-uploaded', async (data) => {
      console.log("📸 Socket nueva foto recibida");
      try {
        // Verificar que la foto tenga URL de S3
        if (!data.data || !data.data.imageUrl) {
          console.error('❌ Error: La foto debe tener imageUrl');
          const mensaje_error = { 
            tipo: 'confirmacion', 
            data: "not ok", 
            error: 'La foto debe tener imageUrl' 
          };
          io.emit('confirmacion', mensaje_error);
          return;
        }

        console.log("✅ Guardando foto en BD con URL:", data.data.imageUrl);
        // Guardar en la base de datos
        insertarFoto(data.data, null, socket);
      } catch (error) {
        console.error('❌ Error en el proceso de guardado de foto:', error);
        const mensaje_error = { 
          data: "not ok", 
        };
        io.emit('confirmacion', mensaje_error);
      }
    });

    socket.on('disconnect', () => {
      console.log('❌ Cliente desconectado, clientes restantes:', io.engine.clientsCount);
    });
  });

  return { io };
};

const guardarFotoS3 = async (data, res = null, socket = null) => {
  console.log("Guardando foto en S3");

  
  try {
    const { blob, title, tags, metadata, uploadedAt } = data.data;
    
    if (!blob) {
      console.error('❌ No se proporcionó blob para guardar en S3');
      const mensaje_error = { tipo: 'confirmacion', data: "not ok", error: 'No se proporcionó blob' };
      io.emit('confirmacion', mensaje_error);
      if (res) res.status(400).json({ error: 'No se proporcionó blob' });
      return;
    }

    // Convertir todos los valores de metadata a string para S3
    const stringifiedMetadata = {};
    if (metadata) {
      Object.keys(metadata).forEach(key => {
        // Asegurarse de que el valor no sea un objeto antes de convertirlo
        if (typeof metadata[key] !== 'object') {
          stringifiedMetadata[key] = String(metadata[key]);
        }
      });
    }

    // Generar nombre único para el archivo
    const timestamp = Date.now();
    const fileName = `fotos-boda/${timestamp}-${title || 'foto'}.jpg`;
    
    // Convertir blob a Buffer si es necesario
    let buffer;
    if (Buffer.isBuffer(blob)) {
      buffer = blob;
    } else if (typeof blob === 'string') {
      // Si es base64, convertir a buffer
      buffer = Buffer.from(blob.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    } else if (blob instanceof Uint8Array) {
      buffer = Buffer.from(blob);
    } else {
      console.error('❌ Formato de blob no soportado');
      const mensaje_error = { tipo: 'confirmacion', data: "not ok", error: 'Formato de blob no soportado' };
      io.emit('confirmacion', mensaje_error);
      if (res) res.status(400).json({ error: 'Formato de blob no soportado' });
      return;
    }

    // Parámetros para subir a S3
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileName,
      Body: buffer,
      ContentType: 'image/jpeg',
      Metadata: {
        title: title || 'Foto de boda',
        tags: JSON.stringify(tags || []),
        uploadedAt: uploadedAt || new Date().toISOString(),
        ...stringifiedMetadata
      }
    };

    // Subir a S3
    try {
      const command = new PutObjectCommand(uploadParams);
      const result = await s3Client.send(command);
      
      // Construir la URL de la imagen (SDK v3 no devuelve Location automáticamente)
      const imageUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
      
      console.log('✅ Foto subida exitosamente a S3:', imageUrl);
      
      // Emitir confirmación de éxito
      const confirmacion = { tipo: 'confirmacion', data: "ok", imageUrl };
      io.emit('confirmacion', confirmacion);
      
      // Si se proporcionó res, enviar respuesta HTTP
      if (res) {
        res.status(200).json({ 
          message: 'Foto guardada en S3 con éxito 🎉',
          imageUrl: imageUrl,
          fileName: fileName
        });
      }
      
      return imageUrl;
      
    } catch (error) {
      console.error('❌ Error al subir foto a S3:', error);
      
      const mensaje_error = { 
        tipo: 'confirmacion', 
        data: "not ok", 
        error: error.message 
      };
      io.emit('confirmacion', mensaje_error);
      
      if (res) {
        res.status(500).json({ 
          error: 'Error al subir foto a S3',
          details: error.message 
        });
      }
      
      throw error;
    }
  } catch (error) {
    console.error('❌ Error al guardar foto en S3:', error);
    
    const mensaje_error = { 
      tipo: 'Guardar foto en S3', 
      data: "not ok", 
      error: error.message 
    };
    io.emit('confirmacion', mensaje_error);
    
    if (res) {
      res.status(500).json({ 
        error: 'Error al guardar foto en S3',
        details: error.message 
      });
    }
    
    throw error;
  }
};

const insertarFoto = (data, res = null, socket = null) => {
  try {
    const { id, imageUrl, imageUrlThumb, title, tags, metadata } = data;

    // Usar el ID del frontend si está disponible, sino generar uno nuevo con UUID v4
    const fotoId = uuidv4();
    
    const query = `
      INSERT INTO fotos_boda (id, url, imageUrlThumb, title, tags, metadata) 
      VALUES ( ?, ?, ?, ?, ?, ?)`;

    try {
      dbBoda.query(query, [
        fotoId, 
        imageUrl, 
        imageUrlThumb || imageUrl, // Si no hay miniatura, usar la imagen original
        title, 
        JSON.stringify(tags), 
        JSON.stringify(metadata)
      ], (err, result) => {
        if (err) {
          console.error('❌ Error en la consulta SQL:', err);
          console.error('❌ Query ejecutada:', query);
          console.error('❌ Parámetros:', [fotoId, imageUrl, imageUrlThumb, title, JSON.stringify(tags), JSON.stringify(metadata)]);
          
          const mensaje_error = { tipo: 'confirmacion', data: "not ok", error: err.message };
          io.emit('confirmacion', mensaje_error);
          
          if (res) res.status(500).json({ 
            error: 'Error al guardar foto en la base de datos',
            details: err.message,
            sqlError: err.sqlMessage || err.code
          });
          return;
        }

        console.log("✔️ Foto guardada en la base de datos con ID:", fotoId);

        const nuevaFoto = {
          id: fotoId,
          imageUrl,
          imageUrlThumb: imageUrlThumb || imageUrl,
          title,
          tags,
          metadata
        };

        const confirmacion = {data: "ok" };
        io.emit('confirmacion', confirmacion);

        io.emit('nueva_categoria', nuevaFoto.tags); 

        const mensaje = { data: nuevaFoto };
        
        // Emitir la nueva foto a los rooms específicos de cada tag
        if (nuevaFoto.tags && Array.isArray(nuevaFoto.tags) && nuevaFoto.tags.length > 0) {
          nuevaFoto.tags.forEach(tag => {
            if (tag && typeof tag === 'string') {
              console.log(`📤 Enviando nueva foto al room: ${tag}`);
              io.to(tag).emit('nueva_foto', mensaje);
            }
          });
        } else {
          // Si no hay tags, emitir a todos (fallback)
          console.log('📤 Enviando nueva foto a todos (sin tags específicos)');
          io.emit('nueva_foto', mensaje);
        }

        console.log('✅ Nueva foto agregada y emitida por Socket.IO:', {
          id: nuevaFoto.id,
          title: nuevaFoto.title,
          tags: nuevaFoto.tags,
          metadata: nuevaFoto.metadata
        });

        if (res) {
          res.status(201).json({ id: fotoId, message: 'Foto guardada con éxito 🎉' });
        }
      });
    } catch (dbError) {
      console.error('❌ Error inesperado en la consulta a la base de datos:', dbError);
      console.error('❌ Stack trace:', dbError.stack);
      
      const mensaje_error = { tipo: 'BBDD', data: "not ok", error: dbError.message };
      io.emit('confirmacion', mensaje_error);
      
      if (res) {
        res.status(500).json({ 
          error: 'Error inesperado en la base de datos',
          details: dbError.message,
          stack: dbError.stack
        });
      }
    }
  } catch (error) {
    console.error('❌ Error inesperado en insertarFoto:', error);
    console.error('❌ Stack trace:', error.stack);
    
    const mensaje_error = { tipo: 'BBDD', data: "not ok", error: error.message };
    io.emit('confirmacion', mensaje_error);
    
    if (res) {
      res.status(500).json({ 
        error: 'Error inesperado al guardar foto',
        details: error.message,
        stack: error.stack
      });
    }
  }
};

const insertarInvitado = (data, res = null, socket = null) => {
  const {
    nombre_completo,
    email,
    asistira,
    numero_acompanantes,
    restricciones,
    asistencia_autobus,
    mensaje_para_novios,
    tipo_autobus,
    cancion_preferencia,
    plataforma_musica,
    acompanantes,
    color
  } = data;

  const query = `
    INSERT INTO invitados (
      nombre_completo, asistira, numero_acompanantes,
      restricciones, asistencia_autobus, mensaje_para_novios,
      tipo_autobus, cancion_preferencia, plataforma_musica, color
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  dbBoda.query(query, [
    nombre_completo,
    asistira,
    numero_acompanantes,
    restricciones,
    asistencia_autobus,
    mensaje_para_novios,
    tipo_autobus,
    cancion_preferencia,
    plataforma_musica,
    color
  ], (err, result) => {
    if (err) {
      const mensaje_error = { tipo: 'confirmacion', data: "not ok" };
      io.emit('confirmacion', mensaje_error);
      console.error('❌ Error al guardar invitado:', err);
      if (res) res.status(500).json({ error: 'Error al guardar invitado' });
      return;
    }

    const nuevoInvitado = {
      id: result.insertId,
      nombre_completo,
      asistira,
      numero_acompanantes,
      restricciones,
      asistencia_autobus,
      mensaje_para_novios,
      tipo_autobus,
      cancion_preferencia,
      plataforma_musica,
      color,
      fecha_respuesta: new Date().toISOString()
    };

    // Insertar acompañantes si existen
    if (acompanantes && acompanantes.length > 0) {
      console.log("Insertando acompañantes:", acompanantes);
      const acompanantesQuery = `
        INSERT INTO invitados (
          nombre_completo, asistira, numero_acompanantes,
          restricciones, asistencia_autobus, mensaje_para_novios,
          tipo_autobus, cancion_preferencia, plataforma_musica,
          invitado_principal_id, color
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      acompanantes.forEach(acompanante => {
        dbBoda.query(acompanantesQuery, [
          acompanante.nombre_completo,
          asistira,
          0,
          acompanante.restricciones,
          acompanante.asistencia_autobus,
          '',
          acompanante.tipo_autobus,
          acompanante.cancion_preferencia || '',
          acompanante.plataforma_musica || '',
          result.insertId,
          acompanante.color
        ], (err, acompananteResult) => {
          if (err) {
            console.error('❌ Error al guardar acompañante:', err);
          } else {
            // Enviar información del acompañante por Socket.IO
            const nuevoAcompanante = {
              id: acompananteResult.insertId,
              nombre_completo: acompanante.nombre_completo,
              asistira: asistira,
              restricciones: acompanante.restricciones,
              asistencia_autobus: acompanante.asistencia_autobus,
              tipo_autobus: acompanante.tipo_autobus,
              cancion_preferencia: acompanante.cancion_preferencia || '',
              plataforma_musica: acompanante.plataforma_musica || '',
              invitado_principal_id: nombre_completo,
              color: acompanante.color,
              fecha_respuesta: new Date().toISOString()
            };
            console.log("Nuevo acompañante: " + JSON.stringify(nuevoAcompanante));
            const mensajeAcompanante = { tipo: 'nuevo_invitado', data: nuevoAcompanante };
            io.emit('nuevo_invitado', mensajeAcompanante);
          }
        });
      });
    }

    const confirmacion = { tipo: 'confirmacion', data: "ok" };
    io.emit('confirmacion', confirmacion);

    const mensaje = { tipo: 'nuevo_invitado', data: nuevoInvitado };
    io.emit('nuevo_invitado', mensaje);

    send_email(email, nombre_completo, asistira, numero_acompanantes, restricciones, asistencia_autobus, mensaje_para_novios, tipo_autobus, cancion_preferencia, plataforma_musica, color, acompanantes);
    console.log('✅ Nuevo invitado y acompañantes agregados y emitidos por Socket.IO:', nuevoInvitado);

    if (res) {
      res.status(201).json({ id: result.insertId, message: 'Invitado y acompañantes guardados con éxito 🎉' });
    }
  });
};

const send_email = (email, nombre_completo, asistira, numero_acompanantes, restricciones, asistencia_autobus, mensaje_para_novios, tipo_autobus, cancion_preferencia, plataforma_musica, color, acompanantes) => {

  console.log("Enviando emails para invitado:", nombre_completo);
  
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'diego.vinalslage@gmail.com',
      pass: 'jdlh mfat iezv vcgp',
    }
  });
  
  const emailPromises = [];
  
  // Preparar información de acompañantes si existe
  let acompanantesHTML = '';
  if (acompanantes && acompanantes.length > 0) {
    acompanantesHTML = '<div style="margin: 20px 0; padding: 15px; background-color: #f8f8f8; border-radius: 10px;">';
    acompanantesHTML += '<h3 style="color: #6c5ce7; margin-bottom: 15px;">👪 Información de tus acompañantes:</h3>';
    
    acompanantes.forEach((acompanante, index) => {
      acompanantesHTML += `<div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px dashed #ccc;">`;
      acompanantesHTML += `<p style="font-weight: bold; margin-bottom: 5px; color: #2d3436;">Acompañante ${index + 1}: ${acompanante.nombre_completo}</p>`;
      
      if (acompanante.restricciones) {
        acompanantesHTML += `<p style="margin: 5px 0;"><span style="color: #e17055;">🍽️ Restricciones alimentarias:</span> ${acompanante.restricciones}</p>`;
      }
      
      if (acompanante.asistencia_autobus !== undefined) {
        acompanantesHTML += `<p style="margin: 5px 0;"><span style="color: #e17055;">🚌 Asistencia en autobús:</span> ${acompanante.asistencia_autobus ? 'Sí' : 'No'}</p>`;
      }
      
      if (acompanante.tipo_autobus) {
        acompanantesHTML += `<p style="margin: 5px 0;"><span style="color: #e17055;">🚐 Tipo de autobús:</span> ${acompanante.tipo_autobus}</p>`;
      }
      
      if (acompanante.cancion_preferencia) {
        acompanantesHTML += `<p style="margin: 5px 0;"><span style="color: #e17055;">🎵 Canción preferida:</span> ${acompanante.cancion_preferencia}${acompanante.plataforma_musica ? ` (${acompanante.plataforma_musica})` : ''}</p>`;
      }

      if (acompanante.color) {
        acompanantesHTML += `<p style="margin: 5px 0;"><span style="color: #e17055;">🎨 Color asignado:</span> ${acompanante.color}</p>`;
      }
      
      acompanantesHTML += '</div>';
    });
    
    acompanantesHTML += '</div>';
  }
  
  let cuerpoMensaje = '';
  let asunto = '';
  
  if (asistira) {
    // Mensaje para invitados que SÍ asistirán
    asunto = `✨ ¡${nombre_completo}, nos vemos en nuestra boda! ✨`;
    cuerpoMensaje = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Confirmación de Asistencia</title>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&family=Dancing+Script:wght@400;700&display=swap" rel="stylesheet">
    </head>
    <body style="font-family: 'Montserrat', Arial, sans-serif; line-height: 1.6; max-width: 650px; margin: 0 auto; padding: 0; color: #333; background-color: #ffffff;">
      <div style="text-align: center; padding: 30px 20px; background-color: #f9f7ff; border-radius: 15px 15px 0 0; border-bottom: 2px solid #d4c6ff;">
        <h1 style="font-family: 'Dancing Script', cursive; color: #6c5ce7; margin-bottom: 5px; font-size: 38px;">✨ ¡Confirmación de Asistencia! ✨</h1>
        <div style="width: 150px; height: 3px; background: linear-gradient(to right, #6c5ce7, #a29bfe); margin: 10px auto;"></div>
      </div>
      
      <div style="padding: 30px; background-color: #ffffff; border-radius: 0 0 15px 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.05);">
        <div style="margin-bottom: 25px; text-align: center;">
          <p style="font-size: 20px; margin-bottom: 20px;">¡Hola <span style="font-weight: bold; color: #6c5ce7; font-family: 'Dancing Script', cursive; font-size: 26px;">${nombre_completo}</span>! 💫</p>
          <p style="font-size: 16px; color: #555;">¡Estamos encantados de que puedas acompañarnos en nuestro gran día! Con mucha ilusión hemos recibido tu confirmación:</p>
        </div>
        
        <div style="background-color: #f9f7ff; padding: 25px; border-radius: 15px; margin-bottom: 25px; border-left: 4px solid #6c5ce7;">
          <p style="margin: 12px 0;"><span style="font-weight: 600; color: #6c5ce7;">🎯 Asistencia:</span> <span style="background-color: #a29bfe; color: white; padding: 4px 12px; border-radius: 20px; font-weight: 600; display: inline-block; margin-left: 5px;">¡SÍ! 🎉</span></p>
          <p style="margin: 12px 0;"><span style="font-weight: 600; color: #6c5ce7;">👥 Número de acompañantes:</span> <span style="color: #444; font-weight: 500;">${numero_acompanantes || 0}</span></p>
          ${restricciones ? `<p style="margin: 12px 0;"><span style="font-weight: 600; color: #6c5ce7;">🍽️ Restricciones alimentarias:</span> <span style="color: #444; font-weight: 500;">${restricciones}</span></p>` : ''}
          <p style="margin: 12px 0;"><span style="font-weight: 600; color: #6c5ce7;">🚌 Asistencia en autobús:</span> <span style="color: #444; font-weight: 500;">${asistencia_autobus ? 'Sí' : 'No'}</span></p>
          ${tipo_autobus ? `<p style="margin: 12px 0;"><span style="font-weight: 600; color: #6c5ce7;">🚐 Tipo de autobús:</span> <span style="color: #444; font-weight: 500;">${tipo_autobus}</span></p>` : ''}
          ${color ? `<p style="margin: 12px 0;"><span style="font-weight: 600; color: #6c5ce7;">🎨 Color asignado:</span> <span style="color: #444; font-weight: 500;">${color}</span></p>` : ''}
          ${cancion_preferencia ? `<p style="margin: 12px 0;"><span style="font-weight: 600; color: #6c5ce7;">🎵 Canción preferida:</span> <span style="color: #444; font-weight: 500;">${cancion_preferencia}</span></p>` : ''}
        </div>
        
        ${acompanantesHTML ? acompanantesHTML.replace('<div style="margin: 20px 0; padding: 15px; background-color: #f8f8f8; border-radius: 10px;">', '<div style="margin: 20px 0; padding: 20px; background-color: #f9f7ff; border-radius: 15px; border-left: 4px solid #a29bfe;">').replace('<h3 style="color: #6c5ce7; margin-bottom: 15px;">', '<h3 style="color: #6c5ce7; margin-bottom: 15px; font-family: \'Montserrat\', sans-serif; font-weight: 600; font-size: 18px;">') : ''}
        
        ${mensaje_para_novios ? `
        <div style="margin: 25px 0; padding: 25px; background-color: #fff9e9; border-radius: 15px; border-left: 4px solid #fdcb6e; box-shadow: 0 2px 10px rgba(253, 203, 110, 0.2);">
          <h3 style="color: #e17055; margin-top: 0; font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 18px;">💌 Tu mensaje para nosotros:</h3>
          <p style="font-style: italic; font-size: 16px; color: #555; line-height: 1.8;">"${mensaje_para_novios}"</p>
        </div>
        ` : ''}
        
        <div style="margin-top: 30px; text-align: center;">
          <p style="font-size: 16px; color: #555;">¡Nos hace muchísima ilusión que formes parte de este día tan especial! 🥂</p>
          <p style="font-size: 15px; color: #777;">Si necesitas hacer algún cambio, no dudes en contactarnos.</p>
        </div>
        
        <div style="margin-top: 40px; text-align: center; border-top: 1px solid #eee; padding-top: 20px;">
          <p style="color: #777; margin-bottom: 5px;">Con cariño,</p>
          <p style="font-family: 'Dancing Script', cursive; font-size: 26px; font-weight: bold; color: #6c5ce7; margin-top: 5px;">💍 Sofía y Diego 💍</p>
          <div style="font-size: 12px; color: #999; margin-top: 20px;">
            <p>Si tienes alguna pregunta o necesitas más información, contáctanos</p>
          </div>
        </div>
      </div>
    </body>
    </html>
    `;
  } else {
    // Mensaje para invitados que NO asistirán
    asunto = `Confirmación recibida - ${nombre_completo}`;
    cuerpoMensaje = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Confirmación Recibida</title>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&family=Dancing+Script:wght@400;700&display=swap" rel="stylesheet">
    </head>
    <body style="font-family: 'Montserrat', Arial, sans-serif; line-height: 1.6; max-width: 650px; margin: 0 auto; padding: 0; color: #333; background-color: #ffffff;">
      <div style="text-align: center; padding: 30px 20px; background-color: #f0f7ff; border-radius: 15px 15px 0 0; border-bottom: 2px solid #c5dbff;">
        <h1 style="font-family: 'Dancing Script', cursive; color: #4a90e2; margin-bottom: 5px; font-size: 38px;">📝 Confirmación Recibida 📝</h1>
        <div style="width: 150px; height: 3px; background: linear-gradient(to right, #4a90e2, #74b9ff); margin: 10px auto;"></div>
      </div>
      
      <div style="padding: 30px; background-color: #ffffff; border-radius: 0 0 15px 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.05);">
        <div style="margin-bottom: 25px; text-align: center;">
          <p style="font-size: 20px; margin-bottom: 20px;">¡Hola <span style="font-weight: bold; color: #4a90e2; font-family: 'Dancing Script', cursive; font-size: 26px;">${nombre_completo}</span>!</p>
        </div>
        
        <div style="background-color: #f0f7ff; padding: 25px; border-radius: 15px; margin-bottom: 25px; border-left: 4px solid #4a90e2;">
          <p style="margin: 12px 0; font-size: 16px; color: #555; line-height: 1.7;">Aunque lamentamos que no puedas estar presente en nuestro día especial, queremos agradecerte enormemente por tomarte el tiempo de responder.</p>
          <p style="margin: 12px 0; font-size: 16px; color: #555; line-height: 1.7;">Te tendremos presente en nuestros pensamientos y esperamos poder reunirnos contigo en otra ocasión. 🤗</p>
        </div>
        
        ${mensaje_para_novios ? `
        <div style="margin: 25px 0; padding: 25px; background-color: #fff9e9; border-radius: 15px; border-left: 4px solid #fdcb6e; box-shadow: 0 2px 10px rgba(253, 203, 110, 0.2);">
          <h3 style="color: #e17055; margin-top: 0; font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 18px;">💌 Tu mensaje para nosotros:</h3>
          <p style="font-style: italic; font-size: 16px; color: #555; line-height: 1.8;">"${mensaje_para_novios}"</p>
        </div>
        ` : ''}
        
        <div style="margin-top: 30px; text-align: center;">
          <p style="font-size: 15px; color: #777;">Si tus planes cambian o necesitas comunicarnos algo, no dudes en contactarnos.</p>
        </div>
        
        <div style="margin-top: 40px; text-align: center; border-top: 1px solid #eee; padding-top: 20px;">
          <p style="color: #777; margin-bottom: 5px;">Con cariño,</p>
          <p style="font-family: 'Dancing Script', cursive; font-size: 26px; font-weight: bold; color: #4a90e2; margin-top: 5px;">💍 Sofía y Diego 💍</p>
          <div style="font-size: 12px; color: #999; margin-top: 20px;">
            <p>Si tienes alguna pregunta o necesitas más información, contáctanos</p>
          </div>
        </div>
      </div>
    </body>
    </html>
    `;
  }
  
  // Prepare email content for the couple - detailed info
  const detalleInvitado = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Nuevo Invitado Registrado</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&family=Dancing+Script:wght@400;700&display=swap" rel="stylesheet">
  </head>
  <body style="font-family: 'Montserrat', Arial, sans-serif; line-height: 1.6; max-width: 650px; margin: 0 auto; padding: 0; color: #333; background-color: #ffffff;">
    <div style="text-align: center; padding: 30px 20px; background-color: #f9f7ff; border-radius: 15px 15px 0 0; border-bottom: 2px solid #d4c6ff;">
      <h1 style="font-family: 'Dancing Script', cursive; color: #6c5ce7; margin-bottom: 5px; font-size: 38px;">🎉 ¡Nuevo Invitado Registrado! 🎉</h1>
      <div style="width: 150px; height: 3px; background: linear-gradient(to right, #6c5ce7, #a29bfe); margin: 10px auto;"></div>
    </div>
    
    <div style="padding: 30px; background-color: #ffffff; border-radius: 0 0 15px 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.05);">
      <div style="margin-bottom: 25px; text-align: center;">
        <p style="font-size: 18px; margin-bottom: 20px;">¡Tenéis un nuevo registro de <span style="font-weight: bold; color: #6c5ce7; font-family: 'Dancing Script', cursive; font-size: 24px;">${nombre_completo}</span>! 💫</p>
        <p style="font-size: 16px; color: #555;">A continuación encontraréis todos los detalles de su confirmación:</p>
      </div>
      
      <div style="background-color: #f9f7ff; padding: 25px; border-radius: 15px; margin-bottom: 25px; border-left: 4px solid #6c5ce7;">
        <p style="font-weight: 600; font-size: 18px; margin-bottom: 15px; color: #6c5ce7;">Información principal:</p>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid #e8e1ff;">
            <td style="padding: 10px 5px; font-weight: 500; color: #6c5ce7; width: 40%;">Nombre:</td>
            <td style="padding: 10px 5px; font-weight: 600;">${nombre_completo}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e8e1ff;">
            <td style="padding: 10px 5px; font-weight: 500; color: #6c5ce7;">Email:</td>
            <td style="padding: 10px 5px;">${email || 'No proporcionado'}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e8e1ff;">
            <td style="padding: 10px 5px; font-weight: 500; color: #6c5ce7;">Asistencia:</td>
            <td style="padding: 10px 5px;"><span style="background-color: ${asistira ? '#a29bfe' : '#fc8181'}; color: white; padding: 4px 12px; border-radius: 20px; font-weight: 600; display: inline-block;">${asistira ? '¡SÍ ASISTIRÁ! 🎉' : 'NO ASISTIRÁ'}</span></td>
          </tr>
          <tr style="border-bottom: 1px solid #e8e1ff;">
            <td style="padding: 10px 5px; font-weight: 500; color: #6c5ce7;">Acompañantes:</td>
            <td style="padding: 10px 5px;">${numero_acompanantes || '0'}</td>
          </tr>
          ${color ? `
          <tr style="border-bottom: 1px solid #e8e1ff;">
            <td style="padding: 10px 5px; font-weight: 500; color: #6c5ce7;">Color asignado:</td>
            <td style="padding: 10px 5px;">${color}</td>
          </tr>` : ''}
          ${restricciones ? `
          <tr style="border-bottom: 1px solid #e8e1ff;">
            <td style="padding: 10px 5px; font-weight: 500; color: #6c5ce7;">Restricciones alimentarias:</td>
            <td style="padding: 10px 5px;">${restricciones}</td>
          </tr>` : ''}
          <tr style="border-bottom: 1px solid #e8e1ff;">
            <td style="padding: 10px 5px; font-weight: 500; color: #6c5ce7;">Asistencia en autobús:</td>
            <td style="padding: 10px 5px;">${asistencia_autobus ? 'Sí' : 'No'}</td>
          </tr>
          ${tipo_autobus ? `
          <tr style="border-bottom: 1px solid #e8e1ff;">
            <td style="padding: 10px 5px; font-weight: 500; color: #6c5ce7;">Tipo de autobús:</td>
            <td style="padding: 10px 5px;">${tipo_autobus}</td>
          </tr>` : ''}
          ${cancion_preferencia ? `
          <tr style="border-bottom: 1px solid #e8e1ff;">
            <td style="padding: 10px 5px; font-weight: 500; color: #6c5ce7;">Canción preferida:</td>
            <td style="padding: 10px 5px;">${cancion_preferencia} (${plataforma_musica || 'No especificada'})</td>
          </tr>` : ''}
          ${mensaje_para_novios ? `
          <tr style="border-bottom: 1px solid #e8e1ff;">
            <td style="padding: 10px 5px; font-weight: 500; color: #6c5ce7;">Mensaje para vosotros:</td>
            <td style="padding: 10px 5px; font-style: italic;">"${mensaje_para_novios}"</td>
          </tr>` : ''}
          <tr>
            <td style="padding: 10px 5px; font-weight: 500; color: #6c5ce7;">Fecha de respuesta:</td>
            <td style="padding: 10px 5px;">${new Date().toLocaleString('es-ES')}</td>
          </tr>
        </table>
      </div>
      
      ${acompanantes && acompanantes.length > 0 ? `
      <div style="background-color: #f9f7ff; padding: 25px; border-radius: 15px; margin-bottom: 25px; border-left: 4px solid #a29bfe;">
        <p style="font-weight: 600; font-size: 18px; margin-bottom: 15px; color: #6c5ce7;">Detalles de los acompañantes (${acompanantes.length}):</p>
        
        ${acompanantes.map((acompanante, index) => `
        <div style="margin-bottom: ${index < acompanantes.length - 1 ? '15px' : '0'}; padding-bottom: ${index < acompanantes.length - 1 ? '15px' : '0'}; ${index < acompanantes.length - 1 ? 'border-bottom: 1px dashed #d4c6ff;' : ''}">
          <p style="font-weight: 600; margin-bottom: 10px; color: #6c5ce7; font-family: 'Montserrat', sans-serif;">Acompañante ${index + 1}: ${acompanante.nombre_completo}</p>
          
          <table style="width: 100%; border-collapse: collapse; margin-left: 10px;">
            ${acompanante.restricciones ? `
            <tr style="border-bottom: 1px solid #e8e1ff;">
              <td style="padding: 7px 5px; font-weight: 500; color: #6c5ce7; width: 40%;">Restricciones alimentarias:</td>
              <td style="padding: 7px 5px;">${acompanante.restricciones}</td>
            </tr>` : ''}
            <tr style="border-bottom: 1px solid #e8e1ff;">
              <td style="padding: 7px 5px; font-weight: 500; color: #6c5ce7;">Asistencia en autobús:</td>
              <td style="padding: 7px 5px;">${acompanante.asistencia_autobus ? 'Sí' : 'No'}</td>
            </tr>
            ${acompanante.tipo_autobus ? `
            <tr style="border-bottom: 1px solid #e8e1ff;">
              <td style="padding: 7px 5px; font-weight: 500; color: #6c5ce7;">Tipo de autobús:</td>
              <td style="padding: 7px 5px;">${acompanante.tipo_autobus}</td>
            </tr>` : ''}
            ${acompanante.cancion_preferencia ? `
            <tr style="border-bottom: 1px solid #e8e1ff;">
              <td style="padding: 7px 5px; font-weight: 500; color: #6c5ce7;">Canción preferida:</td>
              <td style="padding: 7px 5px;">${acompanante.cancion_preferencia}${acompanante.plataforma_musica ? ` (${acompanante.plataforma_musica})` : ''}</td>
            </tr>` : ''}
            ${acompanante.color ? `
            <tr>
              <td style="padding: 7px 5px; font-weight: 500; color: #6c5ce7;">Color asignado:</td>
              <td style="padding: 7px 5px;">${acompanante.color}</td>
            </tr>` : ''}
          </table>
        </div>
        `).join('')}
      </div>
      ` : ''}
      
      <div style="margin-top: 30px; text-align: center;">
        <p style="font-size: 16px; color: #555;">¡Esta persona ya ha recibido su confirmación por email! 📧</p>
      </div>
      
      <div style="margin-top: 40px; text-align: center; border-top: 1px solid #e8e1ff; padding-top: 20px;">
        <p style="color: #777; margin-bottom: 5px;">Sistema automático de</p>
        <p style="font-family: 'Dancing Script', cursive; font-size: 26px; font-weight: bold; color: #6c5ce7; margin-top: 5px;">💍 Boda Sofía y Diego 💍</p>
        <div style="font-size: 12px; color: #999; margin-top: 20px;">
          <p>Este correo se envía automáticamente cuando un invitado confirma su asistencia</p>
        </div>
      </div>
    </div>
  </body>
  </html>
  `;
  
  // 1. Email al invitado (solo si proporcionó email)
  if (email) {
    const mailToInvitado = {
      from: `Boda Sofía y Diego <diego.vinalslage@gmail.com>`,
      to: email,
      subject: asunto,
      html: cuerpoMensaje
    };
    
    emailPromises.push(new Promise((resolve, reject) => {
      transporter.sendMail(mailToInvitado, (error, info) => {
        if (error) {
          console.error('❌ Error al enviar el correo al invitado:', error);
          reject(error);
        } else {
          console.log('✅ Mensaje enviado al invitado: %s', info.messageId);
          resolve(info);
        }
      });
    }));
  }
  
  // 2. Email a Diego
  const mailToDiego = {
    from: `Boda Sofía y Diego <diego.vinalslage@gmail.com>`,
    to: 'diego.vinalslage@gmail.com',
    subject: `Nuevo ${asistira ? 'asistente' : 'invitado'}: ${nombre_completo}`,
    html: detalleInvitado
  };
  
  emailPromises.push(new Promise((resolve, reject) => {
    transporter.sendMail(mailToDiego, (error, info) => {
      if (error) {
        console.error('❌ Error al enviar el correo a Diego:', error);
        reject(error);
      } else {
        console.log('✅ Mensaje enviado a Diego: %s', info.messageId);
        resolve(info);
      }
    });
  }));
  
  // 3. Email a Sofía
  const mailToSofia = {
    from: `Boda Sofía y Diego <diego.vinalslage@gmail.com>`,
    to: 'sofiacb1999@gmail.com',
    subject: `Nuevo ${asistira ? 'asistente' : 'invitado'}: ${nombre_completo}`,
    html: detalleInvitado
  };
  
  emailPromises.push(new Promise((resolve, reject) => {
    transporter.sendMail(mailToSofia, (error, info) => {
      if (error) {
        console.error('❌ Error al enviar el correo a Sofía:', error);
        reject(error);
      } else {
        console.log('✅ Mensaje enviado a Sofía: %s', info.messageId);
        resolve(info);
      }
    });
  }));
  
  // Ejecutar todos los envíos en paralelo
  Promise.all(emailPromises)
    .then(() => console.log('✅ Todos los emails enviados con éxito para', nombre_completo))
    .catch(error => console.error('❌ Error en el envío de alguno de los emails:', error));
};

module.exports = {
  setupWebSocket,
  insertarFoto,
  insertarInvitado
}; 