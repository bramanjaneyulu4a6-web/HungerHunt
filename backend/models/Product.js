// // // // // // import mongoose from 'mongoose';

// // // // // // const productSchema = new mongoose.Schema({
// // // // // //   name: { type: String, required: true, unique: true },
// // // // // //   price: { type: Number, required: true },
// // // // // //   stock: { type: Number, required: true, default: 0 }
// // // // // // }, { timestamps: true });

// // // // // // export default mongoose.model('Product', productSchema);







// // // // // import mongoose from "mongoose";

// // // // // const productSchema = new mongoose.Schema(
// // // // // {
// // // // //   name: {
// // // // //     type: String,
// // // // //     required: true,
// // // // //     unique: true
// // // // //   }
// // // // // },
// // // // // { timestamps: true }
// // // // // );

// // // // // export default mongoose.model("Product", productSchema);




// // // // import mongoose from "mongoose";

// // // // const productSchema = new mongoose.Schema(
// // // // {
// // // //   name: {
// // // //     type: String,
// // // //     required: true,
// // // //     unique: true
// // // //   },

// // // //   price: {
// // // //     type: Number,
// // // //     required: true,
// // // //     default: 0
// // // //   }
// // // // },
// // // // { timestamps: true }
// // // // );

// // // // export default mongoose.model(
// // // //   "Product",
// // // //   productSchema
// // // // );




// // // // 19-06-2026



// // // const productSchema = new mongoose.Schema(
// // // {
// // //   name: {
// // //     type: String,
// // //     required: true,
// // //     unique: true
// // //   },

// // //   stockGroup: {
// // //     type: String,
// // //     required: true
// // //   },

// // //   unit: {
// // //     type: String,
// // //     required: true
// // //   },

// // //   price: {
// // //     type: Number,
// // //     default: 0
// // //   }
// // // },
// // // { timestamps: true }
// // // );






// // import mongoose from "mongoose";

// // const productSchema = new mongoose.Schema(
// // {
// //   name: {
// //     type: String,
// //     required: true,
// //     unique: true
// //   },

// //   stockGroup: {
// //     type: mongoose.Schema.Types.ObjectId,
// //     ref: "StockGroup",
// //     required: true
// //   },

// //   unit: {
// //     type: mongoose.Schema.Types.ObjectId,
// //     ref: "Unit",
// //     required: true
// //   }
// // },
// // { timestamps: true }
// // );

// // export default mongoose.model(
// //   "Product",
// //   productSchema
// // );



// import mongoose from "mongoose";

// const productSchema = new mongoose.Schema(
// {
//   name: {
//     type: String,
//     required: true,
//     unique: true
//   },

//   stockGroup: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "StockGroup",
//     required: true
//   },

//   unit: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Unit",
//     required: true
//   },

//   price: {
//     type: Number,
//     default: 0
//   }
// },
// { timestamps: true }
// );

// export default mongoose.model("Product", productSchema);





// 08-07-2026




import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
{
  name: {
    type: String,
    required: true,
    unique: true
  },

  stockGroup: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "StockGroup",
    required: true
  },

  unit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Unit",
    required: true
  },

  price: {
    type: Number,
    default: 0
  },

  image: {
    type: String,
    default: ""
  }
},
{ timestamps: true }
);

export default mongoose.model("Product", productSchema);