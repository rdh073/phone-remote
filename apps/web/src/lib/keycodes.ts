/** Android KeyEvent constants. Mirror frameworks/base/core/java/android/view/KeyEvent.java. */
export const KEYCODE = {
  HOME: 3,
  BACK: 4,
  VOLUME_UP: 24,
  VOLUME_DOWN: 25,
  POWER: 26,
  APP_SWITCH: 187,
} as const;

export type Keycode = (typeof KEYCODE)[keyof typeof KEYCODE];
