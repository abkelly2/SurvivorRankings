import React, { useState, useEffect, useContext } from 'react';
import { db } from '../firebase';
import { 
  collection, getDocs, doc, updateDoc, arrayUnion, arrayRemove, getDoc, query, where, 
  addDoc, serverTimestamp, orderBy, Timestamp, setDoc, deleteDoc
} from 'firebase/firestore';
import { getContestantImageUrl, getSeasonLogoUrl } from '../firebase';
import { survivorSeasons } from '../data/survivorData';
import { UserContext } from '../UserContext';
import './OtherLists.css';
import './RankingLists.css';
import { useNavigate } from 'react-router-dom';

const OtherLists = ({ initialUserId, initialUserName, source = 'other', initialSelectedList = null }) => {
  const [publicLists, setPublicLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedType, setSelectedType] = useState('all'); // 'all', 'season', 'survivor'
  const [sortBy, setSortBy] = useState('mostVotes'); // 'mostVotes', 'newest', 'oldest'
  const [expandedList, setExpandedList] = useState(null);
  const [selectedList, setSelectedList] = useState(initialSelectedList);
  const [viewingUserId, setViewingUserId] = useState(initialUserId || null);
  const [viewingUserName, setViewingUserName] = useState(initialUserName || '');
  const [contestantImageUrls, setContestantImageUrls] = useState({});
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const { user } = useContext(UserContext);
  
  // Add state for favorites
  const [favorites, setFavorites] = useState([]);
  
  // Add new state for feedback popup
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState({
    text: '',
    position: { x: 0, y: 0 },
    isAdd: true
  });
  
  // Add state for spoiler reveal
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  
  // Available tag options for filtering
  const availableTags = [
    { id: 'favorites', label: 'Favorites' },
    { id: 'social', label: 'Social' },
    { id: 'strategic', label: 'Strategic' },
    { id: 'challenge', label: 'Challenge Beasts' },
    { id: 'spoiler', label: 'Spoiler' }
  ];
  
  const navigate = useNavigate();
  
  useEffect(() => {
    const fetchPublicLists = async () => {
      setLoading(true);
      setError(null);
      
      try {
        console.log('Starting to fetch public lists...');
        const userListsRef = collection(db, 'userLists');
        console.log('Created userListsRef:', userListsRef);
        
        const snapshot = await getDocs(userListsRef);
        console.log('Got snapshot from Firestore, size:', snapshot.size);
        console.log('Empty snapshot?', snapshot.empty);
        
        let allPublicLists = [];
        
        // Log each document for debugging
        snapshot.forEach(doc => {
          console.log('Processing document ID:', doc.id);
          const userData = doc.data();
          console.log('User data:', userData);
          
          // Check if user document contains a 'lists' array
          if (userData.lists && Array.isArray(userData.lists)) {
            console.log(`Found ${userData.lists.length} lists for user ${doc.id}`);
            // Get user's display name if available
            const userName = userData.displayName || 'Unknown User';
            
            userData.lists.forEach(list => {
              console.log('Processing list:', list.id, list.name, 'public:', list.public);
              // Include all lists (temporarily ignore public flag for testing)
              if (list.id) {
                // Add userId, userName, and calculate upvote count
                allPublicLists.push({
                  ...list,
                  userId: doc.id,
                  userName: list.userName || userName, // Use list's userName or fallback to user's name
                  upvoteCount: list.upvotes ? list.upvotes.length : 0,
                  public: list.public === undefined ? true : list.public // Set undefined public to true for testing
                });
                console.log('Added list to allPublicLists:', list.name);
              } else {
                console.log('Skipped list due to missing ID');
              }
            });
          } else {
            console.log('No lists array found for user', doc.id);
          }
        });
        
        console.log('Total public lists found:', allPublicLists.length);
        console.log('First few lists:', allPublicLists.slice(0, 3));
        
        setPublicLists(allPublicLists);
      } catch (err) {
        console.error("Error fetching public lists:", err);
        setError("Failed to load public lists. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchPublicLists();
  }, [initialUserId]);
  
  // Set initial viewing user when initialUserId changes
  useEffect(() => {
    if (initialUserId) {
      setViewingUserId(initialUserId);
      setViewingUserName(initialUserName || 'Unknown User');
    }
  }, [initialUserId, initialUserName]);
  
  // Load user's favorites when user changes
  useEffect(() => {
    if (user) {
      fetchUserFavorites();
    } else {
      setFavorites([]);
    }
  }, [user]);
  
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
          favoritedAt: new Date().toISOString()
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
  
  const handleSortChange = (sortOption) => {
    setSortBy(sortOption);
  };
  
  const handleTypeChange = (type) => {
    setSelectedType(type);
  };
  
  const sortLists = (lists) => {
    switch(sortBy) {
      case 'mostVotes':
        return [...lists].sort((a, b) => (b.upvoteCount || 0) - (a.upvoteCount || 0));
      case 'newest':
        return [...lists].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      case 'oldest':
        return [...lists].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      default:
        return lists;
    }
  };
  
  const handleTagSelect = (tag) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };
  
  const handleUpvote = async (listUserId, listId) => {
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
      
      // Update the lists state and selected list if viewing details
      const updatedUpvotes = userUpvoteIndex >= 0 
        ? upvotes.filter(uid => uid !== user.uid)
        : [...upvotes, user.uid];
      
      // Update sorted lists state
      const updateListsState = (lists) => {
        return lists.map(list => {
          if (list.userId === listUserId && list.id === listId) {
            return {
              ...list,
              upvotes: updatedUpvotes,
              upvoteCount: updatedUpvotes.length
            };
          }
          return list;
        });
      };
      
      setPublicLists(updateListsState(publicLists));
      
      // Also update selectedList if we're viewing a list detail
      if (selectedList && selectedList.userId === listUserId && selectedList.id === listId) {
        setSelectedList({
          ...selectedList,
          upvotes: updatedUpvotes,
          upvoteCount: updatedUpvotes.length
        });
      }
      
    } catch (error) {
      console.error("Error upvoting list:", error);
      alert("Failed to upvote list. Please try again.");
    }
  };
  
  const toggleExpandList = (listId) => {
    if (expandedList === listId) {
      setExpandedList(null);
    } else {
      setExpandedList(listId);
    }
  };
  
  // Get all unique tags from public lists (excluding hidden tags)
  const allTags = [...new Set(
    publicLists.flatMap(list => 
      list.tags?.filter(tag => tag !== 'season-ranking' && tag !== 'survivor-ranking') || []
    )
  )];
  
  // Apply filters and search for the public lists view
  const filteredLists = viewingUserId
    ? publicLists.filter(list => list.userId === viewingUserId) // Only show the specific user's lists
    : publicLists.filter(list => {
        // For the main public lists view, apply all filters
        const matchesSearch = !searchTerm || 
          (list.name && list.name.toLowerCase().includes(searchTerm.toLowerCase())) || 
          (list.description && list.description.toLowerCase().includes(searchTerm.toLowerCase()));
        
        const matchesType = selectedType === 'all' || 
          (selectedType === 'season' && list.tags && list.tags.includes('season-ranking')) ||
          (selectedType === 'survivor' && list.tags && list.tags.includes('survivor-ranking'));
        
        const matchesTags = selectedTags.length === 0 || 
          (selectedTags.includes('favorites') && isFavorited(list.userId, list.id)) ||
          (list.tags && selectedTags.every(tag => tag === 'favorites' || list.tags.includes(tag)));
          
        // TEMPORARILY INCLUDE ALL LISTS FOR TESTING
        // const isPublic = list.public === true || list.public === undefined;
        const isPublic = true; // Show all lists during testing
        
        return isPublic && matchesSearch && matchesType && matchesTags;
      });
  
  // Log filtered list count for debugging
  console.log('Total public lists:', publicLists.length);
  console.log('Filtered lists:', filteredLists.length);
  
  const sortedLists = sortLists(filteredLists);
  
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };
  
  const hasUserUpvoted = (list) => {
    return user && list.upvotes && list.upvotes.includes(user.uid);
  };
  
  // New function to handle list selection with comments loading
  const viewFullList = async (list) => {
    // Instead of setting selectedList, navigate to the list's dedicated URL
    navigate(`/list/${list.userId}/${list.id}`, { state: { source } });
  };
  
  // New function to go back to list overview
  const handleBackToLists = () => {
    // Instead of clearing selectedList, navigate back
    if (source === 'home') {
      navigate('/');
    } else if (viewingUserId) {
      navigate(`/rankings/user/${viewingUserId}`, { 
        state: { userName: viewingUserName } 
      });
    } else {
      navigate('/rankings');
    }
  };
  
  // New function to view all lists by a specific user
  const viewUserLists = (userId, userName, event) => {
    // If event exists, prevent default behavior
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    setSelectedList(null);
    setViewingUserId(userId);
    setViewingUserName(userName || "Unknown");
    
    navigate(`/rankings/user/${userId}`, { state: { userName } });
    // Use window.scrollTo to scroll to top
    window.scrollTo(0, 0);
  };
  
  // Load images for the selected list when it changes
  useEffect(() => {
    const loadImages = async () => {
      if (!selectedList || !selectedList.contestants || selectedList.contestants.length === 0) return;
      
      const newImageUrls = { ...contestantImageUrls };
      
      for (const contestant of selectedList.contestants) {
        if (!contestantImageUrls[contestant.id]) {
          if (contestant.isSeason) {
            // Load season logo
            try {
              const url = await getSeasonLogoUrl(contestant.id);
              newImageUrls[contestant.id] = url;
            } catch (error) {
              console.error(`Error loading logo for season ${contestant.id}:`, error);
              newImageUrls[contestant.id] = '/images/placeholder.jpg';
            }
          } else {
            // First try to use the contestant's seasonId if available
            let seasonId = contestant.seasonId;
            
            // If seasonId is not available, find it from survivorSeasons
            if (!seasonId) {
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
              } catch (error) {
                console.error(`Error loading image for ${contestant.name}:`, error);
                newImageUrls[contestant.id] = '/images/placeholder.jpg';
              }
            } else {
              console.warn(`Unable to find season for contestant: ${contestant.name}`);
              newImageUrls[contestant.id] = '/images/placeholder.jpg';
            }
          }
        }
      }
      
      setContestantImageUrls(newImageUrls);
    };
    
    loadImages();
  }, [selectedList]);
  
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
  
  // Function to toggle spoiler reveal
  const toggleSpoilerReveal = () => {
    setSpoilerRevealed(!spoilerRevealed);
  };
  
  useEffect(() => {
    // Set initialSelectedList if provided
    if (initialSelectedList) {
      setSelectedList(initialSelectedList);
      // Also fetch comments for the list
      fetchComments(initialSelectedList.userId, initialSelectedList.id);
    }
  }, [initialSelectedList]);
  
  // Add new useEffect for loading images in list cards
  useEffect(() => {
    const loadListCardImages = async () => {
      if (!sortedLists || sortedLists.length === 0) return;
      
      const newImageUrls = { ...contestantImageUrls };
      
      // Get all contestants from the preview (first 3) of each list
      const allPreviewContestants = sortedLists.flatMap(list => 
        (list.contestants || []).slice(0, 3)
      );
      
      // Create a map to help find a contestant's season
      const seasonMap = {};
      
      // Build the season map from survivorSeasons data
      survivorSeasons.forEach(season => {
        if (season.contestants) {
          season.contestants.forEach(contestant => {
            seasonMap[contestant.id] = season.id;
          });
        }
      });
      
      for (const contestant of allPreviewContestants) {
        if (!contestant) continue;
        
        if (!newImageUrls[contestant.id]) {
          if (contestant.isSeason) {
            try {
              const url = await getSeasonLogoUrl(contestant.id);
              newImageUrls[contestant.id] = url;
            } catch (error) {
              console.error(`Error loading logo for season ${contestant.id}:`, error);
              newImageUrls[contestant.id] = '/images/placeholder.jpg';
            }
          } else {
            try {
              // First try to use the contestant's seasonId if available
              let seasonId = contestant.seasonId || seasonMap[contestant.id];
              
              // If we still don't have a valid seasonId, try looking it up in survivorSeasons
              if (!seasonId) {
                for (const season of survivorSeasons) {
                  if (season.contestants && season.contestants.some(c => c.id === contestant.id)) {
                    seasonId = season.id;
                    break;
                  }
                }
              }
              
              if (seasonId) {
                // Remove the 's' prefix from seasonId if it exists
                const numericSeasonId = seasonId.startsWith('s') ? seasonId.substring(1) : seasonId;
                const url = await getContestantImageUrl(contestant, numericSeasonId);
                newImageUrls[contestant.id] = url;
              } else {
                console.warn(`Unable to find season for contestant: ${contestant.name}`);
                newImageUrls[contestant.id] = '/images/placeholder.jpg';
              }
            } catch (error) {
              console.error(`Error loading image for ${contestant.name}:`, error);
              newImageUrls[contestant.id] = '/images/placeholder.jpg';
            }
          }
        }
      }
      
      setContestantImageUrls(newImageUrls);
    };
    
    loadListCardImages();
  }, [sortedLists]);
  
  if (loading) return <div className="other-lists loading">Loading rankings...</div>;
  if (error) return <div className="other-lists error">{error}</div>;
  
  // Get lists by user if viewing a specific user's lists
  const userLists = viewingUserId 
    ? publicLists.filter(list => list.userId === viewingUserId)
    : publicLists.filter(list => list.public === true);
  
  const sortedUserLists = sortLists(userLists);
  
  // Final render
  if (selectedList) {
    // Check if list has spoiler tag
    const hasSpoilerTag = selectedList.tags && selectedList.tags.includes('spoiler');
    
    return (
      <div className="other-lists full-list-view">
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
      
        <div className="back-button-container">
          <button 
            className="back-to-lists-button" 
            onClick={handleBackToLists}
          >
            {source === 'home' && !viewingUserId ? '← Back to Home' : '← Back to Rankings'}
          </button>
        </div>
        <div className="full-list-header">
          <h2>{selectedList.name}</h2>
          
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
          
          <div className="list-meta">
            <span className="created-by">
              Created by: <span 
                className="username"
                onClick={(e) => {
                  e.stopPropagation();
                  viewUserLists(selectedList.userId, selectedList.userName, e);
                }}
                title="View all rankings by this user"
              >
                {selectedList.userName || "Unknown"}
              </span>
            </span>
            <span className="created-date">Date: {formatDate(selectedList.createdAt)}</span>
          </div>
          
          <div className="top-right-upvote">
            <button 
              className={`upvote-button ${hasUserUpvoted(selectedList) ? 'upvoted' : ''}`}
              onClick={() => handleUpvote(selectedList.userId, selectedList.id)}
              disabled={!user}
              title={user ? (hasUserUpvoted(selectedList) ? "Remove upvote" : "Upvote this list") : "Sign in to upvote"}
            >
              <span className="upvote-icon">▲</span>
              <span className="upvote-count">{selectedList.upvoteCount || 0}</span>
            </button>
          </div>
          
          <div className="top-left-favorite">
            <button 
              className={`favorite-button ${isFavorited(selectedList.userId, selectedList.id) ? 'favorited' : ''}`}
              onClick={(e) => toggleFavorite(selectedList.userId, selectedList.id, selectedList.name, e)}
              disabled={!user}
              title={user ? (isFavorited(selectedList.userId, selectedList.id) ? "Remove from favorites" : "Add to favorites") : "Login to favorite lists"}
            >
              <span className="favorite-icon">★</span>
            </button>
          </div>
          
          <div className="full-list-tags">
            {selectedList.tags && selectedList.tags.includes('season-ranking') && (
              <span className="list-type-indicator season">Season Ranking</span>
            )}
            {selectedList.tags && selectedList.tags.includes('survivor-ranking') && (
              <span className="list-type-indicator survivor">Survivor Ranking</span>
            )}
            
            {selectedList.tags && selectedList.tags
              .filter(tag => tag !== 'season-ranking' && tag !== 'survivor-ranking')
              .map(tag => (
                <span key={tag} className={`list-tag ${tag === 'spoiler' ? 'spoiler-tag' : ''}`}>{tag}</span>
              ))}
          </div>
          
          {selectedList.description && (
            <div className="list-description">
              <p>{selectedList.description}</p>
            </div>
          )}
        </div>
        
        <div className="ranking-list-container">
          <div className={`ranking-list ${hasSpoilerTag && !spoilerRevealed ? 'spoiler-blur' : 'spoiler-revealed'}`}>
            {selectedList.contestants && selectedList.contestants.length > 0 ? (
              selectedList.contestants.map((contestant, index) => (
                <div key={index} className="ranking-item">
                  <div className="ranking-number">{index + 1}</div>
                  <img
                    src={contestantImageUrls[contestant.id] || contestant.imageUrl || "/images/placeholder.jpg"}
                    alt={contestant.name}
                    className={`contestant-image ${contestant.isSeason ? 'season-logo' : ''}`}
                    draggable="false"
                  />
                  <div className={contestant.isSeason ? "season-name" : "contestant-name"} style={{ color: '#000000' }}>
                    {contestant.isSeason 
                      ? contestant.name.replace('Survivor: ', '').replace('Survivor ', '') 
                      : contestant.name}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-list-message">This list is empty.</div>
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
                        <span 
                          className="comment-author"
                          onClick={(e) => viewUserLists(comment.userId, comment.userName, e)}
                          title="View all rankings by this user"
                        >
                          {comment.userName}
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
                                <span 
                                  className="reply-author"
                                  onClick={(e) => viewUserLists(reply.userId, reply.userName, e)}
                                  title="View all rankings by this user"
                                >
                                  {reply.userName}
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
  }

  // If no list is selected, render the list browsing view
  return (
    <div className="other-lists ranking-lists">
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
    
      <div className="search-and-filters">
        {viewingUserId ? (
          <div className="user-rankings-header">
            <h2>Rankings by <span>{viewingUserName || 'User'}</span></h2>
            <span className="user-list-count">
              {sortedLists.length} {sortedLists.length === 1 ? 'ranking' : 'rankings'} created by this user
            </span>
          </div>
        ) : (
          <>
            <h2>Browse All Rankings</h2>
            {/* Debug info */}
            <div className="debug-panel" style={{ background: 'rgba(0,0,0,0.1)', padding: '5px', margin: '0 0 10px 0', borderRadius: '4px', fontSize: '0.8rem' }}>
              <p style={{ margin: '0' }}>Lists loaded from database: {publicLists.length}</p>
              <p style={{ margin: '0' }}>Lists after filtering: {filteredLists.length}</p>
            </div>
            <div className="search-container">
              <input
                type="text"
                placeholder="Search rankings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              
              <div className="filter-container">
                <div className="type-filters">
                  <span>Ranking Type:</span>
                  <button 
                    className={selectedType === 'all' ? 'active' : ''}
                    onClick={() => handleTypeChange('all')}
                  >
                    All Rankings
                  </button>
                  <button 
                    className={selectedType === 'season' ? 'active' : ''}
                    onClick={() => handleTypeChange('season')}
                  >
                    Season Rankings
                  </button>
                  <button 
                    className={selectedType === 'survivor' ? 'active' : ''}
                    onClick={() => handleTypeChange('survivor')}
                  >
                    Survivor Rankings
                  </button>
                </div>
              
                <div className="sort-options">
                  <span>Sort by:</span>
                  <button 
                    className={sortBy === 'mostVotes' ? 'active' : ''}
                    onClick={() => handleSortChange('mostVotes')}
                  >
                    Most Votes
                  </button>
                  <button 
                    className={sortBy === 'newest' ? 'active' : ''}
                    onClick={() => handleSortChange('newest')}
                  >
                    Newest
                  </button>
                  <button 
                    className={sortBy === 'oldest' ? 'active' : ''}
                    onClick={() => handleSortChange('oldest')}
                  >
                    Oldest
                  </button>
                </div>
                
                <div className="tag-filters">
                  <span>Filter by tag:</span>
                  <div className="tags">
                    {availableTags.map(tag => (
                      <button
                        key={tag.id}
                        className={selectedTags.includes(tag.id) ? 'tag-button selected' : 'tag-button'}
                        onClick={() => handleTagSelect(tag.id)}
                      >
                        {tag.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      
      {sortedLists.length === 0 ? (
        <div className="no-lists-message">
          {publicLists.length > 0 ? (
            <>
              <p>No rankings match your current filters. Try changing the filters or search terms.</p>
              <p className="debug-info">Total lists in database: {publicLists.length}</p>
            </>
          ) : (
            <p>No rankings found. Be the first to create a ranking!</p>
          )}
        </div>
      ) : (
        <div className="public-lists-grid other-rankings-grid">
          {sortedLists.map(list => (
            <div 
              key={`${list.userId}-${list.id}`} 
              className="ranking-list-container" 
              onClick={() => viewFullList(list)}
            >
                <div className="top-left-favorite" onClick={(e) => e.stopPropagation()}>
                  <button 
                    className={`favorite-button ${isFavorited(list.userId, list.id) ? 'favorited' : ''}`}
                    onClick={(e) => toggleFavorite(list.userId, list.id, list.name, e)}
                    disabled={!user}
                    title={user ? (isFavorited(list.userId, list.id) ? "Remove from favorites" : "Add to favorites") : "Login to favorite lists"}
                  >
                    <span className="favorite-icon">★</span>
                  </button>
                </div>
              
              <div className="top-right-upvote" onClick={(e) => e.stopPropagation()}>
                  <button 
                    className={`upvote-button ${hasUserUpvoted(list) ? 'upvoted' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpvote(list.userId, list.id);
                    }}
                    disabled={!user}
                    title={user ? "Upvote this list" : "Sign in to upvote"}
                  >
                  <span className="upvote-icon">▲</span>
                  <span className="upvote-count">{list.upvoteCount || 0}</span>
                  </button>
              </div>
              
              <h2 className="list-title">{list.name}</h2>
              
              {list.tags && list.tags.includes('spoiler') && (
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
              
              <div className={`ranking-list clickable ${list.tags && list.tags.includes('spoiler') ? 'spoiler-blur' : ''}`}>
                {list.contestants && list.contestants.length > 0 ? (
                  list.contestants.slice(0, 3).map((contestant, index) => (
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
          ))}
        </div>
      )}
    </div>
  );
};

export default OtherLists; 
 
 
 