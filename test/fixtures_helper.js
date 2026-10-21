const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function ensureSyntheticFixtures() {
  const samplesJsonPath = path.resolve(__dirname, 'fixtures', 'samples.fixture.json');
  const samplesDir = path.resolve(__dirname, 'fixtures', 'samples');
  if (fs.existsSync(samplesJsonPath)) {
    if (!fs.existsSync(samplesDir)) fs.mkdirSync(samplesDir, { recursive: true });
    const samplesData = JSON.parse(fs.readFileSync(samplesJsonPath, 'utf8'));
    for (const [fileName, rows] of Object.entries(samplesData)) {
      const targetPath = path.join(samplesDir, fileName);
      if (!fs.existsSync(targetPath)) {
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        XLSX.writeFile(wb, targetPath);
      }
    }
  }

  const sheetsJsonPath = path.resolve(__dirname, 'fixtures', 'sheets.fixture.json');
  const sheetsDir = path.resolve(__dirname, 'fixtures', 'sheets');
  if (fs.existsSync(sheetsJsonPath)) {
    if (!fs.existsSync(sheetsDir)) fs.mkdirSync(sheetsDir, { recursive: true });
    const sheetsData = JSON.parse(fs.readFileSync(sheetsJsonPath, 'utf8'));
    for (const [fileName, rows] of Object.entries(sheetsData)) {
      const targetPath = path.join(sheetsDir, fileName);
      if (!fs.existsSync(targetPath)) {
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        XLSX.writeFile(wb, targetPath);
      }
    }
  }
}

module.exports = { ensureSyntheticFixtures };
