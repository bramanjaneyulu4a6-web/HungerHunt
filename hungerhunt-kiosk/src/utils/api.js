// // // import axios from 'axios';

// // // const api = axios.create({
// // //   baseURL: import.meta.env.VITE_API_BASE_URL,
// // // });

// // // // Interceptor to attach Auth token automatically
// // // api.interceptors.request.use((config) => {
// // //   const token = localStorage.getItem("adminToken");

// // //   if (token) {
// // //     config.headers.Authorization = `Bearer ${token}`;
// // //   }

// // //   return config;
// // // });





// // // export default api;









// // import axios from "axios";

// // console.log("API BASE URL =", import.meta.env.VITE_API_BASE_URL);

// // const api = axios.create({
// //   baseURL: import.meta.env.VITE_API_BASE_URL,
// // });

// // api.interceptors.request.use((config) => {
// //   const token = localStorage.getItem("adminToken");

// //   if (token) {
// //     config.headers.Authorization = `Bearer ${token}`;
// //   }

// //   return config;
// // });

// // export default api;











// import axios from "axios";

// const api = axios.create({
//   baseURL: "http://localhost:5000/api",
// });

// api.interceptors.request.use((config) => {
//   const token = localStorage.getItem("adminToken");

//   console.log("TOKEN:", token);

//   if (token) {
//     config.headers.Authorization = `Bearer ${token}`;
//   }

//   console.log(config.headers);

//   return config;
// });

// export default api;



import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("adminToken");

  console.log("TOKEN:", token);

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;