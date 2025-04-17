// Script to upload a sample image to Firebase Storage
const { initializeApp } = require('firebase/app');
const { getStorage, ref, uploadBytes, getDownloadURL } = require('firebase/storage');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Firebase configuration
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

// Function to download a placeholder image
function downloadPlaceholderImage(url, filePath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        const fileStream = fs.createWriteStream(filePath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`Downloaded placeholder image to ${filePath}`);
          resolve();
        });
      } else {
        reject(new Error(`Failed to download image: ${res.statusCode}`));
      }
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// Function to upload an image to Firebase Storage
async function uploadImage(filePath, fileName) {
  try {
    console.log(`Uploading file ${filePath} as ${fileName}...`);
    const fileBuffer = fs.readFileSync(filePath);
    const storageRef = ref(storage, fileName);
    
    const snapshot = await uploadBytes(storageRef, fileBuffer);
    console.log('File uploaded successfully');
    
    const downloadURL = await getDownloadURL(snapshot.ref);
    console.log(`Download URL: ${downloadURL}`);
    
    return downloadURL;
  } catch (error) {
    console.error(`Error uploading ${filePath}:`, error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      serverResponse: error.customData?.serverResponse
    });
    return null;
  }
}

// Main function to upload a sample image
async function uploadSampleImage() {
  try {
    // Create a temporary directory if it doesn't exist
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    
    // Download a placeholder image
    const placeholderUrl = 'https://placehold.co/150x150/000000/FFFFFF?text=Richard+Hatch';
    const placeholderPath = path.join(tempDir, 'S1_richard_t.webp');
    
    console.log('Downloading placeholder image...');
    await downloadPlaceholderImage(placeholderUrl, placeholderPath);
    
    // Upload the placeholder image to Firebase Storage
    console.log('Uploading to Firebase Storage...');
    const downloadURL = await uploadImage(placeholderPath, 'test.webp');
    
    if (downloadURL) {
      console.log('Sample image uploaded successfully!');
      console.log(`You can access it at: ${downloadURL}`);
    } else {
      console.error('Failed to upload sample image.');
    }
    
    // Clean up
    if (fs.existsSync(placeholderPath)) {
      fs.unlinkSync(placeholderPath);
      console.log('Temporary files cleaned up.');
    }
  } catch (error) {
    console.error('Error uploading sample image:', error);
  }
}

// Run the upload function
uploadSampleImage(); 