
const fs = require('fs');
const path = require('path');

const indexFile = 'PROJECT_INDEX.md';
const requiredFiles = [
    'server.js',
    'db.js',
    'ui.html',
    'schema.sql'
];

console.log('Verificando PROJECT_INDEX.md...');

if (!fs.existsSync(indexFile)) {
    console.error('Error: PROJECT_INDEX.md no existe.');
    process.exit(1);
}

const content = fs.readFileSync(indexFile, 'utf8');
let missing = false;

requiredFiles.forEach(file => {
    if (!content.includes(file)) {
        console.warn(`Advertencia: ${file} no está referenciado en PROJECT_INDEX.md`);
        missing = true;
    }
});

if (missing) {
    console.log('Por favor, actualiza PROJECT_INDEX.md.');
} else {
    console.log('PROJECT_INDEX.md parece estar actualizado.');
}
