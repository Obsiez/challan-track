/**
 * Helper to display system notifications safely across different devices and browsers.
 * This prevents "TypeError: Failed to construct 'Notification': Illegal constructor"
 * on Android Chrome and WebViews by wrapping in a try-catch and attempting to use
 * service worker registration if available.
 */
export function showNotification(title: string, options?: NotificationOptions) {
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready
        .then((registration) => {
          registration.showNotification(title, options);
        })
        .catch((err) => {
          console.warn("ServiceWorker showNotification failed, using fallback:", err);
          fallbackNotification(title, options);
        });
    } else {
      fallbackNotification(title, options);
    }
  } catch (err) {
    console.warn("Notification constructor failed, caught to prevent crash:", err);
  }
}

function fallbackNotification(title: string, options?: NotificationOptions) {
  try {
    if ('Notification' in window && window.Notification && window.Notification.permission === 'granted') {
      new window.Notification(title, options);
    }
  } catch (err) {
    console.warn("Fallback Notification constructor failed:", err);
  }
}
