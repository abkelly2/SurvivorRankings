// Import background images
import survivorBackgroundImg from './images/survivor-background.jpg';
// We'll use a fallback for tribal since we don't have that image yet

// Fallback background options if images are not found
const fallbackBackground = 'linear-gradient(to right bottom, #333, #111)';
const fallbackTribal = 'linear-gradient(to right bottom, #300, #000)';

// Export background URLs with fallbacks
export const survivorBackground = `url(${survivorBackgroundImg})`;
export const tribalBackground = fallbackTribal;

// Helper function to check if an image exists
export const checkImageExists = (imagePath) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = imagePath;
  });
}; 
 
 
 
 
 
 
 
 
 