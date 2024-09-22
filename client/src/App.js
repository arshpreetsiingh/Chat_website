import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Signup from './components/Signup';
import Chat from './components/Chat';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';

function App() {
  return (
	<AuthProvider>
	  <Router>
		<div className="App">
		  <Routes>
			<Route path="/login" element={<Login />} />
			<Route path="/signup" element={<Signup />} />
			<Route path="/chat" element={<PrivateRoute><Chat /></PrivateRoute>} />
			<Route path="/" element={<Navigate to="/login" replace />} />
		  </Routes>
		</div>
	  </Router>
	</AuthProvider>
  );
}

export default App;