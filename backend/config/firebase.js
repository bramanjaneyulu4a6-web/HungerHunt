// // // // // // import * as admin from "firebase-admin";
// // // // // // import fs from "fs";

// // // // // // const serviceAccount = JSON.parse(
// // // // // //   fs.readFileSync("./firebase-service-account.json", "utf8")
// // // // // // );

// // // // // // if (!admin.apps || !admin.apps.length) {
// // // // // //   admin.initializeApp({
// // // // // //     credential: admin.credential.cert(serviceAccount),
// // // // // //   });
// // // // // // }

// // // // // // export default admin;


// // // // // import admin from "firebase-admin";
// // // // // import fs from "fs";
// // // // // console.log("🔥 Firebase file loaded");

// // // // // const serviceAccount = JSON.parse(
// // // // //   fs.readFileSync(
// // // // //     new URL("../firebase-service-account.json", import.meta.url)
// // // // //   )
// // // // // );

// // // // // if (!admin.apps.length) {
// // // // //   admin.initializeApp({
// // // // //     credential: admin.credential.cert(serviceAccount),
// // // // //   });
// // // // // }

// // // // // export default admin;



// // // // import * as admin from "firebase-admin";
// // // // import fs from "fs";

// // // // const serviceAccount = JSON.parse(
// // // //   fs.readFileSync(
// // // //     new URL("../firebase-service-account.json", import.meta.url)
// // // //   )
// // // // );

// // // // // ✅ SAFE INIT (no crash possible)
// // // // if (!admin.apps || admin.apps.length === 0) {
// // // //   admin.initializeApp({
// // // //     credential: admin.credential.cert(serviceAccount),
// // // //   });
// // // // }

// // // // export default admin;



// // // import admin from "firebase-admin";
// // // import fs from "fs";

// // // const serviceAccount = JSON.parse(
// // //   fs.readFileSync(
// // //     new URL("../firebase-service-account.json", import.meta.url)
// // //   )
// // // );

// // // // ✅ SAFE SINGLE INIT (NO apps check at all)
// // // try {
// // //   admin.initializeApp({
// // //     credential: admin.credential.cert(serviceAccount),
// // //   });
// // // } catch (err) {
// // //   // prevents crash if already initialized
// // // }

// // // export default admin;





// // import admin from "firebase-admin";
// // import fs from "fs";

// // const serviceAccount = JSON.parse(
// //   fs.readFileSync(
// //     new URL("../firebase-service-account.json", import.meta.url)
// //   )
// // );

// // if (admin.apps.length === 0) {
// //   admin.initializeApp({
// //     credential: admin.credential.cert(serviceAccount),
// //   });
// // }

// // export default admin;




// import { initializeApp, cert, getApps } from "firebase-admin/app";
// import fs from "fs";

// const serviceAccount = JSON.parse(
//   fs.readFileSync(
//     new URL("../firebase-service-account.json", import.meta.url)
//   )
// );

// if (getApps().length === 0) {
//   initializeApp({
//     credential: cert(serviceAccount),
//   });
// }

// console.log("✅ Firebase Admin Initialized");




import { initializeApp, cert, getApps } from "firebase-admin/app";
import fs from "fs";

const serviceAccount = JSON.parse(
  fs.readFileSync(
    new URL("../firebase-service-account.json", import.meta.url)
  )
);

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

console.log("✅ Firebase initialized");