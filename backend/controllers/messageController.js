const Message = require("../models/Message");

// GET all messages (Global Chat)
exports.getMessages = async (req, res) => {
  // Fetch messages and populate sender info
  const messages = await Message.find({ receiver: null })
      .populate("sender")
      .sort({ createdAt: 1 });
  res.render("messages/index", { messages });
};

// DELETE a message
exports.deleteMessage = async (req, res) => {
  const { id } = req.params;
  const message = await Message.findById(id);
  
  if (!message) {
      req.flash("error", "Message not found!");
      return res.redirect("/messages");
  }
  
  // Check if current user is the sender
  if (!message.sender.equals(req.user._id)) {
      req.flash("error", "You do not have permission to delete this message!");
      return res.redirect("/messages");
  }
  
  await Message.findByIdAndDelete(id);
  
  // Broadcast real-time deletion event
  const io = req.app.get("socketio");
  if (io) {
    console.log(`[Socket.io] Broadcasting 'message deleted' event for ID: ${id}`);
    io.emit("message deleted", id);
  }

  req.flash("success", "Message deleted!");
  res.redirect("/messages");
};

// DELETE all messages (Clear Chat)
exports.clearAllMessages = async (req, res) => {
  try {
      await Message.deleteMany({});
      
      // Broadcast real-time clear chat event
      const io = req.app.get("socketio");
      if (io) {
        io.emit("all messages cleared");
      }

      req.flash("success", "All messages cleared!");
      res.redirect("/messages");
  } catch (err) {
      req.flash("error", "Could not clear messages.");
      res.redirect("/messages");
  }
};