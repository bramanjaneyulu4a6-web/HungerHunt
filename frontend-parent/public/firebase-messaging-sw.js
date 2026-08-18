/* Draws notifications while the site is closed or backgrounded.
   Foreground messages never reach this file — FCM hands those to the page, and
   src/utils/push.js draws them there.

   A service worker cannot read Vite's env, so the Firebase config arrives in
   the query string of its own registration URL (see registerWebPush). That
   keeps one copy of the config in .env rather than a second one here that
   quietly drifts out of date. */

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const config = Object.fromEntries(new URL(self.location.href).searchParams);

if (config.apiKey && config.messagingSenderId) {
  firebase.initializeApp(config);

  /* Messages to the browser are data-only, so this handler is the only thing
     that draws them. Were they sent with a notification block, the Firebase SDK
     would draw one as well and every push would arrive twice. */
  firebase.messaging().onBackgroundMessage((payload) => {
    const data = payload.data || {};

    self.registration.showNotification(data.title || 'Hunger Hunt', {
      body: data.body || '',
      icon: '/Logo.jpeg',
      badge: '/Logo.jpeg',
      data,
    });
  });
}

/* Tapping the notification should land on the child it is about, and reuse an
   already-open tab rather than stacking up new ones. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const type = event.notification.data?.type;
  const studentId = event.notification.data?.studentId;
  // Approval notifications belong to the unified dashboard, where the parent
  // can answer them. Other account updates still open the child they concern.
  const path = type === 'PENDING_ORDER' ? '/' : studentId ? `/child/${studentId}` : '/';
  const target = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url === target && 'focus' in client) return client.focus();
        }

        for (const client of clients) {
          if ('navigate' in client && 'focus' in client) {
            return client.navigate(target).then((c) => c && c.focus());
          }
        }

        return self.clients.openWindow(target);
      })
  );
});
