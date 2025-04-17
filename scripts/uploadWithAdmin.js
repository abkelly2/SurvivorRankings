// Script to upload images using Firebase Admin SDK
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'survivorranks-ee419.appspot.com'
});

const bucket = admin.storage().bucket();

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
async function uploadImage(filePath, destination) {
  try {
    console.log(`Uploading ${filePath} to ${destination}...`);
    
    // Upload the file
    const [file] = await bucket.upload(filePath, {
      destination: destination,
      public: true,
      metadata: {
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000'
      }
    });
    
    // Make the file publicly accessible
    await file.makePublic();
    
    // Get the public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
    console.log(`File uploaded successfully. Public URL: ${publicUrl}`);
    
    return publicUrl;
  } catch (error) {
    console.error('Error uploading file:', error);
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
    const destination = 'Headshots/Season 1/S1_richard_t.webp';
    console.log(`Uploading to Firebase Storage as ${destination}...`);
    const publicUrl = await uploadImage(placeholderPath, destination);
    
    if (publicUrl) {
      console.log('Sample image uploaded successfully!');
      console.log(`You can access it at: ${publicUrl}`);
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