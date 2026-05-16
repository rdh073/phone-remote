import { useState, type FormEvent } from 'react';
import { LockKeyhole, Smartphone } from 'lucide-react';
import { useAuthStore } from './stores/auth';

export function Login() {
  const login = useAuthStore((s) => s.login);
  const error = useAuthStore((s) => s.error);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await login(username, password);
    setBusy(false);
  };

  return (
    <main className="min-h-screen ui-popover-surface text-zinc-100 flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm ui-modal-surface border border-zinc-800 rounded-lg p-6 space-y-5 shadow-2xl"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded bg-cyan-400 text-zinc-950 flex items-center justify-center">
            <Smartphone size={19} />
          </div>
          <div>
            <p className="text-lg font-semibold">phone-remote</p>
            <p className="text-[11px] text-zinc-500">operator command center</p>
          </div>
        </div>
        <p className="text-sm text-zinc-400">Sign in to access streams, controls, and provisioning.</p>
        {error && <p className="text-red-300 text-sm border border-red-900 bg-red-950/40 rounded px-3 py-2">{error}</p>}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-400">Username</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            className="ui-popover-surface border border-zinc-800 rounded px-3 py-2 focus:outline-none focus:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-400">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            autoComplete="current-password"
            className="ui-popover-surface border border-zinc-800 rounded px-3 py-2 focus:outline-none focus:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-500"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full h-10 inline-flex items-center justify-center gap-2 bg-cyan-400 text-zinc-950 rounded px-3 text-sm font-medium disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        >
          <LockKeyhole size={15} />
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
