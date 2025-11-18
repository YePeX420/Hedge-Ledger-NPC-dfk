import { analyzeCurrentAssignments } from './garden-analyzer.js';
import { optimizeHeroAssignments, calculateImprovement } from './garden-optimizer.js';
import { formatSummaryMessage, formatCurrentGardens, formatOptimizedGardens } from './report-formatter.js';
import { getAllPoolAnalytics } from './garden-analytics.js';

const WALLET_ADDRESS = '0x1a9f02011c917482345b86f2c879bce988764098';

async function runFullAnalysis() {
  try {
    console.log('═'.repeat(75));
    console.log('     🌿 HEDGE LEDGER - FULL GARDEN OPTIMIZATION ANALYSIS');
    console.log('         Wallet:', WALLET_ADDRESS);
    console.log('═'.repeat(75));
    console.log('');
    
    // Step 1: Get pool analytics
    console.log('📊 Step 1/4: Fetching Crystalvale pool analytics...');
    const startPool = Date.now();
    const pools = await getAllPoolAnalytics();
    const poolTime = ((Date.now() - startPool) / 1000).toFixed(1);
    console.log(`✅ Loaded ${pools.length} garden pools (${poolTime}s)`);
    console.log('   Available pools:', pools.map(p => `#${p.pid} ${p.pair}`).join(', '));
    console.log('');
    
    // Step 2: Analyze current assignments
    console.log('📊 Step 2/4: Scanning your heroes for active gardening quests...');
    console.log('   (This will check all 1000+ heroes via blockchain - may take 2-3 minutes)');
    const startAnalysis = Date.now();
    const currentState = await analyzeCurrentAssignments(WALLET_ADDRESS, pools);
    const analysisTime = ((Date.now() - startAnalysis) / 1000).toFixed(1);
    console.log(`✅ Analysis complete (${analysisTime}s)`);
    console.log(`   Found ${currentState.activeGardeningHeroes} active gardening heroes out of ${currentState.totalHeroes} total`);
    console.log('');
    
    // Step 3: Generate optimized assignments
    console.log('📊 Step 3/4: Generating optimized hero-to-pool assignments...');
    const optimizedState = optimizeHeroAssignments(
      currentState.heroes,
      currentState.pets,
      pools,
      24 // Top 24 heroes
    );
    console.log(`✅ Optimization complete`);
    console.log(`   Analyzed top heroes based on VIT+WIS+Skill`);
    console.log('');
    
    // Step 4: Calculate improvement
    console.log('📊 Step 4/4: Calculating improvement potential...');
    const improvement = calculateImprovement(currentState, optimizedState);
    console.log(`✅ Improvement calculated`);
    console.log('');
    
    // Display full report
    console.log('\n' + '═'.repeat(75));
    console.log('                    📋 OPTIMIZATION REPORT');
    console.log('═'.repeat(75));
    console.log('');
    console.log(formatSummaryMessage(currentState, optimizedState, improvement));
    console.log('');
    console.log('═'.repeat(75));
    console.log('                 🌱 CURRENT GARDEN ASSIGNMENTS');
    console.log('═'.repeat(75));
    console.log('');
    console.log(formatCurrentGardens(currentState));
    console.log('');
    console.log('═'.repeat(75));
    console.log('              ✨ OPTIMIZED RECOMMENDATIONS');
    console.log('═'.repeat(75));
    console.log('');
    console.log(formatOptimizedGardens(optimizedState));
    console.log('');
    console.log('═'.repeat(75));
    console.log('');
    
    const totalTime = ((Date.now() - startPool) / 1000).toFixed(1);
    console.log(`⏱️  Total analysis time: ${totalTime}s`);
    console.log('✅ Analysis complete!');
    
  } catch (error) {
    console.error('');
    console.error('═'.repeat(75));
    console.error('❌ ANALYSIS FAILED');
    console.error('═'.repeat(75));
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

runFullAnalysis();
