const { Client, RemoteAuth, MessageMedia } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const http = require('http');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

let currentQR = null;
const PORT = process.env.PORT || 3000;
http.createServer(async (req, res) => {
    if (req.url === '/qr' && currentQR) {
        const img = await QRCode.toBuffer(currentQR, { scale: 8 });
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(img);
    } else if (req.url === '/qr') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2>QR no disponible aún. Espera unos segundos y recarga.</h2>');
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Bot corriendo. Ve a /qr para escanear el código.');
    }
}).listen(PORT, () => console.log(`🌐 Servidor QR en puerto ${PORT}`));

const SPREADSHEET_IDS = [
    '1w4i5PkXzKBfsmijn6f3mW8z7aPXrH52dDitJPA2PIh8',
    '1eo6jXUhBr_wGdUAI6Llh3MnO3T26jaqPZ-H6AEqPw_w'
];
const SHEET_NAME = 'Sheet1';
const CHECK_INTERVAL = 5 * 60 * 1000;

const SentLeadSchema = new mongoose.Schema({
    chatId: { type: String, unique: true },
    data: mongoose.Schema.Types.Mixed
});
const SentLeadModel = mongoose.model('SentLead', SentLeadSchema);

let sentLeads = {};

async function loadSentLeads() {
    const docs = await SentLeadModel.find({});
    docs.forEach(doc => { sentLeads[doc.chatId] = doc.data; });
    console.log(`📂 ${docs.length} leads cargados desde MongoDB`);
}

async function saveSentLeads() {
    for (const [chatId, data] of Object.entries(sentLeads)) {
        await SentLeadModel.findOneAndUpdate({ chatId }, { chatId, data }, { upsert: true });
    }
}

function getAuthClient() {
    const credentials = process.env.GOOGLE_CREDENTIALS
        ? JSON.parse(process.env.GOOGLE_CREDENTIALS)
        : require('./credentials.json');
    return new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
}

async function getNewLeads(spreadsheetId) {
    const sheets = google.sheets({ version: 'v4', auth: getAuthClient() });
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_NAME}!A:Z`,
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) return [];

    const headers = rows[0].map(h => h.trim());
    const statusColIndex = headers.indexOf('Estado');
    const phoneColIndex = headers.indexOf('phone');
    const phoneFallbackIndex = headers.indexOf('Teléfono del Cliente');
    const idColIndex = headers.indexOf('id');

    const leads = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const status = (row[statusColIndex] || '').trim();
        const phone = (row[phoneColIndex] || row[phoneFallbackIndex] || '').trim();
        const id = (row[idColIndex] || '').trim();

        if (!status && phone && id) {
            const obj = {};
            headers.forEach((h, j) => { obj[h] = (row[j] || '').trim(); });
            obj._rowIndex = i + 1;
            obj._statusCol = String.fromCharCode(65 + statusColIndex);
            leads.push(obj);
        }
    }
    return leads;
}

async function updateEstado(spreadsheetId, rowIndex, statusCol, value) {
    const auth = getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!${statusCol}${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[value]] }
    });

    const colIndex = statusCol.charCodeAt(0) - 65;
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [{
                repeatCell: {
                    range: {
                        sheetId: 0,
                        startRowIndex: rowIndex - 1,
                        endRowIndex: rowIndex,
                        startColumnIndex: colIndex,
                        endColumnIndex: colIndex + 1
                    },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: { red: 1, green: 1, blue: 1 }
                        }
                    },
                    fields: 'userEnteredFormat.backgroundColor'
                }
            }]
        }
    });
}

function formatPhone(phone) {
    let cleaned = phone.toString().replace(/\D/g, '');
    if (cleaned.length === 10) cleaned = '52' + cleaned;
    if (cleaned.length < 10) return null;
    return cleaned + '@c.us';
}

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    await loadSentLeads();

    const store = new MongoStore({ mongoose });

    const client = new Client({
        authStrategy: new RemoteAuth({
            store,
            backupSyncIntervalMs: 60000
        }),
        puppeteer: {
            executablePath: process.env.CHROMIUM_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--single-process',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-sync',
                '--disable-translate',
                '--hide-scrollbars',
                '--mute-audio',
                '--safebrowsing-disable-auto-update',
                '--disable-client-side-phishing-detection',
                '--disable-hang-monitor',
                '--js-flags=--max-old-space-size=128',
            ]
        }
    });

    async function processBacklog() {
        console.log('📬 Revisando respuestas pendientes de leads anteriores...');
        for (const [chatId, lead] of Object.entries(sentLeads)) {
            try {
                const chat = await client.getChatById(chatId);
                const messages = await chat.fetchMessages({ limit: 20 });

                const lastReply = messages.reverse().find(m => !m.fromMe);
                if (!lastReply) continue;

                const texto = lastReply.body.trim().toLowerCase();
                console.log(`🔎 ${lead.name} respondió: "${texto}"`);

                if (texto === '1' || texto.includes('catálogo') || texto.includes('catalogo')) {
                    try {
                        const media = MessageMedia.fromFilePath(path.join(__dirname, 'Catalogo.pdf'));
                        await client.sendMessage(chatId, media, { caption: '¡Aquí está nuestro catálogo! Si tienes alguna pregunta, con gusto te ayudo. 🌞' });
                        await updateEstado(lead.spreadsheetId, lead.rowIndex, lead.statusCol, 'catálogo');
                        console.log(`📄 Catálogo enviado (backlog) a ${lead.name}`);
                    } catch (err) {
                        console.error(`❌ Error enviando catálogo a ${lead.name}: ${err.message}`);
                    }

                } else if (texto === '2' || texto.includes('cotización') || texto.includes('cotizacion')) {
                    await client.sendMessage(chatId, 'Perfecto 👍 para prepararte una cotización personalizada, ¿me puedes compartir estos datos?\n\n• Empresa\n• Página web de la empresa\n• Nombre y cargo\n• Email\n• Teléfono\n• Producto de interés\n• Cantidad aproximada\n\nCon eso te envío una propuesta lo antes posible 😊');
                    await updateEstado(lead.spreadsheetId, lead.rowIndex, lead.statusCol, 'cotización');
                    lead.waitingForDetails = true;
                    await saveSentLeads();
                    console.log(`💰 Cotización solicitada (backlog) por ${lead.name}`);

                } else if (texto === '3' || texto.includes('representante') || texto.includes('hablar')) {
                    await client.sendMessage(chatId, 'Perfecto, un representante de Inti Tech se pondrá en contacto contigo a la brevedad. ¡Muchas gracias por tu interés! 🌞');
                    await updateEstado(lead.spreadsheetId, lead.rowIndex, lead.statusCol, 'representante');
                    await client.sendMessage('18638453737@c.us', `MENSAJE DEL BOT: ${lead.name} quiere hablar con un representante. Número: ${chatId.replace('@c.us', '').replace('@lid', '')}`);
                    console.log(`👤 Representante solicitado (backlog) por ${lead.name}`);

                } else {
                    console.log(`⏭️  ${lead.name}: respuesta no reconocida ("${texto}"), se ignora`);
                }

                await new Promise(r => setTimeout(r, 2000));
            } catch (err) {
                console.error(`❌ Error procesando backlog de ${lead.name}: ${err.message}`);
            }
        }
        console.log('✅ Backlog procesado.');
    }

    async function checkAndSendLeads() {
        console.log('🔍 Revisando nuevos leads...');
        for (const spreadsheetId of SPREADSHEET_IDS) {
            try {
                const leads = await getNewLeads(spreadsheetId);
                console.log(`📋 ${leads.length} leads sin contactar en sheet ${spreadsheetId.slice(0, 8)}...`);

                for (const lead of leads) {
                    const name = lead['full name'] || 'estimado/a';
                    const phone = formatPhone(lead['phone'] || lead['Teléfono del Cliente']);
                    if (!phone) {
                        console.error(`❌ ${name}: número de teléfono inválido o vacío`);
                        continue;
                    }

                    const message = `Hola ${name} 👋 Soy el asistente virtual de *Maria Jesus de Inti Tech*.\n\nVi que mostraste interés en nuestras soluciones de limpieza solar y estoy aquí para ayudarte. ¿En qué puedo asistirte hoy?\n\n1️⃣ Ver catálogo\n2️⃣ Solicitar cotización\n3️⃣ Hablar con un representante`;

                    try {
                        console.log(`📞 Intentando número: ${phone}`);
                        const numberId = await client.getNumberId(phone.replace('@c.us', ''));
                        if (!numberId) {
                            console.error(`❌ ${name}: número no tiene WhatsApp (${phone})`);
                            await updateEstado(spreadsheetId, lead._rowIndex, lead._statusCol, 'Perdido');
                            continue;
                        }

                        await client.sendMessage(numberId._serialized, message);
                        await updateEstado(spreadsheetId, lead._rowIndex, lead._statusCol, 'bot');

                        sentLeads[numberId._serialized] = {
                            spreadsheetId,
                            rowIndex: lead._rowIndex,
                            statusCol: lead._statusCol,
                            name,
                            waitingForDetails: false
                        };
                        await saveSentLeads();

                        console.log(`✉️  Enviado a ${name} → marcado como bot`);
                        await new Promise(r => setTimeout(r, 3000));
                    } catch (err) {
                        console.error(`❌ Error con ${name}: ${err.message}`);
                    }
                }
            } catch (err) {
                console.error(`❌ Error al leer sheet ${spreadsheetId.slice(0, 8)}: ${err.message}`);
            }
        }
    }

    client.on('qr', (qr) => {
        currentQR = qr;
        console.log('Escanea este QR con tu WhatsApp Business:');
        console.log('👉 Abre tu URL de Railway + /qr en el navegador para ver el QR como imagen');
        qrcode.generate(qr, { small: true });
    });

    client.on('disconnected', (reason) => {
        console.log(`⚠️ Bot desconectado: ${reason}. Reconectando...`);
        client.initialize();
    });

    client.on('remote_session_saved', () => {
        console.log('✅ Sesión guardada en MongoDB!');
    });

    client.on('ready', async () => {
        console.log('✅ Bot conectado! Esperando 70s para guardar sesión en MongoDB...');
        await new Promise(r => setTimeout(r, 70000));
        console.log('▶️  Iniciando procesamiento de leads...');
        await processBacklog();
        await checkAndSendLeads();
        setInterval(checkAndSendLeads, CHECK_INTERVAL);
    });

    client.on('message', async (msg) => {
        if (msg.fromMe) return;

        const lead = sentLeads[msg.from];
        if (!lead) return;

        const texto = msg.body.trim().toLowerCase();

        if (lead.waitingForDetails) {
            await msg.reply('Gracias por los detalles. Un representante de Inti Tech te enviará la cotización a la brevedad. 🌞');
            await updateEstado(lead.spreadsheetId, lead.rowIndex, lead.statusCol, 'cotización recibida');
            lead.waitingForDetails = false;
            await saveSentLeads();
            console.log(`📋 Detalles de cotización recibidos de ${lead.name}`);
            return;
        }

        if (texto === '1' || texto.includes('catálogo') || texto.includes('catalogo')) {
            try {
                const media = MessageMedia.fromFilePath(path.join(__dirname, 'Catalogo.pdf'));
                await client.sendMessage(msg.from, media, { caption: '¡Aquí está nuestro catálogo! Si tienes alguna pregunta, con gusto te ayudo. 🌞' });
                await updateEstado(lead.spreadsheetId, lead.rowIndex, lead.statusCol, 'catálogo');
                console.log(`📄 Catálogo enviado a ${lead.name}`);
            } catch (err) {
                console.error(`❌ Error enviando catálogo: ${err.message}`);
            }

        } else if (texto === '2' || texto.includes('cotización') || texto.includes('cotizacion')) {
            await msg.reply('Perfecto 👍 para prepararte una cotización personalizada, ¿me puedes compartir estos datos?\n\n• Empresa\n• Página web de la empresa\n• Nombre y cargo\n• Email\n• Teléfono\n• Producto de interés\n• Cantidad aproximada\n\nCon eso te envío una propuesta lo antes posible 😊');
            await updateEstado(lead.spreadsheetId, lead.rowIndex, lead.statusCol, 'cotización');
            lead.waitingForDetails = true;
            await saveSentLeads();
            console.log(`💰 Cotización solicitada por ${lead.name}`);

        } else if (texto === '3' || texto.includes('representante') || texto.includes('hablar')) {
            await msg.reply('Perfecto, un representante de Inti Tech se pondrá en contacto contigo a la brevedad. ¡Muchas gracias por tu interés! 🌞');
            await updateEstado(lead.spreadsheetId, lead.rowIndex, lead.statusCol, 'representante');
            await client.sendMessage('18638453737@c.us', `MENSAJE DEL BOT: ${lead.name} quiere hablar con un representante. Número: ${msg.from.replace('@c.us', '')}`);
            console.log(`👤 Representante solicitado por ${lead.name}`);

        } else {
            await msg.reply('Por favor elige una opción:\n\n1️⃣ Ver catálogo\n2️⃣ Solicitar cotización\n3️⃣ Hablar con un representante');
        }
    });

    client.initialize();
}

main().catch(console.error);
