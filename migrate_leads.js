const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const SentLeadSchema = new mongoose.Schema({
    chatId: { type: String, unique: true },
    data: mongoose.Schema.Types.Mixed
});
const SentLeadModel = mongoose.model('SentLead', SentLeadSchema);

async function migrate() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Conectado a MongoDB');

    const file = path.join(__dirname, 'sent_leads.json');
    const sentLeads = JSON.parse(fs.readFileSync(file, 'utf8'));

    let count = 0;
    for (const [chatId, data] of Object.entries(sentLeads)) {
        await SentLeadModel.findOneAndUpdate({ chatId }, { chatId, data }, { upsert: true });
        count++;
    }

    console.log(`✅ ${count} leads migrados a MongoDB`);
    await mongoose.disconnect();
}

migrate().catch(console.error);
