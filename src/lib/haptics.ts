export const triggerHaptic = (type: 'single' | 'double' | 'tick' | number | number[] = 'single') => {
  if (localStorage.getItem('haptics') !== 'true') return;
  const intensity = parseInt(localStorage.getItem('haptic_intensity') || '3');
  
  // Calculate base duration for single vibration
  // intensity mapping:
  // 1: 10ms (Very light tick)
  // 2: 25ms (Soft tap)
  // 3: 45ms (Medium buzz)
  // 4: 65ms (Firm buzz)
  // 5: 85ms (Strong buzz)
  const baseDuration = intensity === 1 ? 10
                     : intensity === 2 ? 25
                     : intensity === 3 ? 45
                     : intensity === 4 ? 65
                     : 85;

  let pattern: number | number[];
  
  if (typeof type === 'number') {
    // scale custom duration based on intensity ratio to medium (intensity 3 = 45ms)
    const ratio = baseDuration / 45;
    pattern = Math.max(5, Math.round(type * ratio));
  } else if (Array.isArray(type)) {
    const ratio = baseDuration / 45;
    pattern = type.map((val, idx) => {
      if (idx % 2 === 0) { // vibrate duration
        return Math.max(5, Math.round(val * ratio));
      }
      return val; // gap duration remains unchanged
    });
  } else if (type === 'tick') {
    pattern = Math.max(5, Math.round(baseDuration * 0.4)); // even lighter
  } else if (type === 'double') {
    pattern = [baseDuration, 40, baseDuration];
  } else { // 'single'
    pattern = baseDuration;
  }

  try {
    window.navigator?.vibrate?.(pattern);
  } catch (e) {
    console.warn("Haptics vibration failed:", e);
  }
};
