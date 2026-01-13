/**
 * Repair Script: Fix Corrupted Gene Recessives in tavern_heroes
 * 
 * The original decodeStatGenesLocal() had the gene order WRONG:
 * - Old (wrong): [D, R1, R2, R3] extraction order
 * - New (correct): [R3, R2, R1, D] extraction order
 * 
 * This script re-decodes stat_genes for all rows and fixes the *_r1/_r2/_r3 columns.
 * 
 * Usage:
 *   node src/etl/ingestion/repairGenes.js [batchSize] [maxRows]
 *   
 *   Examples:
 *     node src/etl/ingestion/repairGenes.js           # Process all, batch 500
 *     node src/etl/ingestion/repairGenes.js 200       # Batch size 200
 *     node src/etl/ingestion/repairGenes.js 200 1000  # Process max 1000 rows
 */

import { db } from '../../../server/db.js';
import { sql } from 'drizzle-orm';

const KAI_ALPHABET = '123456789abcdefghijkmnopqrstuvwx';

function kaiToId(kaiChar) {
  return KAI_ALPHABET.indexOf(kaiChar);
}

function decodeStatGenesCorrect(statGenes) {
  if (!statGenes) return null;
  
  const genesBigInt = BigInt(statGenes);
  let kaiString = '';
  let temp = genesBigInt;
  for (let i = 0; i < 48; i++) {
    kaiString = KAI_ALPHABET[Number(temp % 32n)] + kaiString;
    temp = temp / 32n;
  }
  
  const extractGeneSet = (start) => ({
    r3: kaiString[start],       // Position 0 = R3 (least significant)
    r2: kaiString[start + 1],   // Position 1 = R2
    r1: kaiString[start + 2],   // Position 2 = R1
    d: kaiString[start + 3]     // Position 3 = D (most significant/dominant)
  });
  
  return {
    class: extractGeneSet(0),
    subClass: extractGeneSet(4),
    profession: extractGeneSet(8),
    passive1: extractGeneSet(12),
    passive2: extractGeneSet(16),
    active1: extractGeneSet(20),
    active2: extractGeneSet(24),
    statBoost1: extractGeneSet(28),
    statBoost2: extractGeneSet(32),
    element: extractGeneSet(36)
  };
}

async function repairGenes(batchSize = 500, maxRows = null) {
  console.log('='.repeat(60));
  console.log('GENE REPAIR SCRIPT - Fixing corrupted recessive columns');
  console.log('='.repeat(60));
  console.log(`Batch size: ${batchSize}, Max rows: ${maxRows || 'unlimited'}`);
  console.log('');
  
  let processed = 0;
  let updated = 0;
  let errors = 0;
  let mismatches = 0;
  let offset = 0;
  
  const startTime = Date.now();
  
  while (true) {
    const limitClause = maxRows 
      ? Math.min(batchSize, maxRows - processed) 
      : batchSize;
    
    if (limitClause <= 0) break;
    
    const result = await db.execute(sql`
      SELECT hero_id, stat_genes, 
             main_class_r1, main_class_r2, main_class_r3,
             sub_class_r1, sub_class_r2, sub_class_r3,
             active1_r1, active1_r2, active1_r3,
             active2_r1, active2_r2, active2_r3,
             passive1_r1, passive1_r2, passive1_r3,
             passive2_r1, passive2_r2, passive2_r3
      FROM tavern_heroes 
      WHERE genes_status = 'complete' AND stat_genes IS NOT NULL
      ORDER BY hero_id
      OFFSET ${offset}
      LIMIT ${limitClause}
    `);
    
    const rows = Array.isArray(result) ? result : (result.rows || []);
    
    if (rows.length === 0) {
      console.log('No more rows to process.');
      break;
    }
    
    for (const row of rows) {
      try {
        const decoded = decodeStatGenesCorrect(row.stat_genes);
        if (!decoded) {
          errors++;
          continue;
        }
        
        const newR1Class = String(kaiToId(decoded.class.r1));
        const newR2Class = String(kaiToId(decoded.class.r2));
        const newR3Class = String(kaiToId(decoded.class.r3));
        
        const newR1SubClass = String(kaiToId(decoded.subClass.r1));
        const newR2SubClass = String(kaiToId(decoded.subClass.r2));
        const newR3SubClass = String(kaiToId(decoded.subClass.r3));
        
        const newR1Active1 = String(kaiToId(decoded.active1.r1));
        const newR2Active1 = String(kaiToId(decoded.active1.r2));
        const newR3Active1 = String(kaiToId(decoded.active1.r3));
        
        const newR1Active2 = String(kaiToId(decoded.active2.r1));
        const newR2Active2 = String(kaiToId(decoded.active2.r2));
        const newR3Active2 = String(kaiToId(decoded.active2.r3));
        
        const newR1Passive1 = String(kaiToId(decoded.passive1.r1));
        const newR2Passive1 = String(kaiToId(decoded.passive1.r2));
        const newR3Passive1 = String(kaiToId(decoded.passive1.r3));
        
        const newR1Passive2 = String(kaiToId(decoded.passive2.r1));
        const newR2Passive2 = String(kaiToId(decoded.passive2.r2));
        const newR3Passive2 = String(kaiToId(decoded.passive2.r3));
        
        const hasClassMismatch = row.main_class_r1 !== newR1Class || 
                                  row.main_class_r2 !== newR2Class || 
                                  row.main_class_r3 !== newR3Class;
        
        const hasSkillMismatch = row.active1_r1 !== newR1Active1 ||
                                  row.passive1_r1 !== newR1Passive1;
        
        if (hasClassMismatch || hasSkillMismatch) {
          mismatches++;
        }
        
        await db.execute(sql`
          UPDATE tavern_heroes SET
            main_class_r1 = ${newR1Class},
            main_class_r2 = ${newR2Class},
            main_class_r3 = ${newR3Class},
            sub_class_r1 = ${newR1SubClass},
            sub_class_r2 = ${newR2SubClass},
            sub_class_r3 = ${newR3SubClass},
            active1_r1 = ${newR1Active1},
            active1_r2 = ${newR2Active1},
            active1_r3 = ${newR3Active1},
            active2_r1 = ${newR1Active2},
            active2_r2 = ${newR2Active2},
            active2_r3 = ${newR3Active2},
            passive1_r1 = ${newR1Passive1},
            passive1_r2 = ${newR2Passive1},
            passive1_r3 = ${newR3Passive1},
            passive2_r1 = ${newR1Passive2},
            passive2_r2 = ${newR2Passive2},
            passive2_r3 = ${newR3Passive2}
          WHERE hero_id = ${row.hero_id}
        `);
        
        updated++;
      } catch (err) {
        console.error(`Error processing hero ${row.hero_id}:`, err.message);
        errors++;
      }
      
      processed++;
    }
    
    offset += rows.length;
    
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = Math.round(processed / elapsed);
    console.log(`Progress: ${processed} processed, ${updated} updated, ${mismatches} had mismatches, ${errors} errors (${rate}/sec)`);
    
    if (maxRows && processed >= maxRows) break;
  }
  
  const totalElapsed = (Date.now() - startTime) / 1000;
  
  console.log('');
  console.log('='.repeat(60));
  console.log('REPAIR COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total processed: ${processed}`);
  console.log(`Total updated: ${updated}`);
  console.log(`Mismatches found: ${mismatches}`);
  console.log(`Errors: ${errors}`);
  console.log(`Time elapsed: ${totalElapsed.toFixed(1)} seconds`);
  console.log('');
  
  return { processed, updated, mismatches, errors };
}

const batchSize = parseInt(process.argv[2]) || 500;
const maxRows = process.argv[3] ? parseInt(process.argv[3]) : null;

repairGenes(batchSize, maxRows)
  .then(result => {
    console.log('Script finished successfully.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
  });
