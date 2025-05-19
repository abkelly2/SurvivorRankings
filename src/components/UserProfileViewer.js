import React, { useState, useEffect, useRef } from 'react';
import { db, getRandomContestantHeadshotUrl } from '../firebase'; // storage is used by getRandomContestantHeadshotUrl
import { doc, getDoc, updateDoc } from 'firebase/firestore'; // updateDoc for setting random pic if needed
import './UserListManager.css'; // Reusing the same CSS for identical look

const UserProfileViewer = ({ viewedUserId, onSelectList }) => {
  const [userLists, setUserLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewedUserDisplayName, setViewedUserDisplayName] = useState('');
  const [userIdols, setUserIdols] = useState(0);
  const [totalUserUpvotes, setTotalUserUpvotes] = useState(0);
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [mostRankedSurvivor, setMostRankedSurvivor] = useState(null);
  const placeholderProfilePic = 'https://via.placeholder.com/150/CCCCCC/808080?Text=No+Image';
  const [isFetchingRandomPic, setIsFetchingRandomPic] = useState(false);
  const savedProfileImageUrlRef = useRef(''); // To handle random pic assignment consistency

  // Fetch viewed user's profile data (name, idols, picture)
  useEffect(() => {
    if (!viewedUserId) {
      setError('No user ID provided to view.');
      setLoading(false);
      return;
    }
    setLoading(true);

    const fetchViewedUserProfile = async () => {
      try {
        const userProfileRef = doc(db, 'users', viewedUserId);
        const userProfileDoc = await getDoc(userProfileRef);

        if (userProfileDoc.exists()) {
          const userData = userProfileDoc.data();
          setViewedUserDisplayName(userData.displayName || 'User');
          setUserIdols(userData.idolsFound || 0);

          if (userData.profilePictureUrl) {
            setProfileImageUrl(userData.profilePictureUrl);
            savedProfileImageUrlRef.current = userData.profilePictureUrl;
          } else { // userData.profilePictureUrl is falsy, meaning no PFP is set
            if (!isFetchingRandomPic) { // And we're not already fetching one
              setIsFetchingRandomPic(true);
              console.log(`[Viewer] User ${viewedUserId} has no profile picture. Attempting to fetch, save, and display a random one.`);
              try {
                const randomUrl = await getRandomContestantHeadshotUrl();
                if (randomUrl) {
                  console.log(`[Viewer] Fetched random PFP: ${randomUrl}. Saving to Firestore for user ${viewedUserId}.`);
                  // Save the randomly fetched PFP to Firestore for persistence
                  await updateDoc(userProfileRef, { profilePictureUrl: randomUrl });
                  console.log(`[Viewer] Successfully saved PFP to Firestore for user ${viewedUserId}.`);
                  setProfileImageUrl(randomUrl);
                  savedProfileImageUrlRef.current = randomUrl;
                } else {
                  console.warn(`[Viewer] Failed to fetch random headshot URL for user ${viewedUserId}. No PFP will be set.`);
                  setProfileImageUrl(''); 
                  savedProfileImageUrlRef.current = '';
                }
              } catch (error) {
                console.error(`[Viewer] Error during fetch/save of random PFP for user ${viewedUserId}:`, error);
                // On error, ensure PFP is cleared or set to a default, and log
                setProfileImageUrl('');
                savedProfileImageUrlRef.current = '';
              } finally {
                // Ensure the fetching flag is always reset
                setIsFetchingRandomPic(false);
              }
            }
          }
        } else {
          setError('User profile not found.');
          setViewedUserDisplayName('Unknown User');
        }
      } catch (err) {
        console.error("Error fetching viewed user's profile:", err);
        setError('Could not load user profile.');
        setViewedUserDisplayName('Error');
        setIsFetchingRandomPic(false);
      }
    };

    fetchViewedUserProfile();
  }, [viewedUserId]); // Depend on viewedUserId and the fetching flag

  // Load viewed user's lists
  useEffect(() => {
    if (!viewedUserId) return;

    const loadUserLists = async () => {
      // setLoading(true); // Loading state is handled by profile fetch for simplicity here
      setError('');
      setTotalUserUpvotes(0);
      
      try {
        const userDocRef = doc(db, "userLists", viewedUserId);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists() && userDoc.data().lists) {
          const lists = userDoc.data().lists;
          lists.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
          
          const listsWithUserId = lists.map(list => ({
            ...list,
            userId: viewedUserId // Ensure correct userId is associated
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
      } catch (err) {
        console.error('Error loading viewed user lists:', err);
        setError('Failed to load user lists.');
      } finally {
        // setLoading(false); // Managed by profile fetch
      }
    };
    
    loadUserLists();
  }, [viewedUserId]);

  // Calculate most ranked survivor whenever userLists changes
  useEffect(() => {
    if (userLists.length > 0) {
      const contestantCounts = {};
      
      // Count occurrences of each contestant across all lists
      userLists.forEach(list => {
        if (list.contestants) {
          list.contestants.forEach(contestant => {
            if (!contestant.isSeason) { // Only count actual contestants, not seasons
              const name = contestant.name;
              contestantCounts[name] = (contestantCounts[name] || 0) + 1;
            }
          });
        }
      });

      // Find the contestant with the highest count
      let maxCount = 0;
      let mostRanked = null;

      Object.entries(contestantCounts).forEach(([name, count]) => {
        if (count > maxCount) {
          maxCount = count;
          mostRanked = name;
        } else if (count === maxCount && name < mostRanked) {
          // If tied, choose alphabetically first
          mostRanked = name;
        }
      });

      setMostRankedSurvivor(mostRanked);
    }
  }, [userLists]);

  // Format date (reused from UserListManager)
  const formatDate = (isoDate) => {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    return date.toLocaleDateString();
  };

  // Initial loading state for the whole component based on profile display name
  // setLoading(true) is called in the first useEffect, set to false when displayName is available or error occurs
  useEffect(() => {
    if (viewedUserDisplayName || error) {
        setLoading(false);
    }
  }, [viewedUserDisplayName, error]);

  if (loading) {
    return (
      <div className="user-list-manager"> {/* Reusing main class for overall styling */}
        <h2 className="section-title">{viewedUserDisplayName || 'User'}'s Rankings</h2>
        <div className="loading-lists">Loading profile...</div>
      </div>
    );
  }
  
  return (
    <div className="user-list-manager"> {/* Reusing main class */}
      <h2 className="section-title">{viewedUserDisplayName}'s Rankings</h2>
      
      <div className="user-profile-section">
        <div className="profile-picture-section">
          <div className="profile-image-container">
            <img 
              src={profileImageUrl || placeholderProfilePic} 
              alt={`${viewedUserDisplayName}'s Profile`}
              className="profile-picture-img"
            />
          </div>
          {/* No upload/re-roll buttons for viewer */}
        </div>

        <div className="profile-details-content">
          <div className="username-display">
            Username: <strong>{viewedUserDisplayName}</strong>
          </div>
          
          <div className="user-idols" style={{ fontSize: '1.2rem', color: '#ffcc00', fontWeight: 'bold' }}>
            Hidden Immunity Idols: {userIdols} 🏆
          </div>

          <div className="user-total-upvotes" style={{ fontSize: '1.2rem', color: '#34c759', fontWeight: 'bold' }}>
            Total Upvotes: {totalUserUpvotes} 👍
          </div>

          {mostRankedSurvivor && (
            <div className="most-ranked-survivor" style={{ fontSize: '1.2rem', color: '#ff6b00', fontWeight: 'bold' }}>
              Most Ranked: {mostRankedSurvivor} 👑
            </div>
          )}
        </div>
      </div>
      
      {error && <div className="list-error">{error}</div>}
      
      {/* No "Create New Ranking" button for viewer */}
      
      {userLists.length === 0 && !loading && (
        <div className="no-lists-message">
          {viewedUserDisplayName} hasn't created any public rankings yet.
        </div>
      )}
      {userLists.length > 0 && (
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
                    {list.contestants?.length || 0} items
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
              {/* No delete button for viewer */}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default UserProfileViewer; 