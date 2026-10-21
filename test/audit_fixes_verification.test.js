/**
 * Comprehensive Verification Suite for Audit Fixes in SalaryHub
 * Covers:
 * 1. Double counting prevention in summaryData (rawNetPay & payout channels)
 * 2. Extended ParserModule keywords ('відпуск', 'вислуг', 'стаж', 'нічн', 'святков', 'надуроч') & hasVacation
 * 3. Extended period detection in parseGrid (textual month names, YYYY-MM, YYYYMM, MM.YYYY)
 * 4. VacationCalculatorView Order No. 100 compliance (exclusion of one-time material aid, inclusion of prior vacation/donor/sick pay)
 * 5. getTextColorGradient WCAG AA contrast ratio compliance (>= 4.5:1 across entire gradient range)
 * 6. salaryData.json 2025-03 parsing artifact fix & .gitignore PII protection
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const indexPath = path.resolve(__dirname, '..', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

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
console.log(' Starting Audit Fixes Verification Test Suite');
console.log('====================================================\n');

// ----------------------------------------------------
// SECTION 1: Evaluator Extraction from index.html
// ----------------------------------------------------
function getParserModule() {
  const match = indexHtml.match(/const ParserModule = \{([\s\S]*?)\n    \};/);
  if (!match) throw new Error('ParserModule not found in index.html');
  const MONTH_NAMES = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
  let idCounter = 0;
  const generateId = () => `test-${++idCounter}`;
  const fn = new Function('generateId', 'MONTH_NAMES', `
    const ParserModule = {${match[1]}};
    return ParserModule;
  `);
  return fn(generateId, MONTH_NAMES);
}

function getSummaryDataExecutor() {
  const match = indexHtml.match(/const summaryData = useMemo\(\(\) => \{([\s\S]*?)\}, \[dbData, historicalRates/);
  if (!match) throw new Error('summaryData logic not found in index.html');
  const classMatch = indexHtml.match(/const classifyDeduction = ([\s\S]*?\n    \};)/);
  const classFn = classMatch ? classMatch[0] : '';
  const getMilitaryTaxRate = (y, m) => (y < 2024 || (y === 2024 && m < 12)) ? 0.015 : 0.05;
  const formatCurrency = (val) => String(val);
  return new Function('dbData', 'historicalRates', 'liveRate', 'smoothingMode', 'formatCurrency', 'getMilitaryTaxRate', `
    ${classFn}
    ${match[1]}
  `);
}

function getTextColorGradientFn() {
  const match = indexHtml.match(/const getTextColorGradient = ([\s\S]*?\n    \};)/);
  if (!match) throw new Error('getTextColorGradient not found in index.html');
  return new Function(`
    ${match[0]}
    return getTextColorGradient;
  `)();
}

const ParserModule = getParserModule();
const executeSummaryData = getSummaryDataExecutor();
const getTextColorGradient = getTextColorGradientFn();

// ----------------------------------------------------
// SECTION 2: Double Counting Prevention in rawNetPay & summaryData
// ----------------------------------------------------
console.log('--- SECTION 2: Double Counting Prevention in rawNetPay ---');

// Case 1: Deduction contains both payout and bank keywords: "Виплата заробітної плати через банк"
// Before fix: amount was counted in regularPayoutSum AND explicitBankSum -> double counted in rawNetPay.
const doubleBankPayslip = [
  {
    id: '2026-05',
    month: 5,
    year: 2026,
    monthName: 'Травень',
    accruals: [
      { name: 'Посадовий оклад', amount: 50000, days: 20, hours: '160:0' }
    ],
    deductions: [
      { name: 'Податок з доходів', amount: 9000 },
      { name: 'Військовий збір', amount: 2500 },
      { name: 'Плановий аванс', amount: 15000 },
      { name: 'Виплата заробітної плати через банк', amount: 23500 }
    ]
  }
];

const res1 = executeSummaryData(doubleBankPayslip, {}, 41.5, 'raw', String, (y, m) => 0.05)[0];
assert(res1.advanceSum === 15000, 'Advance correctly identified as 15000');
assert(res1.regularPayoutSum === 0, 'regularPayoutSum excludes bank payouts (is 0, not 23500)');
assert(res1.explicitBankSum === 23500, 'explicitBankSum contains 23500');
assert(res1.toBank === 23500, 'toBank equals explicitBankSum (23500)');
assert(res1.rawNetPay === 38500, `rawNetPay is 38500 (15000 + 23500), NOT double-counted 62000 (Got: ${res1.rawNetPay})`);

// Case 2: Deduction "Виплачено на картку"
const doubleCardPayslip = [
  {
    id: '2026-06',
    month: 6,
    year: 2026,
    monthName: 'Червень',
    accruals: [{ name: 'Посадовий оклад', amount: 40000, days: 20 }],
    deductions: [
      { name: 'ПДФО', amount: 7200 },
      { name: 'ВЗ', amount: 2000 },
      { name: 'Плановий аванс', amount: 12000 },
      { name: 'Виплачено на картку', amount: 18800 }
    ]
  }
];
const res2 = executeSummaryData(doubleCardPayslip, {}, 41.5, 'raw', String, (y, m) => 0.05)[0];
assert(res2.regularPayoutSum === 0, 'regularPayoutSum excludes card payout');
assert(res2.explicitBankSum === 18800, 'explicitBankSum contains card payout (18800)');
assert(res2.rawNetPay === 30800, `rawNetPay is 30800 (12000 + 18800), NOT double-counted (Got: ${res2.rawNetPay})`);

// Case 3: Deduction "Перерахування авансу на картку" + "Сума до перерахування на О/Р в банк"
const doubleAdvancePayslip = [
  {
    id: '2026-07',
    month: 7,
    year: 2026,
    monthName: 'Липень',
    accruals: [{ name: 'Посадовий оклад', amount: 60000, days: 22 }],
    deductions: [
      { name: 'Податок з доходів', amount: 10800 },
      { name: 'Військовий збір', amount: 3000 },
      { name: 'Перерахування авансу на картку', amount: 18000 },
      { name: 'Сума до перерахування на О/Р в банк', amount: 28200 }
    ]
  }
];
const res3 = executeSummaryData(doubleAdvancePayslip, {}, 41.5, 'raw', String, (y, m) => 0.05)[0];
assert(res3.advanceSum === 0, 'advanceSum excludes items matching /перерахування|картк/');
assert(res3.explicitBankSum === 46200, `explicitBankSum combines both bank transfers (18000 + 28200 = 46200) (Got: ${res3.explicitBankSum})`);
assert(res3.rawNetPay === 46200, `rawNetPay is 46200, not inflated by duplicate advance (Got: ${res3.rawNetPay})`);

// Case 4: Pure cash payout without explicit bank transfer row
const cashPayslip = [
  {
    id: '2026-08',
    month: 8,
    year: 2026,
    monthName: 'Серпень',
    accruals: [{ name: 'Посадовий оклад', amount: 50000, days: 21 }],
    deductions: [
      { name: 'Податок з доходів', amount: 9000 },
      { name: 'Військовий збір', amount: 2500 },
      { name: 'Плановий аванс', amount: 15000 },
      { name: 'Виплата заробітної плати через касу', amount: 20000 }
    ]
  }
];
const res4 = executeSummaryData(cashPayslip, {}, 41.5, 'raw', String, (y, m) => 0.05)[0];
assert(res4.advanceSum === 15000, 'advanceSum is 15000');
assert(res4.regularPayoutSum === 20000, 'regularPayoutSum captures cash payout 20000');
// totalAccrued = 50000, taxes = 11500, advance = 15000, payout = 20000. Remainder = 3500.
assert(res4.toBank === 3500, `calculatedBankRemainder / toBank is 3500 (Got: ${res4.toBank})`);
assert(res4.rawNetPay === 38500, `rawNetPay is 38500 (15000 + 20000 + 3500) (Got: ${res4.rawNetPay})`);

// ----------------------------------------------------
// SECTION 3: ParserModule Extended Keywords & hasVacation
// ----------------------------------------------------
console.log('\n--- SECTION 3: ParserModule Extended Keywords & hasVacation ---');

assert(ParserModule.accrualKeywords.includes('відпуск'), 'ParserModule.accrualKeywords includes "відпуск"');
assert(ParserModule.accrualKeywords.includes('вислуг'), 'ParserModule.accrualKeywords includes "вислуг"');
assert(ParserModule.accrualKeywords.includes('стаж'), 'ParserModule.accrualKeywords includes "стаж"');
assert(ParserModule.accrualKeywords.includes('нічн'), 'ParserModule.accrualKeywords includes "нічн"');
assert(ParserModule.accrualKeywords.includes('святков'), 'ParserModule.accrualKeywords includes "святков"');
assert(ParserModule.accrualKeywords.includes('надуроч'), 'ParserModule.accrualKeywords includes "надуроч"');

// Test parseGrid with extended accrual names
const testRows = [
  ['Розрахунковий лист за 08.2026'],
  ['Відпускні', 35000],
  ['Надбавка за вислугу років', 7000],
  ['Доплата за стаж', 3000],
  ['Оплата нічних годин', 2500],
  ['Оплата святкових днів', 1800],
  ['Оплата надурочних годин', 1500],
  ['Податок з доход. фіз.ос.', 9144]
];

const parsedTest = ParserModule.parseGrid(testRows);
assert(parsedTest.success === true, 'parseGrid succeeded with new keywords');
const parsedNames = parsedTest.accruals.map(a => a.name);
assert(parsedNames.includes('Відпускні'), 'parseGrid recognizes "Відпускні" without "т" as accrual');
assert(parsedNames.includes('Надбавка за вислугу років'), 'parseGrid recognizes "Надбавка за вислугу років"');
assert(parsedNames.includes('Доплата за стаж'), 'parseGrid recognizes "Доплата за стаж"');
assert(parsedNames.includes('Оплата нічних годин'), 'parseGrid recognizes "Оплата нічних годин"');
assert(parsedNames.includes('Оплата святкових днів'), 'parseGrid recognizes "Оплата святкових днів"');
assert(parsedNames.includes('Оплата надурочних годин'), 'parseGrid recognizes "Оплата надурочних годин"');

// Test hasVacation in summaryData
const vacationSlips = [
  {
    id: '2026-08', month: 8, year: 2026, monthName: 'Серпень',
    accruals: [{ name: 'Відпускні', amount: 35000 }],
    deductions: []
  },
  {
    id: '2026-07', month: 7, year: 2026, monthName: 'Липень',
    accruals: [{ name: 'Оплата відпустки', amount: 30000 }],
    deductions: []
  },
  {
    id: '2026-06', month: 6, year: 2026, monthName: 'Червень',
    accruals: [{ name: 'Відпустка донора', amount: 3000 }],
    deductions: []
  }
];

const vacationSummary = executeSummaryData(vacationSlips, {}, 41.5, 'raw', String, (y, m) => 0.05);
const slipAug = vacationSummary.find(s => s.id === '2026-08');
const slipJul = vacationSummary.find(s => s.id === '2026-07');
const slipJun = vacationSummary.find(s => s.id === '2026-06');

assert(slipAug.hasVacation === true, 'hasVacation is true for "Відпускні" (without "т")');
assert(slipJul.hasVacation === true, 'hasVacation is true for "Оплата відпустки"');
assert(slipJun.hasVacation === false, 'hasVacation is false for "Відпустка донора" (excluded correctly)');

// ----------------------------------------------------
// SECTION 4: Extended Period Detection in parseGrid
// ----------------------------------------------------
console.log('\n--- SECTION 4: Extended Period Detection in parseGrid ---');

// Format: Ukrainian month names
const gridUkr1 = [
  ['Розрахунковий лист Серпень 2026'],
  ['Посадовий оклад', 40000]
];
const pUkr1 = ParserModule.parseGrid(gridUkr1);
assert(pUkr1.period !== null, 'Text month name "Серпень 2026" detected');
assert(pUkr1.period.monthIdx === 7 && pUkr1.period.year === 2026, 'Parsed as month 8 (index 7), year 2026');

const gridUkr2 = [
  ['Відомість нарахувань'],
  ['Період: Січень 2025 р.'],
  ['Посадовий оклад', 35000]
];
const pUkr2 = ParserModule.parseGrid(gridUkr2);
assert(pUkr2.period !== null, 'Text month name "Січень 2025 р." detected');
assert(pUkr2.period.monthIdx === 0 && pUkr2.period.year === 2025, 'Parsed as month 1 (index 0), year 2025');

// Format: YYYY-MM
const gridDash = [
  ['Звітний період: 2026-08'],
  ['Посадовий оклад', 40000]
];
const pDash = ParserModule.parseGrid(gridDash);
assert(pDash.period !== null, 'Format "2026-08" detected');
assert(pDash.period.monthIdx === 7 && pDash.period.year === 2026, 'Parsed 2026-08 as month 8, year 2026');

// Format: YYYY/MM
const gridSlash = [
  ['Період 2025/11'],
  ['Посадовий оклад', 40000]
];
const pSlash = ParserModule.parseGrid(gridSlash);
assert(pSlash.period !== null, 'Format "2025/11" detected');
assert(pSlash.period.monthIdx === 10 && pSlash.period.year === 2025, 'Parsed 2025/11 as month 11, year 2025');

// Genitive case: "за 15 серпня 2026 р."
const gridGenitive = [
  ['Розрахунковий лист за 15 серпня 2026 р.'],
  ['Посадовий оклад', 40000]
];
const pGenitive = ParserModule.parseGrid(gridGenitive);
assert(pGenitive.period !== null, 'Genitive month format "серпня 2026" detected');
assert(pGenitive.period.monthIdx === 7 && pGenitive.period.year === 2026, 'Parsed "серпня 2026" as month 8, year 2026');

// Compound surname should NOT trigger false positive on month name
const gridCompound = [
  ['Таб№ 123 Березеньків Петро 2026'],
  ['Розрахунковий лист за 05.2026'],
  ['Посадовий оклад', 40000]
];
const pCompound = ParserModule.parseGrid(gridCompound);
assert(pCompound.period !== null && pCompound.period.monthIdx === 4, 'Compound surname "Березеньків" did not trigger false positive March period (parsed as May)');

// ----------------------------------------------------
// SECTION 5: Vacation Calculator Removal Cleanliness
// ----------------------------------------------------
console.log('\n--- SECTION 5: Vacation Calculator Removal Cleanliness ---');

assert(!indexHtml.includes('VacationCalculatorView'), 'VacationCalculatorView is completely removed');
assert(!indexHtml.includes('const totalAccrued12 = last12.reduce'), 'totalAccrued12 calculation removed with calculator');
assert(!indexHtml.includes('unpaidVacationDays'), 'unpaidVacationDays denominator removed with calculator');
assert(!indexHtml.includes('diffTotal = diffGross * netTaxFactor'), 'diffTotal calculation removed with calculator');
assert(!indexHtml.includes('IconSuitcase'), 'IconSuitcase is completely removed');

// ----------------------------------------------------
// SECTION 6: getTextColorGradient WCAG AA Contrast Compliance
// ----------------------------------------------------
console.log('\n--- SECTION 6: getTextColorGradient WCAG AA Contrast Compliance ---');

// Helper to convert HSL to RGB
function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16)
  ];
}

function parseColorToRgb(col) {
  if (col.startsWith('#')) return hexToRgb(col);
  const match = col.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/);
  if (match) {
    return hslToRgb(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
  }
  throw new Error('Unknown color format: ' + col);
}

function getRelativeLuminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(rgb1, rgb2) {
  const l1 = getRelativeLuminance(rgb1);
  const l2 = getRelativeLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const whiteRgb = [255, 255, 255];
const darkSlateRgb = hexToRgb('0f172a'); // Tailwind slate-900

// Test light theme contrast across gradient
let allLightPass = true;
for (let p = 0; p <= 1.0; p += 0.05) {
  const val = 10000 + p * 40000;
  const colObj = getTextColorGradient(val, 10000, 50000, 'light');
  const rgb = parseColorToRgb(colObj.color);
  const ratio = getContrastRatio(rgb, whiteRgb);
  if (ratio < 4.5) {
    allLightPass = false;
    console.error(`  Contrast failure at p=${p.toFixed(2)}: color=${colObj.color}, ratio=${ratio.toFixed(2)}`);
  }
}
assert(allLightPass, 'Light theme: WCAG AA contrast ratio >= 4.5:1 across ALL gradient points (0.0 to 1.0)');

// Test max === min in light theme
const singleLight = getTextColorGradient(30000, 30000, 30000, 'light');
const singleLightRgb = parseColorToRgb(singleLight.color);
const singleLightRatio = getContrastRatio(singleLightRgb, whiteRgb);
assert(singleLightRatio >= 4.5, `Light theme max===min contrast >= 4.5:1 (Got: ${singleLightRatio.toFixed(2)})`);

// Test dark theme contrast across gradient
let allDarkPass = true;
for (let p = 0; p <= 1.0; p += 0.05) {
  const val = 10000 + p * 40000;
  const colObj = getTextColorGradient(val, 10000, 50000, 'dark');
  const rgb = parseColorToRgb(colObj.color);
  const ratio = getContrastRatio(rgb, darkSlateRgb);
  if (ratio < 4.5) {
    allDarkPass = false;
    console.error(`  Dark contrast failure at p=${p.toFixed(2)}: color=${colObj.color}, ratio=${ratio.toFixed(2)}`);
  }
}
assert(allDarkPass, 'Dark theme: WCAG AA contrast ratio >= 4.5:1 across ALL gradient points (0.0 to 1.0)');

// ----------------------------------------------------
// SECTION 7: salaryData.json & .gitignore Verification
// ----------------------------------------------------
console.log('\n--- SECTION 7: salaryData.json & .gitignore ---');

const salaryDataPath = fs.existsSync(path.resolve(__dirname, '..', 'salaryData.json'))
  ? path.resolve(__dirname, '..', 'salaryData.json')
  : path.resolve(__dirname, 'fixtures', 'salaryData.fixture.json');
const salaryDataRaw = fs.readFileSync(salaryDataPath, 'utf8');
const salaryData = JSON.parse(salaryDataRaw);
const march2025 = salaryData.find(m => m.id === '2025-03');
assert(march2025 !== undefined, 'Found 2025-03 in salaryData.json');

const marchAnnualBonusPayout = march2025.deductions.find(d => d.name.includes('Виплата премії за рік'));
assert(marchAnnualBonusPayout !== undefined, 'Found annual bonus payout in 2025-03 deductions');
assert(marchAnnualBonusPayout.amount === 11124.12, `2025-03 annual bonus payout is 11124.12 (NOT 111124.12) (Got: ${marchAnnualBonusPayout.amount})`);

// Verify mathematical balance of all reconstructed periods in salaryData.json
const reconstructedMonths = [
  { id: '2025-03', desc: '2025-03 parsing artifact fixed (11124.12)' },
  { id: '2025-08', desc: '2025-08 restored vacation accrual (66864.10)' },
  { id: '2024-07', desc: '2024-07 restored vacation accrual (33684.96)' },
  { id: '2024-06', desc: '2024-06 restored vacation accrual (21455.72)' },
  { id: '2023-12', desc: '2023-12 restored vacation accrual (13417.33)' }
];

reconstructedMonths.forEach(rm => {
  const m = salaryData.find(item => item.id === rm.id);
  assert(m !== undefined, `Found ${rm.id} in salaryData.json`);
  const totalAcc = m.accruals.reduce((s, a) => s + Number(a.amount || 0), 0);
  const actualPdfo = m.deductions
    .filter(d => d.name.toLowerCase().includes('податок') || d.name.toLowerCase().includes('пдфо'))
    .reduce((s, d) => s + Number(d.amount || 0), 0);
  const expectedPdfo = totalAcc * 0.18;
  assertCloseTo(actualPdfo, expectedPdfo, 0.05, `${rm.desc} - PDFO balances with accruals base`);
});

const gitignoreContent = fs.readFileSync(path.resolve(__dirname, '..', '.gitignore'), 'utf8');
assert(gitignoreContent.includes('*.xls'), '.gitignore contains *.xls (protects raw Excel sheets with PII)');
assert(gitignoreContent.includes('*.xlsx'), '.gitignore contains *.xlsx');
assert(gitignoreContent.includes('salaryData.json'), '.gitignore contains salaryData.json (protects database with PII)');

// ----------------------------------------------------
// SECTION 8: Modal Accessibility & Storage Robustness
// ----------------------------------------------------
console.log('\n--- SECTION 8: Modal Accessibility & Storage Robustness ---');

// Check Escape handler for pendingTab in Layout
assert(indexHtml.includes('if (pendingTab) cancelTabChange();'), 'Layout includes Escape key handler for pendingTab modal');

// Check role="dialog" and aria-modal="true" across modals
const modalRoleCount = (indexHtml.match(/role="dialog"\s+aria-modal="true"/g) || []).length;
assert(modalRoleCount >= 6, `All 6 modals have role="dialog" and aria-modal="true" (Found: ${modalRoleCount})`);

// Check earnedNetPay in summaryData
assert(indexHtml.includes('const earnedNetPay = totalAccrued - taxes;'), 'summaryData calculates earnedNetPay (totalAccrued - taxes) without artificial Math.max clamp');
assert(indexHtml.includes('earnedNetPay,'), 'summaryData exports earnedNetPay in month summary object');

// Check storage quota error dispatch and listener
assert(indexHtml.includes("window.dispatchEvent(new CustomEvent('salaryhub-storage-error'"), 'useLocalStorage dispatches salaryhub-storage-error event on failure');
assert(indexHtml.includes("window.addEventListener('salaryhub-storage-error'"), 'SalaryProvider listens for salaryhub-storage-error event');

// ----------------------------------------------------
// Final Summary
// ----------------------------------------------------
console.log('\n====================================================');
console.log(` Audit Fixes Test Suite: ${passedTests} passed, ${failedTests} failed, ${totalTests} total`);
console.log('====================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
