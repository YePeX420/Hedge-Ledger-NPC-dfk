import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Plus } from 'lucide-react';

export default function AdminExpenses() {
  return (
    <div className="p-6 space-y-6" data-testid="admin-expenses-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-muted-foreground">
            Track OpenAI, Replit, and other operational costs
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" data-testid="button-upload-expenses">
            <Upload className="w-4 h-4 mr-2" />
            Upload CSV
          </Button>
          <Button data-testid="button-add-expense">
            <Plus className="w-4 h-4 mr-2" />
            Add Expense
          </Button>
        </div>
      </div>

      {/* Placeholder content */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Expenses</CardTitle>
          <CardDescription>
            Expense tracking and reconciliation will be implemented in Phase 8
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center text-muted-foreground">
            <p>Expense management coming soon.</p>
            <p className="text-sm mt-2">
              This will include OpenAI API costs, Replit compute costs, and manual expense entries.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
