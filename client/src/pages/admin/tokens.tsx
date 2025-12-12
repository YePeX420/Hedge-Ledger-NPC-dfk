import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Database, Coins } from "lucide-react";

interface Token {
  id: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  holders: number | null;
  priceUsd: string | null;
  chain: string;
  lastUpdatedAt: string;
  createdAt: string;
}

interface TokensResponse {
  tokens: Token[];
  count: number;
}

interface SyncResult {
  success: boolean;
  added: number;
  updated: number;
  errors: number;
}

export default function TokensPage() {
  const { data, isLoading, refetch } = useQuery<TokensResponse>({
    queryKey: ["/api/admin/tokens"],
  });

  const syncMutation = useMutation({
    mutationFn: async (fullSync: boolean) => {
      const response = await apiRequest("/api/admin/tokens/sync", {
        method: "POST",
        body: JSON.stringify({ fullSync }),
      });
      return response as SyncResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tokens"] });
    },
  });

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Token Registry</h1>
          <p className="text-muted-foreground">
            DFK Chain token metadata from RouteScan
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
            data-testid="button-refresh"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={() => syncMutation.mutate(false)}
            disabled={syncMutation.isPending}
            data-testid="button-sync-known"
          >
            {syncMutation.isPending ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Database className="mr-2 h-4 w-4" />
            )}
            Sync Known Tokens
          </Button>
          <Button
            variant="secondary"
            onClick={() => syncMutation.mutate(true)}
            disabled={syncMutation.isPending}
            data-testid="button-sync-full"
          >
            {syncMutation.isPending ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Coins className="mr-2 h-4 w-4" />
            )}
            Full RouteScan Sync
          </Button>
        </div>
      </div>

      {syncMutation.isSuccess && (
        <Card className="border-green-500/50 bg-green-500/10">
          <CardContent className="pt-4">
            <p className="text-sm text-green-600 dark:text-green-400" data-testid="text-sync-result">
              Sync complete: {syncMutation.data.added} added, {syncMutation.data.updated} updated, {syncMutation.data.errors} errors
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Registered Tokens
          </CardTitle>
          <CardDescription>
            {data?.count || 0} tokens in registry
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-center">Decimals</TableHead>
                  <TableHead className="text-center">Holders</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.tokens.map((token) => (
                  <TableRow key={token.id} data-testid={`row-token-${token.id}`}>
                    <TableCell>
                      <Badge variant="secondary" data-testid={`badge-symbol-${token.id}`}>
                        {token.symbol}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium" data-testid={`text-name-${token.id}`}>
                      {token.name}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded" data-testid={`text-address-${token.id}`}>
                        {formatAddress(token.address)}
                      </code>
                    </TableCell>
                    <TableCell className="text-center" data-testid={`text-decimals-${token.id}`}>
                      {token.decimals}
                    </TableCell>
                    <TableCell className="text-center" data-testid={`text-holders-${token.id}`}>
                      {token.holders ? token.holders.toLocaleString() : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" data-testid={`badge-chain-${token.id}`}>
                        {token.chain.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm" data-testid={`text-updated-${token.id}`}>
                      {formatDate(token.lastUpdatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
                {(!data?.tokens || data.tokens.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No tokens registered. Click "Sync Known Tokens" to populate.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
