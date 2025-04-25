import React, { useState } from 'react';
import { signInWithGoogle, signInWithTwitter, signInWithEmail, signUpWithEmail, sendPasswordResetEmail } from '../firebase';
import './Login.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showEmailSection, setShowEmailSection] = useState(false);
  const [resetPasswordMessage, setResetPasswordMessage] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      // Auth state change will be handled by App.js
    } catch (error) {
      console.error('Google login failed:', error);
    }
  };

  const handleTwitterSignIn = async () => {
    try {
      await signInWithTwitter();
      // Auth state change will be handled by App.js
    } catch (error) {
      console.error('Twitter login failed:', error);
      if (error.code === 'auth/account-exists-with-different-credential') {
        alert('An account already exists with this email using a different sign-in method. Please sign in with Google or the method you used previously.');
      } else {
        alert('Twitter sign-in failed. Please try again or use a different method.');
      }
    }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (isSignUp) {
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.');
        return;
      }
      try {
        await signUpWithEmail(email, password);
        // Auth state change will be handled by App.js
      } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
          setErrorMessage('Email already in use. Please sign in instead.');
        } else if (error.code === 'auth/weak-password') {
          setErrorMessage('Password is too weak. Please use a stronger password.');
        } else {
          setErrorMessage('Sign-up failed. Please try again.');
        }
      }
    } else {
      try {
        await signInWithEmail(email, password);
        // Auth state change will be handled by App.js
      } catch (error) {
        if (error.code === 'auth/wrong-password') {
          setErrorMessage('Incorrect password. Please try again.');
        } else if (error.code === 'auth/user-not-found') {
          setErrorMessage('No account found with this email. Please sign up.');
        } else {
          setErrorMessage('Sign-in failed. Please try again.');
        }
      }
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setResetPasswordMessage('Please enter your email address to reset your password.');
      return;
    }
    setIsResettingPassword(true);
    try {
      await sendPasswordResetEmail(email);
      setResetPasswordMessage('Password reset email sent. Check your inbox for instructions.');
    } catch (error) {
      console.error('Password reset failed:', error);
      setResetPasswordMessage('Failed to send password reset email. Please try again.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const toggleSignUp = (mode) => {
    setIsSignUp(mode === 'signup');
    setErrorMessage('');
  };

  const toggleEmailSection = () => {
    setShowEmailSection(!showEmailSection);
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>Sign In Required</h2>
        <p>To create and interact with Survivor contestant rankings, please sign in.</p>
        <p>Once logged in, you'll be able to create your own!</p>
        <button 
          className="google-sign-in-button" 
          onClick={handleGoogleSignIn}
        >
          <img 
            src="/images/google.png"
            alt="Google logo" 
          />
          Sign in with Google
        </button>
        <button
          className="twitter-sign-in-button"
          onClick={handleTwitterSignIn}
        >
          <img
            src="/images/twitter.png"
            alt="Twitter logo"
          />
          Sign in with Twitter
        </button>
        <button
          className="email-toggle-button"
          onClick={toggleEmailSection}
        >
          <img
            src="/images/email.png"
            alt="Email logo"
          />
          Sign in with Email
        </button>
        {showEmailSection && (
          <div className="email-sign-in-section">
            <div className="auth-mode-toggle">
              <span
                className={`auth-mode ${!isSignUp ? 'active' : ''}`}
                onClick={() => toggleSignUp('signin')}
              >
                Sign In
              </span>
              <span
                className={`auth-mode ${isSignUp ? 'active' : ''}`}
                onClick={() => toggleSignUp('signup')}
              >
                Sign Up
              </span>
            </div>
            {errorMessage && <p className="error-message">{errorMessage}</p>}
            {resetPasswordMessage && <p className="reset-password-message">{resetPasswordMessage}</p>}
            <form onSubmit={handleEmailAuth}>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="email-input"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="password-input"
              />
              {isSignUp && (
                <input
                  type="password"
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="password-input"
                />
              )}
              <button type="submit" className="email-sign-in-button">
                {isSignUp ? 'Sign Up' : 'Sign In'}
              </button>
              {!isSignUp && (
                <button 
                  type="button" 
                  className="reset-password-button"
                  onClick={handleResetPassword}
                  disabled={isResettingPassword}
                >
                  {isResettingPassword ? 'Sending...' : 'Forgot Password?'}
                </button>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login; 
 
 
 
 