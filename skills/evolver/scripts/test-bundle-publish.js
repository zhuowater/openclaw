#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { loadGenes, loadCapsules, readAllEvents } = require('../src/gep/assetStore');
const { exportEligibleCapsules, exportEligibleGenes } = require('../src/gep/a2a');
const { buildPublishBundle, buildHello, httpTransportSend } = require('../src/gep/a2aProtocol');

async function testBundlePublish() {
  const capsules = loadCapsules();
  const genes = loadGenes();
  const events = readAllEvents();
  
  const eligibleCapsules = exportEligibleCapsules({ capsules, events });
  const eligibleGenes = exportEligibleGenes({ genes });
  
  console.log(`Found ${eligibleCapsules.length} eligible Capsules, ${eligibleGenes.length} eligible Genes`);
  
  // Send hello
  const hello = buildHello({ geneCount: genes.length, capsuleCount: capsules.length });
  console.log('\n[1/2] Sending hello...');
  const helloRes = await httpTransportSend(hello);
  if (!helloRes.ok) {
    console.error('Hello failed:', helloRes.error);
    return;
  }
  console.log('✓ Hello successful');
  
  // Bundle publishing: each Capsule + its Gene
  console.log(`\n[2/2] Publishing bundles...`);
  for (const capsule of eligibleCapsules) {
    const geneId = capsule.gene;
    const gene = genes.find(g => g.id === geneId);
    
    if (!gene) {
      console.log(`✗ Capsule ${capsule.id}: Gene ${geneId} not found`);
      continue;
    }
    
    try {
      const bundleMsg = buildPublishBundle({ gene, capsule });
      const res = await httpTransportSend(bundleMsg);
      console.log(`✓ Bundle [${gene.id} + ${capsule.id}]:`, res.ok ? 'SUCCESS' : `FAILED - ${res.error}`);
      if (res.response) {
        console.log('  Response:', JSON.stringify(res.response, null, 2));
      }
    } catch (e) {
      console.log(`✗ Bundle failed:`, e.message);
    }
  }
  
  console.log('\n✓ Publish complete!');
}

testBundlePublish().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
