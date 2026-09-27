let iosHapticCheckbox: HTMLInputElement | null = null;
let iosHapticLabel: HTMLLabelElement | null = null;

function triggerIosHaptic() {
  if (typeof document === 'undefined') return;
  try {
    if (!iosHapticLabel) {
      iosHapticCheckbox = document.createElement('input');
      iosHapticCheckbox.type = 'checkbox';
      iosHapticCheckbox.setAttribute('switch', '');
      iosHapticCheckbox.id = 'ios-haptic-trigger-switch';
      iosHapticCheckbox.style.position = 'fixed';
      iosHapticCheckbox.style.top = '-9999px';
      iosHapticCheckbox.style.left = '-9999px';
      iosHapticCheckbox.style.opacity = '0';
      iosHapticCheckbox.style.pointerEvents = 'none';

      iosHapticLabel = document.createElement('label');
      iosHapticLabel.htmlFor = 'ios-haptic-trigger-switch';
      iosHapticLabel.style.position = 'fixed';
      iosHapticLabel.style.top = '-9999px';
      iosHapticLabel.style.left = '-9999px';
      iosHapticLabel.style.opacity = '0';
      iosHapticLabel.style.pointerEvents = 'none';

      document.body.appendChild(iosHapticCheckbox);
      document.body.appendChild(iosHapticLabel);
    }
    iosHapticLabel.click();
  } catch (e) {}
}

export const triggerHaptic = (type: 'single' | 'double' | 'tick' | number | number[] = 'single') => {
  if (localStorage.getItem('haptics') !== 'true') return;
  const intensity = parseInt(localStorage.getItem('haptic_intensity') || '3');
  
  // Calculate base duration for single vibration
  // intensity mapping:
  // 1: 15ms (Very light tick)
  // 2: 30ms (Soft tap)
  // 3: 50ms (Medium buzz)
  // 4: 75ms (Firm buzz)
  // 5: 110ms (Strong buzz)
  const baseDuration = intensity === 1 ? 2
                     : intensity === 2 ? 5
                     : intensity === 3 ? 28
                     : intensity === 4 ? 55
                     : 110;

  let pattern: number | number[];
  
  if (typeof type === 'number') {
    // scale custom duration based on intensity ratio to medium (intensity 3 = 50ms)
    const ratio = baseDuration / 28;
    pattern = Math.max(baseDuration, Math.round(type * ratio));
  } else if (Array.isArray(type)) {
    const ratio = baseDuration / 28;
    pattern = type.map((val, idx) => {
      if (idx % 2 === 0) { // vibrate duration
        return Math.max(baseDuration, Math.round(val * ratio));
      }
      return val; // gap duration remains unchanged
    });
  } else if (type === 'tick') {
    pattern = Math.max(Math.round(baseDuration * 0.5), 1); // even lighter but palpable
  } else if (type === 'double') {
    pattern = [baseDuration, 40, baseDuration];
  } else { // 'single'
    pattern = baseDuration;
  }

  // 1. Standard Web Vibration API (Android Chrome, desktop, etc.)
  try {
    if (window.navigator?.vibrate) {
      window.navigator.vibrate(pattern);
    }
  } catch (e) {
    console.warn("Haptics vibration failed:", e);
  }

  // 2. iOS Safari / WebKit Taptic Engine workaround
  try {
    const isIOS = typeof navigator !== 'undefined' && (
      /iPad|iPhone|iPod/.test(navigator.userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
    if (isIOS) {
      triggerIosHaptic();
    }
  } catch (e) {}
};
