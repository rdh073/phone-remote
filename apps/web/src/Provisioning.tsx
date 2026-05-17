import { useEffect, useState, type FormEvent } from 'react';
import { Check, Copy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useProvisioningStore, type ProvisioningTab } from './stores/provisioning';
import { useDevicesStore } from './stores/devices';
import { useConfigStore } from './stores/config';

export function Provisioning() {
  const open = useProvisioningStore((s) => s.open);
  if (!open) return null;
  return <ProvisioningModal />;
}

function ProvisioningModal() {
  const session = useProvisioningStore((s) => s.session);
  const status = useProvisioningStore((s) => s.status);
  const error = useProvisioningStore((s) => s.error);
  const serial = useProvisioningStore((s) => s.serial);
  const cancel = useProvisioningStore((s) => s.cancel);
  const close = useProvisioningStore((s) => s.close);
  const tab = useProvisioningStore((s) => s.tab);
  const setTab = useProvisioningStore((s) => s.setTab);
  const refresh = useDevicesStore((s) => s.refresh);
  const tailnet = useConfigStore((s) => s.tailnet);
  const mdns = useConfigStore((s) => s.mdns);
  const hasTailscaleStep = Boolean(session?.authKey && session?.loginServer);
  // mdns === false means the hub's boot probe said the multicast socket can't
  // bind on this host (avahi conflict, container netns, etc). QR is then
  // structurally unavailable for ANY session kind on this hub, not just
  // tailnet sessions. null/true → assume available (back-compat with old hubs).
  const qrAvailable = mdns !== false;

  // The QR tab is LAN-only (mDNS doesn't cross WireGuard), so route a tailnet
  // session away from it even if a stale UI event tries to select QR.
  // Same redirect when the hub-wide mDNS capability is false.
  useEffect(() => {
    if ((hasTailscaleStep || !qrAvailable) && tab === 'qr') setTab('manual');
  }, [hasTailscaleStep, qrAvailable, setTab, tab]);

  return (
    <div className="fixed inset-0 ui-modal-overlay ui-modal-overlay-65 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="ui-modal-surface border border-zinc-800 bg-zinc-950 rounded-lg w-full max-w-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Add device</h2>
            {hasTailscaleStep ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
                <StageChip n={1} tone="blue" label="join tailnet" />
                <span aria-hidden className="text-zinc-600">→</span>
                <StageChip n={2} tone="cyan" label="pair ADB" />
              </div>
            ) : (
              <p className="mt-1 text-xs text-zinc-500">
                Pair the phone over wireless debugging on the same LAN as the hub.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => (status === 'done' ? close() : cancel())}
            className="text-zinc-400 hover:text-zinc-100 text-xs px-2 py-1 rounded border border-zinc-800 bg-zinc-900 ui-chip-surface"
          >
            close
          </button>
        </div>

        {status === 'starting' && <p className="text-zinc-400">Preparing session…</p>}

        {error && (
          <p className="text-red-400 text-sm bg-red-950/30 border border-red-900 rounded p-2 break-words">
            {error}
          </p>
        )}

        {session && status !== 'done' && (
          <>
            <TabSwitch tab={tab} onChange={setTab} hasTailscaleStep={hasTailscaleStep} qrAvailable={qrAvailable} />
            {tab === 'tailnet' && session.authKey && session.loginServer && (
              <TailscaleStep
                authKey={session.authKey}
                loginServer={session.loginServer}
                onContinue={() => setTab('manual')}
              />
            )}
            {tab === 'qr' && !hasTailscaleStep && qrAvailable && (
              <QrPair
                qrPayload={session.qrPayload}
                status={status}
                tailnet={Boolean(tailnet)}
                onSwitchToManual={() => setTab('manual')}
              />
            )}
            {tab === 'manual' && (
              <>
                {hasTailscaleStep ? (
                  <TailnetPairIntro onJump={() => setTab('tailnet')} />
                ) : (
                  <LanIntro />
                )}
                <PairForm disabled={status === 'pairing'} />
              </>
            )}
            {tab === 'usb' && (
              <UsbConnect
                disabled={status === 'pairing'}
                hasTailscaleStep={hasTailscaleStep}
                onBackToTailscale={() => setTab('tailnet')}
              />
            )}
          </>
        )}

        {status === 'done' && serial && (
          <div className="space-y-3">
            <p className="text-emerald-400">Paired successfully</p>
            <p className="font-mono text-sm break-all text-zinc-300">{serial}</p>
            <button
              type="button"
              onClick={() => {
                refresh();
                close();
              }}
              className="bg-cyan-500 hover:bg-cyan-400 text-zinc-950 rounded px-3 py-1.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Subtitle chip rendered when both stages exist. Stage 1 (Tailscale onboarding)
// uses the blue tint that telegraphs "do this first"; stage 2 (ADB pairing)
// uses cyan, matching the stage badges inside the tab strip below.
function StageChip({
  n,
  tone,
  label,
}: {
  n: number;
  tone: 'blue' | 'cyan';
  label: string;
}) {
  const dotTone =
    tone === 'blue'
      ? 'border-blue-500/55 bg-blue-500/20 text-blue-100'
      : 'border-cyan-500/50 bg-cyan-500/20 text-cyan-100';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full border px-1 font-mono text-[9px] tabular-nums ${dotTone}`}
      >
        {n}
      </span>
      <span className="text-zinc-300">{label}</span>
    </span>
  );
}

function TabSwitch({
  tab,
  onChange,
  hasTailscaleStep,
  qrAvailable,
}: {
  tab: ProvisioningTab;
  onChange: (t: ProvisioningTab) => void;
  hasTailscaleStep: boolean;
  qrAvailable: boolean;
}) {
  // Tabs are content-sized (no flex-1) so the strip reads as discrete pills
  // rather than a stretched row — labels vary too much in width for fair
  // stretch (8 chars for "QR" vs 20 for "Tailscale onboarding").
  const base =
    'inline-flex items-center justify-center gap-1.5 text-[11px] py-1.5 px-2.5 rounded border transition-colors duration-[120ms]';
  const active = 'bg-zinc-800 border-zinc-600 text-zinc-100 ui-chip-surface ui-chip-surface-active';
  const inactive = 'border-zinc-800 bg-zinc-900 ui-chip-surface text-zinc-400 hover:text-zinc-100';
  // Stage-1 (Tailscale) badge is blue-tinted to telegraph "do this first";
  // stage-2 badges (the three ADB-pair tabs) stay cyan so they read as the
  // same step in different flavours.
  const stepBadge = (n: number, on: boolean) => {
    const onTone =
      n === 1
        ? 'border-blue-500/55 bg-blue-500/20 text-blue-100'
        : 'border-cyan-500/50 bg-cyan-500/20 text-cyan-100';
    const offTone = 'border-zinc-700 bg-zinc-900 ui-chip-surface text-zinc-500';
    return (
      <span
        className={`inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full border px-1 font-mono text-[9px] tabular-nums ${
          on ? onTone : offTone
        }`}
      >
        {n}
      </span>
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1" role="tablist" aria-label="Add device stages">
      {hasTailscaleStep && (
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'tailnet'}
          onClick={() => onChange('tailnet')}
          className={`${base} ${tab === 'tailnet' ? active : inactive}`}
        >
          {stepBadge(1, tab === 'tailnet')}
          <span>Tailscale onboarding</span>
        </button>
      )}
      {hasTailscaleStep && (
        <span
          aria-hidden
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500 pl-1"
        >
          Method
        </span>
      )}
      {!hasTailscaleStep && qrAvailable && (
        <>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'qr'}
            onClick={() => onChange('qr')}
            className={`${base} ${tab === 'qr' ? active : inactive}`}
            title="Phone scans QR via Android Wireless debugging — phone must be on the same LAN as the hub"
          >
            <span>Wireless debug QR</span>
          </button>
          <OrSep />
        </>
      )}
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'manual'}
        onClick={() => onChange('manual')}
        className={`${base} ${tab === 'manual' ? active : inactive}`}
        title="Matches Android's 'Pair device with pairing code' — type the IP + 6-digit code from the phone"
      >
        <span>Pairing code</span>
      </button>
      <OrSep />
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'usb'}
        onClick={() => onChange('usb')}
        className={`${base} ${tab === 'usb' ? active : inactive}`}
        title="Phone is USB-tethered to your laptop — run `adb tcpip 5555` there, then hub `adb connect`s over the tailnet"
      >
        <span>ADB over USB</span>
      </button>
    </div>
  );
}

// "OR" separator between the alternative ADB-pair method tabs. zinc-100
// matches the active tab label brightness so the separator is clearly
// readable and reads as part of the primary tab strip, not as muted chrome.
function OrSep() {
  return (
    <span
      aria-hidden
      className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-100 px-0.5"
    >
      or
    </span>
  );
}

function QrPair({
  qrPayload,
  status,
  tailnet,
  onSwitchToManual,
}: {
  qrPayload: string;
  status: string;
  tailnet: boolean;
  onSwitchToManual: () => void;
}) {
  const pairQr = useProvisioningStore((s) => s.pairQr);
  const pairIp = useProvisioningStore((s) => s.pairIp);
  const qrConnectPort = useProvisioningStore((s) => s.pairDraft.connectPort);
  const setQrConnectPort = useProvisioningStore((s) => s.setQrConnectPort);
  const qrAutoStarted = useProvisioningStore((s) => s.qrAutoStarted);
  const markQrAutoStarted = useProvisioningStore((s) => s.markQrAutoStarted);
  const qrRetryAvailable = useProvisioningStore((s) => s.qrRetryAvailable);

  useEffect(() => {
    if (status === 'awaiting-pair' && !qrAutoStarted) {
      markQrAutoStarted();
      void pairQr();
    }
  }, [markQrAutoStarted, pairQr, qrAutoStarted, status]);

  if (status === 'mdns-timeout') {
    return (
      <div className="space-y-3 text-sm">
        {tailnet && (
          <p className="text-zinc-300">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300/80 mr-1.5">Stage 2</span>
            Couldn't see the phone on the LAN.
          </p>
        )}
        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-[12.5px] text-amber-100 space-y-1.5">
          <p className="font-medium">QR pairing needs the phone on the same LAN as the hub.</p>
          <p className="text-amber-200/85">
            If your phone is only reachable over Tailscale (mobile data, different Wi-Fi, AP isolation), the hub can't
            hear its <span className="font-mono">_adb-tls-pairing._tcp</span> mDNS announcement.{' '}
            <span className="text-amber-100">Use Pairing code instead</span> — it talks unicast over the tailnet to{' '}
            <span className="font-mono">100.x.y.z</span>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSwitchToManual}
            className="inline-flex items-center justify-center gap-1.5 rounded border border-cyan-400 bg-cyan-500 text-zinc-950 px-3 py-1.5 text-xs font-semibold hover:bg-cyan-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            Switch to Pairing code
            <span aria-hidden>→</span>
          </button>
          {qrRetryAvailable && (
            <button
              type="button"
              onClick={() => {
                void pairQr();
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 ui-chip-surface px-3 py-1.5 text-xs text-zinc-300 hover:text-zinc-100 hover:border-zinc-600"
              title="Retry with a longer (120s) discovery window — useful only if QR was working before and the LAN is just slow"
            >
              Retry QR (longer wait)
            </button>
          )}
        </div>
      </div>
    );
  }

  if (status === 'awaiting-connect-port') {
    return (
    <div className="space-y-3 text-sm">
      <p className="text-emerald-400">Phone paired ✓</p>
        <p className="text-zinc-300">
          Couldn't auto-discover the connect port. On the phone's <span className="font-medium">Wireless debugging</span>{' '}
          screen (not the pair dialog), read the number after the colon in <span className="font-medium">IP address & Port</span>:
        </p>
        <div className="font-mono text-xs text-zinc-400">{pairIp}:<span className="text-zinc-100">?</span></div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(qrConnectPort);
            if (Number.isFinite(n) && n > 0) void pairQr(n);
          }}
          className="flex gap-2"
        >
          <input
            id="qr-connect-port"
            name="connectPort"
            type="number"
            inputMode="numeric"
            value={qrConnectPort}
            onChange={(e) => setQrConnectPort(e.target.value)}
            placeholder="38743"
            aria-label="Connect port"
            className="flex-1 bg-zinc-950 ui-popover-surface border border-zinc-800 rounded px-2 py-1 text-zinc-100 text-sm font-mono"
            autoFocus
            required
          />
          <button
            type="submit"
            className="bg-zinc-700 ui-chip-surface text-zinc-100 rounded px-3 py-1.5 text-sm font-medium"
          >
            Connect
          </button>
        </form>
      </div>
    );
  }

  const label =
    status === 'pairing'
      ? 'Waiting for phone to scan…'
      : status === 'error'
      ? 'QR pairing failed — retry below'
      : 'Ready';

  return (
    <div className="space-y-3 text-sm">
      <p className="text-zinc-300">
        {tailnet && (
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300/80 mr-1.5">Stage 2</span>
        )}
        On the Android phone, enable <span className="font-medium">Developer Options → Wireless debugging</span> and tap{' '}
        <span className="font-medium">Pair device with QR code</span>. Then scan:
      </p>
      <div className="flex justify-center">
      <div className="bg-zinc-800/80 ui-popover-surface border border-zinc-700 p-3 rounded">
        <QRCodeSVG value={qrPayload} size={224} level="M" />
      </div>
      </div>
      <p className="text-center text-zinc-400 text-xs">{label}</p>
      {tailnet && (
        <p className="text-[11px] text-amber-300/80 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5">
          Heads up: this QR uses Android's <span className="font-medium">Wireless debugging</span> mDNS pairing — it
          only works when the phone is on the same LAN as the hub. For a remote phone, do{' '}
          <span className="font-medium">Tailscale onboarding</span> first, then use <span className="font-medium">Manual</span>{' '}
          with the phone's <span className="font-mono">100.x.y.z</span> address.
        </p>
      )}
      {status === 'error' && (
        <button
          type="button"
          onClick={() => {
            void pairQr();
          }}
          className="w-full bg-zinc-700 ui-chip-surface text-zinc-100 rounded px-3 py-1.5 text-sm font-medium"
        >
          Retry
        </button>
      )}
    </div>
  );
}

function TailscaleStep({
  authKey,
  loginServer,
  onContinue,
}: {
  authKey: string;
  loginServer: string;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-zinc-300">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300/80 mr-1.5">Stage 1</span>
        Join the phone to the tailnet. Install the <span className="font-medium">Tailscale</span> Android app and follow the two steps below.
      </p>

      <ol className="space-y-2.5 rounded border border-zinc-800 bg-zinc-950/40 ui-modal-surface p-3 text-[12px] text-zinc-300">
        <li className="flex gap-2.5">
          <span className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-500/45 bg-cyan-500/15 font-mono text-[11px] tabular-nums text-cyan-100">
            1
          </span>
          <div className="min-w-0 space-y-1.5">
            <p>
              Point Tailscale at the <span className="font-medium">login server</span>. On the logged-out screen, tap the{' '}
              <span className="font-medium">⋮ menu (top right)</span> → <span className="font-medium">"Use alternate server"</span>,
              then paste (or scan, if your Tailscale version supports it):
            </p>
            <CopyField label="Login server" value={loginServer} />
          </div>
        </li>
        <li className="flex gap-2.5">
          <span className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-500/45 bg-cyan-500/15 font-mono text-[11px] tabular-nums text-cyan-100">
            2
          </span>
          <div className="min-w-0 space-y-1.5">
            <p>
              Back on the login screen, tap the <span className="font-medium">⋮ menu</span> →{' '}
              <span className="font-medium">"Sign in with auth key"</span>, then tap the QR icon and scan:
            </p>
            <CopyField label="Auth key" value={authKey} />
          </div>
        </li>
      </ol>

      <div className="flex items-center justify-center gap-6 pt-1">
        <QrPanel index={1} caption="Login server" value={loginServer} />
        <span
          aria-hidden
          className="flex flex-col items-center gap-1 text-zinc-600"
          title="Scan in order"
        >
          <span className="block w-7 border-t border-zinc-700/70"></span>
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">then</span>
          <span className="block w-7 border-t border-zinc-700/70"></span>
        </span>
        <QrPanel index={2} caption="Auth key" value={authKey} />
      </div>
      <p className="text-[11px] text-zinc-500 pt-1">
        After the phone shows <span className="text-zinc-300">connected</span> with a <span className="font-mono">100.x.y.z</span>{' '}
        address, continue to stage 2 to pair ADB over wireless debugging.
      </p>
      <button
        type="button"
        onClick={onContinue}
        className="w-full inline-flex items-center justify-center gap-2 rounded border border-cyan-400 bg-cyan-500 text-zinc-950 px-3 py-2 text-xs font-semibold hover:bg-cyan-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
      >
        Continue to ADB pairing
        <span aria-hidden>→</span>
      </button>
    </div>
  );
}

function TailnetPairIntro({ onJump }: { onJump: () => void }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="text-zinc-300">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300/80 mr-1.5">Stage 2</span>
        Pair the phone's ADB over wireless debugging. Enable{' '}
        <span className="font-medium">Developer Options → Wireless debugging</span> on the phone, tap{' '}
        <span className="font-medium">Pair device with pairing code</span>, then enter the phone's Tailscale IP +
        pairing details below.
      </p>
      <p className="text-[11px] text-zinc-500">
        Haven't joined the tailnet yet? <button type="button" onClick={onJump} className="text-cyan-300 hover:text-cyan-200 underline">Go back to stage 1</button>.
      </p>
    </div>
  );
}

function LanIntro() {
  return (
    <p className="text-sm text-zinc-300">
      On the Android phone, enable <span className="font-medium">Developer Options → Wireless debugging</span> and tap{' '}
      <span className="font-medium">Pair device with pairing code</span>. The phone must be reachable from the hub on
      the local network.
    </p>
  );
}

function UsbConnect({
  disabled,
  hasTailscaleStep,
  onBackToTailscale,
}: {
  disabled: boolean;
  hasTailscaleStep: boolean;
  onBackToTailscale: () => void;
}) {
  const connect = useProvisioningStore((s) => s.connect);
  const draft = useProvisioningStore((s) => s.usbDraft);
  const patchDraft = useProvisioningStore((s) => s.patchUsbDraft);

  const handleIpPaste = (raw: string) => {
    const match = raw.trim().match(/^(.+?):(\d+)$/);
    if (match) {
      patchDraft({ ip: match[1]!, port: match[2]! });
    } else {
      patchDraft({ ip: raw.trim() });
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(draft.port);
    if (!draft.ip.trim() || !Number.isFinite(n) || n <= 0) return;
    void connect({ ip: draft.ip.trim(), port: n });
  };

  return (
    <div className="space-y-3 text-sm">
      <p className="text-zinc-300">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300/80 mr-1.5">Stage 2</span>
        Phone is tethered to your laptop via USB and is already on the tailnet. Enable ADB-over-TCP from your laptop,
        then the hub connects over the phone's <span className="font-mono">100.x.y.z</span> address.
      </p>
      {hasTailscaleStep && (
        <p className="text-[11px] text-zinc-500">
          Haven't joined the tailnet yet?{' '}
          <button type="button" onClick={onBackToTailscale} className="text-cyan-300 hover:text-cyan-200 underline">
            Go back to stage 1
          </button>
          .
        </p>
      )}

      <ol className="space-y-2.5 rounded border border-zinc-800 bg-zinc-950/40 ui-modal-surface p-3 text-[12px] text-zinc-300">
        <li className="flex gap-2.5">
          <UsbStepBadge n={1} />
          <p className="min-w-0">
            Plug the phone into your laptop via USB. On the phone, tap{' '}
            <span className="font-medium">Allow USB debugging</span> when prompted.
          </p>
        </li>
        <li className="flex gap-2.5">
          <UsbStepBadge n={2} />
          <div className="min-w-0 space-y-1.5">
            <p>
              On your laptop (where the phone is plugged in), open a terminal and run:
            </p>
            <CopyField label="On your laptop" value="adb tcpip 5555" />
            <p className="text-[11px] text-zinc-500">
              Output should look like <span className="font-mono text-zinc-300">restarting in TCP mode port: 5555</span>.
              You can unplug the USB cable after this.
            </p>
          </div>
        </li>
        <li className="flex gap-2.5">
          <UsbStepBadge n={3} />
          <div className="min-w-0 space-y-1.5">
            <p>
              Look up the phone's tailnet IP — open the <span className="font-medium">Tailscale</span> app on the phone,
              the address shown at the top is the <span className="font-mono">100.x.y.z</span> to use below.
            </p>
          </div>
        </li>
      </ol>

      <form onSubmit={submit} className="space-y-3 pt-2 border-t border-zinc-800">
        <FieldGroup
          step="4"
          title="Connect"
          hint={
            <>
              Paste the phone's tailnet IP. Default port is{' '}
              <span className="font-mono text-zinc-300">5555</span> unless you used a different one with{' '}
              <span className="font-mono">adb tcpip &lt;port&gt;</span>.
            </>
          }
        >
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <LabeledInput
              label="Phone tailnet IP"
              value={draft.ip}
              onChange={handleIpPaste}
              placeholder="100.64.0.5"
              hint="paste full host:port and we'll split it"
            />
            <LabeledInput label="Port" value={draft.port} onChange={(port) => patchDraft({ port })} placeholder="5555" />
          </div>
        </FieldGroup>

        <button
          type="submit"
          disabled={disabled || !draft.ip.trim() || !draft.port.trim()}
          className="w-full inline-flex items-center justify-center gap-2 rounded border border-cyan-500/45 bg-cyan-500/15 text-cyan-100 px-3 py-2 text-xs font-medium hover:bg-cyan-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {disabled ? 'Connecting…' : 'Connect'}
        </button>
      </form>
    </div>
  );
}

function UsbStepBadge({ n }: { n: number }) {
  return (
    <span className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-500/45 bg-cyan-500/15 font-mono text-[11px] tabular-nums text-cyan-100">
      {n}
    </span>
  );
}

function QrPanel({
  caption,
  value,
  index,
}: {
  caption: string;
  value: string;
  index?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {index != null && (
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-500/45 bg-cyan-500/15 font-mono text-[11px] tabular-nums text-cyan-100"
          aria-label={`Step ${index}`}
        >
          {index}
        </span>
      )}
      <div className="bg-zinc-800/80 ui-popover-surface border border-zinc-700 p-2 rounded shadow-[0_4px_14px_-6px_rgba(0,0,0,0.6)]">
        <QRCodeSVG value={value} size={128} level="M" />
      </div>
      <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-400">{caption}</span>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-400 text-xs w-24">{label}</span>
      <code className="flex-1 text-xs bg-zinc-950 ui-modal-surface border border-zinc-800 rounded px-2 py-1 truncate">
        {value}
      </code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        title={copied ? 'Copied' : 'Copy to clipboard'}
        aria-label={copied ? 'Copied' : 'Copy to clipboard'}
        className={`inline-flex h-7 w-7 items-center justify-center rounded border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
          copied
            ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
            : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-100'
        }`}
      >
        {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} />}
      </button>
    </div>
  );
}

function PairForm({ disabled }: { disabled: boolean }) {
  const pair = useProvisioningStore((s) => s.pair);
  const tailnet = useConfigStore((s) => s.tailnet);
  const draft = useProvisioningStore((s) => s.pairDraft);
  const patchDraft = useProvisioningStore((s) => s.patchPairDraft);

  // Convenience: paste "192.168.1.169:38831" into the IP field and we'll split it.
  const handleIpPaste = (raw: string) => {
    const match = raw.trim().match(/^(.+?):(\d+)$/);
    if (match) {
      patchDraft({
        ip: match[1]!,
        connectPort: draft.connectPort || match[2]!,
      });
    } else {
      patchDraft({ ip: raw });
    }
  };
  const handlePairPaste = (raw: string) => {
    const match = raw.trim().match(/^(?:.+:)?(\d+)$/);
    if (match) patchDraft({ pairPort: match[1]! });
    else patchDraft({ pairPort: raw });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    pair({
      ip: draft.ip.trim(),
      pairPort: Number(draft.pairPort),
      pairCode: draft.pairCode.trim(),
      connectPort: Number(draft.connectPort),
    });
  };

  const ipLabel = tailnet ? 'Tailscale IP' : 'Phone IP';
  const ipPlaceholder = tailnet ? '100.x.y.z' : '192.168.1.169';

  return (
    <form onSubmit={submit} className="space-y-3 pt-2 border-t border-zinc-800">
      <FieldGroup
        step="1"
        title="From the Wireless debugging screen"
        hint={
          <>
            The <span className="text-zinc-200 font-medium">IP address & Port</span> shown near the top — this is the
            persistent connect endpoint.
          </>
        }
      >
        <div className="grid grid-cols-[1fr_120px] gap-2">
          <LabeledInput
            label={ipLabel}
            value={draft.ip}
            onChange={handleIpPaste}
            placeholder={ipPlaceholder}
            hint="paste full host:port and we'll split it"
          />
          <LabeledInput
            label="Connect port"
            value={draft.connectPort}
            onChange={(connectPort) => patchDraft({ connectPort })}
            placeholder="38831"
          />
        </div>
      </FieldGroup>

      <FieldGroup
        step="2"
        title="From the “Pair with device” popup"
        hint={
          <>
            Tap <span className="text-zinc-200 font-medium">Pair device with pairing code</span> on the phone to open
            it. The port and 6-digit code change every time the popup opens.
          </>
        }
      >
        <div className="grid grid-cols-[120px_1fr] gap-2">
          <LabeledInput
            label="Pair port"
            value={draft.pairPort}
            onChange={handlePairPaste}
            placeholder="38249"
          />
          <LabeledInput
            label="6-digit code"
            value={draft.pairCode}
            onChange={(pairCode) => patchDraft({ pairCode })}
            placeholder="447373"
          />
        </div>
      </FieldGroup>

      <button
        type="submit"
        disabled={disabled}
        className="w-full bg-zinc-700 ui-chip-surface text-zinc-100 rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
        {disabled ? 'Pairing…' : 'Pair'}
      </button>
    </form>
  );
}

function FieldGroup({
  step,
  title,
  hint,
  children,
}: {
  step: string;
  title: string;
  hint: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/40 ui-modal-surface p-3 space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="h-5 w-5 inline-flex items-center justify-center rounded-full bg-cyan-500/15 text-cyan-200 font-mono text-[10px] tabular-nums">
          {step}
        </span>
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-300">{title}</span>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500 pl-7">{hint}</p>
      <div className="pl-7">{children}</div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  const name = label.toLowerCase().replace(/\W+/g, '-');
  return (
    <label className="text-xs text-zinc-400 flex flex-col gap-1">
      <span className="flex items-baseline justify-between gap-2">
        <span>{label}</span>
        {hint && <span className="text-[10px] text-zinc-600 truncate">{hint}</span>}
      </span>
      <input
        id={`pair-${name}`}
        name={name}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-zinc-950 ui-popover-surface border border-zinc-800 rounded px-2 py-1.5 text-zinc-100 text-sm font-mono focus:outline-none focus:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-500/40"
        required
      />
    </label>
  );
}
