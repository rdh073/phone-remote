import { useEffect } from 'react';
import { useAuthStore } from './stores/auth';
import { useConfigStore } from './stores/config';
import { useDevicesStore } from './stores/devices';
import { useLayoutStore } from './stores/layout';
import { useScenesStore } from './stores/scenes';
import { Login } from './Login';
import { Grid } from './Grid';
import { Sidebar } from './Sidebar';
import { Detail } from './Detail';
import { Topbar } from './Topbar';
import { Provisioning } from './Provisioning';
import { Assistant } from './Assistant';
import { ActivityDrawer } from './components/ActivityDrawer';
import { CommandPalette } from './components/CommandPalette';
import { ContextMenuHost } from './components/ContextMenu';
import { DialogHost } from './components/DialogHost';
import { ScratchPad } from './components/ScratchPad';
import { SettingsModal } from './components/SettingsModal';
import { ShortcutsOverlay } from './components/ShortcutsOverlay';
import { ToastHost } from './components/ToastHost';
import { WallboardExitButton } from './components/WallboardExitButton';
import { useDeviceAutoRefresh } from './hooks/useDeviceAutoRefresh';
import { useFilterUrlSync } from './hooks/useFilterUrlSync';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { useLastSeenTracker } from './hooks/useLastSeenTracker';
import { useThemeStore } from './stores/theme';

export function App() {
  const authStatus = useAuthStore((s) => s.status);
  const check = useAuthStore((s) => s.check);
  const refresh = useDevicesStore((s) => s.refresh);
  const loadScenes = useScenesStore((s) => s.load);
  const loadConfig = useConfigStore((s) => s.load);

  useGlobalShortcuts();
  useDeviceAutoRefresh(authStatus === 'authed');
  useLastSeenTracker();
  useFilterUrlSync();
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  useEffect(() => {
    check();
  }, [check]);

  useEffect(() => {
    if (authStatus !== 'authed') return;
    loadConfig();
    loadScenes();
    refresh();
  }, [authStatus, loadConfig, loadScenes, refresh]);

  if (authStatus === 'checking') {
    return (
      <main className="min-h-screen ui-popover-surface text-zinc-400 flex items-center justify-center text-sm">
        Loading…
      </main>
    );
  }

  if (authStatus === 'unauthed') return <Login />;
  return <AuthedShell />;
}

function AuthedShell() {
  const wallboard = useLayoutStore((s) => s.wallboard);
  return (
    <main className="h-screen ui-popover-surface text-zinc-100 flex flex-col overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-3 focus:py-2 focus:rounded focus:bg-cyan-400 focus:text-zinc-950 focus:text-xs focus:font-semibold focus:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        Skip to device grid
      </a>
      <Provisioning />
      {!wallboard && <Topbar />}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {!wallboard && <Sidebar />}
        <Grid />
        {!wallboard && <Assistant />}
      </div>
      <Detail />
      <ActivityDrawer />
      <ShortcutsOverlay />
      <CommandPalette />
      <ContextMenuHost />
      <SettingsModal />
      <DialogHost />
      <ToastHost />
      <ScratchPad />
      {wallboard && <WallboardExitButton />}
    </main>
  );
}
