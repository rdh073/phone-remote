import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ColorTag = 'cyan' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';
export const COLOR_TAGS: ColorTag[] = ['cyan', 'emerald', 'amber', 'rose', 'violet', 'slate'];

type State = {
  colors: Record<string, ColorTag>;
  setColor: (serial: string, color: ColorTag | null) => void;
};

export const useColorsStore = create<State>()(
  persist(
    (set) => ({
      colors: {},
      setColor: (serial, color) =>
        set((s) => {
          if (color == null) {
            const { [serial]: _drop, ...rest } = s.colors;
            return { colors: rest };
          }
          return { colors: { ...s.colors, [serial]: color } };
        }),
    }),
    { name: 'phone-remote-colors' },
  ),
);

/** Tailwind background class for a color tag, used for the dot + left-edge bar. */
export function colorBgClass(color: ColorTag | undefined | null): string {
  switch (color) {
    case 'cyan': return 'bg-cyan-400';
    case 'emerald': return 'bg-emerald-400';
    case 'amber': return 'bg-amber-400';
    case 'rose': return 'bg-rose-400';
    case 'violet': return 'bg-violet-400';
    case 'slate': return 'bg-slate-400';
    default: return 'bg-transparent';
  }
}

export function colorRingClass(color: ColorTag | undefined | null): string {
  switch (color) {
    case 'cyan': return 'ring-cyan-400/40';
    case 'emerald': return 'ring-emerald-400/40';
    case 'amber': return 'ring-amber-400/40';
    case 'rose': return 'ring-rose-400/40';
    case 'violet': return 'ring-violet-400/40';
    case 'slate': return 'ring-slate-400/40';
    default: return 'ring-transparent';
  }
}
