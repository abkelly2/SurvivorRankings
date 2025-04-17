// Script to set up CORS configuration for Firebase Storage
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Create a CORS configuration file
const corsConfig = [
  {
    "origin": ["*"],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE"],
    "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"],
    "maxAgeSeconds": 3600
  }
];

// Write the CORS configuration to a file
const corsFilePath = path.join(__dirname, 'cors.json');
fs.writeFileSync(corsFilePath, JSON.stringify(corsConfig, null, 2));
console.log(`Created CORS configuration file at ${corsFilePath}`);

// Set the CORS configuration for the Firebase Storage bucket
try {
  console.log('Setting CORS configuration for Firebase Storage bucket...');
  const bucketName = 'survivorranks-ee419.appspot.com';
  const command = `gsutil cors set ${corsFilePath} gs://${bucketName}`;
  
  console.log(`Running command: ${command}`);
  const output = execSync(command, { encoding: 'utf8' });
  console.log('CORS configuration set successfully!');
  console.log(output);
} catch (error) {
  console.error('Error setting CORS configuration:', error.message);
  console.error('Make sure you have the Google Cloud SDK installed and configured.');
  console.error('You can install it from: https://cloud.google.com/sdk/docs/install');
  console.error('After installation, run: gcloud auth login');
}

// Clean up
fs.unlinkSync(corsFilePath);
console.log('CORS configuration file cleaned up.'); 