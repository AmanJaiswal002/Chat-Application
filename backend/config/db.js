const mongoose = require("mongoose");

const connectDB = async () => {
  const mongoUrl = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/chat-app";
  await mongoose.connect(mongoUrl);
  console.log("MongoDB Connected");
};

module.exports = connectDB;