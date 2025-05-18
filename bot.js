require('dotenv').config(); // Cargar variables de entorno
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

let responseCounters = {}; // Puedes usar esto para limitar respuestas por usuario

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function initBot(numbers, welcomeMessage, gptContext, fallbackMessage, io) {
    const client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: false,
            args: ['--no-sandbox']
        }
    });

    client.on('qr', (qr) => {
        console.log('Emitiendo QR:', qr);  // Verificar que el QR se emita correctamente
    
        if (io) {
            io.emit('qr', qr);  // Emitir el QR a todos los clientes conectados
            console.log('📸 QR emitido por socket');
        } else {
            qrcode.generate(qr, { small: true });
        }
    });

    client.on('auth_failure', () => {
        console.log('❌ Fallo de autenticación');
        if (io) io.emit('auth_failure');
    });

    client.on('ready', async () => {
        console.log('✅ WhatsApp listo');
        if (io) io.emit('ready');

        for (const number of numbers) {
            const full = number.includes('@c.us') ? number : number + '@c.us';
            try {
                await client.sendMessage(full, welcomeMessage);
                guardarConversacion(full, 'BOT', welcomeMessage);
                console.log(`📤 Mensaje enviado a ${full}`);
            } catch (err) {
                console.error(`❌ Error enviando a ${full}:`, err.message);
            }
            await delay(15000); // Espera entre mensajes
        }
    });

    client.on('message', async (msg) => {
        const numero = msg.from;
        const texto = msg.body?.toLowerCase().trim();

        if (!texto) return; // Ignorar mensajes vacíos
        if (msg.fromMe || msg.isGroupMsg) return;

        const numeroBase = numero.replace('@c.us', '');
        const numerosPermitidos = numbers.map(n => n.replace(/@c\.us$/, ''));
        if (!numerosPermitidos.includes(numeroBase)) {
            console.log(`⚠️ Mensaje de número no autorizado: ${numero}`);
            return;
        }

        guardarConversacion(numero, 'USUARIO', msg.body);

        try {
            const respuesta = await obtenerRespuestaGPT(msg.body, gptContext);
            await client.sendMessage(numero, respuesta);
            guardarConversacion(numero, 'BOT', respuesta);
            console.log(`💬 Respondido a ${numero}: ${respuesta.substring(0, 50)}...`);
        } catch (err) {
            const mensajeError = fallbackMessage || '⚠️ Lo siento, estoy teniendo problemas para responder. Intenta más tarde.';
            await client.sendMessage(numero, mensajeError);
            guardarConversacion(numero, 'BOT', mensajeError);
            console.error('❌ Error GPT:', err.message);
        }
    });

    console.log('🟡 Inicializando cliente de WhatsApp...');
    client.initialize();
    console.log('✅ Cliente inicializado');
}

async function obtenerRespuestaGPT(mensaje, contexto) {
    const respuesta = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: 'gpt-3.5-turbo',
            messages: [
                { role: "system", content: contexto },
                { role: "user", content: mensaje }
            ],
            temperature: 0.7,
            max_tokens: 100
        },
        {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        }
    );
    return respuesta.data.choices[0].message.content.trim();
}

function guardarConversacion(numero, remitente, mensaje) {
    const ruta = path.join(__dirname, 'conversaciones');
    if (!fs.existsSync(ruta)) fs.mkdirSync(ruta);

    const archivo = path.join(ruta, `chat_${numero.replace('@c.us', '')}.txt`);
    const texto = `[${new Date().toLocaleString()}] ${remitente}: ${mensaje}\n`;

    fs.appendFileSync(archivo, texto, 'utf8');
}

module.exports = { initBot };
