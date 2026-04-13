import { createFileRoute } from '@tanstack/react-router';
import { seedAdminUser } from '@/lib/seed-admin.functions';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/setup')({
  component: SetupPage,
});

function SetupPage() {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSeed = async () => {
    setLoading(true);
    try {
      const res = await seedAdminUser();
      setResult(JSON.stringify(res));
    } catch (e: any) {
      setResult(e.message);
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold">Setup</h1>
        <Button onClick={handleSeed} disabled={loading}>
          {loading ? 'Setting up...' : 'Create Admin User'}
        </Button>
        {result && <pre className="text-sm bg-muted p-4 rounded">{result}</pre>}
      </div>
    </div>
  );
}
