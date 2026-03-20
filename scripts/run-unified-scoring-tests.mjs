import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const execFileAsync = promisify(execFile);

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'staceyreply-tests-'));
try {
  const tsconfigPath = path.join(tempDir, 'tsconfig.json');
  await writeFile(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'CommonJS',
        moduleResolution: 'Node',
        outDir: './out',
        rootDir: path.resolve('.'),
        esModuleInterop: true,
        skipLibCheck: true,
        strict: false,
      },
      files: [
        path.resolve('src/types/domain.ts'),
        path.resolve('src/utils/nyDate.ts'),
        path.resolve('src/aggregation/timeframe.ts'),
        path.resolve('src/validation/datasetValidation.ts'),
        path.resolve('src/strategy/engine.ts'),
      ],
    }),
  );
  await execFileAsync('tsc', ['-p', tsconfigPath], { cwd: path.resolve('.') });

  const outfile = path.join(tempDir, 'out', 'src', 'strategy', 'engine.js');
  const mod = createRequire(import.meta.url)(outfile);
  const evaluateUnifiedSignalDayStrategy = mod.evaluateUnifiedSignalDayStrategy;

  const base = (overrides = {}) => ({
    templateType: 'FGD',
    template: 'FGD',
    direction: 'long',
    d1: undefined,
    d2: undefined,
    tradeGroup: [{}],
    session: [{}],
    five: [],
    ema5: [],
    sourceBar: { low: 1.1, high: 1.101 },
    sourcePrice: 1.1,
    sourceLocationLabel: 'LOD / LOS / low-side LHF zone',
    stopHuntBar: { close: 1.1005 },
    peakBar: { low: 1.099 },
    engulfmentBar: undefined,
    pinBar: undefined,
    pattern123Ready: true,
    emaConfirmBar: { close: 1.1015, time: '2026-01-01T12:00:00-05:00' },
    entryBar: { close: 1.1015, time: '2026-01-01T12:00:00-05:00' },
    entryPrice: 1.1015,
    stopPrice: 1.1002,
    stopDistancePips: 13,
    previousClose: 1.1008,
    sourceToPrevClosePips: 8,
    sessionLabel: 'newYorkSession',
    d1BodyPips: 20,
    d1BodyPctRange: 40,
    insideDay: false,
    firstHourTouchedPrevClose: false,
    roundNumberConfluence: false,
    strikeZoneConfluence: true,
    immediateFollowThrough: true,
    ...overrides,
  });

  const fgdBaseline = evaluateUnifiedSignalDayStrategy(base());
  const fgdStrong = evaluateUnifiedSignalDayStrategy(base({ d1BodyPips: 45, d1BodyPctRange: 70 }));
  assert.ok(fgdStrong.score > fgdBaseline.score, 'FGD + strong body should score higher than baseline');

  const frdBase = evaluateUnifiedSignalDayStrategy(base({
    templateType: 'FRD', template: 'FRD', direction: 'short', sourceLocationLabel: 'HOD / HOS / high-side LHF zone', sourceToPrevClosePips: 12,
  }));
  const frdPrevClose5 = evaluateUnifiedSignalDayStrategy(base({
    templateType: 'FRD', template: 'FRD', direction: 'short', sourceLocationLabel: 'HOD / HOS / high-side LHF zone', sourceToPrevClosePips: 5,
  }));
  assert.ok(frdPrevClose5.score >= frdBase.score + 10, 'FRD prev close <= 5 should score significantly higher');

  const frdInside = evaluateUnifiedSignalDayStrategy(base({
    templateType: 'FRD_INSIDE', template: 'FRD_INSIDE', direction: 'short', insideDay: true, sourceLocationLabel: 'HOD / HOS / high-side LHF zone', sourceToPrevClosePips: 5, firstHourTouchedPrevClose: true,
  }));
  assert.ok(frdInside.score >= frdPrevClose5.score, 'FRD_INSIDE + prev close <= 5 should be among the highest scores');

  const noStopHunt = evaluateUnifiedSignalDayStrategy(base({ stopHuntBar: undefined, d1BodyPips: 45, d1BodyPctRange: 70, firstHourTouchedPrevClose: true, roundNumberConfluence: true }));
  assert.ok(noStopHunt.entryAllowed, 'Stop hunt absent should still allow entry when hard gates pass and score >= 75');

  const fgdPrevClose5 = evaluateUnifiedSignalDayStrategy(base({ templateType: 'FGD', template: 'FGD', direction: 'long', sourceToPrevClosePips: 5 }));
  assert.ok(frdPrevClose5.score > fgdPrevClose5.score, 'Previous close should influence FRD more than FGD');

  const hardGateFail = evaluateUnifiedSignalDayStrategy(base({ stopDistancePips: 25, d1BodyPips: 45, d1BodyPctRange: 70, firstHourTouchedPrevClose: true, roundNumberConfluence: true }));
  assert.ok(!hardGateFail.entryAllowed, 'Hard gate failure should block entry even with high score');

  const lowScore = evaluateUnifiedSignalDayStrategy(base({
    stopHuntBar: undefined,
    pattern123Ready: false,
    strikeZoneConfluence: false,
    immediateFollowThrough: false,
    roundNumberConfluence: false,
    d1BodyPips: 10,
    d1BodyPctRange: 20,
    sourceToPrevClosePips: 30,
  }));
  assert.ok(lowScore.hardGates.every((gate) => gate.passed), 'All hard gates should still pass in low-score case');
  assert.ok(lowScore.score < 75 && !lowScore.entryAllowed, 'Score below 75 should block entry even if hard gates pass');

  console.log('Unified scoring tests passed.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
