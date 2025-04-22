import React, { useState, useEffect, useRef } from 'react';
import './RainingTrophiesEffect.css'; // We'll create this CSS file next

// Configuration
const NUM_TROPHIES = 20; // Number per container
const MIN_SPEED = 0.4;
const MAX_SPEED = 1.2;
const MIN_SIZE = 32;
const MAX_SIZE = 60;
const MIN_ROTATION = -25;
const MAX_ROTATION = 25;
const MIN_ROTATION_SPEED = -1.5; // Degrees per frame
const MAX_ROTATION_SPEED = 1.5;
const MAX_Z_INDEX = 5; // Control layering slightly

const RainingTrophiesEffect = () => {
  const [trophies, setTrophies] = useState([]);
  const containerRef = useRef(null);
  const animationFrameId = useRef(null);

  useEffect(() => {
    const containerElement = containerRef.current;
    if (!containerElement) return;

    let initialized = false; // Flag to prevent re-initialization on minor re-renders

    const initializeTrophies = () => {
        if (initialized) return; // Don't re-initialize if already done

        const containerWidth = containerElement.offsetWidth;
        const containerHeight = containerElement.offsetHeight;
        if (containerWidth === 0 || containerHeight === 0) return; // Wait for dimensions

        const initialTrophies = [];
        for (let i = 0; i < NUM_TROPHIES; i++) {
            initialTrophies.push({
                id: i,
                x: Math.random() * containerWidth,
                y: -(Math.random() * containerHeight * 0.5 + MAX_SIZE), // Start above container randomly
                speed: MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED),
                size: MIN_SIZE + Math.random() * (MAX_SIZE - MIN_SIZE),
                rotation: MIN_ROTATION + Math.random() * (MAX_ROTATION - MIN_ROTATION),
                rotationSpeed: MIN_ROTATION_SPEED + Math.random() * (MAX_ROTATION_SPEED - MIN_ROTATION_SPEED),
                z: Math.floor(Math.random() * MAX_Z_INDEX) + 1, // Random z-index
            });
        }
        setTrophies(initialTrophies);
        initialized = true; // Mark as initialized
        console.log(`[Trophy Rain ${containerElement.id || 'Container'}] Initialized ${initialTrophies.length} trophies.`);
    };

    // Use ResizeObserver to re-initialize if container size changes significantly
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            // Re-initialize if needed (e.g., on significant resize)
             // Simple check: If trophies exist, assume initialization happened.
             // A more robust check might compare dimensions.
            if (trophies.length > 0) {
               // Reset initialized flag if you want re-initialization on resize
               // initialized = false; 
               // initializeTrophies(); 
            } else {
               initializeTrophies(); // Initialize if no trophies exist yet
            }
        }
    });

    resizeObserver.observe(containerElement);
    initializeTrophies(); // Initial call

    // Animation loop
    const animate = () => {
        const currentContainerHeight = containerElement.offsetHeight;
        const currentContainerWidth = containerElement.offsetWidth;
        if (currentContainerHeight === 0) { // Stop if container disappears
             animationFrameId.current = requestAnimationFrame(animate);
             return;
        }

        setTrophies(prevTrophies =>
            prevTrophies.map(trophy => {
                let newY = trophy.y + trophy.speed;
                let newX = trophy.x;
                let newRotation = trophy.rotation + trophy.rotationSpeed;

                if (newY > currentContainerHeight) {
                    newY = -MAX_SIZE; // Reset above top
                    newX = Math.random() * currentContainerWidth; // Random X
                }
                return { ...trophy, y: newY, x: newX, rotation: newRotation };
            })
        );
        animationFrameId.current = requestAnimationFrame(animate);
    };

    // Start animation only if trophies have been initialized
     if (trophies.length > 0) {
        animationFrameId.current = requestAnimationFrame(animate);
     } else {
        // If trophies aren't initialized yet (e.g. container size 0), try again shortly
        const initTimeout = setTimeout(initializeTrophies, 100);
        return () => clearTimeout(initTimeout); // Cleanup timeout
     }


    // Cleanup function
    return () => {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
        }
        resizeObserver.disconnect();
         console.log(`[Trophy Rain ${containerElement.id || 'Container'}] Animation stopped & observer disconnected.`);
    };
  }, [trophies.length]); // Rerun effect if trophy count changes (e.g. initialization)

  return (
    <div ref={containerRef} className="raining-trophies-container">
      {trophies.map(trophy => (
        <div
          key={trophy.id}
          className="raining-trophy-item"
          style={{
            left: `${trophy.x}px`,
            top: `${trophy.y}px`,
            fontSize: `${trophy.size}px`,
            transform: `rotate(${trophy.rotation}deg)`,
            zIndex: trophy.z, // Apply random z-index
          }}
        >
          🏆
        </div>
      ))}
    </div>
  );
};

export default RainingTrophiesEffect; 
 
 
 
 
 
 
 