import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function AdminSettings() {
  return (
    <div className="p-6 space-y-6" data-testid="admin-settings-page">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure Hedge Ledger behavior and debug options
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Debug Settings</CardTitle>
          <CardDescription>
            Options for testing and development
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Payment Bypass</Label>
              <p className="text-sm text-muted-foreground">
                Skip JEWEL payment verification for garden optimization testing
              </p>
            </div>
            <Switch data-testid="switch-payment-bypass" />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Verbose Logging</Label>
              <p className="text-sm text-muted-foreground">
                Enable detailed console logging for debugging
              </p>
            </div>
            <Switch data-testid="switch-verbose-logging" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bot Configuration</CardTitle>
          <CardDescription>
            General bot settings (changes require restart)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground">
            <p>Configuration options coming soon.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
