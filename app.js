const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const { initBot } = require('./bot');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const upload = multer({ dest: 'uploads/' });

// Configuración básica
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Ruta principal
app.get('/', (req, res) => {
    res.render('index', { success: null, error: null });
});

// Procesar formulario
app.post('/enviar', upload.single('archivo'), async (req, res) => {
    const { mensaje, contexto, fallback, numeros: numerosTexto } = req.body;
    let numeros = [];

    try {
        // Procesar números manuales
        if (numerosTexto && numerosTexto.trim().length > 0) {
            numeros = numerosTexto
                .split('\n')
                .map(n => limpiarNumero(n))
                .filter(n => n);
        }

        // Procesar archivo subido
        if (req.file) {
            const ruta = req.file.path;
            
            if (req.file.originalname.endsWith('.csv')) {
                await new Promise((resolve, reject) => {
                    fs.createReadStream(ruta)
                        .pipe(csv())
                        .on('data', (row) => {
                            if (row.numero) numeros.push(limpiarNumero(row.numero));
                        })
                        .on('end', resolve)
                        .on('error', reject);
                });
            } else if (req.file.originalname.endsWith('.xlsx')) {
                const wb = xlsx.readFile(ruta);
                const datos = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                numeros.push(...datos.map(d => limpiarNumero(d.numero)));
            } else {
                return res.render('index', { success: null, error: 'Formato de archivo no soportado' });
            }
        }

        if (numeros.length === 0) {
            return res.render('index', { success: null, error: 'No se encontraron números válidos' });
        }

        numeros = [...new Set(numeros)]; // Eliminar duplicados
        lanzarBot(numeros, mensaje, contexto, fallback);
        res.render('index', { success: '✅ Bot iniciado: Escanea el QR', error: null });

    } catch (err) {
        console.error('Error en /enviar:', err);
        res.render('index', { success: null, error: 'Error al procesar la solicitud' });
    }
});

// Función para iniciar el bot con Socket.IO
function lanzarBot(numeros, mensaje, contexto, fallback) {
    initBot(numeros, mensaje, contexto, fallback, io);
}

// Limpiar números
function limpiarNumero(numero) {
    const limpio = String(numero).replace(/\D/g, '');
    if (limpio.length === 10 && limpio.startsWith('3')) return '57' + limpio;
    if (limpio.length === 12 && limpio.startsWith('57')) return limpio;
    return null;
}

// Iniciar servidor
server.listen(3000, () => {
    console.log('🌐 Servidor escuchando en http://localhost:3000');
});