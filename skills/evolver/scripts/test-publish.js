#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { loadGenes, loadCapsules, readAllEvents } = require('../src/gep/assetStore');
const { exportEligibleCapsules, exportEligibleGenes } = require('../src/gep/a2a');
const { buildPublish, buildHello, buildPublishBundle, httpTransportSend } = require('../src/gep/a2aProtocol');

async function testPublish() {
  const capsules = loadCapsules();
  const genes = loadGenes();
  const events = readAllEvents();
  
  const eligibleCapsules = exportEligibleCapsules({ capsules, events });
  const eligibleGenes = exportEligibleGenes({ genes });
  
  console.log(`Found ${eligibleCapsules.length} eligible Capsules, ${eligibleGenes.length} eligible Genes`);
  
  // Send hello
  const hello = buildHello({ geneCount: genes.length, capsuleCount: capsules.length });
  console.log('\n[1/3] Sending hello...');
  const helloRes = await httpTransportSend(hello);
  console.log('Hello result:', JSON.stringify(helloRes, null, 2));
  
  // Send capsules
  console.log(`\n[2/3] Publishing ${eligibleCapsules.length} Capsules...`);
  for (const capsule of eligibleCapsules) {
    const msg = buildPublish({ asset: capsule });
    const res = await httpTransportSend(msg);
    console.log(`Capsule ${capsule.id}:`, res.ok ? '✓' : '✗', res.error || '');
  }
  
  // Send genes
  console.log(`\n[3/3] Publishing ${eligibleGenes.length} Genes...`);
  for (const gene of eligibleGenes) {
    const msg = buildPublish({ asset: gene });
    const res = await httpTransportSend(msg);
    console.log(`Gene ${gene.id}:`, res.ok ? '✓' : '✗', res.error || '');
  }
  
  console.log('\n✓ Publish complete!');
}

testPublish().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
