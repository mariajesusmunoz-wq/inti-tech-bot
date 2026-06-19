const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const path = require('path');

const client = new Client({ authStrategy: new LocalAuth() });

client.on('ready', async () => {
    console.log('✅ Conectado, enviando catálogo...');
    const media = MessageMedia.fromFilePath(path.join(__dirname, 'catalogo.pdf'));
    await client.sendMessage('524441306950@c.us', media, { caption: '¡Aquí está nuestro catálogo! Si tienes alguna pregunta, con gusto te ayudo. 🌞' });
    console.log('✅ Catálogo enviado a Jose Armando Felix');
    process.exit(0);
});

client.initialize();
