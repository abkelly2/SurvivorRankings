import { initializeApp } from "firebase/app";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection } from "firebase/firestore";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBBgnuqzrprlrjoXOdtQUVQxqmjIn41fSw",
  authDomain: "survivorlist.xyz",
  projectId: "survivorranks-ee419",
  storageBucket: "survivorranks-ee419.firebasestorage.app",
  messagingSenderId: "287417667596",
  appId: "1:287417667596:web:d32b706f03baf878795e29",
  measurementId: "G-XTHMW1YS7Z"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
const db = getFirestore(app);
const auth = getAuth(app);

// Function to get image URL from Firebase Storage
export const getContestantImageUrl = async (contestant, seasonId) => {
  try {
    // Remove the 's' prefix from seasonId if it exists
    const numericSeasonId = seasonId.startsWith('s') ? seasonId.substring(1) : seasonId;
    
    // Special cases mapping for contestants with unusual names
    const specialNameMapping = {
      "B.B. Andersen": "bb",
      "J'Tia Taylor": "jtia",
      "R.C. Saint-Amour": "rc",
      "J.P. Hilsabeck": "jp",
      "J.P. Calderon": "jp",
      "Susan Hawk": "sue"
      // Add more special cases as needed
    };
    
    // Check if this contestant has a special case name
    let imageFilename;
    if (specialNameMapping[contestant.name]) {
      imageFilename = specialNameMapping[contestant.name];
    } else {
      // Get the first name in lowercase for the filename
      imageFilename = contestant.name.toLowerCase().split(' ')[0];
    }
    
    // New simplified path to the image
    const imagePath = `Headshots/Season ${numericSeasonId}/${imageFilename}.png`;
    console.log('Attempting to load image:', imagePath);
    
    const imageRef = ref(storage, imagePath);
    const url = await getDownloadURL(imageRef);
    console.log('Generated URL:', url); // Debug log
    return url;
  } catch (error) {
    console.error('Error getting image URL:', error);
    // Try direct URL as fallback
    const numericSeasonId = seasonId.startsWith('s') ? seasonId.substring(1) : seasonId;
    
    // Special cases mapping for contestants with unusual names
    const specialNameMapping = {
      "B.B. Andersen": "bb",
      "J'Tia Taylor": "jtia",
      "R.C. Saint-Amour": "rc",
      "J.P. Hilsabeck": "jp",
      "J.P. Calderon": "jp",
      "Susan Hawk": "sue",
      "Elizabeth Filarski": "elisabeth",
      "Kim Johnson": "kimmi",
      "Jessica Johnston": "jessie",
      "Kim Powers": "kimp",
      "T-Bird Cooper": "teresa",
      "Kim Johnson": "kimj",
      "Rob Mariano": "robm",
      "Shii-Ann Huang": "shiiann",
      "Jenna Morasca": "joanna",
      "Jonny Fairplay": "jon",
      "Lill Morris": "lil",
      "Ryan Opray": "ryano",
      "Ryan Shoulders": "ryans",
      "Stephanie Lagrossa": "stephenie",
      "Ibrahim Hassan": "ibrehem",
      "Ruth Marie Milliman": "ruthmarie",
      "Stephanie Favor": "stephannie",
      "Nate Gonzalez": "nathan",
      "Cao Boi Bui": "caoboi",
      "Yau-Man Chan": "yauman",
      "Peih-Gee Law": "peihgee",
      "Jamie Dugan": "jaime",
      "Jean-Robert Bellande": "jeanrobert",
      "Mikey Bortone": "michael",
      "Jacquie Berg": "jacque",
      "Kenny Hoang": "ken",
      "Coach Wade": "ben",
      "Debbie Beebe": "debra",
      "Jimmy Johnson": "jimmyj",
      "Jud 'Fabio' Birza": "fabio",
      "Ben 'Benry' Henry": "benry",
      "Matthew 'Sash' Lenahan": "mathew",
      "Jimmy Tarantino": "jimmyt",
      "Benjamin 'Coach' Wade": "coach",
      "John Cochran": "cochran",
      "Greg 'Tarzan' Smith": "tarzan",
      "Jonathan Penner": "penner",
      "Abi-Maria Gomes": "abi",
      "Michael Skupin": "skupin",
      "Sarah Dawson": "dawson",
      "Laura Morett": "lauram",
      "Laura Boneham": "laurab",
      "So Kim": "sokim",
      "Joe Del Campo": "joseph",
      "Liz Markham": "elisabeth",
      "Justin 'Jay' Starrett": "jay",
      "Stephanie Gonzalez": "stephanieg",
      "Stephanie Johnson": "stephaniej",
      "Wardog DaSilva": "dan",
      "Noura Salman": "naura",
      "JD Robinson": "jairus",
      "Shan Smith": "shantel",
      "Elisabeth 'Elie' Scott": "elie",
      "Mike Gabler": "gabler",
      "Yam Yam Arocho": "yamyam",
      "Jamie Lynn Ruiz": "jaime",
      "Nicholas 'Sifu' Alsup": "sifu",
      "Janani Krishnan-Jha": "jmaya",
      "David Jelinksy": "jelinsky",
      "Jemila Hussain-Adams": "jem",
      "Solomon Yi": "sol",
      "Terran Foster": "tk",
      "Jerome Cooney": "rome",
      "G.C. Brown": "danny",
      "Jon Palyok": "johnp",




















      // Add more special cases as needed
    };
    
    // Check if this contestant has a special case name
    let imageFilename;
    if (specialNameMapping[contestant.name]) {
      imageFilename = specialNameMapping[contestant.name];
    } else {
      // Get the first name in lowercase for the filename
      imageFilename = contestant.name.toLowerCase().split(' ')[0];
    }
    
    const directUrl = `https://firebasestorage.googleapis.com/v0/b/survivorranks-ee419.firebasestorage.app/o/${encodeURIComponent(`Headshots/Season ${numericSeasonId}/${imageFilename}.png`)}?alt=media`;
    console.log('Trying direct URL:', directUrl); // Debug log
    return directUrl;
  }
};

// Function to get season logo URL from Firebase Storage
export const getSeasonLogoUrl = async (seasonId) => {
  try {
    // Remove the 's' prefix from seasonId if it exists
    const numericSeasonId = seasonId.startsWith('s') ? seasonId.substring(1) : seasonId;
    
    // Path to the season logo
    const logoPath = `Survivor Seasons/Season ${numericSeasonId}.png`;
    console.log('Attempting to load season logo:', logoPath);
    
    const logoRef = ref(storage, logoPath);
    const url = await getDownloadURL(logoRef);
    console.log('Generated logo URL:', url);
    return url;
  } catch (error) {
    console.error('Error getting season logo URL:', error);
    // Try direct URL as fallback
    const numericSeasonId = seasonId.startsWith('s') ? seasonId.substring(1) : seasonId;
    const directUrl = `https://firebasestorage.googleapis.com/v0/b/survivorranks-ee419.firebasestorage.app/o/${encodeURIComponent(`Survivor Seasons/Season ${numericSeasonId}.png`)}?alt=media`;
    console.log('Trying direct logo URL:', directUrl);
    return directUrl;
  }
};

// Firestore functions for handling rankings lists
export const saveRankingsToFirestore = async (maddysList, andrewsList, kendallsList) => {
  try {
    const rankingsRef = doc(db, "rankings", "current");
    await setDoc(rankingsRef, {
      maddysList,
      andrewsList,
      kendallsList,
      lastUpdated: new Date().toISOString()
    });
    console.log("Rankings saved successfully");
    return true;
  } catch (error) {
    console.error("Error saving rankings:", error);
    return false;
  }
};

export const getRankingsFromFirestore = async () => {
  try {
    const rankingsRef = doc(db, "rankings", "current");
    const docSnap = await getDoc(rankingsRef);
    
    if (docSnap.exists()) {
      return docSnap.data();
    } else {
      console.log("No rankings found, creating empty lists");
      // Initialize with empty lists if no document exists
      await saveRankingsToFirestore([], [], []);
      return { maddysList: [], andrewsList: [], kendallsList: [] };
    }
  } catch (error) {
    console.error("Error getting rankings:", error);
    return { maddysList: [], andrewsList: [], kendallsList: [] };
  }
};

export const subscribeToRankingsUpdates = (callback) => {
  const rankingsRef = doc(db, "rankings", "current");
  
  // Set up real-time listener
  return onSnapshot(rankingsRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data());
    } else {
      callback({ maddysList: [], andrewsList: [], kendallsList: [] });
    }
  }, (error) => {
    console.error("Error listening to rankings updates:", error);
  });
};

// Auth functions
export const signInWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
};

export const logOut = async () => {
  try {
    await signOut(auth);
    console.log('User signed out successfully');
    return true;
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

export const getCurrentUser = () => {
  return auth.currentUser;
};

export const subscribeToAuthChanges = (callback) => {
  return onAuthStateChanged(auth, callback);
};

export { db, auth };
export default app; 