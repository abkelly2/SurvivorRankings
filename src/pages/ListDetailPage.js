import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import OtherLists from '../components/OtherLists';

const ListDetailPage = () => {
  const { userId, listId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Get source parameter from location state (home or other)
  const source = location.state?.source || 'other';
  
  useEffect(() => {
    const fetchListDetails = async () => {
      setLoading(true);
      setError(null);
      
      try {
        if (!userId || !listId) {
          throw new Error('Missing userId or listId');
        }
        
        const userDocRef = doc(db, 'userLists', userId);
        const userDocSnap = await getDoc(userDocRef);
        
        if (!userDocSnap.exists()) {
          throw new Error('User not found');
        }
        
        const userData = userDocSnap.data();
        
        if (!userData.lists) {
          throw new Error('No lists found for this user');
        }
        
        const foundList = userData.lists.find(list => list.id === listId);
        
        if (!foundList) {
          throw new Error('List not found');
        }
        
        setList({
          ...foundList,
          userId: userId,
          upvoteCount: foundList.upvotes ? foundList.upvotes.length : 0
        });
      } catch (err) {
        console.error("Error fetching list details:", err);
        setError(err.message || "Failed to load list. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchListDetails();
  }, [userId, listId]);
  
  // If loading, show loading message
  if (loading) {
    return <div className="loading">Loading list details...</div>;
  }
  
  // If error, show error message with back button
  if (error) {
    return (
      <div className="error-container">
        <div className="error-message">
          {error}
        </div>
        <button 
          className="back-button"
          onClick={() => navigate(-1)}
        >
          Go Back
        </button>
      </div>
    );
  }
  
  // If list is loaded, show the OtherLists component with initialSelectedList
  return (
    <OtherLists 
      initialUserId={null}
      initialUserName={null}
      source={source}
      initialSelectedList={list}
    />
  );
};

export default ListDetailPage; 