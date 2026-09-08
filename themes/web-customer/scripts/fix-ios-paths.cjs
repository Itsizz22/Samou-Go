const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../ios/App/CapApp-SPM/Package.swift');
fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('\\', '/'));
