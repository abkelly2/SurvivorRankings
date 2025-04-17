// Script to upload contestant images to Firebase Storage
// Usage: node scripts/uploadImages.js <path-to-images-directory>

const { initializeApp } = require('firebase/app');
const { getStorage, ref, uploadBytes, getDownloadURL } = require('firebase/storage');
const fs = require('fs');
const path = require('path');

// Firebase configuration - replace with your own
const firebaseConfig = {
    apiKey: "AIzaSyBBgnuqzrprlrjoXOdtQUVQxqmjIn41fSw",
    authDomain: "survivorranks-ee419.firebaseapp.com",
    projectId: "survivorranks-ee419",
    storageBucket: "survivorranks-ee419.appspot.com",
    messagingSenderId: "287417667596",
    appId: "1:287417667596:web:d32b706f03baf878795e29",
    measurementId: "G-XTHMW1YS7Z"
};
  
// Initialize Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

// Get the images directory from command line arguments
const imagesDir = process.argv[2];
if (!imagesDir) {
  console.error('Please provide the path to the images directory');
  console.error('Usage: node scripts/uploadImages.js <path-to-images-directory>');
  process.exit(1);
}

// Function to upload an image to Firebase Storage
async function uploadImage(filePath, storagePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const storageRef = ref(storage, storagePath);
    
    await uploadBytes(storageRef, fileBuffer);
    const downloadURL = await getDownloadURL(storageRef);
    
    console.log(`Uploaded ${filePath} to ${storagePath}`);
    console.log(`Download URL: ${downloadURL}`);
    
    return downloadURL;
  } catch (error) {
    console.error(`Error uploading ${filePath}:`, error);
    return null;
  }
}

// Function to extract season number from filename
function extractSeasonNumber(filename) {
  // Expected format: S{seasonNumber}_{firstName}_t.webp
  const match = filename.match(/^S(\d+)_/);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

// Main function to upload all images
async function uploadAllImages() {
  try {
    // Check if the directory exists
    if (!fs.existsSync(imagesDir)) {
      console.error(`Directory not found: ${imagesDir}`);
      return;
    }

    // Read all files in the images directory
    const files = fs.readdirSync(imagesDir);
    
    // Filter for image files
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
    });
    
    console.log(`Found ${imageFiles.length} image files`);
    
    // Upload each image
    for (const file of imageFiles) {
      const filePath = path.join(imagesDir, file);
      
      // Extract season number from filename
      const seasonNumber = extractSeasonNumber(file);
      
      if (seasonNumber) {
        // Use the new folder structure: Headshots/Season {seasonNumber}/filename
        const storagePath = `Headshots/Season ${seasonNumber}/${file}`;
        console.log(`Uploading ${file} to ${storagePath}`);
        await uploadImage(filePath, storagePath);
      } else {
        console.warn(`Skipping file ${file} - does not match the expected naming convention (S{seasonNumber}_{firstName}_t.webp)`);
      }
    }
    
    console.log('All images uploaded successfully!');
  } catch (error) {
    console.error('Error uploading images:', error);
  }
}

// Run the upload function
uploadAllImages(); 