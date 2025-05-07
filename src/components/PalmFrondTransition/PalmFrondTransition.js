import React, { useState, useEffect } from 'react';
import './PalmFrondTransition.css';

// Make sure to place palmleft.png and palmright.png in the public/images directory
const PalmFrondTransition = ({ isAnimating, onAnimationHalfway, onAnimationComplete, direction = 'forward' }) => {
  const [phase, setPhase] = useState('idle'); // idle, closing, opening
  // console.log(`[PalmFrondTransition] Initializing. Phase: ${phase}, IsAnimating: ${isAnimating}`);

  useEffect(() => {
    let closeTimerId;
    let openDelayTimerId;
    let openTimerId;

    // console.log(`[PalmFrondTransition EFFECT] Running. IsAnimating: ${isAnimating}, Current Phase: ${phase}, Direction: ${direction}`);

    if (isAnimating) {
      const cssAnimationDuration = 550; // Matches CSS transition-duration of .7s
      const pauseDuration = 50;    // Reduced pause in the middle
      // Let's use a smaller, more realistic buffer now that we are debugging the stuck issue
      const jsCompletionBuffer = 100; 

      // Only set to closing if we are not already closing or opening (to avoid interrupting an ongoing transition if props change weirdly)
      if (phase === 'idle') { 
        console.log('[PalmFrondTransition EFFECT] isAnimating is TRUE. Current phase is IDLE. Setting phase to CLOSING.');
        setPhase('closing');
      }

      // This assumes that if isAnimating is true, we want the sequence to run or continue.
      // The phase check above ensures we only KICK IT OFF if it was idle.
      // If it was already closing/opening, the existing timers from a previous run (if any, unlikely with current deps) should complete or be cleared by cleanup.

      console.log(`[PalmFrondTransition EFFECT] Setting closeTimerId for ${cssAnimationDuration}ms. Current phase: ${phase}`);
      closeTimerId = setTimeout(() => {
        console.log('[PalmFrondTransition TIMER] === CloseTimer FIRED ===');
        if (onAnimationHalfway) {
          console.log('[PalmFrondTransition TIMER] Calling onAnimationHalfway...');
          onAnimationHalfway(); 
        }
        
        console.log(`[PalmFrondTransition TIMER] Setting openDelayTimerId for ${pauseDuration}ms`);
        openDelayTimerId = setTimeout(() => {
          console.log('[PalmFrondTransition TIMER] === OpenDelayTimer FIRED === Setting phase to OPENING');
          setPhase('opening');
          
          console.log(`[PalmFrondTransition TIMER] Setting openTimerId for ${cssAnimationDuration + jsCompletionBuffer}ms`);
          openTimerId = setTimeout(() => {
            console.log('[PalmFrondTransition TIMER] === OpenTimer FIRED === Setting phase to IDLE & calling onAnimationComplete');
            setPhase('idle');
            if (onAnimationComplete) {
              console.log('[PalmFrondTransition TIMER] Calling onAnimationComplete...');
              onAnimationComplete();
            }
          }, cssAnimationDuration + jsCompletionBuffer); 
        }, pauseDuration); 
      }, cssAnimationDuration);

    } else {
      console.log('[PalmFrondTransition EFFECT] isAnimating is FALSE. Setting phase to IDLE.');
      setPhase('idle');
    }

    // Cleanup function
    return () => {
      console.log('[PalmFrondTransition EFFECT CLEANUP] Clearing timers:', { closeTimerId, openDelayTimerId, openTimerId });
      clearTimeout(closeTimerId);
      clearTimeout(openDelayTimerId);
      clearTimeout(openTimerId);
    };
    // Re-run this effect ONLY if these core props change.
    // Removing 'phase' from deps to prevent re-triggering on self-induced phase changes.
  }, [isAnimating, onAnimationHalfway, onAnimationComplete, direction]);

  // Do not unmount if isAnimating is true, even if phase becomes 'idle' prematurely by the effect's else branch.
  // The final unmount decision should be driven by App.js setting isAnimating to false AFTER onAnimationComplete.
  if (phase === 'idle' && !isAnimating) {
    // console.log('[PalmFrondTransition] Rendering null (idle and !isAnimating)');
    return null; 
  }
  
  // console.log(`[PalmFrondTransition RENDER] Phase: ${phase}, IsAnimating: ${isAnimating}`);

  return (
    <div className={`palm-frond-transition-container ${phase}`}>
      <img src="/images/palmleft.png" alt="Palm frond left" className="palm-frond left" />
      <img src="/images/palmright.png" alt="Palm frond right" className="palm-frond right" />
    </div>
  );
};

export default PalmFrondTransition; 