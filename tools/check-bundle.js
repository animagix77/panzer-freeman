const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
if (html.length < 1000000 || /<script[^>]+src=/.test(html)) throw Error('Missing or externally dependent bundle');
let count=0;
for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) { new vm.Script(match[1]); count++; }
if (!count) throw Error('No embedded scripts');
for (const file of ['00_title','01_ashen_canyon','02_the_drowned_choir','03_citadel_hours','04_hour_sphinx','05_ending']) {
 if (!fs.existsSync(path.join(__dirname, '../sound', file+'.mp3'))) throw Error('Missing music: '+file);
}
console.log('Bundle parses; embedded scripts and all six music cues present.');
