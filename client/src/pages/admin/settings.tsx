import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";
import { RefreshCw, Loader2 } from "lucide-react";

type DebugSettings = {
  paymentBypass: boolean;
  verboseLogging: boolean;
  oauthBypass: boolean;
  oauthBypassAllowed?: boolean;
};

type LabeledSwitchProps = {
  enabled: boolean;
  onToggle: (value: boolean) => void;
  accent?: "emerald" | "blue";
  testId?: string;
};

/**
 * Labeled pill switch with color blending + sliding knob.
 * Shows ON/OFF inside the pill so it's always visible.
 */
function LabeledSwitch({
  enabled,
  onToggle,
  accent = "emerald",
  testId,
}: LabeledSwitchProps) {
  const accentOn =
    accent === "emerald"
      ? "from-emerald-400 via-emerald-500 to-emerald-600"
      : "from-blue-400 via-blue-500 to-blue-600";

  return (
    <button
      type="button"
      onClick={() => onToggle(!enabled)}
      data-testid={testId}
      className={`relative inline-flex h-8 w-20 items-center rounded-full px-2 text-xs font-semibold tracking-wide transition-all duration-200
        ${
          enabled
            ? "bg-gradient-to-r " + accentOn + " text-white"
            : "bg-slate-500 text-slate-200"
        }
      `}
    >
      {/* Label inside pill */}
      <span
        className={`z-10 transition-opacity duration-200 ${
          enabled ? "opacity-100" : "opacity-80"
        }`}
      >
        {enabled ? "ON" : "OFF"}
      </span>

      {/* Sliding knob */}
      <span
        className={`absolute h-7 w-7 rounded-full bg-white shadow transform transition-transform duration-200
          ${enabled ? "translate-x-6" : "-translate-x-1"}
        `}
      />
    </button>
  );
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<DebugSettings>({
    paymentBypass: false,
    verboseLogging: false,
    oauthBypass: false,
  });
  const [isRestarting, setIsRestarting] = useState(false);

  async function restartServer() {
    if (isRestarting) return;
    
    setIsRestarting(true);
    try {
      const res = await fetch("/api/admin/restart-server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      if (res.ok) {
        // Wait for server to restart, then reload page
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        // Handle non-OK response (e.g., auth error)
        console.error("Restart failed with status:", res.status);
        setIsRestarting(false);
      }
    } catch (err) {
      console.error("Failed to restart server:", err);
      // If request fails, it might be because server already restarted
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    }
  }

  // Load current settings from backend
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/admin/debug-settings");
        if (!res.ok) return;
        const data = await res.json();
        setSettings((prev) => ({
          ...prev,
          ...data,
        }));
      } catch (err) {
        console.error("Failed to load debug settings:", err);
      }
    }

    loadSettings();
  }, []);

  async function updateSetting(key: keyof DebugSettings, value: boolean) {
    const next = { ...settings, [key]: value };
    setSettings(next);

    try {
      await fetch("/api/admin/debug-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });

      // 🔄 Invalidate React Query cache so Dashboard sees fresh values
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/debug-settings"],
      });
    } catch (err) {
      console.error("Failed to update debug settings:", err);
    }
  }

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
          <CardDescription>Options for testing and development</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Payment Bypass */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Payment Bypass</Label>
              <p className="text-sm text-muted-foreground">
                Skip JEWEL payment verification for garden optimization testing
              </p>
            </div>

            <LabeledSwitch
              enabled={settings.paymentBypass}
              onToggle={(val) => updateSetting("paymentBypass", val)}
              accent="emerald"
              testId="switch-payment-bypass"
            />
          </div>

          {/* Verbose Logging */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Verbose Logging</Label>
              <p className="text-sm text-muted-foreground">
                Enable detailed console logging for debugging
              </p>
            </div>

            <LabeledSwitch
              enabled={settings.verboseLogging}
              onToggle={(val) => updateSetting("verboseLogging", val)}
              accent="blue"
              testId="switch-verbose-logging"
            />
          </div>

          {/* OAuth Bypass - only shown when ALLOW_OAUTH_BYPASS env var is set */}
          {settings.oauthBypassAllowed && (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>OAuth Bypass</Label>
                <p className="text-sm text-muted-foreground">
                  Skip Discord OAuth for admin dashboard testing (allows unauthenticated access)
                </p>
              </div>

              <LabeledSwitch
                enabled={settings.oauthBypass}
                onToggle={(val) => updateSetting("oauthBypass", val)}
                accent="emerald"
                testId="switch-oauth-bypass"
              />
            </div>
          )}
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

      <Card>
        <CardHeader>
          <CardTitle>Server Control</CardTitle>
          <CardDescription>
            Restart the server to apply code changes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Restart Server</Label>
              <p className="text-sm text-muted-foreground">
                Restart the backend server process to apply code changes. The page will reload automatically.
              </p>
            </div>
            <Button
              onClick={restartServer}
              disabled={isRestarting}
              variant="destructive"
              data-testid="button-restart-server"
            >
              {isRestarting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Restarting...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Restart Server
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
