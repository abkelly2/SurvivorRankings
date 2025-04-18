import React, { useState, useEffect, useContext } from 'react';
import { db } from '../firebase';
import { getContestantImageUrl, getSeasonLogoUrl } from '../firebase';
import { 
  collection, getDocs, query, where, Timestamp, doc, getDoc, updateDoc, 
  addDoc, serverTimestamp, orderBy, deleteDoc, setDoc 
} from 'firebase/firestore';
import { survivorSeasons } from '../data/survivorData';
import { UserContext } from '../UserContext';
import './HomePageLists.css';
import { useNavigate } from 'react-router-dom';

const RankingLists = ({ onViewUserLists }) => {
  const [contestantImageUrls, setContestantImageUrls] = useState({});
  const [topVotedLists, setTopVotedLists] = useState([]);
  const [recentLists, setRecentLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedList, setSelectedList] = useState(null);
  const { user } = useContext(UserContext);
  const navigate = useNavigate();

  // Comment state variables
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [viewingUserId, setViewingUserId] = useState(null);
  const [viewingUserName, setViewingUserName] = useState('');

  // Favorite state variables
  const [favorites, setFavorites] = useState([]);
  const [favoriteLists, setFavoriteLists] = useState([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);

  // Add new state for feedback popup
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState({
    text: '',
    position: { x: 0, y: 0 },
    isAdd: true
  });

  // Add new state for spoiler reveal
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);

  // Fetch lists on component mount
  useEffect(() => {
    fetchLists();
  }, []);

  // Load image URLs for contestants in the lists
  useEffect(() => {
    const loadContestantImages = async () => {
      const newImageUrls = { ...contestantImageUrls };
      
      // Combine all lists to avoid duplicate image loading
      const allContestants = [
        ...topVotedLists.flatMap(list => list.contestants.slice(0, 3)),
        ...recentLists.flatMap(list => list.contestants.slice(0, 3))
      ];
      
      if (selectedList) {
        // Also load images for the selected list's contestants
        allContestants.push(...(selectedList.contestants || []));
      }
      
      // Create a map to help find a contestant's season
      const seasonMap = {};
      
      // Build the season map from survivorSeasons data
      if (survivorSeasons) {
        survivorSeasons.forEach(season => {
          if (season.contestants) {
            season.contestants.forEach(contestant => {
              seasonMap[contestant.id] = season.id;
            });
          }
        });
      }
      
      for (const contestant of allContestants) {
        if (!contestant) continue;
        
        if (!newImageUrls[contestant.id]) {
          if (contestant.isSeason) {
            try {
              const url = await getSeasonLogoUrl(contestant.id);
              newImageUrls[contestant.id] = url;
            } catch (error) {
              console.error(`Error loading season logo for ${contestant.id}:`, error);
              newImageUrls[contestant.id] = '/images/placeholder.jpg';
            }
          } else {
            try {
              // Find the season for this contestant using both methods
              let seasonId = contestant.seasonId || seasonMap[contestant.id];
              
              // If we still don't have a valid seasonId, try looking it up in survivorSeasons
              if (!seasonId && survivorSeasons) {
                for (const season of survivorSeasons) {
                  if (season.contestants && season.contestants.some(c => c.id === contestant.id)) {
                    seasonId = season.id;
                    break;
                  }
                }
              }
              
              if (seasonId) {
                try {
                  // Remove the 's' prefix from seasonId if it exists
                  const numericSeasonId = seasonId.startsWith('s') ? seasonId.substring(1) : seasonId;
                  const url = await getContestantImageUrl(contestant, numericSeasonId);
                  newImageUrls[contestant.id] = url;
                } catch (imageError) {
                  console.error(`Error loading image for ${contestant.name}:`, imageError);
                  newImageUrls[contestant.id] = '/images/placeholder.jpg';
                }
              } else {
                // If we still can't find a season, use a placeholder
                console.warn(`Unable to find season for contestant: ${contestant.name}`);
                newImageUrls[contestant.id] = '/images/placeholder.jpg';
              }
            } catch (error) {
              console.error(`Error processing contestant ${contestant.name}:`, error);
              newImageUrls[contestant.id] = '/images/placeholder.jpg';
            }
          }
        }
      }
      
      setContestantImageUrls(newImageUrls);
    };

    if (topVotedLists.length > 0 || recentLists.length > 0 || selectedList) {
      loadContestantImages();
    }
  }, [topVotedLists, recentLists, selectedList]);

  // Load user's favorites on component mount and when user changes
  useEffect(() => {
    if (user) {
      fetchUserFavorites();
    } else {
      setFavorites([]);
      setFavoriteLists([]);
    }
  }, [user]);

  // Effect to load favorited lists when favorites array changes
  useEffect(() => {
    if (favorites.length > 0) {
      fetchFavoriteLists();
    } else {
      setFavoriteLists([]);
    }
  }, [favorites]);

  const fetchLists = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const userListsRef = collection(db, 'userLists');
      const snapshot = await getDocs(userListsRef);
      
      let allLists = [];
      
      // Get all lists
      snapshot.forEach(doc => {
        const userData = doc.data();
        if (userData.lists && Array.isArray(userData.lists)) {
          userData.lists.forEach(list => {
            allLists.push({
              ...list,
              userId: doc.id,
              upvoteCount: list.upvotes ? list.upvotes.length : 0
            });
          });
        }
      });
      
      // Get lists from past week for top voted
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      const recentListsForVoting = allLists.filter(list => {
        const createdAt = new Date(list.createdAt);
        return createdAt >= oneWeekAgo;
      });
      
      // Sort by upvote count to get top voted lists from past week
      const topVoted = recentListsForVoting
        .sort((a, b) => b.upvoteCount - a.upvoteCount)
        .slice(0, 3);
      
      // Sort by creation date to get most recent lists
      const mostRecent = [...allLists]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 3);
      
      setTopVotedLists(topVoted);
      setRecentLists(mostRecent);
    } catch (err) {
      console.error("Error fetching lists:", err);
      setError("Failed to load lists. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  // Function to fetch user's favorites from Firestore
  const fetchUserFavorites = async () => {
    if (!user) return;
    
    try {
      const userRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists() && userDoc.data().favorites) {
        setFavorites(userDoc.data().favorites);
      } else {
        // Initialize favorites array if it doesn't exist
        await setDoc(userRef, { favorites: [] }, { merge: true });
        setFavorites([]);
      }
    } catch (error) {
      console.error("Error fetching favorites:", error);
    }
  };

  // Function to fetch the actual list data for favorited lists
  const fetchFavoriteLists = async () => {
    if (favorites.length === 0) return;
    
    setLoadingFavorites(true);
    
    try {
      const favoriteListsData = [];
      
      // Get all unique user IDs from favorites
      const userIds = [...new Set(favorites.map(fav => fav.userId))];
      
      // For each user, fetch their lists document
      for (const userId of userIds) {
        const userListRef = doc(db, "userLists", userId);
        const userListDoc = await getDoc(userListRef);
        
        if (userListDoc.exists()) {
          const userData = userListDoc.data();
          
          if (userData.lists && Array.isArray(userData.lists)) {
            // Filter to only get favorited lists from this user
            const userFavorites = favorites.filter(fav => fav.userId === userId);
            
            for (const favorite of userFavorites) {
              const list = userData.lists.find(l => l.id === favorite.listId);
              
              if (list) {
                favoriteListsData.push({
                  ...list,
                  userId: userId,
                  userName: list.userName || userData.displayName || "Unknown User",
                  upvoteCount: list.upvotes ? list.upvotes.length : 0
                });
              }
            }
          }
        }
      }
      
      setFavoriteLists(favoriteListsData);
    } catch (error) {
      console.error("Error fetching favorite lists:", error);
    } finally {
      setLoadingFavorites(false);
    }
  };

  // Handle upvoting a list
  const handleUpvote = async (listUserId, listId, e) => {
    // Prevent triggering the parent onClick (which would open the list view)
    if (e) {
      e.stopPropagation();
    }
    
    if (!user) {
      alert('You must be logged in to upvote lists.');
      return;
    }
    
    try {
      // Get the user's lists
      const userDocRef = doc(db, "userLists", listUserId);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        console.error("User document not found");
        return;
      }
      
      const userData = userDoc.data();
      const userLists = userData.lists || [];
      
      // Find the list to upvote
      const listIndex = userLists.findIndex(list => list.id === listId);
      
      if (listIndex === -1) {
        console.error("List not found");
        return;
      }
      
      // Check if user already upvoted this list
      const upvotes = userLists[listIndex].upvotes || [];
      const userUpvoteIndex = upvotes.indexOf(user.uid);
      
      // Create a copy of the lists array
      const updatedLists = [...userLists];
      
      if (userUpvoteIndex >= 0) {
        // User already upvoted, remove the upvote
        updatedLists[listIndex].upvotes = upvotes.filter(uid => uid !== user.uid);
      } else {
        // User hasn't upvoted, add the upvote
        updatedLists[listIndex].upvotes = [...upvotes, user.uid];
      }
      
      // Update the document
      await updateDoc(userDocRef, {
        lists: updatedLists
      });
      
      // Calculate the new upvotes
      const newUpvotes = userUpvoteIndex >= 0 
        ? upvotes.filter(uid => uid !== user.uid)
        : [...upvotes, user.uid];
      
      // Update both lists state
      const updateListsState = (lists) => {
        return lists.map(list => {
          if (list.userId === listUserId && list.id === listId) {
            return {
              ...list,
              upvotes: newUpvotes,
              upvoteCount: newUpvotes.length
            };
          }
          return list;
        });
      };
      
      setTopVotedLists(updateListsState(topVotedLists));
      setRecentLists(updateListsState(recentLists));
      
      // Also update favorites if this list is in favorites
      if (isFavorited(listUserId, listId)) {
        setFavoriteLists(updateListsState(favoriteLists));
      }
      
    } catch (error) {
      console.error("Error upvoting list:", error);
      alert("Failed to upvote list. Please try again.");
    }
  };

  // Check if the current user has upvoted a list
  const hasUserUpvoted = (list) => {
    return user && list.upvotes && list.upvotes.includes(user.uid);
  };

  const viewFullList = async (list) => {
    // Instead of setting selectedList, navigate to the list's dedicated URL
    navigate(`/list/${list.userId}/${list.id}`, { state: { source: 'home' } });
  };

  const handleBackToLists = () => {
    // Instead of clearing selectedList, navigate back to home
    navigate('/');
  };

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Function to fetch comments for a specific list
  const fetchComments = async (listUserId, listId) => {
    if (!listUserId || !listId) return;
    
    setLoadingComments(true);
    try {
      // Fetch comments from comments collection
      const commentsRef = collection(db, 'comments');
      
      try {
        const q = query(
          commentsRef, 
          where('listUserId', '==', listUserId),
          where('listId', '==', listId),
          orderBy('createdAt', 'desc')
        );
        
        const querySnapshot = await getDocs(q);
        const fetchedComments = [];
        
        querySnapshot.forEach((doc) => {
          fetchedComments.push({
            id: doc.id,
            ...doc.data(),
            upvotes: doc.data().upvotes || [],
            downvotes: doc.data().downvotes || []
          });
        });
        
        setComments(fetchedComments);
      } catch (indexError) {
        console.error("Index error, trying without sorting:", indexError);
        
        // If index doesn't exist, try without the orderBy
        const simpleQuery = query(
          commentsRef, 
          where('listUserId', '==', listUserId),
          where('listId', '==', listId)
        );
        
        const querySnapshot = await getDocs(simpleQuery);
        let fetchedComments = [];
        
        querySnapshot.forEach((doc) => {
          fetchedComments.push({
            id: doc.id,
            ...doc.data(),
            upvotes: doc.data().upvotes || [],
            downvotes: doc.data().downvotes || []
          });
        });
        
        // Sort manually on client side
        fetchedComments = fetchedComments.sort((a, b) => {
          const dateA = a.createdAt instanceof Timestamp 
            ? a.createdAt.toDate() 
            : new Date(a.createdAt || 0);
          const dateB = b.createdAt instanceof Timestamp 
            ? b.createdAt.toDate() 
            : new Date(b.createdAt || 0);
          return dateB - dateA; // Descending order
        });
        
        setComments(fetchedComments);
        
        // Alert the user once about the index issue
        console.warn(
          "This is a first-time setup issue. The admin should create an index for comments collection " +
          "with fields: listUserId, listId, and createdAt. Follow the Firestore error link if you're an admin."
        );
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  };
  
  // Function to add a new comment
  const addComment = async (parentId = null) => {
    if (!user) {
      alert('You must be logged in to add comments.');
      return;
    }
    
    const text = parentId ? replyText.trim() : newComment.trim();
    
    if (!text) {
      alert('Comment cannot be empty.');
      return;
    }
    
    try {
      const commentData = {
        listUserId: selectedList.userId,
        listId: selectedList.id,
        userId: user.uid,
        userName: user.displayName || 'Anonymous',
        text: text,
        createdAt: serverTimestamp(),
        upvotes: [],
        downvotes: [],
        parentId: parentId || null, // Add parentId field for replies
        isReply: !!parentId
      };
      
      const docRef = await addDoc(collection(db, 'comments'), commentData);
      
      // Add to local state with the ID
      setComments([
        {
          id: docRef.id,
          ...commentData,
          createdAt: new Date(), // Use current date as serverTimestamp isn't available in client
        },
        ...comments
      ]);
      
      // Clear the comment fields
      if (parentId) {
        setReplyText('');
        setReplyingTo(null);
      } else {
        setNewComment('');
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      alert('Failed to add comment. Please try again.');
    }
  };
  
  // Function to handle comment votes
  const handleCommentVote = async (commentId, voteType) => {
    if (!user) {
      alert('You must be logged in to vote on comments.');
      return;
    }
    
    try {
      const commentRef = doc(db, 'comments', commentId);
      const commentSnapshot = await getDoc(commentRef);
      
      if (!commentSnapshot.exists()) {
        console.error("Comment not found");
        return;
      }
      
      const commentData = commentSnapshot.data();
      const upvotes = commentData.upvotes || [];
      const downvotes = commentData.downvotes || [];
      
      const hasUpvoted = upvotes.includes(user.uid);
      const hasDownvoted = downvotes.includes(user.uid);
      
      // Handle vote logic
      let updatedUpvotes = [...upvotes];
      let updatedDownvotes = [...downvotes];
      
      if (voteType === 'upvote') {
        if (hasUpvoted) {
          // Remove upvote if already upvoted
          updatedUpvotes = updatedUpvotes.filter(id => id !== user.uid);
        } else {
          // Add upvote and remove downvote if exists
          updatedUpvotes.push(user.uid);
          updatedDownvotes = updatedDownvotes.filter(id => id !== user.uid);
        }
      } else if (voteType === 'downvote') {
        if (hasDownvoted) {
          // Remove downvote if already downvoted
          updatedDownvotes = updatedDownvotes.filter(id => id !== user.uid);
        } else {
          // Add downvote and remove upvote if exists
          updatedDownvotes.push(user.uid);
          updatedUpvotes = updatedUpvotes.filter(id => id !== user.uid);
        }
      }
      
      // Update the comment in Firestore
      await updateDoc(commentRef, {
        upvotes: updatedUpvotes,
        downvotes: updatedDownvotes
      });
      
      // Update the local state
      setComments(comments.map(comment => {
        if (comment.id === commentId) {
          return {
            ...comment,
            upvotes: updatedUpvotes,
            downvotes: updatedDownvotes
          };
        }
        return comment;
      }));
      
    } catch (error) {
      console.error('Error voting on comment:', error);
      alert('Failed to process your vote. Please try again.');
    }
  };
  
  // Function to handle comment deletion
  const handleDeleteComment = async (commentId) => {
    if (!user) {
      alert('You must be logged in to delete comments.');
      return;
    }
    
    // Confirm before deleting
    if (!window.confirm('Are you sure you want to delete this comment?')) {
      return;
    }
    
    try {
      const commentRef = doc(db, 'comments', commentId);
      const commentSnapshot = await getDoc(commentRef);
      
      if (!commentSnapshot.exists()) {
        console.error("Comment not found");
        return;
      }
      
      const commentData = commentSnapshot.data();
      
      // Only allow deletion if this is the comment author
      if (commentData.userId !== user.uid) {
        alert('You can only delete your own comments.');
        return;
      }
      
      // Delete the comment
      await deleteDoc(commentRef);
      
      // Update local state by removing the deleted comment
      setComments(comments.filter(comment => comment.id !== commentId));
      
    } catch (error) {
      console.error('Error deleting comment:', error);
      alert('Failed to delete comment. Please try again.');
    }
  };
  
  // Function to handle starting a reply
  const handleReplyClick = (commentId) => {
    setReplyingTo(replyingTo === commentId ? null : commentId);
    setReplyText('');
  };

  // Function to cancel reply
  const cancelReply = () => {
    setReplyingTo(null);
    setReplyText('');
  };
  
  // Function to check if the current user is the author of a comment
  const isCommentAuthor = (comment) => {
    return user && comment.userId === user.uid;
  };
  
  // Function to format comment timestamps
  const formatCommentDate = (timestamp) => {
    if (!timestamp) return '';
    
    const date = timestamp instanceof Timestamp 
      ? timestamp.toDate() 
      : new Date(timestamp);
      
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  // Function to get vote count
  const getVoteCount = (comment) => {
    return (comment.upvotes?.length || 0) - (comment.downvotes?.length || 0);
  };
  
  // Function to check if user has upvoted a comment
  const hasUserUpvotedComment = (comment) => {
    return user && comment.upvotes && comment.upvotes.includes(user.uid);
  };
  
  // Function to check if user has downvoted a comment
  const hasUserDownvotedComment = (comment) => {
    return user && comment.downvotes && comment.downvotes.includes(user.uid);
  };

  // Function to view all lists by a specific user
  const viewUserLists = (userId, userName, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Use the router to navigate to the user's rankings page
    onViewUserLists(userId, userName);
  };

  // Function to check if a list is favorited by the current user
  const isFavorited = (listUserId, listId) => {
    return favorites.some(fav => fav.userId === listUserId && fav.listId === listId);
  };
  
  // Function to toggle favorite status of a list
  const toggleFavorite = async (listUserId, listId, listName, e) => {
    if (e) {
      e.stopPropagation();
    }
    
    if (!user) {
      alert('You must be logged in to favorite lists.');
      return;
    }
    
    try {
      const userRef = doc(db, "users", user.uid);
      
      // Check if already favorited
      const alreadyFavorited = isFavorited(listUserId, listId);
      
      // Save the click position for the popup
      const buttonRect = e.currentTarget.getBoundingClientRect();
      const popupPosition = {
        x: buttonRect.left + buttonRect.width / 2,
        y: buttonRect.top - 10 // Position above the button instead of below
      };
      
      if (alreadyFavorited) {
        // Remove from favorites
        const updatedFavorites = favorites.filter(
          fav => !(fav.userId === listUserId && fav.listId === listId)
        );
        
        await updateDoc(userRef, {
          favorites: updatedFavorites
        });
        
        setFavorites(updatedFavorites);
        
        // Show feedback popup
        setFeedbackMessage({
          text: `Removed from favorites`,
          position: popupPosition,
          isAdd: false
        });
        setShowFeedback(true);
        setTimeout(() => setShowFeedback(false), 2000);
      } else {
        // Add to favorites
        const newFavorite = {
          userId: listUserId,
          listId: listId,
          name: listName,
          favoritedAt: new Date().toISOString() // Use ISO string instead of serverTimestamp()
        };
        
        const updatedFavorites = [...favorites, newFavorite];
        
        await updateDoc(userRef, {
          favorites: updatedFavorites
        });
        
        setFavorites(updatedFavorites);
        
        // Show feedback popup
        setFeedbackMessage({
          text: `Added to favorites`,
          position: popupPosition,
          isAdd: true
        });
        setShowFeedback(true);
        setTimeout(() => setShowFeedback(false), 2000);
      }
    } catch (error) {
      console.error("Error updating favorites:", error);
      alert("Failed to update favorites. Please try again.");
    }
  };

  // Function to toggle spoiler reveal
  const toggleSpoilerReveal = () => {
    setSpoilerRevealed(!spoilerRevealed);
  };

  const renderRankingList = (list) => {
    if (!list || !list.contestants) return null;
    
    // Get only the top 3 contestants from the list
    const topContestants = list.contestants.slice(0, 3);
    const hasSpoilerTag = list.tags && list.tags.includes('spoiler');
    
    return (
      <div 
        className="ranking-list-container" 
        onClick={() => viewFullList(list)}
      >
        <div className="top-left-favorite" onClick={(e) => e.stopPropagation()}>
          <button 
            className={`favorite-button ${isFavorited(list.userId, list.id) ? 'favorited' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              if (user) {
                toggleFavorite(list.userId, list.id, list.name, e);
              } else {
                alert("You must be logged in to favorite lists");
              }
            }}
            title={user ? (isFavorited(list.userId, list.id) ? "Remove from favorites" : "Add to favorites") : "Login to favorite lists"}
          >
            <span className="favorite-icon">★</span>
          </button>
        </div>
        
        <div className="top-right-upvote" onClick={(e) => e.stopPropagation()}>
          <button 
            className={`upvote-button ${hasUserUpvoted(list) ? 'upvoted' : ''}`}
            onClick={(e) => handleUpvote(list.userId, list.id, e)}
            disabled={!user}
            title={user ? "Upvote this list" : "Sign in to upvote"}
          >
            <span className="upvote-icon">▲</span>
            <span className="upvote-count">{list.upvoteCount || 0}</span>
          </button>
        </div>
          
        <h2 className="list-title">{list.name}</h2>
        
        {hasSpoilerTag && (
          <div className="spoiler-warning">Contains Spoilers</div>
        )}
        
        <p className="list-creator">
          By <span 
            className="username"
            onClick={(e) => {
              e.stopPropagation();
              viewUserLists(list.userId, list.userName, e);
            }}
            title="View all rankings by this user"
          >
            {list.userName || "Unknown User"}
          </span>
        </p>
        
        <div className={`ranking-list clickable ${hasSpoilerTag ? 'spoiler-blur' : ''}`}>
          {topContestants.length === 0 ? (
            <div className="empty-list-message">
              This list is empty
            </div>
          ) : (
            topContestants.map((contestant, index) => (
              <div
                key={`${contestant.id}-${index}`}
                className="ranking-item"
              >
                <div className="ranking-number">{index + 1}</div>
                <img
                  src={contestantImageUrls[contestant.id] || contestant.imageUrl || "/images/placeholder.jpg"}
                  alt={contestant.name}
                  className={`contestant-image ${contestant.isSeason ? 'season-logo' : ''}`}
                  draggable="false"
                />
                <div className={contestant.isSeason ? "season-name" : "contestant-name"}>
                  {contestant.isSeason 
                    ? contestant.name.replace('Survivor: ', '').replace('Survivor ', '') 
                    : contestant.name}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderFullList = () => {
    if (!selectedList) return null;
    
    // Check if list has spoiler tag
    const hasSpoilerTag = selectedList.tags && selectedList.tags.includes('spoiler');
    
    return (
      <div className="full-list-view">
        <div className="full-list-header">
          <button className="back-to-lists-button" onClick={handleBackToLists}>
            ← Back to Lists
          </button>
          
          <div className="top-left-favorite">
            <button 
              className={`favorite-button ${isFavorited(selectedList.userId, selectedList.id) ? 'favorited' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (user) {
                  toggleFavorite(selectedList.userId, selectedList.id, selectedList.name, e);
                } else {
                  alert("You must be logged in to favorite lists");
                }
              }}
              title={user ? (isFavorited(selectedList.userId, selectedList.id) ? "Remove from favorites" : "Add to favorites") : "Login to favorite lists"}
            >
              <span className="favorite-icon">★</span>
            </button>
          </div>
          
          <div className="title-container">
            <h2 className="centered-title">{selectedList.name}</h2>
            
            {/* Add spoiler warning and toggle button */}
            {hasSpoilerTag && (
              <div className="spoiler-reveal-container">
                <button 
                  className="spoiler-reveal-button" 
                  onClick={toggleSpoilerReveal}
                >
                  <span className="eye-icon">{spoilerRevealed ? "👁️" : "👁️‍🗨️"}</span>
                  {spoilerRevealed ? "Hide Spoilers" : "Show Spoilers"}
                </button>
              </div>
            )}
            
            <span className="created-by">
              Created by: <span 
                className="username"
                onClick={(e) => {
                  e.stopPropagation();
                  viewUserLists(selectedList.userId, selectedList.userName, e);
                }}
                title="View all rankings by this user"
              >
                {selectedList.userName || "Unknown User"}
              </span>
            </span>
          </div>
          
          <div className="top-right-upvote">
            <button 
              className={`upvote-button ${hasUserUpvoted(selectedList) ? 'upvoted' : ''}`}
              onClick={(e) => handleUpvote(selectedList.userId, selectedList.id, e)}
              disabled={!user}
              title={user ? "Upvote this list" : "Sign in to upvote"}
            >
              <span className="upvote-icon">▲</span>
              <span className="upvote-count">{selectedList.upvoteCount || 0}</span>
            </button>
          </div>
          
          <div className="list-meta">
            <span className="created-date">
              {selectedList.updatedAt 
                ? `Updated: ${formatDate(selectedList.updatedAt)}` 
                : `Created: ${formatDate(selectedList.createdAt)}`}
            </span>
          </div>
          
          {selectedList.description && (
            <p className="list-description">{selectedList.description}</p>
          )}
          
          <div className="full-list-tags">
            {selectedList.tags && selectedList.tags
              .filter(tag => tag !== 'season-ranking' && tag !== 'survivor-ranking')
              .map(tag => (
                <span key={tag} className="list-tag">
                  {tag.charAt(0).toUpperCase() + tag.slice(1)}
                </span>
              ))}
          </div>
        </div>
        
        <div className="ranking-list-container full-list">
          <div className={`ranking-list ${hasSpoilerTag && !spoilerRevealed ? 'spoiler-blur' : 'spoiler-revealed'}`}>
            {selectedList.contestants && selectedList.contestants.length > 0 ? (
              selectedList.contestants.map((contestant, index) => (
                <div
                  key={`${contestant.id}-${index}`}
                  className="ranking-item"
                >
                  <div className="ranking-number">{index + 1}</div>
                  <img
                    src={contestantImageUrls[contestant.id] || contestant.imageUrl || "/images/placeholder.jpg"}
                    alt={contestant.name}
                    className={`contestant-image ${contestant.isSeason ? 'season-logo' : ''}`}
                    draggable="false"
                  />
                  <div className={contestant.isSeason ? "season-name" : "contestant-name"}>
                    {contestant.isSeason 
                      ? contestant.name.replace('Survivor: ', '').replace('Survivor ', '') 
                      : contestant.name}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-list-message">
                This list is empty
              </div>
            )}
          </div>
        </div>
        
        {/* Comments Section */}
        <div className="comments-section">
          <h3 className="comments-title">Comments</h3>
          
          {/* Add Comment Form */}
          {user ? (
            <div className="add-comment-form">
              <textarea
                placeholder="Add your comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={3}
                maxLength={500}
              />
              <div className="comment-actions">
                <button 
                  className="add-comment-button" 
                  onClick={() => addComment()}
                  disabled={!newComment.trim()}
                >
                  Post Comment
                </button>
              </div>
            </div>
          ) : (
            <div className="login-to-comment">
              Please log in to add comments.
            </div>
          )}
          
          {/* Comments List */}
          {loadingComments ? (
            <div className="loading-comments">Loading comments...</div>
          ) : comments.length === 0 ? (
            <div className="no-comments">
              No comments yet. Be the first to comment!
            </div>
          ) : (
            <div className="comments-list">
              {comments
                .filter(comment => !comment.parentId) // Filter for top-level comments only
                .map(comment => {
                  // Find replies to this comment
                  const replies = comments.filter(reply => reply.parentId === comment.id);
                  
                  return (
                    <div key={comment.id} className="comment-item">
                      <div className="comment-header">
                        <span className="comment-author">
                          <span 
                            className="username"
                            onClick={(e) => viewUserLists(comment.userId, comment.userName, e)}
                            title="View all rankings by this user"
                          >
                            {comment.userName}
                          </span>
                        </span>
                        <span className="comment-date">{formatCommentDate(comment.createdAt)}</span>
                      </div>
                      <div className="comment-content">
                        {comment.text}
                      </div>
                      <div className="comment-footer">
                        <div className="comment-actions-group">
                          <div className="comment-votes">
                            <button 
                              className={`comment-vote upvote ${hasUserUpvotedComment(comment) ? 'voted' : ''}`}
                              onClick={() => handleCommentVote(comment.id, 'upvote')}
                              disabled={!user}
                              title={user ? "Upvote" : "Please log in to vote"}
                            >
                              ▲
                            </button>
                            <span className="vote-count">{getVoteCount(comment)}</span>
                            <button 
                              className={`comment-vote downvote ${hasUserDownvotedComment(comment) ? 'voted' : ''}`}
                              onClick={() => handleCommentVote(comment.id, 'downvote')}
                              disabled={!user}
                              title={user ? "Downvote" : "Please log in to vote"}
                            >
                              ▼
                            </button>
                          </div>
                          
                          {user && (
                            <button 
                              className="reply-button"
                              onClick={() => handleReplyClick(comment.id)}
                              title="Reply to this comment"
                            >
                              {replyingTo === comment.id ? 'Cancel' : 'Reply'}
                            </button>
                          )}
                        </div>
                        
                        {isCommentAuthor(comment) && (
                          <button 
                            className="delete-comment-button"
                            onClick={() => handleDeleteComment(comment.id)}
                            title="Delete your comment"
                          >
                            Delete
                          </button>
                        )}
                      </div>

                      {/* Reply Form */}
                      {replyingTo === comment.id && user && (
                        <div className="reply-form">
                          <textarea
                            placeholder="Write your reply..."
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            rows={2}
                            maxLength={500}
                          />
                          <div className="reply-actions">
                            <button 
                              className="cancel-reply-button"
                              onClick={cancelReply}
                            >
                              Cancel
                            </button>
                            <button 
                              className="post-reply-button"
                              onClick={() => addComment(comment.id)}
                              disabled={!replyText.trim()}
                            >
                              Post Reply
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Replies */}
                      {replies.length > 0 && (
                        <div className="comment-replies">
                          {replies.map(reply => (
                            <div key={reply.id} className="reply-item">
                              <div className="reply-header">
                                <span className="reply-author">
                                  <span 
                                    className="username"
                                    onClick={(e) => viewUserLists(reply.userId, reply.userName, e)}
                                    title="View all rankings by this user"
                                  >
                                    {reply.userName}
                                  </span>
                                </span>
                                <span className="reply-date">{formatCommentDate(reply.createdAt)}</span>
                              </div>
                              <div className="reply-content">
                                {reply.text}
                              </div>
                              <div className="reply-footer">
                                <div className="reply-votes">
                                  <button 
                                    className={`reply-vote upvote ${hasUserUpvotedComment(reply) ? 'voted' : ''}`}
                                    onClick={() => handleCommentVote(reply.id, 'upvote')}
                                    disabled={!user}
                                    title={user ? "Upvote" : "Please log in to vote"}
                                  >
                                    ▲
                                  </button>
                                  <span className="vote-count">{getVoteCount(reply)}</span>
                                  <button 
                                    className={`reply-vote downvote ${hasUserDownvotedComment(reply) ? 'voted' : ''}`}
                                    onClick={() => handleCommentVote(reply.id, 'downvote')}
                                    disabled={!user}
                                    title={user ? "Downvote" : "Please log in to vote"}
                                  >
                                    ▼
                                  </button>
                                </div>
                                
                                {isCommentAuthor(reply) && (
                                  <button 
                                    className="delete-reply-button"
                                    onClick={() => handleDeleteComment(reply.id)}
                                    title="Delete your reply"
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="ranking-lists">
      {/* Feedback Popup */}
      {showFeedback && (
        <div 
          className={`feedback-popup ${feedbackMessage.isAdd ? 'add-favorite' : 'remove-favorite'}`}
          style={{
            position: 'fixed',
            left: `${feedbackMessage.position.x}px`,
            top: `${feedbackMessage.position.y}px`,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="popup-content">
            <span className="popup-icon">{feedbackMessage.isAdd ? '★' : '☆'}</span>
            <span className="popup-text">{feedbackMessage.text}</span>
          </div>
        </div>
      )}
      
      <h2 className="section-title">Top Voted Lists This Week</h2>
      <div className="lists-container">
        {topVotedLists.length > 0 ? (
          topVotedLists.map(list => renderRankingList(list))
        ) : (
          <div className="empty-section-message">No voted lists found this week</div>
        )}
      </div>
      
      <h2 className="section-title">Recently Created Lists</h2>
      <div className="lists-container">
        {recentLists.length > 0 ? (
          recentLists.map(list => renderRankingList(list))
        ) : (
          <div className="empty-section-message">No recent lists found</div>
        )}
      </div>
      
      {user && (
        <>
          <h2 className="section-title">Your Favorite Lists</h2>
          {loadingFavorites ? (
            <div className="empty-section-message">Loading favorites...</div>
          ) : favoriteLists.length > 0 ? (
            <>
              {/* Display favorites in rows of 3 */}
              {Array.from({ length: Math.ceil(favoriteLists.length / 3) }).map((_, rowIndex) => (
                <div key={`favorite-row-${rowIndex}`} className="lists-container">
                  {favoriteLists.slice(rowIndex * 3, rowIndex * 3 + 3).map(list => renderRankingList(list))}
                </div>
              ))}
            </>
          ) : (
            <div className="empty-section-message">
              You haven't favorited any lists yet. 
              Click the star icon on lists you like to add them here!
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default RankingLists;