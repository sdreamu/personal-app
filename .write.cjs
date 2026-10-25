const fs = require('fs');
fs.writeFileSync(process.argv[2], fs.readFileSync(process.argv[3], 'utf8'), 'utf8');
console.log('wrote ' + process.argv[2]);
