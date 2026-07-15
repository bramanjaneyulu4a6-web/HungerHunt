// importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
// importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// const firebaseConfig = {
//   apiKey: "AIzaSyBEvWAmL7sRp-we38W15pwBARNi2il_7S0",
//   authDomain: "hungerhuntm.firebaseapp.com",
//   projectId: "hungerhuntm",
//   storageBucket: "hungerhuntm.firebasestorage.app",
//   messagingSenderId: "383327390863",
//   appId: "1:383327390863:web:7e45235d7eaa71b9fb34fa",
//   measurementId: "G-Y6WE8P0P8N"
// };

// const messaging = firebase.messaging();

// messaging.onBackgroundMessage((payload) => {
//   console.log("Background message:", payload);

//   self.registration.showNotification(payload.notification.title, {
//     body: payload.notification.body,
//     icon: "/icon.png",
//   });
// });






importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyBEvWAmL7sRp-we38W15pwBARNi2il_7S0",
  authDomain: "hungerhuntm.firebaseapp.com",
  projectId: "hungerhuntm",
  storageBucket: "hungerhuntm.firebasestorage.app",
  messagingSenderId: "383327390863",
  appId: "1:383327390863:web:7e45235d7eaa71b9fb34fa",
  measurementId: "G-Y6WE8P0P8N"
};

// VERY IMPORTANT
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("Background Message:", payload);

  self.registration.showNotification(
    payload.notification.title,
    {
      body: payload.notification.body,
      icon: "/icon.png",
    }
  );
});