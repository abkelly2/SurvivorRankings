# Survivor Rankings

A web application for ranking your favorite Survivor contestants. Built with React and react-beautiful-dnd.

## Features

- Two ranking lists: "Andrew's List" and "Maddy's List"
- Drag and drop functionality to add contestants to your list
- Collapsible list of all Survivor seasons
- Contestant cards with images and names
- Reorder contestants within your list
- Firebase Storage for contestant images

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- Firebase account

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Set up Firebase:
   - Create a Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/)
   - Enable Firebase Storage
   - Update the Firebase configuration in `src/firebase.js` with your project details
   - Upload contestant images to Firebase Storage using the paths defined in `survivorData.js`
4. Start the development server:
   ```
   npm start
   ```
5. Open your browser and navigate to `http://localhost:3000`

## How to Use

1. The top section shows two lists: "Andrew's List" and "Maddy's List"
2. Below that, you'll see a list of Survivor seasons
3. Click on any season to expand it and see the contestants
4. Click and drag any contestant to add them to either list
5. You can reorder contestants within each list by dragging them
6. Each list can hold up to 20 contestants

## Firebase Setup

The application uses Firebase Storage to store and serve contestant images. To set up Firebase:

1. Create a Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/)
2. Enable Firebase Storage
3. Update the Firebase configuration in `src/firebase.js` with your project details:
   ```javascript
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_AUTH_DOMAIN",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_STORAGE_BUCKET",
     messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```
4. Upload contestant images to Firebase Storage using the paths defined in `survivorData.js`

### Uploading Images to Firebase

You can use the provided script to upload images to Firebase Storage:

1. Place all contestant images in a directory (e.g., `contestant-images`)
2. Update the Firebase configuration in `scripts/uploadImages.js` with your project details
3. Run the script:
   ```
   node scripts/uploadImages.js path/to/contestant-images
   ```
4. The script will upload all images to Firebase Storage and print the download URLs

## Data Structure

The contestant data is stored in `src/data/survivorData.js`. Each season contains:
- `id`: A unique identifier for the season
- `name`: The name of the season
- `contestants`: An array of contestant objects, each with:
  - `id`: A unique identifier for the contestant
  - `name`: The contestant's name
  - `image`: The path to the contestant's image in Firebase Storage

## License

This project is licensed under the MIT License. 