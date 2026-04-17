import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
console.log('require:', pdf);
console.log('type:', typeof pdf);
console.log('keys:', Object.keys(pdf));
