import { getDeviceScreenshot } from './api';

export async function downloadDeviceScreenshot(serial: string): Promise<boolean> {
  try {
    const blob = await getDeviceScreenshot(serial);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${serial.replace(/[^a-z0-9.-]+/gi, '_')}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
