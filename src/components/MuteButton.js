import React, { useState, useEffect } from 'react';
import './MuteButton.css';

const MuteButton = () => {
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const themeMusic = document.getElementById('themeMusic');
    if (themeMusic) {
      setIsMuted(themeMusic.muted);
    }
  }, []);

  const toggleMute = () => {
    const themeMusic = document.getElementById('themeMusic');
    if (themeMusic) {
      themeMusic.muted = !themeMusic.muted;
      setIsMuted(themeMusic.muted);
    }
  };

  return (
    <button 
      className="mute-button"
      onClick={toggleMute}
      title={isMuted ? "Unmute" : "Mute"}
    >
      {isMuted ? (
        <span className="mute-icon">🔇</span>
      ) : (
        <span className="mute-icon">🔊</span>
      )}
    </button>
  );
};

export default MuteButton; 