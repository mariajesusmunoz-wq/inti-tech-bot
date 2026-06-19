const { google } = require('googleapis');

const SPREADSHEET_ID = '1eo6jXUhBr_wGdUAI6Llh3MnO3T26jaqPZ-H6AEqPw_w';

async function deleteTestLead() {
    const auth = new google.auth.GoogleAuth({
        keyFile: 'credentials.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A:A',
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] && row[0].toString().includes('test lead'));

    if (rowIndex === -1) {
        console.log('No se encontró el test lead.');
        return;
    }

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
            requests: [{
                deleteDimension: {
                    range: {
                        sheetId: 0,
                        dimension: 'ROWS',
                        startIndex: rowIndex,
                        endIndex: rowIndex + 1
                    }
                }
            }]
        }
    });

    console.log(`✅ Test lead eliminado (fila ${rowIndex + 1})`);
}

deleteTestLead().catch(console.error);
