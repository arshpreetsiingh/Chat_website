const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('./models/user');
const Message = require('./models/Message');
const auth = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch((err) => console.error('MongoDB connection error:', err));

// User routes
app.post('/signup', async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.status(201).send({ user, token });
  } catch (error) {
    res.status(400).send(error);
  }
});

app.post('/login', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.body.username });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      throw new Error('Invalid login credentials');
    }
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.send({ user, token });
  } catch (error) {
    res.status(400).send(error.message);
  }
});

app.get('/users', auth, async (req, res) => {
  try {
    const users = await User.find({}, '-password');
    res.send(users);
  } catch (error) {
    res.status(500).send(error);
  }
});

// Message routes
app.get('/messages/:userId', auth, async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { sender: req.user._id, receiver: req.params.userId },
        { sender: req.params.userId, receiver: req.user._id }
      ]
    }).sort('timestamp');
    res.send(messages);
  } catch (error) {
    res.status(500).send(error);
  }
});
app.get('/users/:id', auth, async (req, res) => {
    try {
      const user = await User.findById(req.params.id).select('-password');
      if (!user) {
        return res.status(404).send({ error: 'User not found' });
      }
      res.send(user);
    } catch (error) {
      res.status(500).send(error);
    }
  });
  app.put('/users/:id', auth, async (req, res) => {
    try {
      const updates = Object.keys(req.body);
      const allowedUpdates = ['username', 'email', 'bio', 'avatar', 'theme'];
      const isValidOperation = updates.every((update) => allowedUpdates.includes(update));
  
      if (!isValidOperation) {
        return res.status(400).send({ error: 'Invalid updates!' });
      }
  
      const user = await User.findById(req.params.id);
  
      if (!user) {
        return res.status(404).send({ error: 'User not found' });
      }
  
      updates.forEach((update) => {
        if (req.body[update] !== undefined) {
          user[update] = req.body[update];
        }
      });
  
      await user.save();
  
      res.send(user);
    } catch (e) {
      console.error('Error updating user:', e);
      res.status(400).send({ error: e.message });
    }
  });
const connectedUsers = new Map();

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return next(new Error('Authentication error'));
    }
    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log('New client connected:', socket.user.username);
  connectedUsers.set(socket.user._id.toString(), socket.id);

  socket.on('sendMessage', async (messageData, callback) => {
    try {
      const { content, receiver } = messageData;
  
      const message = new Message({
        content: content,
        sender: socket.user._id,
        receiver: receiver,
        timestamp: new Date(),
        seen: false,
      });
  
      await message.save();
  
      // Send the saved message back to the sender and receiver
      socket.emit('message', message);
      const receiverSocketId = connectedUsers.get(receiver);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('message', message);
      }
  
      // Acknowledge with the saved message
      callback(message);
    } catch (error) {
      console.error('Error in sendMessage event:', error);
    }
  });
  
  socket.on('messageSeen', async ({ messageId }) => {
    try {
      console.log('Received messageSeen event for messageId:', messageId);
  
      if (!messageId || typeof messageId !== 'string') {
        console.error('Invalid messageId received');
        return;
      }
  
      const message = await Message.findById(messageId);
      if (!message) {
        console.error(`Message with id ${messageId} not found`);
        return;
      }
      
      if (!message.sender) {
        console.error(`Message with id ${messageId} has no sender`);
        return;
      }
  
      message.seen = true;
      await message.save();
      
      console.log(`Message ${messageId} marked as seen`);
      
      const senderSocketId = connectedUsers.get(message.sender.toString());
      if (senderSocketId) {
        io.to(senderSocketId).emit('messageSeenUpdate', { messageId, seen: true });
      } else {
        console.log(`Sender socket not found for message ${messageId}`);
      }
    } catch (error) {
      console.error('Error in messageSeen event:', error);
    }
  });

  socket.on('typing', ({ receiverId, isTyping }) => {
    const receiverSocketId = connectedUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('typing', { userId: socket.user._id, isTyping });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.user.username);
    connectedUsers.delete(socket.user._id.toString());
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));