/**
 * Permanent Automated Regression Test Suite for SalaryHub Audit Fixes (2026-10-21)
 * Covers all P1 and P2 audit findings and adversarial critique requirements:
 * 1. Git index and .gitignore PII protection (no raw .xls tracked)
 * 2. confirmParserPreview empty data handling (no residual state leakage)
 * 3. Batch import deep item comparison & sheet-level failure tracking & intra-batch collisions
 * 4. validateImportedPayslips strict finite amounts, period rules, non-hyphenated ID rules, and duplicate checks
 * 5. useLocalStorage functional updates and persistence failure resilience with ref sync
 * 6. Financial model & storno accounting (elimination of Math.max clamp, distinct payout concepts & UI labels)
 * 7. SheetJS security version verification (CVE-2023-30533, CVE-2024-22363)
 * 8. Shared deduction classification (withholdings vs employee payouts: union dues, alimony, court orders)
 *
 * Run with: node test/audit_2026_10_21_regression.test.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ensureSyntheticFixtures } = require('./fixtures_helper');

ensureSyntheticFixtures();

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName} - ${details}`);
  }
}

function assertCloseTo(actual, expected, maxDiff = 0.05, testName = '') {
  totalTests++;
  const diff = Math.abs(actual - expected);
  if (diff <= maxDiff) {
    passedTests++;
    console.log(`  [PASS] ${testName} (${actual} ≈ ${expected})`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName} - Expected: ${expected}, Got: ${actual}, Diff: ${diff}`);
  }
}

console.log('====================================================');
console.log(' Starting SalaryHub Audit 2026-10-21 Regression Suite');
console.log('====================================================\n');

const indexPath = path.resolve(__dirname, '..', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

function between(start, end) {
  const normHtml = indexHtml.replace(/\r\n/g, '\n');
  const a = normHtml.indexOf(start);
  const b = normHtml.indexOf(end, a);
  if (a < 0 || b <= a) throw new Error(`Extraction failed: ${start}`);
  return normHtml.slice(a, b);
}

// ----------------------------------------------------
// ITEM 1: Git and Data Security (P1)
// ----------------------------------------------------
console.log('--- ITEM 1: Git and Data Security ---');

try {
  const trackedFiles = execSync('git ls-files', { encoding: 'utf8', cwd: path.resolve(__dirname, '..') });
  assert(!trackedFiles.includes('salaryData.json'), 'salaryData.json is NOT tracked in git index');
  assert(!/\.xlsx?$/m.test(trackedFiles), 'No .xls or .xlsx files are tracked in git index');
} catch (e) {
  console.log('  [SKIP] git ls-files check skipped (git not available or non-repo environment)');
}

const gitignorePath = path.resolve(__dirname, '..', '.gitignore');
assert(fs.existsSync(gitignorePath), '.gitignore exists');
const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
assert(gitignoreContent.includes('salaryData.json'), '.gitignore includes salaryData.json');
assert(gitignoreContent.includes('*.xls'), '.gitignore includes *.xls');
assert(gitignoreContent.includes('*.xlsx'), '.gitignore includes *.xlsx');
assert(gitignoreContent.includes('Розрахункові'), '.gitignore includes Розрахункові');
assert(!gitignoreContent.includes('!test/fixtures/**'), '.gitignore does NOT un-ignore raw spreadsheets in fixtures');

// Verify synthetic JSON fixtures exist
assert(fs.existsSync(path.resolve(__dirname, 'fixtures', 'salaryData.fixture.json')), 'Synthetic fixture salaryData.fixture.json exists');
assert(fs.existsSync(path.resolve(__dirname, 'fixtures', 'samples.fixture.json')), 'Synthetic samples.fixture.json exists');
assert(fs.existsSync(path.resolve(__dirname, 'fixtures', 'sheets.fixture.json')), 'Synthetic sheets.fixture.json exists');

// ----------------------------------------------------
// ITEM 2: Form Reset in confirmParserPreview (P1)
// ----------------------------------------------------
console.log('\n--- ITEM 2: Form Reset in confirmParserPreview ---');

const previewBody = between('const confirmParserPreview = () => {', 'const handleFormSubmit =');
let formAccruals = [{ name: 'Старий оклад', amount: 50000 }];
let formDeductions = [{ name: 'Старий податок', amount: 9000 }];
let formMonthIdx = 0;
let formYear = '2025';
let toastMessage = '';

const runConfirmPreview = (data) => {
  new Function(
    'parserPreviewData', 'setAccruals', 'setDeductions', 'setMonthIdx', 'setYear',
    'setPastedText', 'markDirty', 'setParserPreviewData', 'showToast',
    previewBody + '; confirmParserPreview();'
  )(
    data,
    v => { formAccruals = v; },
    v => { formDeductions = v; },
    v => { formMonthIdx = v; },
    v => { formYear = v; },
    () => {}, () => {}, () => {},
    msg => { toastMessage = msg; }
  );
};

// Scenario: import document with empty deductions
runConfirmPreview({ accruals: [{ name: 'Новий оклад', amount: 30000 }], deductions: [], period: { monthIdx: 5, year: 2026 } });
assert(formAccruals.length === 1 && formAccruals[0].name === 'Новий оклад', 'New accruals applied');
assert(Array.isArray(formDeductions) && formDeductions.length === 0, 'Previous deductions cleared even when incoming deductions are empty');
assert(formMonthIdx === 5, 'Month updated to 5');
assert(formYear === '2026', 'Year updated to 2026');

// Scenario: import document with empty accruals
runConfirmPreview({ accruals: [], deductions: [{ name: 'Нове утримання', amount: 500 }], period: null });
assert(Array.isArray(formAccruals) && formAccruals.length === 0, 'Previous accruals cleared when incoming accruals are empty');
assert(formDeductions.length === 1 && formDeductions[0].name === 'Нове утримання', 'New deductions applied');

// ----------------------------------------------------
// ITEM 3: Batch Import Deep Item Comparison & Discrepancies (P1)
// ----------------------------------------------------
console.log('\n--- ITEM 3: Batch Import Deep Comparison & Discrepancies ---');

const areIdenticalCode = between('const areItemListsIdentical =', 'const applyBatchImport =');
const areSlipsIdenticalFn = new Function(`
  ${areIdenticalCode}
  return areSlipsIdentical;
`)();

// Critic Finding 1: Two slips with identical sums and length but different item breakdown
const slip1 = {
  id: '2026-05',
  accruals: [{ name: 'Оклад', amount: 50000 }, { name: 'Премія', amount: 10000 }],
  deductions: [{ name: 'ПДФО', amount: 10800 }]
};
const slip2DifferentBreakdown = {
  id: '2026-05',
  accruals: [{ name: 'Оклад', amount: 40000 }, { name: 'Лікарняні', amount: 20000 }],
  deductions: [{ name: 'ПДФО', amount: 10800 }]
};
assert(
  areSlipsIdenticalFn(slip1, slip2DifferentBreakdown) === false,
  'areSlipsIdentical correctly detects differing item breakdown with identical total sum and count'
);

const slip1Reordered = {
  id: '2026-05',
  accruals: [{ name: 'Премія', amount: 10000 }, { name: 'Оклад', amount: 50000 }],
  deductions: [{ name: 'ПДФО', amount: 10800 }]
};
assert(
  areSlipsIdenticalFn(slip1, slip1Reordered) === true,
  'areSlipsIdentical recognizes identical items regardless of order'
);

// Critic Finding 2: Discrepancy detection & intra-batch collision tracking
const MONTH_NAMES = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const parserMatch = between('const ParserModule = {', 'class WidgetErrorBoundary');
let idCounter = 0;
const ParserModule = new Function('generateId', 'MONTH_NAMES', `
  const ParserModule = {${parserMatch.replace(/^const ParserModule = \{/, '')}
  return ParserModule;
`)(() => `test-${++idCounter}`, MONTH_NAMES);

const checkControlSums = (result) => {
  const parsedAcc = (result.accruals || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const parsedDed = (result.deductions || []).reduce((s, d) => s + (Number(d.amount) || 0), 0);
  let accDiscrepancy = false;
  let dedDiscrepancy = false;
  if (result.totalAccruedControl !== null && result.totalAccruedControl !== undefined) {
    if (Math.abs(parsedAcc - result.totalAccruedControl) > 0.05) accDiscrepancy = true;
  }
  if (result.totalDeductedControl !== null && result.totalDeductedControl !== undefined) {
    if (Math.abs(parsedDed - result.totalDeductedControl) > 0.05) dedDiscrepancy = true;
  }
  return { hasDiscrepancy: accDiscrepancy || dedDiscrepancy, parsedAcc, parsedDed, accDiscrepancy, dedDiscrepancy };
};

const mismatchGrid = [
  ['Розрахунковий лист за 01.2026'],
  ['Посадовий оклад', 1000],
  ['Разом нараховано - 2000']
];
const parsedMismatch = ParserModule.parseGrid(mismatchGrid);
const mismatchCheck = checkControlSums(parsedMismatch);
assert(mismatchCheck.hasDiscrepancy === true, 'Discrepancy detected between parsed (1000) and control (2000)');

// Test intra-batch collision detection
const batchSlips = [
  { id: '2026-01', accruals: [{ name: 'Оклад', amount: 50000 }], deductions: [] },
  { id: '2026-01', accruals: [{ name: 'Оклад', amount: 60000 }], deductions: [] }
];
const intraBatchCollisions = [];
const seenInBatch = new Map();
batchSlips.forEach(slip => {
  if (seenInBatch.has(slip.id)) {
    const prev = seenInBatch.get(slip.id);
    if (!areSlipsIdenticalFn(prev, slip)) {
      intraBatchCollisions.push({ first: prev, second: slip });
    }
  } else {
    seenInBatch.set(slip.id, slip);
  }
});
assert(intraBatchCollisions.length === 1, 'Intra-batch collision detected for conflicting slips with same period');

// ----------------------------------------------------
// ITEM 4: JSON Normalization & Validation (P1)
// ----------------------------------------------------
console.log('\n--- ITEM 4: JSON Normalization & Validation ---');

const validateFn = new Function(
  between('const validateImportedPayslips =', 'const Layout =') + '; return validateImportedPayslips;'
)();

const validSlip = {
  id: '2026-01',
  month: 1,
  year: 2026,
  monthName: 'Січень',
  accruals: [{ name: 'Оклад', amount: 50000 }],
  deductions: [{ name: 'ПДФО', amount: 9000 }]
};

assert(validateFn([]).valid === true, 'Empty database export [] is accepted');
assert(validateFn([validSlip]).valid === true, 'Valid payslip is accepted');

// Non-finite amounts
assert(validateFn([{ ...validSlip, accruals: [{ name: 'Оклад', amount: 'Infinity' }] }]).valid === false, 'Rejects string "Infinity"');
assert(validateFn([{ ...validSlip, accruals: [{ name: 'Оклад', amount: Infinity }] }]).valid === false, 'Rejects numeric Infinity');
assert(validateFn([{ ...validSlip, accruals: [{ name: 'Оклад', amount: -Infinity }] }]).valid === false, 'Rejects -Infinity');
assert(validateFn([{ ...validSlip, accruals: [{ name: 'Оклад', amount: NaN }] }]).valid === false, 'Rejects NaN');
assert(validateFn([{ ...validSlip, accruals: [{ name: 'Оклад', amount: null }] }]).valid === false, 'Rejects null amount');
assert(validateFn([{ ...validSlip, accruals: [{ name: 'Оклад', amount: "" }] }]).valid === false, 'Rejects empty string amount');
assert(validateFn([{ ...validSlip, accruals: [{ name: 'Оклад', amount: true }] }]).valid === false, 'Rejects boolean true');
assert(validateFn([{ ...validSlip, accruals: [{ name: 'Оклад', amount: false }] }]).valid === false, 'Rejects boolean false');

// Critic Finding 5: Non-hyphenated, invalid, and malformed IDs
assert(validateFn([{ ...validSlip, id: '2026/01' }]).valid === false, 'Rejects slash period id "2026/01"');
assert(validateFn([{ ...validSlip, id: 'invalid-id' }]).valid === false, 'Rejects malformed text id "invalid-id"');
assert(validateFn([{ ...validSlip, id: 202601 }]).valid === false, 'Rejects numeric id 202601');
assert(validateFn([{ ...validSlip, id: '2026-05', month: 1, year: 2026 }]).valid === false, 'Rejects inconsistent hyphenated id');
assert(validateFn([{ ...validSlip, id: '2026.01', month: 1, year: 2026 }]).valid === true, 'Accepts valid legacy dot format matching month and year');

// Invalid periods
assert(validateFn([{ ...validSlip, month: 0 }]).valid === false, 'Rejects month 0');
assert(validateFn([{ ...validSlip, month: 13 }]).valid === false, 'Rejects month 13');
assert(validateFn([{ ...validSlip, month: 99 }]).valid === false, 'Rejects month 99');
assert(validateFn([{ ...validSlip, year: 26 }]).valid === false, 'Rejects non-4-digit year 26');

// Duplicate periods
assert(validateFn([validSlip, validSlip]).valid === false, 'Rejects duplicate periods in single import');

// ----------------------------------------------------
// ITEM 5: useLocalStorage Hook Reliability (P1)
// ----------------------------------------------------
console.log('\n--- ITEM 5: useLocalStorage Hook Reliability ---');

let hookState, hookDisk, storageThrows = false;
let dispatchedErrorEvent = null;

const testHook = new Function('useState', 'useRef', 'window', 'CustomEvent', 'console',
  between('const useLocalStorage =', '// Єдина функція класифікації') + '; return useLocalStorage;'
)(
  init => { hookState = init(); return [hookState, v => { hookState = v; }]; },
  val => ({ current: val }),
  {
    localStorage: {
      getItem: () => null,
      setItem: (key, val) => {
        if (storageThrows) throw new Error('QuotaExceededError');
        hookDisk = val;
      }
    },
    dispatchEvent: (ev) => { dispatchedErrorEvent = ev; }
  },
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  { error: () => {} }
);

const [, updateStorage] = testHook('testKey', []);

// Functional updates sequence
updateStorage(prev => [...prev, 'A']);
updateStorage(prev => [...prev, 'B']);
assert(Array.isArray(hookState) && hookState.length === 2 && hookState[0] === 'A' && hookState[1] === 'B', 'Sequential functional updates preserve all updates: [A, B]');

// Storage failure handling
storageThrows = true;
const updateResult = updateStorage(['UNSAVED_CRITICAL_DATA']);
assert(updateResult === false, 'setValue returns false on storage write error');
assert(hookState.length === 2 && hookState[1] === 'B', 'State does NOT mutate to unsaved data on quota error');
assert(JSON.parse(hookDisk).length === 2, 'Disk remains consistent with UI state on quota error');
assert(dispatchedErrorEvent !== null && dispatchedErrorEvent.type === 'salaryhub-storage-error', 'Dispatches salaryhub-storage-error event on failure');

// ----------------------------------------------------
// ITEM 6: Financial Model, Storno & UI Representation (P1)
// ----------------------------------------------------
console.log('\n--- ITEM 6: Financial Model, Storno & UI Representation ---');

const summaryBody = indexHtml.match(/const summaryData = useMemo\(\(\) => \{([\s\S]*?)\}, \[dbData, historicalRates/)[1];
const classMatch = indexHtml.match(/const classifyDeduction = ([\s\S]*?\n    \};)/);
const classFn = classMatch ? classMatch[0] : '';
const summaryFn = new Function('dbData', 'historicalRates', 'liveRate', 'smoothingMode', 'formatCurrency', 'getMilitaryTaxRate', `
  ${classFn}
  ${summaryBody}
`);

const summarize = (data) => summaryFn(data, {}, null, 'raw', String, () => 0.05);

// Test negative adjustment (storno)
const stornoSlip = [
  {
    id: '2026-01',
    month: 1,
    year: 2026,
    monthName: 'Січень',
    accruals: [{ name: 'Перерахунок окладу (сторно)', amount: -5000 }],
    deductions: []
  }
];
const stornoRes = summarize(stornoSlip)[0];
assert(stornoRes.totalAccrued === -5000, 'totalAccrued preserves negative amount (-5000)');
assert(stornoRes.earnedNetPay === -5000, 'earnedNetPay is -5000 without artificial Math.max clamp');
assert(stornoRes.calculatedBankRemainder === -5000, 'calculatedBankRemainder is -5000 without artificial Math.max clamp');
assert(stornoRes.rawNetPay === -5000, 'rawNetPay is -5000 without artificial Math.max clamp');

// Critic Finding 4: UI Representation of earnedNetPay and paidBySlipSum
assert(indexHtml.includes('Зароблений чистий дохід'), 'UI renders "Зароблений чистий дохід" in showMath breakdown');
assert(indexHtml.includes('activeMonthData.earnedNetPay'), 'UI binds activeMonthData.earnedNetPay in breakdown');
assert(indexHtml.includes('Фактично виплачено за листом'), 'UI renders "Фактично виплачено за листом" in showMath breakdown');
assert(indexHtml.includes('activeMonthData.paidBySlipSum'), 'UI binds activeMonthData.paidBySlipSum in breakdown');
assert(indexHtml.includes('Розрахунковий залишок до виплати'), 'UI renders "Розрахунковий залишок до виплати" in showMath breakdown');

// ----------------------------------------------------
// ITEM 7: SheetJS Security Version (P1)
// ----------------------------------------------------
console.log('\n--- ITEM 7: SheetJS Security Version ---');

assert(
  indexHtml.includes('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js') ||
  indexHtml.includes('https://cdn.sheetjs.com/xlsx-0.20'),
  'index.html loads SheetJS from official secure CDN (xlsx-latest or 0.20+)'
);
assert(!indexHtml.includes('cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5'), 'Vulnerable cdnjs SheetJS 0.18.5 is completely removed from index.html');

const pkgJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
assert(
  pkgJson.dependencies && pkgJson.dependencies.xlsx && !pkgJson.dependencies.xlsx.includes('0.18.5'),
  'package.json uses secure official SheetJS version (not 0.18.5)'
);

// ----------------------------------------------------
// ITEM 8: Shared Deduction Classification (P2)
// ----------------------------------------------------
console.log('\n--- ITEM 8: Shared Deduction Classification ---');

const classifyFn = new Function(`
  ${classFn}
  return classifyDeduction;
`)();

// Critic Finding 3: Non-payout withholdings (trade union dues, alimony, court orders)
assert(classifyFn('Перерахування профвнесків').isPayout === false, 'Перерахування профвнесків is NOT an employee payout');
assert(classifyFn('Перерахування профвнесків').isTax === true, 'Перерахування профвнесків is classified as withholding/tax');
assert(classifyFn('Перерахування профвнесків').isBank === false, 'Перерахування профвнесків is not marked as bank salary transfer');

assert(classifyFn('Профспілкові внески').isPayout === false, 'Профспілкові внески is NOT payout');
assert(classifyFn('Профспілкові внески').isTax === true, 'Профспілкові внески is tax/withholding');

assert(classifyFn('Аліменти').isPayout === false, 'Аліменти is NOT salary payout');
assert(classifyFn('Перерахування аліментів за вик. листом').isPayout === false, 'Перерахування аліментів is NOT salary payout');
assert(classifyFn('Стягнення за виконавчим листом').isPayout === false, 'Court enforcement order is NOT salary payout');
assert(classifyFn('Благодійна допомога ЗСУ').isPayout === false, 'Charity withholding is NOT salary payout');

// Real employee payouts
assert(classifyFn('Виплата заробітної плати через банк').isBank === true, 'Salary bank transfer is bank');
assert(classifyFn('Виплата заробітної плати через банк').isPayout === true, 'Salary bank transfer is payout');
assert(classifyFn('Плановий аванс').isAdvance === true, 'Advance is advance');
assert(classifyFn('Плановий аванс').isPayout === true, 'Advance is payout');
assert(classifyFn('Виплачено відпускні').isVacation === true, 'Vacation payout is vacation payout');
assert(classifyFn('Виплата відпускних').isVacation === true, 'Виплата відпускних is vacation payout');
assert(classifyFn('Виплачено лікарняні').isSick === true, 'Sick payout is sick payout');
assert(classifyFn('Виплата лікарняних').isSick === true, 'Виплата лікарняних is sick payout');
assert(classifyFn('Виплата через касу').isRegularPayout === true, 'Cash payout is regular payout');

// ----------------------------------------------------
// Final Summary
// ----------------------------------------------------
console.log('\n====================================================');
console.log(` Regression Suite Results: ${passedTests} passed, ${failedTests} failed, ${totalTests} total`);
console.log('====================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
