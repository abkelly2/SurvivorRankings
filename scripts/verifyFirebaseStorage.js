// Script to verify Firebase Storage configuration and test image access
const { initializeApp } = require('firebase/app');
const { getStorage, ref, getDownloadURL } = require('firebase/storage');
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

// Function to test direct HTTP access to an image URL
function testDirectAccess(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        console.log(`Direct HTTP access successful: ${url}`);
        resolve(true);
      } else {
        console.error(`Direct HTTP access failed with status code: ${res.statusCode}`);
        resolve(false);
      }
    }).on('error', (err) => {
      console.error(`Direct HTTP access error: ${err.message}`);
      resolve(false);
    });
  });
}

// Function to check if a file exists in Firebase Storage
async function checkFileExists(filePath) {
  try {
    console.log(`Checking if file exists: ${filePath}`);
    const fileRef = ref(storage, filePath);
    const url = await getDownloadURL(fileRef);
    console.log(`File exists! URL: ${url}`);
    
    // Test direct HTTP access to the URL
    const directAccess = await testDirectAccess(url);
    if (directAccess) {
      console.log('Direct HTTP access to the image URL is successful!');
    } else {
      console.log('Direct HTTP access to the image URL failed. This might indicate a CORS issue.');
    }
    
    return true;
  } catch (error) {
    console.error(`Error checking file: ${filePath}`, error);
    console.error(`Error code: ${error.code}`);
    console.error(`Error message: ${error.message}`);
    return false;
  }
}

// Main function to verify Firebase Storage
async function verifyFirebaseStorage() {
  console.log('Verifying Firebase Storage configuration...');
  
  // Check if the Headshots directory exists
  const headshotsPath = 'Headshots';
  try {
    const headshotsRef = ref(storage, headshotsPath);
    await getDownloadURL(headshotsRef);
    console.log('Headshots directory exists!');
  } catch (error) {
    console.log('Headshots directory does not exist or is not accessible.');
    console.log('This is expected if it\'s a directory and not a file.');
  }
  
  // Check if Season 1 directory exists
  const season1Path = 'Headshots/Season 1';
  try {
    const season1Ref = ref(storage, season1Path);
    await getDownloadURL(season1Ref);
    console.log('Season 1 directory exists!');
  } catch (error) {
    console.log('Season 1 directory does not exist or is not accessible.');
    console.log('This is expected if it\'s a directory and not a file.');
  }
  
  // Check if a sample image exists
  const sampleImagePath = 'Headshots/Season 1/S1_richard_t.webp';
  const imageExists = await checkFileExists(sampleImagePath);
  
  if (imageExists) {
    console.log('Sample image exists! Firebase Storage is properly configured.');
  } else {
    console.log('Sample image does not exist. You need to upload images to Firebase Storage.');
  }
  
  console.log('\nTo fix CORS issues, follow these steps:');
  console.log('1. Update Firebase Storage rules in the Firebase Console:');
  console.log('   - Go to Firebase Console > Storage > Rules');
  console.log('   - Replace the rules with the following:');
  console.log(`
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
  `);
  console.log('   - Click "Publish" to save the rules');
  
  console.log('\n2. Configure CORS for Firebase Storage:');
  console.log('   - Install the Firebase CLI: npm install -g firebase-tools');
  console.log('   - Log in to Firebase: firebase login');
  console.log('   - Create a CORS configuration file named cors.json with the following content:');
  console.log(`
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE"],
    "maxAgeSeconds": 3600
  }
]
  `);
  console.log('   - Set the CORS configuration: gsutil cors set cors.json gs://survivorranks-ee419.appspot.com');
}

// Run the verification
verifyFirebaseStorage(); 