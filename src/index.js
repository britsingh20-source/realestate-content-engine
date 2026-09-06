import fs from 'node:fs/promises';
import { runInvestmentMonitor, saveReport } from './investmentMonitor.js';
import { generateContentPack } from './geminiText.js';
import { sendContentPack, sendStatus } from './telegram.js';

async function loadJson(path) {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

async function main() {
  const config = await loadJson('config/investment.creators.json');
  const report = await runInvestmentMonitor(config);
  await saveReport(report);

  const actionable = report.candidates.filter(c => c.viralScore >= 80 || (c.confirmations >= 2 && c.source.outlier >= 2) || (c.source.outlier >= 5 && c.source.velocityRatio >= 3));

  if (!actionable.length) {
    console.log(`Scan complete: ${report.candidates.length} breakouts, none actionable.`);
    if (process.env.TELEGRAM_STATUS_MESSAGES === 'true') {
      await sendStatus(`Investment scan complete. ${report.candidates.length} breakout candidates; no prompt generated.`);
    }
    return;
  }

  const selected = actionable[0];
  const pack = await generateContentPack(selected);
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile('data/investment-content-pack.json', JSON.stringify({ generatedAt: new Date().toISOString(), candidate: selected, pack }, null, 2));
  await sendContentPack(selected, pack);
  console.log(`Generated and sent content pack for ${selected.source.url}`);
}

main().catch(async err => {
  console.error(err);
  try {
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) await sendStatus(`ERROR: ${err.message}`);
  } catch {}
  process.exitCode = 1;
});
