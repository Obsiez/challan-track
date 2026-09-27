/**
 * Helper to display system notifications safely across different devices and browsers.
 * Uses custom high-resolution PNG icon and badge to ensure Challan Track branding
 * appears on Android status bars and notification panels instead of the default Chrome logo.
 */
export function showNotification(title: string, options?: NotificationOptions) {
  const mergedOptions: NotificationOptions = {
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    ...options
  };

  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready
        .then((registration) => {
          registration.showNotification(title, mergedOptions);
        })
        .catch((err) => {
          console.warn("ServiceWorker showNotification failed, using fallback:", err);
          fallbackNotification(title, mergedOptions);
        });
    } else {
      fallbackNotification(title, mergedOptions);
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
