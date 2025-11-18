import { analyzeCurrentAssignments } from './garden-analyzer.js';
import { optimizeHeroAssignments, calculateImprovement } from './garden-optimizer.js';
import { formatSummaryMessage, formatCurrentGardens, formatOptimizedGardens } from './report-formatter.js';
import { getAllPoolAnalytics } from './garden-analytics.js';

const WALLET_ADDRESS = '0x1a9f02011c917482345b86f2c879bce988764098';

async function runAnalysis() {
  try {
    console.log('🔍 Analyzing wallet:', WALLET_ADDRESS);
    console.log('');
    
    // Get pool data directly (cache should be ready from main bot process)
    console.log('📊 Fetching pool analytics...');
    const pools = await getAllPoolAnalytics();
    console.log(`✅ Got ${pools.length} pools\n`);
    
    // Step 1: Analyze current assignments (pass pools directly to avoid cache issues)
    console.log('📊 Step 1: Analyzing current garden assignments (checking blockchain for all heroes)...');
    const currentState = await analyzeCurrentAssignments(WALLET_ADDRESS, pools);
    console.log('✅ Current state analyzed\n');
    
    // Step 2: Generate optimized assignments
    console.log('🎯 Step 2: Generating optimized assignments...');
    const optimizedState = optimizeHeroAssignments(
      currentState.heroes,
      currentState.pets,
      pools,
      24 // Check up to 24 heroes
    );
    console.log('✅ Optimization complete\n');
    
    // Step 3: Calculate improvement
    const improvement = calculateImprovement(currentState, optimizedState);
    
    // Step 4: Format reports
    console.log('\n' + '═'.repeat(70));
    console.log(formatSummaryMessage(currentState, optimizedState, improvement));
    console.log('═'.repeat(70) + '\n');
    console.log(formatCurrentGardens(currentState));
    console.log('\n' + '═'.repeat(70) + '\n');
    console.log(formatOptimizedGardens(optimizedState));
    console.log('═'.repeat(70));
    
  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runAnalysis();
