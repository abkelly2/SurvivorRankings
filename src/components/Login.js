import React from 'react';
import { signInWithGoogle } from '../firebase';
import './Login.css';

const Login = () => {
  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      // Auth state change will be handled by App.js
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>Sign In Required</h2>
        <p>To view and interact with Survivor contestant rankings, please sign in with your Google account.</p>
        <p>Once logged in, you'll be able to see all ranking lists and drag contestants to create your own!</p>
        <button 
          className="google-sign-in-button" 
          onClick={handleGoogleSignIn}
        >
          <img 
            src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" 
            alt="Google logo" 
          />
          Sign in with Google
        </button>
      </div>
    </div>
  );
};

export default Login; 
 
 
 
 