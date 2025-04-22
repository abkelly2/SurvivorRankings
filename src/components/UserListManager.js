import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { doc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import './UserListManager.css';

const UserListManager = ({ user, onSelectList, onCreateNew }) => {
  const [userLists, setUserLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameChangeSuccess, setUsernameChangeSuccess] = useState(false);
  const [usernameError, setUsernameError] = useState('');

  // Initialize new username from current display name when user object is available
  useEffect(() => {
    if (user && user.displayName) {
      setNewUsername(user.displayName);
    }
  }, [user]);

  // Load user's lists
  useEffect(() => {
    const loadUserLists = async () => {
      setLoading(true);
      setError('');
      
      try {
        if (!user) return;
        
        const userDocRef = doc(db, "userLists", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists() && userDoc.data().lists) {
          // Sort lists by last updated date, newest first
          const lists = userDoc.data().lists;
          lists.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
          
          // Add userId to each list object
          const listsWithUserId = lists.map(list => ({
            ...list,
            userId: user.uid
          }));
          
          setUserLists(listsWithUserId);
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
  
  const handleUsernameChange = async () => {
    if (!newUsername || newUsername.trim() === '') {
      setUsernameError('Username cannot be empty');
      return;
    }

    try {
      // Update Firebase Auth profile
      await updateProfile(auth.currentUser, {
        displayName: newUsername
      });
      
      // Update all lists with the new username
      const userDocRef = doc(db, "userLists", user.uid);
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
      
      <div className="user-profile-section">
        {isEditingUsername ? (
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
        ) : (
          <div className="username-display">
            <div className="current-username">
              <span className="username-label">Your Username:</span>
              <span className="username-value">{user.displayName}</span>
            </div>
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
        )}
      </div>
      
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
 
 
 
 