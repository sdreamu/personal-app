const fs = require('fs');
const target = process.argv[2];
const oldPath = process.argv[3];
const newPath = process.argv[4];
let s = fs.readFileSync(target, 'utf8');
const oldText = fs.readFileSync(oldPath, 'utf8');
const newText = fs.readFileSync(newPath, 'utf8');
if (oldText.trim() === '__APPEND__') {
  fs.writeFileSync(target, s.replace(/\s*$/, '\n') + newText, 'utf8');
  console.log('appended ' + target);
  process.exit(0);
}
if (!s.includes(oldText)) { console.error('OLD NOT FOUND in ' + target); process.exit(1); }
fs.writeFileSync(target, s.split(oldText).join(newText), 'utf8');
console.log('patched ' + target);
