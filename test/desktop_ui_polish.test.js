/**
 * Automated Verification Suite for Desktop UI/UX Polish
 * Verifies all 5 items from docs/superpowers/plans/2026-10-14-ui-ux-desktop-polish.md
 * and ORIGINAL_SPEC.
 * 
 * Run with: node test/desktop_ui_polish.test.js
 */

const fs = require('fs');
const path = require('path');

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

console.log('\n--- AREA 1: Native SVG Icons & Emoji Elimination ---');

// 1. Icon definitions
assert(!indexHtml.includes('const IconSuitcase = () =>'), 'IconSuitcase component removed');
assert(indexHtml.includes('const IconLightbulb = () =>'), 'IconLightbulb component defined');
assert(indexHtml.includes('const IconPalmtree = () =>'), 'IconPalmtree component defined');

// Verify SVG structure for the new icons
const lightbulbSvgMatch = indexHtml.match(/const IconLightbulb = \(\) => (<svg[\s\S]*?<\/svg>);/);
assert(lightbulbSvgMatch !== null, 'IconLightbulb contains valid SVG markup');
if (lightbulbSvgMatch) {
  assert(lightbulbSvgMatch[1].includes('stroke="currentColor"'), 'IconLightbulb uses stroke="currentColor"');
  assert(lightbulbSvgMatch[1].includes('viewBox="0 0 24 24"'), 'IconLightbulb has standard 24x24 viewBox');
}

const palmtreeSvgMatch = indexHtml.match(/const IconPalmtree = \(\) => (<svg[\s\S]*?<\/svg>);/);
assert(palmtreeSvgMatch !== null, 'IconPalmtree contains valid SVG markup');
if (palmtreeSvgMatch) {
  assert(palmtreeSvgMatch[1].includes('stroke="currentColor"'), 'IconPalmtree uses stroke="currentColor"');
  assert(palmtreeSvgMatch[1].includes('viewBox="0 0 24 24"'), 'IconPalmtree has standard 24x24 viewBox');
}

// 2. Strict emoji elimination checks
assert(!indexHtml.includes('🧳'), 'No raw suitcase emoji (🧳) anywhere in index.html');
assert(!indexHtml.includes('💡'), 'No raw lightbulb emoji (💡) anywhere in index.html');
assert(!indexHtml.includes('🌴'), 'No raw palmtree emoji (🌴) anywhere in index.html');

// 3. Confirm SVG usage in target components & vacation calculator removal
assert(
  !indexHtml.includes('Калькулятор відпустки'),
  'Navigation vacation tab is completely removed'
);

assert(
  indexHtml.includes('<div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0"><IconLightbulb /></div>'),
  'PayslipView monthly insights uses <IconLightbulb />'
);

assert(
  indexHtml.includes('<div className="p-2 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-xl shrink-0"><IconPalmtree /></div>'),
  'PayslipView vacation card uses <IconPalmtree />'
);

assert(
  !indexHtml.includes('Розрахувати вигідність наступної відпустки'),
  'PayslipView vacation button is completely removed'
);

assert(
  !indexHtml.includes('Як премії впливають на вигідність?'),
  'VacationCalculatorView tip header is removed'
);

assert(
  !indexHtml.includes('VacationCalculatorView'),
  'VacationCalculatorView component is completely removed'
);

assert(
  indexHtml.includes('<span className="text-xl animate-bounce text-amber-400 shrink-0"><IconLightbulb /></span>'),
  'AddPayslipView import hint uses <IconLightbulb />'
);

console.log('\n--- AREA 2: Dashboard KPI Typography & Segmented Controls ---');

// KPI typography
assert(
  indexHtml.includes('<h3 className="text-3xl font-black font-mono tabular-nums tracking-tight text-blue-600 dark:text-blue-400"><AnimatedNumber value={avgEarnedUAH} currency="UAH" /></h3>'),
  'KPI average income UAH heading has font-mono tabular-nums tracking-tight'
);

assert(
  indexHtml.includes('<span className="text-lg font-bold font-mono tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400">~ <AnimatedNumber value={avgEarnedForeign} currency={\'USD\'} /></span>'),
  'KPI average income foreign span has font-mono tabular-nums tracking-tight'
);

// Segmented Control harmonization
assert(
  indexHtml.includes('bg-white dark:bg-slate-800 shadow-sm text-slate-900 dark:text-white font-bold'),
  'Segmented controls use unified active premium card styling (bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold)'
);

assert(
  indexHtml.includes('text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-medium'),
  'Segmented controls use unified inactive styling (text-slate-500 dark:text-slate-400 font-medium)'
);

// Smoothing modes do not use clashing colored backdrops (amber/indigo)
assert(
  !indexHtml.includes('bg-indigo-50 dark:bg-indigo-900/30 shadow-sm text-indigo-700 dark:text-indigo-400'),
  'Smoothing mode buttons have removed clashing indigo background'
);
assert(
  !indexHtml.includes('bg-amber-50 dark:bg-amber-900/30 shadow-sm text-amber-700 dark:text-amber-400'),
  'Smoothing mode buttons have removed clashing amber background'
);

// Chart mode buttons have accent dots
assert(
  indexHtml.includes("chartMode === 'income' && <span className=\"w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0\"></span>"),
  "Chart mode 'income' active button displays emerald accent dot"
);
assert(
  indexHtml.includes("chartMode === 'bonus' && <span className=\"w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0\"></span>"),
  "Chart mode 'bonus' active button displays purple accent dot"
);
assert(
  indexHtml.includes("chartMode === 'hourly' && <span className=\"w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0\"></span>"),
  "Chart mode 'hourly' active button displays cyan accent dot"
);

console.log('\n--- AREA 3: Vacation Calculator Range Slider Clean Removal ---');

// Confirm slider styles and scale markings removed cleanly
assert(
  !indexHtml.includes('input[type=range]'),
  'CSS input[type=range] slider styles removed cleanly from <style>'
);
assert(
  !indexHtml.includes('setVacationDays'),
  'Visual scale markings and setVacationDays removed with VacationCalculatorView'
);

console.log('\n--- AREA 4: Quick Import & Data Safety ---');

// Textarea height
assert(
  indexHtml.includes('className="flex-1 h-36 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700 text-slate-800 dark:text-slate-200 rounded-xl p-3'),
  'AddPayslipView textarea height increased to h-36'
);

// Navigation clear database separation
assert(
  indexHtml.includes('Небезпечна зона'),
  'Navigation includes "Небезпечна зона" micro-label separating destructive action'
);
assert(
  indexHtml.includes('text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400'),
  'Clear database button styled as muted cautious action (text-slate-400 hover:text-rose-600)'
);

console.log('\n====================================================');
console.log(` Polish Test Suite Complete: ${passedTests} passed, ${failedTests} failed, ${totalTests} total`);
console.log('====================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
