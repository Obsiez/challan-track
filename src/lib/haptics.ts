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
  const baseDuration = intensity === 1 ? 15
                     : intensity === 2 ? 30
                     : intensity === 3 ? 50
                     : intensity === 4 ? 75
                     : 110;

  let pattern: number | number[];
  
  if (typeof type === 'number') {
    // scale custom duration based on intensity ratio to medium (intensity 3 = 50ms)
    const ratio = baseDuration / 50;
    pattern = Math.max(8, Math.round(type * ratio));
  } else if (Array.isArray(type)) {
    const ratio = baseDuration / 50;
    pattern = type.map((val, idx) => {
      if (idx % 2 === 0) { // vibrate duration
        return Math.max(8, Math.round(val * ratio));
      }
      return val; // gap duration remains unchanged
    });
  } else if (type === 'tick') {
    pattern = Math.max(10, Math.round(baseDuration * 0.5)); // even lighter but palpable
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
