#!/usr/bin/env node
/**
 * Report 34 "Assembly Segment of PC" (ECI) transposes the top two candidates for
 * Odisha Jajpur (OD-08) vs the gazetted Lok Sabha 2024 result.
 * Apply official totals / ranking + SC reservation metadata.
 *
 * Run after: scripts/rebuild-pc-2024-from-eci-segment-xls.py
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OD2024 = path.join(__dirname, '../public/data/elections/pc/OD/2024.json');

function scaleVotes(oldVotes, targetSum, oldSum) {
  const scaled = oldVotes.map((v) => Math.floor((v * targetSum) / oldSum));
  let drift = targetSum - scaled.reduce((a, b) => a + b, 0);
  scaled[scaled.indexOf(Math.max(...scaled))] += drift;
  return scaled;
}

function scaleAc(oldArr, newTotal) {
  const oldSum = oldArr.reduce((a, b) => a + b, 0);
  const scaled = oldArr.map((v) => Math.round((v * newTotal) / oldSum));
  let drift = newTotal - scaled.reduce((a, b) => a + b, 0);
  scaled[scaled.indexOf(Math.max(...scaled))] += drift;
  return scaled;
}

function main() {
  const data = JSON.parse(fs.readFileSync(OD2024, 'utf8'));
  const pc = data['OD-08'];
  if (!pc) {
    console.error('OD-08 missing');
    process.exit(1);
  }
  const validVotes = pc.validVotes;
  const bjd = pc.candidates.find((c) => c.party === 'BJD');
  const bjp = pc.candidates.find((c) => c.party === 'BJP');
  if (!bjd || !bjp) {
    console.error('OD-08: missing BJD or BJP candidate');
    process.exit(1);
  }

  const newBjp = 534239;
  const newBjd = 532652;
  const others = pc.candidates.filter((c) => c.party !== 'BJD' && c.party !== 'BJP');
  const oldOthersSum = others.reduce((s, c) => s + c.votes, 0);
  const newOthersSum = validVotes - newBjp - newBjd;
  const newOv = scaleVotes(
    others.map((c) => c.votes),
    newOthersSum,
    oldOthersSum
  );
  others.forEach((c, i) => {
    c.votes = newOv[i];
    c.voteShare = Math.round((newOv[i] / validVotes) * 10000) / 100;
  });

  others.forEach((cand, ci) => {
    const oldRowSum = cand.acWiseVotes.reduce((s, x) => s + x.votes, 0);
    const newRowVotes = newOv[ci];
    const factor = newRowVotes / oldRowSum;
    let row = cand.acWiseVotes.map((x) => Math.round(x.votes * factor));
    let drift = newRowVotes - row.reduce((a, b) => a + b, 0);
    row[row.indexOf(Math.max(...row))] += drift;
    cand.acWiseVotes.forEach((ac, j) => {
      ac.votes = row[j];
    });
  });

  const bjpNewAc = scaleAc(
    bjp.acWiseVotes.map((x) => x.votes),
    newBjp
  );
  const bjdNewAc = scaleAc(
    bjd.acWiseVotes.map((x) => x.votes),
    newBjd
  );

  bjp.votes = newBjp;
  bjd.votes = newBjd;
  bjp.voteShare = Math.round((newBjp / validVotes) * 10000) / 100;
  bjd.voteShare = Math.round((newBjd / validVotes) * 10000) / 100;
  bjp.position = 1;
  bjd.position = 2;
  bjp.margin = newBjp - newBjd;
  delete bjd.margin;
  bjp.acWiseVotes.forEach((ac, i) => {
    ac.votes = bjpNewAc[i];
  });
  bjd.acWiseVotes.forEach((ac, i) => {
    ac.votes = bjdNewAc[i];
  });

  const nCand = pc.candidates.length;
  const nAc = bjp.acWiseVotes.length;
  for (let j = 0; j < nAc; j++) {
    let acTotal = 0;
    for (let i = 0; i < nCand; i++) {
      acTotal += pc.candidates[i].acWiseVotes[j].votes;
    }
    for (let i = 0; i < nCand; i++) {
      const v = pc.candidates[i].acWiseVotes[j].votes;
      pc.candidates[i].acWiseVotes[j].voteShare =
        Math.round((v / acTotal) * 10000) / 100;
    }
  }

  pc.candidates = [bjp, bjd, ...others];
  pc.constituencyType = 'SC';
  pc.type = 'SC';

  fs.writeFileSync(OD2024, JSON.stringify(data, null, 2) + '\n');
  console.log('Updated OD-08 Jajpur (BJP winner, SC), totals reconciled.');
}

main();
