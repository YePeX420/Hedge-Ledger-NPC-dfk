import { analyzeCurrentAssignments } from './garden-analyzer.js';
import { optimizeHeroAssignments, calculateImprovement } from './garden-optimizer.js';
import { formatSummaryMessage, formatCurrentGardens, formatOptimizedGardens } from './report-formatter.js';
import { getCachedPoolAnalytics, isCacheReady } from './pool-cache.js';

const WALLET_ADDRESS = '0x1a9f02011c917482345b86f2c879bce988764098';

async function waitForCache(maxWaitSec = 300) {
  console.log('⏳ Waiting for pool cache to be ready...');
  const startTime = Date.now();
  
  while (!isCacheReady()) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    if (elapsed > maxWaitSec) {
      throw new Error(`Cache did not become ready after ${maxWaitSec}s`);
    }
    
    if (elapsed % 10 === 0 && elapsed > 0) {
      console.log(`  Still waiting... (${elapsed}s elapsed)`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  const cache = getCachedPoolAnalytics();
  console.log(`✅ Cache ready! ${cache.data.length} pools available (${cache.ageMinutes} min old)\n`);
}

async function runAnalysis() {
  try {
    // Wait for cache to be ready
    await waitForCache();
    
    console.log('🔍 Analyzing wallet:', WALLET_ADDRESS);
    console.log('');
    
    // Step 1: Analyze current assignments
    console.log('📊 Step 1: Analyzing current garden assignments...');
    const currentState = await analyzeCurrentAssignments(WALLET_ADDRESS);
    
    // Get pool data for optimizer
    const poolCache = getCachedPoolAnalytics();
    const pools = poolCache.data;
    
    // Step 2: Generate optimized assignments
    console.log('🎯 Step 2: Generating optimized assignments...');
    const optimizedState = optimizeHeroAssignments(
      currentState.heroes,
      currentState.pets,
      pools,
      10
    );
    
    // Step 3: Calculate improvement
    const improvement = calculateImprovement(currentState, optimizedState);
    
    // Step 4: Format reports
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(formatSummaryMessage(currentState, optimizedState, improvement));
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log(formatCurrentGardens(currentState));
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log(formatOptimizedGardens(optimizedState));
    console.log('═══════════════════════════════════════════════════════════');
    
  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    console.error(error.stack);
  }
}

runAnalysis();
