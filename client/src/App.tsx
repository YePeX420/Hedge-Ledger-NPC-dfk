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

function AdminRoutes() {
  console.log('[AdminRoutes] Rendering, current path:', window.location.pathname);
  return (
    <ProtectedRoute requireAdmin>
      <AdminLayout>
        <Switch>
          <Route path="/admin/users/:discordId/dashboard">
            {(params) => {
              console.log('[Route] Matched /admin/users/:discordId/dashboard, params:', params);
              return <AdminUserDashboard />;
            }}
          </Route>
          <Route path="/admin/users/:userId">
            {(params) => {
              console.log('[Route] Matched /admin/users/:userId, params:', params);
              return <AdminUserProfile />;
            }}
          </Route>
          <Route path="/admin/users">
            {() => {
              console.log('[Route] Matched /admin/users');
              return <AdminUsers />;
            }}
          </Route>
          <Route path="/admin/expenses" component={AdminExpenses} />
          <Route path="/admin/settings" component={AdminSettings} />
          <Route path="/admin/bridge" component={AdminBridgeAnalytics} />
          <Route path="/admin/account" component={AccountPage} />
          <Route path="/admin">
            {() => {
              console.log('[Route] Matched /admin (dashboard)');
              return <AdminDashboard />;
            }}
          </Route>
          <Route>
            {() => {
              console.log('[Route] No match - showing 404');
              return <NotFound />;
            }}
          </Route>
        </Switch>
      </AdminLayout>
    </ProtectedRoute>
  );
}

function Router() {
  return (
    <Switch>
      {/* Admin login (public) */}
      <Route path="/admin/login" component={AdminLogin} />
      
      {/* All admin routes (protected) */}
      <Route path="/admin/:rest*" component={AdminRoutes} />
      <Route path="/admin" component={AdminRoutes} />
      
      {/* Root redirects to admin */}
      <Route path="/">
        {() => {
          window.location.href = '/admin';
          return null;
        }}
      </Route>
      
      {/* Fallback to 404 */}
      <Route component={NotFound} />
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
