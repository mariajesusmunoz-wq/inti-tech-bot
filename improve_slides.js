const { google } = require('googleapis');

const PRESENTATION_ID = '1G8IXomumpeT2qy0s2Cq64dCVtKD9m9-2MlohCz7z7lU';

const EVENTS_2026 = [
    { name: 'Intersolar & Energy Storage\nNorth America, Texas', dates: 'Sep 1-2, 2026' },
    { name: 'Energy Storage Summit, LATAM', dates: 'Oct 26-27, 2026' },
    { name: 'RE+ 26, USA', dates: 'Nov 16-19, 2026' },
    { name: 'Solar Panel Cleaning Convention, USA', dates: 'Nov 18-20, 2026' },
];

const EVENTS_2027 = [
    { name: 'IESNA Flagship, USA', dates: 'Feb 8-11, 2027' },
    { name: 'Energy Storage Australia', dates: 'Mar 9-10, 2027' },
    { name: 'RE+ Mexico', dates: 'Apr 20-22, 2027' },
];

const YELLOW = { red: 1.0, green: 0.84, blue: 0.0 };
const WHITE  = { red: 1.0, green: 1.0, blue: 1.0 };
const DARK   = { red: 0.08, green: 0.08, blue: 0.08 };
const CARD   = { red: 0.14, green: 0.14, blue: 0.14 };

function textBox(id, pageId, x, y, w, h) {
    return { createShape: { objectId: id, shapeType: 'TEXT_BOX',
        elementProperties: { pageObjectId: pageId,
            size: { width: { magnitude: w, unit: 'EMU' }, height: { magnitude: h, unit: 'EMU' } },
            transform: { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: 'EMU' }
        }
    }};
}

function rect(id, pageId, x, y, w, h, fillColor, borderColor) {
    const req = [{ createShape: { objectId: id, shapeType: 'RECTANGLE',
        elementProperties: { pageObjectId: pageId,
            size: { width: { magnitude: w, unit: 'EMU' }, height: { magnitude: h, unit: 'EMU' } },
            transform: { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: 'EMU' }
        }
    }}];
    const props = { shapeBackgroundFill: { solidFill: { color: { rgbColor: fillColor } } } };
    const fields = ['shapeBackgroundFill'];
    if (borderColor) {
        props.outline = { outlineFill: { solidFill: { color: { rgbColor: borderColor } } }, weight: { magnitude: 18000, unit: 'EMU' } };
        fields.push('outline');
    } else {
        props.outline = { propertyState: 'NOT_RENDERED' };
        fields.push('outline');
    }
    req.push({ updateShapeProperties: { objectId: id, shapeProperties: props, fields: fields.join(',') } });
    return req;
}

function setText(id, text) {
    return { insertText: { objectId: id, text } };
}

function styleText(id, size, color, bold, range) {
    return { updateTextStyle: { objectId: id,
        style: { bold, fontSize: { magnitude: size, unit: 'PT' }, foregroundColor: { opaqueColor: { rgbColor: color } }, fontFamily: 'Arial' },
        fields: 'bold,fontSize,foregroundColor,fontFamily',
        textRange: range || { type: 'ALL' }
    }};
}

function alignText(id, alignment) {
    return { updateParagraphStyle: { objectId: id,
        style: { alignment },
        fields: 'alignment',
        textRange: { type: 'ALL' }
    }};
}

async function main() {
    const auth = new google.auth.GoogleAuth({
        keyFile: 'credentials.json',
        scopes: ['https://www.googleapis.com/auth/presentations'],
    });
    const slides = google.slides({ version: 'v1', auth });

    const pres = await slides.presentations.get({ presentationId: PRESENTATION_ID });
    const slidesList = pres.data.slides;

    const targetSlide = slidesList[2];
    const slideId = targetSlide.objectId;

    const requests = [];

    // Delete existing elements
    if (targetSlide.pageElements) {
        for (const el of targetSlide.pageElements) {
            requests.push({ deleteObject: { objectId: el.objectId } });
        }
    }

    // Dark background
    requests.push({ updatePageProperties: { objectId: slideId,
        pageProperties: { pageBackgroundFill: { solidFill: { color: { rgbColor: DARK } } } },
        fields: 'pageBackgroundFill'
    }});

    const W = 9144000, H = 5143500;
    const colW = 4200000;
    const leftX = 200000;
    const rightX = W - colW - 200000;

    // Title
    requests.push(textBox('title', slideId, rightX, 150000, colW, 380000));
    requests.push(setText('title', 'FECHAS DE FERIAS'));
    requests.push(styleText('title', 26, YELLOW, true));
    requests.push(alignText('title', 'END'));

    // Yellow line under title
    requests.push(...rect('yellow_line', slideId, rightX, 570000, colW, 45000, YELLOW));

    // Year headers
    requests.push(textBox('h2026', slideId, leftX, 150000, 1500000, 400000));
    requests.push(setText('h2026', '2026'));
    requests.push(styleText('h2026', 36, YELLOW, true));

    requests.push(textBox('h2027', slideId, rightX, 150000, 1500000, 400000));
    requests.push(setText('h2027', '2027'));
    requests.push(styleText('h2027', 36, YELLOW, true));

    // Vertical divider
    requests.push(...rect('divider', slideId, W / 2 - 15000, 130000, 30000, H - 250000,
        { red: 0.3, green: 0.3, blue: 0.3 }));

    // Event cards
    const cardH = 820000;
    const gap = 120000;
    const startY = 620000;

    EVENTS_2026.forEach((ev, i) => {
        const y = startY + i * (cardH + gap);
        requests.push(...rect(`c26_${i}`, slideId, leftX, y, colW, cardH, CARD, YELLOW));
        requests.push(textBox(`n26_${i}`, slideId, leftX + 180000, y + 120000, colW - 250000, 420000));
        requests.push(setText(`n26_${i}`, ev.name));
        requests.push(styleText(`n26_${i}`, 13, WHITE, true));
        requests.push(textBox(`d26_${i}`, slideId, leftX + 180000, y + 540000, colW - 250000, 200000));
        requests.push(setText(`d26_${i}`, ev.dates));
        requests.push(styleText(`d26_${i}`, 12, YELLOW, false));
    });

    EVENTS_2027.forEach((ev, i) => {
        const y = startY + i * (cardH + gap);
        requests.push(...rect(`c27_${i}`, slideId, rightX, y, colW, cardH, CARD, YELLOW));
        requests.push(textBox(`n27_${i}`, slideId, rightX + 180000, y + 120000, colW - 250000, 420000));
        requests.push(setText(`n27_${i}`, ev.name));
        requests.push(styleText(`n27_${i}`, 13, WHITE, true));
        requests.push(textBox(`d27_${i}`, slideId, rightX + 180000, y + 540000, colW - 250000, 200000));
        requests.push(setText(`d27_${i}`, ev.dates));
        requests.push(styleText(`d27_${i}`, 12, YELLOW, false));
    });

    await slides.presentations.batchUpdate({
        presentationId: PRESENTATION_ID,
        requestBody: { requests }
    });

    console.log('Restaurado!');
    console.log(`Ver: https://docs.google.com/presentation/d/${PRESENTATION_ID}/edit`);
}

main().catch(err => {
    console.error('Error:', err.message);
    if (err.response && err.response.data) console.error(JSON.stringify(err.response.data, null, 2));
});
