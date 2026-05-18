import { create } from 'zustand';

import { useDevicesStore } from './devices';
import { useReconnectStore } from './reconnect';

/**
 * Thumb-tile quality picker, YouTube-style. The selection drives the
 * `?maxSize&bitrate&fps` query string on every thumb WebSocket. Switching tier
 * bumps the per-serial reconnect counter for every known device, forcing all
 * thumb streams to tear down and re-attach with the new params; scrcpy cannot
 * hot-swap encode settings mid-stream so a brief reconnect blip is unavoidable.
 *
 * Only thumb streams (the grid) honour this — the focused-tile (main) stream
 * keeps its server-side preset, because operators want the detail view at the
 * highest the hub will give them.
 */

export type ThumbQualityTier = 'data-saver' | 'sd' | 'hd' | 'fhd';

export type ThumbQuality = {
  tier: ThumbQualityTier;
  maxSize: number;
  videoBitRate: number;
  maxFps: number;
};

export const THUMB_QUALITY_TIERS: Record<ThumbQualityTier, ThumbQuality> = {
  'data-saver': { tier: 'data-saver', maxSize: 480, videoBitRate: 1_000_000, maxFps: 15 },
  sd: { tier: 'sd', maxSize: 480, videoBitRate: 2_000_000, maxFps: 24 },
  hd: { tier: 'hd', maxSize: 720, videoBitRate: 2_500_000, maxFps: 24 },
  fhd: { tier: 'fhd', maxSize: 1080, videoBitRate: 4_500_000, maxFps: 30 },
};

export const THUMB_QUALITY_ORDER: ThumbQualityTier[] = ['data-saver', 'sd', 'hd', 'fhd'];

export const THUMB_QUALITY_LABELS: Record<ThumbQualityTier, { label: string; sublabel: string }> = {
  'data-saver': { label: 'Data saver', sublabel: '480p · 1 Mbps · 15 fps' },
  sd: { label: 'SD', sublabel: '480p · 2 Mbps · 24 fps' },
  hd: { label: 'HD', sublabel: '720p · 2.5 Mbps · 24 fps' },
  fhd: { label: 'Full HD', sublabel: '1080p · 4.5 Mbps · 30 fps' },
};

const STORAGE_KEY = 'phone-remote-thumb-quality';
const DEFAULT_TIER: ThumbQualityTier = 'hd';

function readInitialTier(): ThumbQualityTier {
  if (typeof window === 'undefined') return DEFAULT_TIER;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return isThumbQualityTier(saved) ? saved : DEFAULT_TIER;
}

function isThumbQualityTier(v: unknown): v is ThumbQualityTier {
  return v === 'data-saver' || v === 'sd' || v === 'hd' || v === 'fhd';
}

type State = {
  tier: ThumbQualityTier;
  setTier: (tier: ThumbQualityTier) => void;
};

export const useVideoQualityStore = create<State>()((set, get) => ({
  tier: readInitialTier(),
  setTier: (tier) => {
    if (get().tier === tier) return;
    set({ tier });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, tier);
    }
    // Force every thumb stream to reconnect with the new params. Bumping the
    // reconnect counter triggers the useScrcpyStream effect cleanup → fresh WS
    // with updated query string.
    const serials = useDevicesStore.getState().devices.map((d) => d.serial);
    const bump = useReconnectStore.getState().bump;
    for (const serial of serials) bump(serial);
  },
}));

export function getThumbQuality(tier: ThumbQualityTier): ThumbQuality {
  return THUMB_QUALITY_TIERS[tier];
}
