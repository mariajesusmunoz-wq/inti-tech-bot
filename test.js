const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({ authStrategy: new LocalAuth() });

client.on('qr', (qr) => {
    console.log('Escanea el QR:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('✅ Conectado, enviando mensaje de prueba...');
    await client.sendMessage('18638453737@c.us', 'Hola Maria Jesus 👋 Soy el asistente virtual de *Maria Jesus de Inti Tech*.\n\nVi que mostraste interés en nuestras soluciones de limpieza solar y estoy aquí para ayudarte. ¿En qué puedo asistirte hoy?\n\n1️⃣ Ver catálogo\n2️⃣ Solicitar cotización\n3️⃣ Hablar con un representante');
    console.log('✅ Mensaje enviado!');
    process.exit(0);
});

client.initialize();
