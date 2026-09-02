const path = require('node:path');
const { chromium } = require('playwright');

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sourcePath = path.join(__dirname, 'figure-source.html');
const figures = [
  ['agent-scorecard', 'agent-scorecard.png'],
  ['evaluation-rubric', 'evaluation-rubric.png'],
  ['claim-matrix', 'claim-verification-matrix.png'],
  ['failure-pattern', 'truncated-search-failure-pattern.png'],
  ['private-review-proof', 'private-review-proof.png'],
  ['table-hierarchy-proof', 'nine-player-table-hierarchy.png'],
  ['disappearing-player', 'disappearing-player-sequence.png'],
];

(async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1760, height: 1400 }, deviceScaleFactor: 1 });
  await page.goto(`file://${sourcePath}`);
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));
  for (const [id, filename] of figures) {
    await page.locator(`#${id}`).screenshot({ path: path.join(__dirname, filename) });
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
