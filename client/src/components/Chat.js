import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import io from 'socket.io-client';
import axios from 'axios';
import { format } from 'date-fns';
import { User, Send, LogOut, Search, Paperclip, Smile } from 'lucide-react';

function Chat() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [socket, setSocket] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState('');

  const addMessage = useCallback((message) => {
    setMessages((prevMessages) => {
      if (!prevMessages.some(m => m._id === message._id)) {
        return [...prevMessages, message];
      }
      return prevMessages;
    });
  }, []);

  useEffect(() => {
    const newSocket = io('http://localhost:5000', {
      auth: { token: user.token }
    });
    setSocket(newSocket);

    return () => newSocket.close();
  }, [user.token]);

  useEffect(() => {
    if (socket) {
      // Listen to incoming messages
      socket.on('message', (message) => {
        if (
          message.sender === selectedUser?._id ||
          message.receiver === selectedUser?._id ||
          message.sender === user.user._id ||
          message.receiver === user.user._id
        ) {
          addMessage(message);
        }
      });

      // Typing event
      socket.on('typing', ({ userId, isTyping }) => {
        if (userId === selectedUser?._id) {
          setIsTyping(isTyping);
        }
      });
    }

    return () => {
      if (socket) {
        socket.off('message');
        socket.off('typing');
      }
    };
  }, [socket, selectedUser, user.user._id, addMessage]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await axios.get('http://localhost:5000/users', {
          headers: { Authorization: `Bearer ${user.token}` }
        });
        const fetchedUsers = response.data.filter((u) => u._id !== user.user._id);
        setUsers(fetchedUsers);
        setFilteredUsers(fetchedUsers);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };
    fetchUsers();
  }, [user.token, user.user._id]);

  useEffect(() => {
    if (selectedUser) {
      const fetchMessages = async () => {
        try {
          const response = await axios.get(`http://localhost:5000/messages/${selectedUser._id}`, {
            headers: { Authorization: `Bearer ${user.token}` }
          });
          setMessages(response.data);
        } catch (error) {
          console.error('Error fetching messages:', error);
        }
      };
      fetchMessages();
    } else {
      setMessages([]);
    }
  }, [selectedUser, user.token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleUserSelect = (selectedUser) => {
    setSelectedUser(selectedUser);
    setIsTyping(false);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (inputMessage.trim() && selectedUser) {
      const newMessage = {
        content: inputMessage,
        sender: user.user._id,
        receiver: selectedUser._id,
      };
      socket.emit('sendMessage', newMessage); // Send message through socket
      setInputMessage(''); // Clear input after sending
    }
  };

  const handleInputChange = (e) => {
    setInputMessage(e.target.value);
    socket.emit('typing', { userId: user.user._id, receiverId: selectedUser._id, isTyping: true });
    clearTimeout(window.typingTimeout);
    window.typingTimeout = setTimeout(() => {
      socket.emit('typing', { userId: user.user._id, receiverId: selectedUser._id, isTyping: false });
    }, 2000);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSearch = (e) => {
    const term = e.target.value.toLowerCase();
    setSearchTerm(term);
    const filtered = users.filter(u => u.username.toLowerCase().includes(term));
    setFilteredUsers(filtered);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-1/4 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Chats</h2>
            <button
              onClick={handleLogout}
              className="text-red-500 hover:text-red-600 transition-colors"
              aria-label="Logout"
            >
              <LogOut size={24} />
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={handleSearch}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {filteredUsers.map((u) => (
            <li
              key={u._id}
              onClick={() => handleUserSelect(u)}
              className={`flex items-center p-3 cursor-pointer transition-colors ${
                selectedUser?._id === u._id
                  ? 'bg-blue-100 text-blue-800'
                  : 'hover:bg-gray-100'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center mr-3">
                <User size={20} />
              </div>
              <span className="font-medium">{u.username}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex-1 flex flex-col">
        {selectedUser ? (
          <>
            <div className="bg-white border-b border-gray-200 p-4 flex items-center">
              <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center mr-3">
                <User size={20} />
              </div>
              <h2 className="text-xl font-semibold text-gray-800">
                {selectedUser.username}
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div
                  key={message._id}
                  className={`flex ${
                    message.sender === user.user._id ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md xl:max-w-lg px-4 py-2 rounded-lg ${
                      message.sender === user.user._id
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    <p>{message.content}</p>
                    <p className={`text-xs mt-1 ${
                      message.sender === user.user._id ? 'text-blue-100' : 'text-gray-500'
                    }`}>
                      {format(new Date(message.timestamp), 'HH:mm')}
                    </p>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="text-gray-500 text-sm">
                  {selectedUser.username} is typing...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSendMessage} className="p-4 bg-gray-50 border-t border-gray-200">
              <div className="flex items-center space-x-3">
                <input
                  type="text"
                  placeholder="Type a message"
                  value={inputMessage}
                  onChange={handleInputChange}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <Send size={20} />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Select a user to start chatting
          </div>
        )}
      </div>
    </div>
  );
}

export default Chat;