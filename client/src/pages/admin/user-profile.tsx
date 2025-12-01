import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";

interface UserProfile {
  id: number;
  discordId: string;
  discordUsername: string;
  tier: string;
  totalQueries: number;
  wallets: Array<{
    id: number;
    address: string;
    chain: string;
    verified: boolean;
  }>;
  lpPositions: Array<{
    id: number;
    poolName: string;
    chain: string;
    lpAmount: string;
    apr24h: string;
  }>;
  createdAt: string;
}

export default function UserProfile() {
  const { userId } = useParams();
  
  const { data: profile, isLoading, error } = useQuery<UserProfile>({
    queryKey: [`/api/admin/users/${userId}/profile`],
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="container mx-auto p-6">
        <Link href="/admin/users">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="mt-4 text-red-500">Failed to load user profile</div>
      </div>
    );
  }

  const createdDate = profile.createdAt ? new Date(profile.createdAt).toISOString().split('T')[0] : 'N/A';

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="user-profile-container">
      <div className="flex items-center gap-4">
        <Link href="/admin/users">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold" data-testid="profile-title">
            {profile.discordUsername}'s Account
          </h1>
          <p className="text-muted-foreground" data-testid="profile-subtitle">
            User ID: {profile.discordId}
          </p>
        </div>
      </div>

      <Card data-testid="card-profile">
        <CardHeader>
          <CardTitle>Your Hedge Ledger Account</CardTitle>
          <CardDescription>Admin view of user account dashboard</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Profile Section */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm uppercase text-muted-foreground">Profile</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Discord:</span> {profile.discordUsername}
              </div>
              <div>
                <span className="text-muted-foreground">Tier:</span> <Badge>{profile.tier}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Total queries:</span> {profile.totalQueries}
              </div>
              <div>
                <span className="text-muted-foreground">Member since:</span> {createdDate}
              </div>
            </div>
          </div>

          {/* Wallets Section */}
          <div className="space-y-3 border-t pt-4">
            <h3 className="font-semibold text-sm uppercase text-muted-foreground">Wallets</h3>
            {profile.wallets && profile.wallets.length > 0 ? (
              <div className="space-y-2">
                {profile.wallets.slice(0, 5).map((wallet, idx) => {
                  const shortAddr = `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`;
                  const verified = wallet.verified ? '✓ Verified' : '⚠ Not verified';
                  return (
                    <div key={wallet.id} className="text-sm p-2 bg-muted rounded">
                      <div>
                        {idx + 1}. <code className="text-xs">{shortAddr}</code> ({wallet.chain}) – {verified}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 break-all">
                        {wallet.address}
                      </div>
                    </div>
                  );
                })}
                {profile.wallets.length > 5 && (
                  <div className="text-sm text-muted-foreground">
                    + {profile.wallets.length - 5} more wallets
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No wallets linked yet.
              </div>
            )}
          </div>

          {/* LP Positions Section */}
          <div className="space-y-3 border-t pt-4">
            <h3 className="font-semibold text-sm uppercase text-muted-foreground">LP Positions</h3>
            {profile.lpPositions && profile.lpPositions.length > 0 ? (
              <div className="space-y-3">
                {profile.lpPositions.slice(0, 5).map((lp) => (
                  <div key={lp.id} className="text-sm p-2 bg-muted rounded">
                    <div className="font-medium">
                      {lp.poolName} ({lp.chain})
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      • {lp.lpAmount} LP<br />
                      • 24h APR (with quests): {lp.apr24h}%
                    </div>
                  </div>
                ))}
                {profile.lpPositions.length > 5 && (
                  <div className="text-sm text-muted-foreground">
                    + {profile.lpPositions.length - 5} more LP positions
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No LP positions detected yet.
              </div>
            )}
          </div>

          <div className="border-t pt-4 text-xs text-muted-foreground">
            Early Access – features and on-chain automation are still being rolled out.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
