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
import HedgeCombatSync from "@/pages/admin/hedge-combat-sync";
import HedgePlansAccess from "@/pages/admin/hedge-plans-access";
import AccountPage from "@/pages/account";
import LeaderboardsPage from "@/pages/leaderboards";
import ChallengesPage from "@/pages/challenges";
import NotFound from "@/pages/not-found";

function ProtectedAdminPage({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requireAdmin>
      <AdminLayout>
        {children}
      </AdminLayout>
    </ProtectedRoute>
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
      
      {/* Root redirects to admin */}
      <Route path="/">
        {() => {
          window.location.href = '/admin';
          return null;
        }}
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
