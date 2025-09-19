// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ----- MONGODB SETUP -----
// Provide MONGODB_URI in .env, e.g. mongodb://localhost:27017/realtime-chat
const MONGODB_URI = process.env.MONGODB_URI || '';

let Message, User;
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

  const messageSchema = new mongoose.Schema({
    from: String,
    to: { type: String, default: 'all' }, // 'all' for group
    text: String,
    time: { type: Date, default: Date.now }
  });

  const userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    lastSeen: Date
  });

  Message = mongoose.model('Message', messageSchema);
  User = mongoose.model('User', userSchema);
} else {
  console.log('No MONGODB_URI provided — running with in-memory storage (data lost on restart).');
}

// ----- Serve static frontend -----
app.use(express.static('public'));

// ----- In-memory stores (fallback if no DB) -----
const users = {}; // username -> socket.id
let messagesMemory = []; // store messages if no DB

// ----- Socket.IO -----
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Client sends join with chosen username
  socket.on('join', async (username, ack) => {
    if (!username) return;

    // Save mapping
    socket.username = username;
    users[username] = socket.id;

    // Persist/update user lastSeen in DB if available
    if (User) {
      try {
        await User.findOneAndUpdate({ username }, { lastSeen: new Date() }, { upsert: true });
      } catch (e) {
        console.error('User save error:', e);
      }
    }

    // Send existing message history (from DB or memory)
    if (Message) {
      const history = await Message.find().sort({ time: 1 }).limit(1000).lean();
      ack && ack(history);
    } else {
      ack && ack(messagesMemory);
    }

    // Broadcast updated online user list
    io.emit('user list', Object.keys(users));

    // Announce join
    const sys = { from: 'System', to: 'all', text: `${username} joined the chat`, time: new Date() };
    io.emit('chat message', sys);
  });

  // Receive message object: { from, to, text }
  socket.on('chat message', async (msg) => {
    if (!msg || !msg.from || !msg.text) return;
    msg.time = new Date();

    if (msg.to === 'all') {
      // group: broadcast to all
      io.emit('chat message', msg);
    } else {
      // private: send to specific user and sender
      const targetSocketId = users[msg.to];
      if (targetSocketId) {
        io.to(targetSocketId).emit('chat message', msg); // receiver
      }
      socket.emit('chat message', msg); // sender copy
    }

    // Save message to DB or memory
    if (Message) {
      try {
        await Message.create({ from: msg.from, to: msg.to || 'all', text: msg.text, time: msg.time });
      } catch (e) {
        console.error('Save message error:', e);
      }
    } else {
      messagesMemory.push(msg);
      // Optionally cap memory
      if (messagesMemory.length > 2000) messagesMemory.shift();
    }
  });

  socket.on('typing', (payload) => {
    // payload: { from, to } -> send typing indicator to target(s)
    if (!payload || !payload.from) return;
    if (payload.to && payload.to !== 'all') {
      const targetId = users[payload.to];
      if (targetId) io.to(targetId).emit('typing', payload);
    } else {
      socket.broadcast.emit('typing', payload);
    }
  });

  socket.on('disconnect', () => {
    if (socket.username) {
      delete users[socket.username];
      io.emit('user list', Object.keys(users));
      io.emit('chat message', { from: 'System', to: 'all', text: `${socket.username} left the chat`, time: new Date() });
    }
    console.log('Socket disconnected:', socket.id);
  });
});

// ----- Start server -----
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
