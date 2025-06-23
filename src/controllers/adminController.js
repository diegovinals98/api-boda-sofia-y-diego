const { execSync } = require("child_process");

// Obtener información de discos
const getDiskInfo = (req, res) => {
  try {
    const salidaDf = execSync("df -h | grep '^/dev'").toString();
    const discos = salidaDf.trim().split("\n").map(linea => {
      const [nombre, total, usado, libre, porcentaje, montaje] = linea.trim().split(/\s+/);
      return {
        nombre,
        total,
        usado,
        libre,
        porcentaje: parseInt(porcentaje.replace('%', '')),
        montaje
      };
    });

    const salidaTemp = execSync("lsblk -dno NAME | xargs -I{} sudo smartctl -A /dev/{} | grep Temperature").toString();
    const temperaturas = salidaTemp.trim().split("\n").reduce((acc, linea) => {
      const match = linea.match(/\/dev\/(\w+).*?(\d+)[^\d]*$/);
      if (match) {
        acc[match[1]] = parseInt(match[2]);
      }
      return acc;
    }, {});

    discos.forEach(disco => {
      const base = disco.nombre.replace("/dev/", "").replace(/[0-9]+$/, "");
      disco.temperatura = temperaturas[base] || null;
    });

    res.json(discos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener información de los discos." });
  }
};

// Verificar estado del sistema
const checkHealth = (req, res) => {
  console.log("checkHealth");
  res.send('Hello World');
};

module.exports = {
  getDiskInfo,
  checkHealth
}; 