const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);
app.set("socketio", io);
const path = require("path");
const mongoose = require("mongoose");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const session = require("express-session");
const flash = require("connect-flash");
const methodOverride = require("method-override");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });



const connectDB = require("./config/db");
const User = require("./models/User");
const Message = require("./models/Message");

// Connect to Database
connectDB();

// Middleware
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "frontend", "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "..", "frontend", "public")));
app.use(methodOverride("_method"));

// Session Configuration
const sessionOptions = {
  secret: process.env.SESSION_SECRET || "mysupersecretstring",
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
};
app.use(session(sessionOptions));
app.use(flash());

// Passport Configuration
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Global Variables
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currentUser = req.user;
  next();
});

// Socket.io Logic
io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("chat message", async (msg) => {
    try {
      const newMessage = new Message({
        sender: msg.senderId,
        text: msg.text,
        createdAt: new Date()
      });
      await newMessage.save();
      
      // Broadcast with sender info populated
      const populatedMsg = await Message.findById(newMessage._id).populate("sender");
      io.emit("chat message", populatedMsg);
    } catch (err) {
      console.error("Socket error:", err);
    }
  });

  // WebRTC Signaling Logic
  socket.on("video-call-offer", (data) => {
    socket.broadcast.emit("video-call-offer", {
      offer: data.offer,
      callerSocketId: socket.id,
      callerUsername: data.callerUsername
    });
  });

  socket.on("video-call-answer", (data) => {
    io.to(data.callerSocketId).emit("video-call-answer", {
      answer: data.answer,
      answererSocketId: socket.id,
      answererUsername: data.answererUsername
    });
  });

  socket.on("ice-candidate", (data) => {
    io.to(data.targetSocketId).emit("ice-candidate", {
      candidate: data.candidate,
      senderSocketId: socket.id
    });
  });

  socket.on("end-call", (data) => {
    io.to(data.targetSocketId).emit("end-call");
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

// Routes
const messageRoutes = require("./routes/messageRoutes");
const userRoutes = require("./routes/userRoutes");

app.use("/messages", messageRoutes);
app.use("/", userRoutes);

app.get("/", (req, res) => {
  res.render("home");
});

// Start Server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});