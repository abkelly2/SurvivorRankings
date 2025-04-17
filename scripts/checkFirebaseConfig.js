// Script to check Firebase configuration and connectivity
const { initializeApp } = require('firebase/app');
const { getStorage, ref, listAll } = require('firebase/storage');

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

async function checkFirebaseConfig() {
  try {
    console.log('Checking Firebase configuration...');
    
    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    console.log('Firebase app initialized successfully');
    
    // Check Storage configuration
    console.log('\nChecking Firebase Storage configuration...');
    console.log('Storage bucket:', firebaseConfig.storageBucket);
    
    const storage = getStorage(app);
    console.log('Storage instance created successfully');
    
    // Try to list files in the root directory
    console.log('\nAttempting to list files in root directory...');
    try {
      const rootRef = ref(storage);
      const result = await listAll(rootRef);
      
      console.log('Successfully listed files:');
      console.log('Prefixes (directories):', result.prefixes.map(prefix => prefix.fullPath));
      console.log('Items (files):', result.items.map(item => item.fullPath));
    } catch (listError) {
      console.error('Error listing files:', listError);
      console.error('Error details:', {
        code: listError.code,
        message: listError.message,
        serverResponse: listError.customData?.serverResponse
      });
    }
    
    console.log('\nFirebase configuration check complete');
  } catch (error) {
    console.error('Error checking Firebase configuration:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      serverResponse: error.customData?.serverResponse
    });
  }
}

// Run the check
checkFirebaseConfig(); 