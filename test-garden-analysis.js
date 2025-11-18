import { analyzeCurrentAssignments } from './garden-analyzer.js';
import { optimizeHeroAssignments, calculateImprovement } from './garden-optimizer.js';
import { formatSummaryMessage, formatCurrentGardens, formatOptimizedGardens } from './report-formatter.js';

const WALLET_ADDRESS = '0x1a9f02011c917482345b86f2c879bce988764098';

async function runAnalysis() {
  try {
    console.log('🔍 Analyzing wallet:', WALLET_ADDRESS);
    console.log('');
    
    // Step 1: Analyze current assignments
    console.log('📊 Step 1: Analyzing current garden assignments...');
    const currentState = await analyzeCurrentAssignments(WALLET_ADDRESS);
    
    // Step 2: Generate optimized assignments
    console.log('🎯 Step 2: Generating optimized assignments...');
    const optimizedState = optimizeHeroAssignments(
      currentState.heroes,
      currentState.pets,
      currentState.pools || [],
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
