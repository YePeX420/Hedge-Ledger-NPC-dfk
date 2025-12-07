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
import AccountPage from "@/pages/account";
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
      
      <Route path="/admin/bridge">
        {() => (
          <ProtectedAdminPage>
            <AdminBridgeAnalytics />
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
