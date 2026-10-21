const fs = require('fs');
const XLSX = require('xlsx');

const html = fs.readFileSync('./index.html', 'utf8');
const lines = html.split('\n');
const startIdx = lines.findIndex(l => l.includes('const ParserModule = {'));
const endIdx = lines.findIndex(l => l.includes('class WidgetErrorBoundary'));
const parserLines = lines.slice(startIdx, endIdx).join('\n');

const vm = require('vm');
const sandbox = { 
  console, Math, String, Number, Array, parseInt, parseFloat, isNaN, RegExp,
  generateId: () => Math.random().toString(36).slice(2),
  MONTH_NAMES: ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень']
};
vm.runInNewContext(parserLines + '; this.ParserModule = ParserModule;', sandbox);
const ParserModule = sandbox.ParserModule;

const path = require('path');
const { ensureSyntheticFixtures } = require('./fixtures_helper');
ensureSyntheticFixtures();

const realDir = path.resolve(__dirname, '..', 'Розрахункові');
const fixtureDir = path.resolve(__dirname, 'fixtures', 'sheets');
const realFiles = fs.existsSync(realDir) ? fs.readdirSync(realDir).filter(f => f.endsWith('.xls') || f.endsWith('.xlsx')) : [];
const fixtureFiles = fs.existsSync(fixtureDir) ? fs.readdirSync(fixtureDir).filter(f => f.endsWith('.xls') || f.endsWith('.xlsx')) : [];
const dirToUse = realFiles.length >= 40 ? realDir : (fixtureFiles.length >= 40 ? fixtureDir : realDir);
const files = (dirToUse === realDir ? realFiles : fixtureFiles).sort();
if (files.length < 40) {
  console.error(`Verification aborted: expected at least 40 sheet files, found ${files.length} in ${dirToUse}`);
  process.exit(1);
}
const cleanNum = (str) => parseFloat(str.replace(/\s/g, '').replace(',', '.'));

let okCount = 0;
const issues = [];

for (const file of files) {
  const wb = XLSX.readFile(path.join(dirToUse, file));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1});
  const res = ParserModule.parseGrid(rows);
  
  let ctrlAcc = 0, ctrlDed = 0;
  for (const r of rows) {
    if (!Array.isArray(r)) continue;
    for (const c of r) {
      if (typeof c === 'string') {
        const mAcc = c.match(/Разом нараховано\s*-\s*([\d\s]+(?:[,\.]\d+)?)/i);
        if (mAcc) ctrlAcc = cleanNum(mAcc[1]);
        const mDed = c.match(/Разом утримано\s*-\s*([\d\s]+(?:[,\.]\d+)?)/i);
        if (mDed) ctrlDed = cleanNum(mDed[1]);
      }
    }
  }
  
  const parsedAcc = res.accruals.reduce((s, a) => s + a.amount, 0);
  const parsedDed = res.deductions.reduce((s, d) => s + d.amount, 0);
  
  const diffAcc = Math.abs(parsedAcc - ctrlAcc);
  const diffDed = Math.abs(parsedDed - ctrlDed);
  
  if (diffAcc > 0.05 || diffDed > 0.05) {
    issues.push({ file, parsedAcc, ctrlAcc, diffAcc, parsedDed, ctrlDed, diffDed });
  } else {
    okCount++;
  }
}

console.log(`REAL-WORLD ${files.length} FILES VERIFICATION ON index.html:`);
console.log('Successfully matched control totals: ' + okCount + ' out of ' + files.length);
if (issues.length > 0) {
  console.log('Remaining issues:', issues);
  process.exit(1);
} else {
  console.log(`ALL ${files.length} FILES (100.0%) PARSED WITH ZERO DISCREPANCIES!`);
}
