import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { ProtectedRoute } from "@/components/protected-route";
import { AdminLayout } from "@/components/admin-layout";

import AdminLogin from "@/pages/admin/login";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminUsers from "@/pages/admin/users";
import AdminUserProfile from "@/pages/admin/user-profile";
import AdminUserDashboard from "@/pages/admin/user-dashboard";
import AdminExpenses from "@/pages/admin/expenses";
import AdminSettings from "@/pages/admin/settings";
import AdminBridgeAnalytics from "@/pages/admin/bridge-analytics";
import AdminValueAllocation from "@/pages/admin/value-allocation";
import AdminCoverageDetails from "@/pages/admin/coverage-details";
import AdminChallenges from "@/pages/admin/challenges";
import ChallengeEditor from "@/pages/admin/challenge-editor";
import AdminLevelRacer from "@/pages/admin/level-racer";
import AdminTokens from "@/pages/admin/tokens";
import AdminExtractors from "@/pages/admin/extractors";
import AdminPools from "@/pages/admin/pools";
import PoolDetailPage from "@/pages/admin/pool-detail";
import AdminPoolIndexer from "@/pages/admin/pool-indexer";
import AdminPoolIndexerV1 from "@/pages/admin/pool-indexer-v1";
import AdminPoolIndexerHarmony from "@/pages/admin/pool-indexer-harmony";
import AdminJeweler from "@/pages/admin/jeweler";
import AdminGardeningQuest from "@/pages/admin/gardening-quest";
import AdminGardeningCalc from "@/pages/admin/gardening-calc";
import AdminYieldCalculator from "@/pages/admin/yield-calculator";
import AdminBattleReady from "@/pages/admin/battle-ready";
import AdminSummoningCalculator from "@/pages/admin/summoning-calculator";
import AdminSummonSniper from "@/pages/admin/summon-sniper";
import AdminTavernSniper from "@/pages/admin/tavern-sniper";
import AdminHeroScore from "@/pages/admin/hero-score";
import AdminPVPMatchup from "@/pages/admin/pvp-matchup";
import AdminAIConsultant from "@/pages/admin/ai-consultant";
import AdminQuestOptimizer from "@/pages/admin/quest-optimizer";
import AdminBargainHunter from "@/pages/admin/bargain-hunter";
import AdminDarkBargainHunter from "@/pages/admin/dark-bargain-hunter";
import AdminTavernIndexer from "@/pages/admin/tavern-indexer";
import AdminTavernWalletActivity from "@/pages/admin/tavern-wallet-activity";
import AdminMarketIntel from "@/pages/admin/market-intel";
import AdminHeroPrice from "@/pages/admin/hero-price";
import AdminProfitTracker from "@/pages/admin/profit-tracker";
import AdminPVEDropRates from "@/pages/admin/pve-droprates";
import AdminPVEHunts from "@/pages/admin/pve-hunts";
import AdminHuntCompanion from "@/pages/admin/hunt-companion";
import AdminPatrolRewards from "@/pages/admin/patrol-rewards";
import HedgeCombatSync from "@/pages/admin/hedge-combat-sync";
import CombatClasses from "@/pages/admin/combat-classes";
import HedgePlansAccess from "@/pages/admin/hedge-plans-access";
import AdminCombatPets from "@/pages/admin/combat-pets";
import AdminCombatToolkit from "@/pages/admin/combat-toolkit";
import AdminTournament from "@/pages/admin/tournament";
import AdminTournamentDetail from "@/pages/admin/tournament-detail";
import TournamentSession from "@/pages/admin/tournament-session";
import TournamentBracketPage from "@/pages/admin/tournament-bracket";
import TournamentMatchupPage from "@/pages/admin/tournament-matchup";
import FightHistoryPage from "@/pages/admin/fight-history";
import PreviousTournamentsPage from "@/pages/admin/previous-tournaments";
import UserAccessManagement from "@/pages/admin/user-access";
import UserLogin from "@/pages/user-login";
import UserDashboardPage from "@/pages/user/dashboard";
import { UserLayout } from "@/components/user-layout";
import AccountPage from "@/pages/account";
import LeaderboardsPage from "@/pages/leaderboards";
import ChallengesPage from "@/pages/challenges";
import NotFound from "@/pages/not-found";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/queryClient";

function ProtectedAdminPage({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requireAdmin>
      <AdminLayout>
        {children}
      </AdminLayout>
    </ProtectedRoute>
  );
}

interface UserSession {
  allowedTabs: string[];
  username: string;
  displayName: string | null;
}

function UserToolRoute({ tab, children }: { tab: string | string[]; children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'allowed' | 'denied' | 'unauthed'>('loading');
  const [userInfo, setUserInfo] = useState<UserSession | null>(null);

  const tabKey = Array.isArray(tab) ? tab.join(',') : tab;

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/user/session`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (!data.success) { setStatus('unauthed'); return; }
        const allowed: string[] = data.user.allowedTabs || [];
        const tabs = Array.isArray(tab) ? tab : [tab];
        setUserInfo({ allowedTabs: allowed, username: data.user.username, displayName: data.user.displayName });
        setStatus(tabs.some(t => allowed.includes(t)) ? 'allowed' : 'denied');
      })
      .catch(() => setStatus('unauthed'));
  }, [tabKey]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }
  if (status === 'unauthed') {
    window.location.href = '/user/login';
    return null;
  }

  const username = userInfo?.displayName || userInfo?.username || 'Member';
  const allowedTabs = userInfo?.allowedTabs || [];

  if (status === 'denied') {
    return (
      <UserLayout allowedTabs={allowedTabs} username={username}>
        <div className="flex flex-col items-center justify-center min-h-full gap-4 p-12">
          <div className="text-xl font-semibold">Access Denied</div>
          <p className="text-muted-foreground text-sm">You don't have permission to use this tool.</p>
        </div>
      </UserLayout>
    );
  }
  return (
    <UserLayout allowedTabs={allowedTabs} username={username}>
      {children}
    </UserLayout>
  );
}

function Router() {
  console.log('[Router] Current path:', window.location.pathname);
  
  return (
    <Switch>
      {/* Admin login (public) */}
      <Route path="/admin/login" component={AdminLogin} />
      
      {/* User dashboard - most specific route first */}
      <Route path="/admin/users/:discordId/dashboard">
        {(params) => {
          console.log('[Route] Matched /admin/users/:discordId/dashboard, params:', params);
          return (
            <ProtectedAdminPage>
              <AdminUserDashboard />
            </ProtectedAdminPage>
          );
        }}
      </Route>
      
      {/* User profile */}
      <Route path="/admin/users/:userId">
        {(params) => {
          console.log('[Route] Matched /admin/users/:userId, params:', params);
          return (
            <ProtectedAdminPage>
              <AdminUserProfile />
            </ProtectedAdminPage>
          );
        }}
      </Route>
      
      {/* User list */}
      <Route path="/admin/users">
        {() => {
          console.log('[Route] Matched /admin/users');
          return (
            <ProtectedAdminPage>
              <AdminUsers />
            </ProtectedAdminPage>
          );
        }}
      </Route>
      
      {/* Other admin pages */}
      <Route path="/admin/expenses">
        {() => (
          <ProtectedAdminPage>
            <AdminExpenses />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/settings">
        {() => (
          <ProtectedAdminPage>
            <AdminSettings />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/user-access">
        {() => (
          <ProtectedAdminPage>
            <UserAccessManagement />
          </ProtectedAdminPage>
        )}
      </Route>
      
      {/* Challenge editor - more specific routes first */}
      <Route path="/admin/challenges/:id/edit">
        {() => (
          <ProtectedAdminPage>
            <ChallengeEditor />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/challenges/:id">
        {() => (
          <ProtectedAdminPage>
            <ChallengeEditor />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/challenges">
        {() => (
          <ProtectedAdminPage>
            <AdminChallenges />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/bridge">
        {() => (
          <ProtectedAdminPage>
            <AdminBridgeAnalytics />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/value-allocation">
        {() => (
          <ProtectedAdminPage>
            <AdminValueAllocation />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/coverage-details">
        {() => (
          <ProtectedAdminPage>
            <AdminCoverageDetails />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/tokens">
        {() => (
          <ProtectedAdminPage>
            <AdminTokens />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/extractors">
        {() => (
          <ProtectedAdminPage>
            <AdminExtractors />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/pools/:pid">
        {() => (
          <ProtectedAdminPage>
            <PoolDetailPage />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/pools">
        {() => (
          <ProtectedAdminPage>
            <AdminPools />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/pool-indexer">
        {() => (
          <ProtectedAdminPage>
            <AdminPoolIndexer />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/pool-indexer-v1">
        {() => (
          <ProtectedAdminPage>
            <AdminPoolIndexerV1 />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/pool-indexer-harmony">
        {() => (
          <ProtectedAdminPage>
            <AdminPoolIndexerHarmony />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/jeweler">
        {() => (
          <ProtectedAdminPage>
            <AdminJeweler />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/gardening-quest">
        {() => (
          <ProtectedAdminPage>
            <AdminGardeningQuest />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/gardening-calc">
        {() => (
          <ProtectedAdminPage>
            <AdminGardeningCalc />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/yield-calculator">
        {() => (
          <ProtectedAdminPage>
            <AdminYieldCalculator />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/battle-ready">
        {() => (
          <ProtectedAdminPage>
            <AdminBattleReady />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/summoning-calculator">
        {() => (
          <ProtectedAdminPage>
            <AdminSummoningCalculator />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/summon-sniper">
        {() => (
          <ProtectedAdminPage>
            <AdminSummonSniper />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/tavern-sniper">
        {() => (
          <ProtectedAdminPage>
            <AdminTavernSniper />
          </ProtectedAdminPage>
        )}
      </Route>

      <Route path="/admin/hero-score">
        {() => (
          <ProtectedAdminPage>
            <AdminHeroScore />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/pvp-matchup">
        {() => (
          <ProtectedAdminPage>
            <AdminPVPMatchup />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/tournaments/session/:sessionKey">
        {(params) => (
          <ProtectedAdminPage>
            <TournamentSession sessionKey={params.sessionKey} />
          </ProtectedAdminPage>
        )}
      </Route>

      <Route path="/admin/tournament/bracket/:id/matchup/:slotA/:slotB">
        {(params) => (
          <ProtectedAdminPage>
            <TournamentMatchupPage />
          </ProtectedAdminPage>
        )}
      </Route>

      <Route path="/admin/tournament/bracket/:id">
        {(params) => (
          <ProtectedAdminPage>
            <TournamentBracketPage id={params.id} />
          </ProtectedAdminPage>
        )}
      </Route>

      <Route path="/admin/tournament/:id">
        {(params) => (
          <ProtectedAdminPage>
            <AdminTournamentDetail id={params.id} />
          </ProtectedAdminPage>
        )}
      </Route>

      <Route path="/admin/tournament">
        {() => (
          <ProtectedAdminPage>
            <AdminTournament />
          </ProtectedAdminPage>
        )}
      </Route>

      <Route path="/admin/fight-history">
        {() => (
          <ProtectedAdminPage>
            <FightHistoryPage />
          </ProtectedAdminPage>
        )}
      </Route>

      <Route path="/admin/previous-tournaments">
        {() => (
          <ProtectedAdminPage>
            <PreviousTournamentsPage />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/ai-consultant">
        {() => (
          <ProtectedAdminPage>
            <AdminAIConsultant />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/quest-optimizer">
        {() => (
          <ProtectedAdminPage>
            <AdminQuestOptimizer />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/bargain-hunter">
        {() => (
          <ProtectedAdminPage>
            <AdminBargainHunter />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/dark-bargain-hunter">
        {() => (
          <ProtectedAdminPage>
            <AdminDarkBargainHunter />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/tavern-indexer">
        {() => (
          <ProtectedAdminPage>
            <AdminTavernIndexer />
          </ProtectedAdminPage>
        )}
      </Route>

      <Route path="/admin/tavern-wallet-activity">
        {() => (
          <ProtectedAdminPage>
            <AdminTavernWalletActivity />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/market-intel">
        {() => (
          <ProtectedAdminPage>
            <AdminMarketIntel />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/hero-price">
        {() => (
          <ProtectedAdminPage>
            <AdminHeroPrice />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/profit-tracker">
        {() => (
          <ProtectedAdminPage>
            <AdminProfitTracker />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/combat-pets">
        {() => (
          <ProtectedAdminPage>
            <AdminCombatPets />
          </ProtectedAdminPage>
        )}
      </Route>

      <Route path="/admin/combat-toolkit">
        {() => (
          <ProtectedAdminPage>
            <AdminCombatToolkit />
          </ProtectedAdminPage>
        )}
      </Route>

      <Route path="/admin/pve-droprates">
        {() => (
          <ProtectedAdminPage>
            <AdminPVEDropRates />
          </ProtectedAdminPage>
        )}
      </Route>

      <Route path="/admin/pve-hunts">
        {() => (
          <ProtectedAdminPage>
            <AdminPVEHunts />
          </ProtectedAdminPage>
        )}
      </Route>

      <Route path="/admin/hunt-companion">
        {() => (
          <ProtectedAdminPage>
            <AdminHuntCompanion />
          </ProtectedAdminPage>
        )}
      </Route>

      <Route path="/admin/patrol-rewards">
        {() => (
          <ProtectedAdminPage>
            <AdminPatrolRewards />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/level-racer">
        {() => (
          <ProtectedAdminPage>
            <AdminLevelRacer />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/hedge/combat-sync">
        {() => (
          <ProtectedAdminPage>
            <HedgeCombatSync />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/combat-classes">
        {() => (
          <ProtectedAdminPage>
            <CombatClasses />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/hedge/plans">
        {() => (
          <ProtectedAdminPage>
            <HedgePlansAccess />
          </ProtectedAdminPage>
        )}
      </Route>
      
      <Route path="/admin/account">
        {() => (
          <ProtectedAdminPage>
            <AccountPage />
          </ProtectedAdminPage>
        )}
      </Route>
      
      {/* Admin dashboard */}
      <Route path="/admin">
        {() => {
          console.log('[Route] Matched /admin (dashboard)');
          return (
            <ProtectedAdminPage>
              <AdminDashboard />
            </ProtectedAdminPage>
          );
        }}
      </Route>
      
      {/* User login (public) */}
      <Route path="/user/login" component={UserLogin} />
      
      {/* User dashboard (protected by user session) */}
      <Route path="/user/dashboard">
        {() => <UserDashboardPage />}
      </Route>

      {/* User tool routes — each reuses the admin page component, gated by UserToolRoute */}
      <Route path="/user/quest-optimizer">
        {() => <UserToolRoute tab="quest-optimizer"><AdminQuestOptimizer /></UserToolRoute>}
      </Route>
      <Route path="/user/ai-consultant">
        {() => <UserToolRoute tab="ai-consultant"><AdminAIConsultant /></UserToolRoute>}
      </Route>
      <Route path="/user/pools/:pid">
        {() => <UserToolRoute tab="pools"><PoolDetailPage /></UserToolRoute>}
      </Route>
      <Route path="/user/pools">
        {() => <UserToolRoute tab="pools"><AdminPools /></UserToolRoute>}
      </Route>
      <Route path="/user/yield-calculator">
        {() => <UserToolRoute tab="yield-calculator"><AdminYieldCalculator /></UserToolRoute>}
      </Route>
      <Route path="/user/yield-optimizer">
        {() => <UserToolRoute tab="yield-optimizer"><AdminYieldCalculator /></UserToolRoute>}
      </Route>
      <Route path="/user/summon-sniper">
        {() => <UserToolRoute tab="summon-sniper"><AdminSummonSniper /></UserToolRoute>}
      </Route>
      <Route path="/user/tavern-sniper">
        {() => <UserToolRoute tab="tavern-sniper"><AdminTavernSniper /></UserToolRoute>}
      </Route>
      <Route path="/user/gardening-calculator">
        {() => <UserToolRoute tab="gardening-calculator"><AdminGardeningCalc /></UserToolRoute>}
      </Route>
      <Route path="/user/combat-pets">
        {() => <UserToolRoute tab="combat-pets"><AdminCombatPets /></UserToolRoute>}
      </Route>
      <Route path="/user/summoning-calculator">
        {() => <UserToolRoute tab="summoning-calculator"><AdminSummoningCalculator /></UserToolRoute>}
      </Route>
      <Route path="/user/pvp-matchup">
        {() => <UserToolRoute tab="pvp-matchup"><AdminPVPMatchup /></UserToolRoute>}
      </Route>
      <Route path="/user/bargain-hunter">
        {() => <UserToolRoute tab="bargain-hunter"><AdminBargainHunter /></UserToolRoute>}
      </Route>
      <Route path="/user/dark-bargain-hunter">
        {() => <UserToolRoute tab="dark-bargain-hunter"><AdminDarkBargainHunter /></UserToolRoute>}
      </Route>
      <Route path="/user/tavern-indexer">
        {() => <UserToolRoute tab="tavern-indexer"><AdminTavernIndexer /></UserToolRoute>}
      </Route>
      <Route path="/user/market-intel">
        {() => <UserToolRoute tab="market-intel"><AdminMarketIntel /></UserToolRoute>}
      </Route>
      <Route path="/user/battle-ready">
        {() => <UserToolRoute tab="battle-ready"><AdminBattleReady /></UserToolRoute>}
      </Route>
      <Route path="/user/level-racer">
        {() => <UserToolRoute tab="level-racer"><AdminLevelRacer /></UserToolRoute>}
      </Route>
      <Route path="/user/combat-toolkit">
        {() => <UserToolRoute tab="combat-toolkit"><AdminCombatToolkit /></UserToolRoute>}
      </Route>
      <Route path="/user/patrol-rewards">
        {() => <UserToolRoute tab="patrol-rewards"><AdminPatrolRewards /></UserToolRoute>}
      </Route>
      <Route path="/user/profit-tracker">
        {() => <UserToolRoute tab="profit-tracker"><AdminProfitTracker /></UserToolRoute>}
      </Route>
      <Route path="/user/dfk-tournaments">
        {() => <UserToolRoute tab="dfk-tournaments"><AdminTournament /></UserToolRoute>}
      </Route>
      <Route path="/user/dfk-tournaments/session/:sessionKey">
        {(params) => <UserToolRoute tab={['dfk-tournaments', 'previous-tournaments']}><TournamentSession sessionKey={params.sessionKey} /></UserToolRoute>}
      </Route>
      <Route path="/user/dfk-tournament/bracket/:id/matchup/:slotA/:slotB">
        {() => <UserToolRoute tab={['dfk-tournaments', 'previous-tournaments']}><TournamentMatchupPage /></UserToolRoute>}
      </Route>
      <Route path="/user/dfk-tournament/bracket/:id">
        {(params) => <UserToolRoute tab={['dfk-tournaments', 'previous-tournaments']}><TournamentBracketPage id={params.id} /></UserToolRoute>}
      </Route>
      <Route path="/user/dfk-tournament/:id">
        {(params) => <UserToolRoute tab={['dfk-tournaments', 'previous-tournaments']}><AdminTournamentDetail id={params.id} /></UserToolRoute>}
      </Route>
      <Route path="/user/previous-tournaments">
        {() => <UserToolRoute tab="previous-tournaments"><PreviousTournamentsPage /></UserToolRoute>}
      </Route>
      <Route path="/user/fight-history">
        {() => <UserToolRoute tab="fight-history"><FightHistoryPage /></UserToolRoute>}
      </Route>

      {/* Yield & Garden */}
      <Route path="/user/gardening-quest">
        {() => <UserToolRoute tab="gardening-quest"><AdminGardeningQuest /></UserToolRoute>}
      </Route>

      {/* Market & Tavern */}
      <Route path="/user/hero-score">
        {() => <UserToolRoute tab="hero-score"><AdminHeroScore /></UserToolRoute>}
      </Route>
      <Route path="/user/hero-price">
        {() => <UserToolRoute tab="hero-price"><AdminHeroPrice /></UserToolRoute>}
      </Route>
      <Route path="/user/tavern-wallet-activity">
        {() => <UserToolRoute tab="tavern-wallet-activity"><AdminTavernWalletActivity /></UserToolRoute>}
      </Route>

      {/* Competitive */}
      <Route path="/user/pve-hunts">
        {() => <UserToolRoute tab="pve-hunts"><AdminPVEHunts /></UserToolRoute>}
      </Route>
      <Route path="/user/hunt-companion">
        {() => <UserToolRoute tab="pve-hunts"><AdminHuntCompanion /></UserToolRoute>}
      </Route>
      <Route path="/user/pve-droprates">
        {() => <UserToolRoute tab="pve-droprates"><AdminPVEDropRates /></UserToolRoute>}
      </Route>

      {/* Ecosystem */}
      <Route path="/user/value-allocation">
        {() => <UserToolRoute tab="value-allocation"><AdminValueAllocation /></UserToolRoute>}
      </Route>
      <Route path="/user/tokens">
        {() => <UserToolRoute tab="tokens"><AdminTokens /></UserToolRoute>}
      </Route>
      <Route path="/user/bridge">
        {() => <UserToolRoute tab="bridge"><AdminBridgeAnalytics /></UserToolRoute>}
      </Route>
      <Route path="/user/extractors">
        {() => <UserToolRoute tab="extractors"><AdminExtractors /></UserToolRoute>}
      </Route>
      <Route path="/user/users">
        {() => <UserToolRoute tab="users"><AdminUsers /></UserToolRoute>}
      </Route>

      {/* Indexers */}
      <Route path="/user/jeweler">
        {() => <UserToolRoute tab="jeweler"><AdminJeweler /></UserToolRoute>}
      </Route>
      <Route path="/user/pool-indexer">
        {() => <UserToolRoute tab="pool-indexer"><AdminPoolIndexer /></UserToolRoute>}
      </Route>
      <Route path="/user/pool-indexer-v1">
        {() => <UserToolRoute tab="pool-indexer-v1"><AdminPoolIndexerV1 /></UserToolRoute>}
      </Route>
      <Route path="/user/pool-indexer-harmony">
        {() => <UserToolRoute tab="pool-indexer-harmony"><AdminPoolIndexerHarmony /></UserToolRoute>}
      </Route>

      {/* Public leaderboards page */}
      <Route path="/leaderboards/:key">
        {() => <LeaderboardsPage />}
      </Route>
      <Route path="/leaderboards">
        {() => <LeaderboardsPage />}
      </Route>
      
      {/* Public challenges page */}
      <Route path="/challenges">
        {() => <ChallengesPage />}
      </Route>
      
      {/* Root — unified login landing */}
      <Route path="/">
        {() => <UserLogin />}
      </Route>
      
      {/* Fallback to 404 */}
      <Route>
        {() => {
          console.log('[Route] No match - showing 404');
          return <NotFound />;
        }}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
