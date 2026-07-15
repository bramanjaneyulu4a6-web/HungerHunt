// // // // // import admin from "../config/firebase.js";

// // // // // export const sendNotification = async (token, title, body, data = {}) => {
// // // // //   try {
// // // // //     await admin.messaging().send({
// // // // //       token,
// // // // //       notification: {
// // // // //         title,
// // // // //         body,
// // // // //       },
// // // // //       data,
// // // // //     });

// // // // //     console.log("✅ Push notification sent");
// // // // //   } catch (err) {
// // // // //     console.log("FCM Error:", err.message);
// // // // //   }
// // // // // };





// // // // import { getMessaging } from "firebase-admin/messaging";

// // // // export const sendNotification = async (
// // // //   token,
// // // //   title,
// // // //   body,
// // // //   data = {}
// // // // ) => {
// // // //   try {
// // // //     console.log("📲 Sending notification...");

// // // //     const message = {
// // // //       token,
// // // //       notification: {
// // // //         title,
// // // //         body,
// // // //       },
// // // //       data,
// // // //     };

// // // //     const response = await getMessaging().send(message);

// // // //     console.log("✅ Notification sent:", response);
// // // //   } catch (err) {
// // // //     console.log("❌ FCM Error:", err);
// // // //   }
// // // // };




// // // import admin from "../config/firebase.js";
// // // import { getMessaging } from "firebase-admin/messaging";

// // // export const sendNotification = async (
// // //   token,
// // //   title,
// // //   body,
// // //   data = {}
// // // ) => {
// // //   try {
// // //     console.log("📲 Sending notification...");

// // //     const message = {
// // //       token,
// // //       notification: {
// // //         title,
// // //         body,
// // //       },
// // //       data,
// // //     };

// // //     // IMPORTANT: use the initialized app
// // //     const response = await getMessaging(admin.app()).send(message);

// // //     console.log("✅ Notification sent:", response);

// // //   } catch (err) {
// // //     console.log("❌ FCM Error:", err);
// // //   }
// // // };





// // import admin from "../config/firebase.js";

// // export const sendNotification = async (
// //   token,
// //   title,
// //   body,
// //   data = {}
// // ) => {
// //   try {
// //     console.log("📲 Sending notification...");

// //     const message = {
// //       token,
// //       notification: {
// //         title,
// //         body,
// //       },
// //       data,
// //     };

// //     const response = await admin.messaging().send(message);

// //     console.log("✅ Notification sent:", response);
// //   } catch (err) {
// //     console.log("❌ FCM Error:", err);
// //   }
// // };




// import "../config/firebase.js";
// import { getMessaging } from "firebase-admin/messaging";

// export const sendNotification = async (
//   token,
//  title,
//   body,
//   data = {}
// ) => {
//   try {
//     console.log("📲 Sending notification...");

//     const response = await getMessaging().send({
//       token,
//       notification: {
//         title,
//         body,
//       },
//       data,
//     });

//     console.log("✅ Notification sent");
//     console.log(response);

//   } catch (err) {
//     console.log("❌ FCM Error");
//     console.log(err);
//   }
// };




import "../config/firebase.js";
import { getMessaging } from "firebase-admin/messaging";

export const sendNotification = async (
  token,
  title,
  body,
  data = {}
) => {
  try {
    console.log("📲 Sending notification...");

    const response = await getMessaging().send({
      token,
      notification: {
        title,
        body,
      },
      data,
    });

    console.log("✅ Notification sent:", response);
  } catch (err) {
    console.error("❌ FCM Error:", err);
  }
};