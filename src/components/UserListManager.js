import React, { useState, useEffect, useRef } from 'react';
import { db, auth, getRandomContestantHeadshotUrl } from '../firebase';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, getDoc, deleteDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import './UserListManager.css';

// Try to get storage via auth.app if direct import fails
let storage;
try {
  // This assumes 'auth' is correctly initialized and exported from firebase.js
  // and that storage was initialized with the same app instance in firebase.js
  if (auth && auth.app) {
    storage = getStorage(auth.app);
  } else {
    // Fallback if auth.app is not available, try to import directly (might still fail if not exported)
    // This part is mostly to satisfy the linter if the direct import { storage } was used.
    // We will rely on the getStorage(auth.app) above.
    const firebaseExports = await import('../firebase');
    if (firebaseExports.storage) {
      storage = firebaseExports.storage;
    } else {
      console.warn("Firebase storage instance could not be obtained. Profile picture uploads will likely fail. Please ensure 'storage' is exported from firebase.js or the app instance is consistent.");
    }
  }
} catch (e) {
  console.error("Error trying to initialize storage for UserListManager:", e);
  // If storage remains undefined, handleImageUpload will show an error.
}

const UserListManager = ({ user, onSelectList, onCreateNew }) => {
  const [userLists, setUserLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameChangeSuccess, setUsernameChangeSuccess] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [userIdols, setUserIdols] = useState(0);
  const [totalUserUpvotes, setTotalUserUpvotes] = useState(0);

  // Profile Picture State
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const placeholderProfilePic = 'https://via.placeholder.com/150/CCCCCC/808080?Text=No+Image'; // Basic placeholder
  const [isFetchingRandomPic, setIsFetchingRandomPic] = useState(false);
  const [isReRollingPicture, setIsReRollingPicture] = useState(false); // New state for re-roll button
  const savedProfileImageUrlRef = useRef(''); // To store the actual saved URL

  // Initialize new username from current display name when user object is available
  useEffect(() => {
    if (user && user.displayName) {
      setNewUsername(user.displayName);
    }
  }, [user]);

  // Fetch user's profile picture URL
  useEffect(() => {
    const fetchProfilePicture = async () => {
      if (user && !isFetchingRandomPic) {
        try {
          const userProfileRef = doc(db, 'users', user.uid);
          const userProfileDoc = await getDoc(userProfileRef);
          if (userProfileDoc.exists() && userProfileDoc.data().profilePictureUrl) {
            const url = userProfileDoc.data().profilePictureUrl;
            setProfileImageUrl(url);
            savedProfileImageUrlRef.current = url;
          } else {
            // No profile picture set, let's try to assign a random one and save it
            console.log("No profile picture found, attempting to set a random one.");
            setIsFetchingRandomPic(true);
            const randomUrl = await getRandomContestantHeadshotUrl();
            if (randomUrl) {
              console.log("Assigning random profile picture:", randomUrl);
              await updateDoc(userProfileRef, { profilePictureUrl: randomUrl });
              setProfileImageUrl(randomUrl);
              savedProfileImageUrlRef.current = randomUrl;
            } else {
              console.log("Could not get a random headshot URL. Using placeholder.");
              setProfileImageUrl(''); // Fallback to placeholder if random fetch fails
              savedProfileImageUrlRef.current = '';
            }
            setIsFetchingRandomPic(false);
          }
        } catch (err) {
          console.error("Error fetching/setting profile picture:", err);
          setProfileImageUrl(''); // Fallback
          savedProfileImageUrlRef.current = '';
          setIsFetchingRandomPic(false);
        }
      } else if (!user) {
        setProfileImageUrl(''); // Clear if no user
        savedProfileImageUrlRef.current = '';
      }
    };
    fetchProfilePicture();
  }, [user, isFetchingRandomPic]);

  // Load user's lists
  useEffect(() => {
    const loadUserLists = async () => {
      setLoading(true);
      setError('');
      setTotalUserUpvotes(0);
      
      try {
        if (!user) {
          setUserLists([]);
          return;
        }
        
        const userDocRef = doc(db, "userLists", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists() && userDoc.data().lists) {
          const lists = userDoc.data().lists;
          lists.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
          
          const listsWithUserId = lists.map(list => ({
            ...list,
            userId: user.uid
          }));
          
          setUserLists(listsWithUserId);

          let currentTotalUpvotes = 0;
          lists.forEach(list => {
            if (list.upvotes && Array.isArray(list.upvotes)) {
              currentTotalUpvotes += list.upvotes.length;
            }
          });
          setTotalUserUpvotes(currentTotalUpvotes);

        } else {
          setUserLists([]);
        }
      } catch (error) {
        console.error('Error loading user lists:', error);
        setError('Failed to load your lists. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    loadUserLists();
  }, [user]);
  
  // Fetch user's idols count
  useEffect(() => {
    const fetchUserIdols = async () => {
      if (user) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userRef);
          if (userDoc.exists() && userDoc.data().hasOwnProperty('idolsFound')) {
            setUserIdols(userDoc.data().idolsFound);
          } else {
            setUserIdols(0);
          }
        } catch (error) {
          console.error('Error fetching user idols:', error);
          setUserIdols(0);
        }
      } else {
        setUserIdols(0);
      }
    };
    
    fetchUserIdols();
  }, [user]);
  
  const handleUsernameChange = async () => {
    if (!newUsername || newUsername.trim() === '') {
      setUsernameError('Username cannot be empty');
      return;
    }

    try {
      // Check if username already exists in users collection
      console.log('Checking username:', newUsername);
      const usersRef = collection(db, 'users');
      const querySnapshot = await getDocs(usersRef);
      console.log('Total users found:', querySnapshot.size);

      let existingUser = null;
      querySnapshot.forEach(doc => {
        const data = doc.data();
        if (data.displayName && data.displayName.toLowerCase() === newUsername.toLowerCase() && doc.id !== user.uid) {
          console.log('Username already taken by user ID:', doc.id);
          existingUser = doc;
        }
      });

      if (existingUser) {
        setUsernameError('This username is already taken (case-insensitive match). Please choose another.');
        return;
      }

      // If not found in users, check in userLists collection as well
      const userListsRef = collection(db, 'userLists');
      const listsQuery = query(userListsRef);
      const listsSnapshot = await getDocs(listsQuery);
      console.log('Checking userLists collection for username:', newUsername);
      let foundInLists = false;
      listsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.lists && data.lists.length > 0) {
          data.lists.forEach(list => {
            if (list.userName && list.userName.toLowerCase() === newUsername.toLowerCase() && doc.id !== user.uid) {
              console.log('Username found in userLists for user ID:', doc.id);
              foundInLists = true;
            }
          });
        }
      });

      if (foundInLists) {
        setUsernameError('This username is already taken (case-insensitive match). Please choose another.');
        return;
      }

      // Update Firebase Auth profile
      await updateProfile(auth.currentUser, {
        displayName: newUsername
      });
      
      // Update user document in Firestore
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: newUsername
      });
      
      // Update all lists with the new username
      const userDocRef = doc(db, 'userLists', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists() && userDoc.data().lists) {
        const updatedLists = userDoc.data().lists.map(list => ({
          ...list,
          userName: newUsername
        }));
        
        await updateDoc(userDocRef, {
          lists: updatedLists
        });
        
        setUserLists(updatedLists);
      }
      
      setIsEditingUsername(false);
      setUsernameChangeSuccess(true);
      setUsernameError('');
      
      // Hide success message after 3 seconds
      setTimeout(() => {
        setUsernameChangeSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Error updating username:', error);
      setUsernameError('Failed to update username. Please try again.');
    }
  };

  const handleDeleteList = async (listId) => {
    if (confirmDelete === listId) {
      try {
        const userDocRef = doc(db, "userLists", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists() && userDoc.data().lists) {
          const updatedLists = userDoc.data().lists.filter(list => list.id !== listId);
          
          await updateDoc(userDocRef, {
            lists: updatedLists
          });
          
          setUserLists(updatedLists);
          setConfirmDelete(null);
        }
      } catch (error) {
        console.error('Error deleting list:', error);
        setError('Failed to delete list. Please try again.');
      }
    } else {
      // First click - confirm before deleting
      setConfirmDelete(listId);
      
      // Auto-reset confirm state after 5 seconds
      setTimeout(() => {
        setConfirmDelete(state => state === listId ? null : state);
      }, 5000);
    }
  };
  
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setUploadError('');
      // Create a preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileImageUrl(reader.result); // Show preview
      };
      reader.readAsDataURL(file);
    } else {
      setSelectedFile(null);
      setUploadError(file ? 'Please select a valid image file.' : '');
      // Revert to saved image or placeholder if selection is cleared or invalid
      setProfileImageUrl(savedProfileImageUrlRef.current || placeholderProfilePic);
    }
  };

  const handleImageUpload = async () => {
    if (!user || !selectedFile) {
      setUploadError('No file selected or user not logged in.');
      return;
    }
    if (!storage) { // Check if storage was successfully initialized
      setUploadError('Firebase Storage is not configured. Upload failed.');
      setIsUploading(false);
      return;
    }

    setIsUploading(true);
    setUploadError('');

    const fileExtension = selectedFile.name.split('.').pop();
    const filePath = `profilePictures/${user.uid}/profileImage.${fileExtension}`;
    const imageStorageRef = storageRef(storage, filePath);

    try {
      const snapshot = await uploadBytes(imageStorageRef, selectedFile);
      const downloadURL = await getDownloadURL(snapshot.ref);

      const userProfileRef = doc(db, 'users', user.uid);
      await updateDoc(userProfileRef, {
        profilePictureUrl: downloadURL
      });

      setProfileImageUrl(downloadURL); // Display the newly uploaded image
      savedProfileImageUrlRef.current = downloadURL; // Update the saved URL ref
      setSelectedFile(null); 
      // Clear the file input visually (this is tricky, often requires resetting the form or input key)
      const fileInput = document.getElementById('profilePicInput');
      if (fileInput) fileInput.value = null;

      setIsUploading(false);
    } catch (err) {
      console.error("Error uploading profile picture:", err);
      setUploadError(`Upload failed: ${err.message}. Check storage rules.`);
      setIsUploading(false);
      // Revert to last saved image on failed upload
      setProfileImageUrl(savedProfileImageUrlRef.current || placeholderProfilePic);
    }
  };

  const handleAssignNewRandomPicture = async () => {
    if (!user) return;
    setIsReRollingPicture(true);
    setUploadError('');
    try {
      const randomUrl = await getRandomContestantHeadshotUrl();
      if (randomUrl) {
        const userProfileRef = doc(db, 'users', user.uid);
        await updateDoc(userProfileRef, { profilePictureUrl: randomUrl });
        setProfileImageUrl(randomUrl);
        savedProfileImageUrlRef.current = randomUrl; // Update saved URL ref
        console.log("Successfully re-rolled and assigned new random profile picture:", randomUrl);
      } else {
        setUploadError('Could not get a new random picture. Please try again.');
      }
    } catch (err) {
      console.error("Error re-rolling random profile picture:", err);
      setUploadError('Failed to re-roll picture. Please try again.');
    } finally {
      setIsReRollingPicture(false);
    }
  };
  
  // Get tag label from tag ID
  const getTagLabel = (tagId) => {
    const tagMap = {
      'favorites': 'Favorites',
      'social': 'Social',
      'strategic': 'Strategic',
      'challenge': 'Challenge Beasts'
    };
    
    return tagMap[tagId] || tagId;
  };
  
  // Format date
  const formatDate = (isoDate) => {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    return date.toLocaleDateString();
  };
  
  if (loading) {
    return (
      <div className="user-list-manager">
        <h2 className="section-title">My Survivor Rankings</h2>
        <div className="loading-lists">Loading your lists...</div>
      </div>
    );
  }
  
  return (
    <div className="user-list-manager">
      <h2 className="section-title">My Survivor Rankings</h2>
      
      {/* {user && (
        <div className="user-idols" style={{ fontSize: '1.2rem', color: '#ffcc00', marginTop: '10px', fontWeight: 'bold' }}>
          Hidden Immunity Idols: {userIdols} 🏆
        </div>
      )} */}
      
      {/* Only show profile section if user is logged in */}
      {user && (
      <div className="user-profile-section"> {/* This will be our flex container */}
        {/* Profile Picture Display and Upload - As the first direct child */}
        <div className="profile-picture-section">
          <h4>Profile Picture</h4>
          <div className="profile-image-container">
            <img 
              src={profileImageUrl || placeholderProfilePic} 
              alt="Profile" 
              className="profile-picture-img"
            />
          </div>
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleFileChange} 
            disabled={isUploading || isReRollingPicture}
            id="profilePicInput"
            style={{ margin: '10px 0' }}
          />
          <button 
            onClick={handleImageUpload} 
            disabled={!selectedFile || isUploading || isReRollingPicture}
            className="upload-profile-pic-button"
          >
            {isUploading ? 'Uploading...' : 'Upload Picture'}
          </button>
          {/* Re-roll Button - Conditionally Rendered */}
          {profileImageUrl && profileImageUrl !== placeholderProfilePic && (
            <button
              onClick={handleAssignNewRandomPicture}
              disabled={isReRollingPicture || isUploading}
              className="reroll-profile-pic-button"
              style={{ marginTop: '8px' }} // Simple styling for now
            >
              {isReRollingPicture ? '🎲 Finding...' : '🎲 Re-roll Random'}
            </button>
          )}
          {uploadError && <div className="error-message" style={{color: 'red', marginTop: '5px'}}>{uploadError}</div>}
        </div>
        {/* End Profile Picture Display and Upload */}

        {/* New wrapper for all existing username and other profile content */}
        <div className="profile-details-content">
          <div className="username-display">
            Current Username: <strong>{user.displayName || 'Not set'}</strong>
          </div>

          {/* Conditional rendering for edit button OR editor form */}
          {!isEditingUsername ? (
            <div className="change-username-section">
              <button 
                onClick={() => setIsEditingUsername(true)} 
                className="edit-username-button"
              >
                Change Username
              </button>
              {usernameChangeSuccess && (
                <div className="username-success">Username updated successfully!</div>
              )}
            </div>
          ) : (
          <div className="username-editor">
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Enter new username"
              className="username-input"
              maxLength={30}
            />
            <div className="username-actions">
              <button onClick={handleUsernameChange} className="save-username-button">
                Save
              </button>
              <button onClick={() => {
                setIsEditingUsername(false);
                setNewUsername(user.displayName);
                setUsernameError('');
              }} className="cancel-username-button">
                Cancel
              </button>
            </div>
            {usernameError && <div className="username-error">{usernameError}</div>}
          </div>
          )}

          {/* MOVED user-idols display HERE */}
          <div className="user-idols" style={{ fontSize: '1.2rem', color: '#ffcc00', fontWeight: 'bold' }}>
            Hidden Immunity Idols: {userIdols} 🏆
            </div>

          {/* Total Upvotes Display */}
          <div className="user-total-upvotes" style={{ fontSize: '1.2rem', color: '#34c759', fontWeight: 'bold' }}>
            Total Upvotes: {totalUserUpvotes} 👍
          </div>

          {/* You can add other existing profile items here if there were any */}
        </div>
        {/* End profile-details-content */}
      </div>
      )}
      {/* End of user profile section conditional */}
      
      {error && <div className="list-error">{error}</div>}
      
      <div className="list-actions-top">
        <button className="create-new-button" onClick={onCreateNew}>
          + Create New Ranking
        </button>
      </div>
      
      {userLists.length === 0 ? (
        <div className="no-lists-message">
          You haven't created any rankings yet. Create your first list now!
        </div>
      ) : (
        <div className="user-lists">
          {userLists.map(list => (
            <div key={list.id} className="list-card">
              <div className="list-card-content" onClick={() => onSelectList(list)} style={{ color: 'black' }}>
                <h3 className="list-title" style={{ color: 'black' }}>{list.name}</h3>
                
                <div className="list-meta" style={{ color: 'black' }}>
                  <div className="list-updated">
                    Updated: {formatDate(list.updatedAt)}
                  </div>
                  <div className="list-count">
                    {list.contestants?.length || 0} contestants
                  </div>
                </div>
                
                {list.contestants && list.contestants.length > 0 && (
                  <div className="list-preview" style={{ color: 'black' }}>
                    <p style={{ color: 'black' }}>Top 3:</p>
                    <ol className="preview-contestants" style={{ color: 'black' }}>
                      {list.contestants.slice(0, 3).map((contestant, index) => (
                        <li key={index} style={{ color: 'black' }}>
                          {contestant.isSeason 
                            ? contestant.name.replace('Survivor: ', '').replace('Survivor ', '') 
                            : contestant.name}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
              
              <button 
                className={`delete-list-button ${confirmDelete === list.id ? 'confirm' : ''}`}
                onClick={() => handleDeleteList(list.id)}
                title={confirmDelete === list.id ? "Click again to confirm" : "Delete list"}
              >
                {confirmDelete === list.id ? 'Confirm' : '×'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default UserListManager; 
 
 
 
 