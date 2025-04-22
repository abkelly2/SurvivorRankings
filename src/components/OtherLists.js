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
import './OtherRankingsLists.css';
import { useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';

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
  
  // Add mobile state
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // --- Share Image State --- 
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareImageDataUrl, setShareImageDataUrl] = useState(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  // -------------------------
  
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
  
  // Add new useEffect for loading preview images
  useEffect(() => {
    const loadPreviewImages = async () => {
      if (!sortedLists || sortedLists.length === 0) return;
      
      const newImageUrls = { ...contestantImageUrls };
      let hasNewImages = false;
      
      for (const list of sortedLists) {
        // Only process first 3 contestants for preview
        const previewContestants = list.contestants?.slice(0, 3) || [];
        
        for (const contestant of previewContestants) {
          if (!contestantImageUrls[contestant.id]) {
            if (contestant.isSeason) {
              try {
                const url = await getSeasonLogoUrl(contestant.id);
                newImageUrls[contestant.id] = url;
                hasNewImages = true;
              } catch (error) {
                console.error(`Error loading logo for season ${contestant.id}:`, error);
                newImageUrls[contestant.id] = '/placeholder.jpg';
              }
            } else {
              // Find the season ID for this contestant
              let seasonId = null;
              for (const season of survivorSeasons) {
                if (season.contestants.some(c => c.id === contestant.id)) {
                  seasonId = season.id;
                  break;
                }
              }
              
              if (seasonId) {
                try {
                  // Remove the 's' prefix from seasonId if it exists
                  const numericSeasonId = seasonId.startsWith('s') ? seasonId.substring(1) : seasonId;
                  const url = await getContestantImageUrl(contestant, numericSeasonId);
                  newImageUrls[contestant.id] = url;
                  hasNewImages = true;
                } catch (error) {
                  console.error(`Error loading image for ${contestant.name}:`, error);
                  newImageUrls[contestant.id] = '/placeholder.jpg';
                }
              }
            }
          }
        }
      }
      
      // Only update state if we have new images
      if (hasNewImages) {
        setContestantImageUrls(newImageUrls);
      }
    };
    
    loadPreviewImages();
  }, [sortedLists, contestantImageUrls]);

  // Modify the existing image loading useEffect to avoid duplicate work
  useEffect(() => {
    const loadFullListImages = async () => {
      if (!selectedList || !selectedList.contestants || selectedList.contestants.length === 0) return;
      
      const newImageUrls = { ...contestantImageUrls };
      let hasNewImages = false;
      
      for (const contestant of selectedList.contestants) {
        if (!contestantImageUrls[contestant.id]) {
          if (contestant.isSeason) {
            try {
              const url = await getSeasonLogoUrl(contestant.id);
              newImageUrls[contestant.id] = url;
              hasNewImages = true;
            } catch (error) {
              console.error(`Error loading logo for season ${contestant.id}:`, error);
              newImageUrls[contestant.id] = '/placeholder.jpg';
            }
          } else {
            // Find the season ID for this contestant
            let seasonId = null;
            for (const season of survivorSeasons) {
              if (season.contestants.some(c => c.id === contestant.id)) {
                seasonId = season.id;
                break;
              }
            }
            
            if (seasonId) {
              try {
                // Remove the 's' prefix from seasonId if it exists
                const numericSeasonId = seasonId.startsWith('s') ? seasonId.substring(1) : seasonId;
                const url = await getContestantImageUrl(contestant, numericSeasonId);
                newImageUrls[contestant.id] = url;
                hasNewImages = true;
              } catch (error) {
                console.error(`Error loading image for ${contestant.name}:`, error);
                newImageUrls[contestant.id] = '/placeholder.jpg';
              }
            }
          }
        }
      }
      
      // Only update state if we have new images
      if (hasNewImages) {
        setContestantImageUrls(newImageUrls);
      }
    };
    
    loadFullListImages();
  }, [selectedList, contestantImageUrls]);
  
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
  
  // Effect to handle window resize for isMobile state
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Effect to fetch comments when selectedList changes
  useEffect(() => {
    if (selectedList?.userId && selectedList?.id) {
        fetchComments(selectedList.userId, selectedList.id);
        // Reset spoiler state when list changes
        setSpoilerRevealed(false); 
    }
  }, [selectedList]);

  // --- Helper function to load an image using Promises ---
  const loadImage = (src) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous'; // Important for canvas tainting
      img.onload = () => resolve(img);
      img.onerror = (err) => {
        console.error(`[Share Image Load Error] Failed to load image from src: ${src}`, err);
        reject(err); // Reject the promise with the error
      };
      console.log(`[Share Image Load] Setting image src: ${src}`); // Log when setting src
      img.src = src;
    });
  };
  // --- End Load Image Helper ---

  // --- Share Image Functions (Updated) ---
  const handleShareClick = async () => {
    if (!selectedList || !selectedList.contestants) {
      console.error("No selected list or contestants to share.");
      return;
    }
    setIsGeneratingImage(true);

    const backgroundImage = new Image();
    // Assuming the image is in the public folder
    backgroundImage.src = '/images/Shareimage.png'; 
    backgroundImage.crossOrigin = 'Anonymous'; // Needed if fonts/images are from different origins

    backgroundImage.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = backgroundImage.naturalWidth;
      canvas.height = backgroundImage.naturalHeight;
      const ctx = canvas.getContext('2d');

      // Draw the background image
      ctx.drawImage(backgroundImage, 0, 0);

      // --- Load Wood Texture for Title ---
      let woodPattern = null;
      try {
          const woodTextureImg = await loadImage('/images/wood_texture.png'); // ASSUMED PATH
          
          // <<< Create scaled pattern >>>
          const scaleFactor = 1; // Adjust this value to control zoom level (0.5 = 50% size)
          const patternCanvas = document.createElement('canvas');
          const patternCtx = patternCanvas.getContext('2d');
          
          patternCanvas.width = woodTextureImg.width * scaleFactor;
          patternCanvas.height = woodTextureImg.height * scaleFactor;
          
          // Draw the scaled image onto the pattern canvas
          patternCtx.drawImage(woodTextureImg, 0, 0, patternCanvas.width, patternCanvas.height);
          
          // Create the pattern from the scaled canvas
          woodPattern = ctx.createPattern(patternCanvas, 'repeat'); 
          
          console.log(`[Share Image] Wood texture loaded and scaled pattern created (scale: ${scaleFactor}).`);
      } catch (error) {
          console.error("[Share Image] Failed to load/scale wood texture, falling back to solid color:", error);
          // Fallback color will be set later if woodPattern is null
      }
      // --- End Load Texture ---

      // --- Helper function for text wrapping ---
      const wrapText = (context, text, maxWidth, initialFontSize, minFontSize, lineHeight) => {
          let words = text.split(' ');
          let lines = [];
          let currentLine = words[0];
          let fontSize = initialFontSize;

          // Function to measure and attempt wrapping at a given font size
          const attemptWrap = (size) => {
              context.font = `${size}px Survivant`;
              lines = [];
              currentLine = words[0];
              for (let i = 1; i < words.length; i++) {
                  let word = words[i];
                  let width = context.measureText(currentLine + " " + word).width;
                  if (width < maxWidth) {
                      currentLine += " " + word;
                  } else {
                      lines.push(currentLine);
                      currentLine = word;
                  }
              }
              lines.push(currentLine);
              return lines;
          };

          // Initial attempt
          attemptWrap(fontSize);

          // Reduce font size if any line is too wide or total height exceeds box height
          let totalHeight = lines.length * lineHeight;
          let anyLineTooWide = lines.some(line => context.measureText(line).width > maxWidth);
          
          while ((anyLineTooWide || totalHeight > titleBox.height) && fontSize > minFontSize) {
              fontSize--;
              attemptWrap(fontSize);
              totalHeight = lines.length * lineHeight;
              anyLineTooWide = lines.some(line => context.measureText(line).width > maxWidth);
              // Try fewer lines if possible at this smaller size (helps fit height)
              if (lines.length > 1 && fontSize >= minFontSize) { 
                  let singleLineAttempt = attemptWrap(fontSize); // Rerun wrap logic
                  if(singleLineAttempt.length === 1 && context.measureText(singleLineAttempt[0]).width <= maxWidth){
                      lines = singleLineAttempt;
                      totalHeight = lines.length * lineHeight;
                      anyLineTooWide = false;
                      console.log(`[Share Image Title Wrap] Switched back to single line at size ${fontSize}px`);
                  }
              } 
          }
          
          console.log(`[Share Image Title Wrap] Final lines: ${lines.length}, Font size: ${fontSize}px`);
          return { lines, fontSize };
      };
      // --- End Helper --- 

      // --- Draw Title (Updated for Wrapping) --- 
      const titleBox = { x: 210, y: 150, width: 624, height: 290 }; // width: 804-180, height: 378-180
      const title = selectedList.name || "Untitled List";
      const initialTitleFontSize = 130; // Start large
      const minTitleFontSize = 20; // Minimum acceptable size
      const titleLineHeight = 97; // Approximate line height based on font size

      // Debug box
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 1;
      ctx.strokeRect(titleBox.x, titleBox.y, titleBox.width, titleBox.height);
      
      // Get wrapped lines and final font size
      const { lines: titleLines, fontSize: finalTitleFontSize } = wrapText(
          ctx, 
          title, 
          titleBox.width, 
          initialTitleFontSize, 
          minTitleFontSize, 
          titleLineHeight
      );

      // Set final text properties
      ctx.font = `${finalTitleFontSize}px Survivant`;
      // <<< Use pattern if loaded, otherwise fallback color >>>
      ctx.fillStyle = woodPattern || 'rgb(29, 21, 4)'; 
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Calculate starting Y position for vertical centering
      const totalTextHeight = titleLines.length * titleLineHeight;
      let startY = titleBox.y + (titleBox.height - totalTextHeight) / 2 + titleLineHeight / 2;
      
      // Adjust startY slightly if only one line to better center visually
      if (titleLines.length === 1) {
          startY += 10; // Small adjustment may be needed depending on font baseline
      }

      // Draw each line
      const titleX = titleBox.x + titleBox.width / 2;
      titleLines.forEach((line, index) => {
          const lineY = startY + index * titleLineHeight;
          ctx.fillText(line, titleX, lineY);
          console.log(`[Share Image Title Draw] Drawing line ${index + 1}: "${line}" at Y=${lineY}`);
      });
      // --- End Draw Title ---

      // --- Reset settings for contestant names ---
      ctx.textAlign = 'left'; 
      ctx.textBaseline = 'middle';
      // The main font size for names will be set within drawEntries
      // --- End Reset ---

      // --- Text Styling (Contestants - Font size set later) ---
      const fontSize = 64; // Base size for contestants
      // ctx.font = `${fontSize}px Survivant`; // Font set within drawEntries loop
      ctx.fillStyle = 'rgb(38, 20, 3)'; 
      // ctx.textAlign = 'left'; // Reset above
      // ctx.textBaseline = 'middle'; // Reset above

      // --- Draw Top 5 Contestant Names (Now called drawEntries) ---
      const topContestants = selectedList.contestants.slice(0, 5);
      // Define image size and padding
      const imageWidth = 110; // Base width for contestant images
      const imageHeight = 110; // Base height for contestant images
      const seasonImageWidth = 160; // Larger width for season logos
      const seasonImageHeight = 160; // Larger height for season logos
      const namePadding = 35; // Unchanged

      // Determine if this is a season list by checking the first contestant
      const isSeasonList = topContestants.length > 0 && topContestants[0].isSeason;

      // Use async function to handle image loading within loop/drawing
      const drawEntries = async () => {
        for (let i = 0; i < topContestants.length; i++) {
          const contestant = topContestants[i];
          const name = contestant.isSeason ? contestant.name.replace('Survivor: ', '') : contestant.name;
          const rank = i + 1;

          // --- Placement Logic --- 
          let entryX = 210; // Keep X constant
          let entryY = 0;   // Y will be determined by rank
          let nameX = entryX + (contestant.isSeason ? seasonImageWidth : imageWidth) + namePadding;
          let nameY = 0;   // Y will be determined by rank

          // Determine Y coordinates based on rank (index i) and list type
          if (isSeasonList) {
            // Season list entries - positioned higher
            switch (i) {
              case 0: entryY = 403; break; // 30px higher
              case 1: entryY = 558; break; // 30px higher
              case 2: entryY = 713; break; // 30px higher
              case 3: entryY = 873; break; // 30px higher
              case 4: entryY = 1032; break; // 30px higher
              default: entryY = 0;
            }
          } else {
            // Survivor contestant entries - original positions
            switch (i) {
              case 0: entryY = 433; break;
              case 1: entryY = 588; break;
              case 2: entryY = 743; break;
              case 3: entryY = 903; break;
              case 4: entryY = 1062; break;
              default: entryY = 0;
            }
          }
          
          // Calculate name Y based on entry Y for middle alignment
          nameY = entryY + (contestant.isSeason ? seasonImageHeight : imageHeight) / 2;

          // --- Font Size Adjustment Logic ---
          const defaultFontSize = 64; 
          let currentFontSize = defaultFontSize;
          ctx.font = `${currentFontSize}px Survivant`; // Ensure font is set before measuring

          const horizontalLimit = 835; // Define the limit here
          let fontWasAdjusted = false; // Define the flag here
          const minFontSize = 10; // Minimum font size to prevent excessive shrinking

          // Loop to reduce font size until text fits or hits minimum size
          let measuredWidth = ctx.measureText(name).width; // Initial measure
          let endX = nameX + measuredWidth;

          while (endX > horizontalLimit && currentFontSize > minFontSize) {
            currentFontSize--; // Decrease font size by 1
            ctx.font = `${currentFontSize}px Survivant`; // Apply smaller font
            // Re-measure with the new font size
            measuredWidth = ctx.measureText(name).width;
            endX = nameX + measuredWidth;
            fontWasAdjusted = true;
          }

          // Log if the font was adjusted
          if (fontWasAdjusted) {
            console.log(`[Share Image Rank ${rank}] Text ('${name}') exceeded ${horizontalLimit}px. Reducing font size to ${currentFontSize}px.`);
          }

          // Draw the name for the current entry (using potentially adjusted font)
          ctx.fillText(name, nameX, nameY); 

          // --- Reset Font Size if it was adjusted ---
          if (fontWasAdjusted) {
            ctx.font = `${defaultFontSize}px Survivant`; // Reset font back to default
          }

          // Load and draw the image for the current entry
          const imageUrl = contestantImageUrls[contestant.id];
          console.log(`[Share Image Rank ${rank}] Attempting to load image for ${name}: ${imageUrl}`); 
          if (imageUrl) {
            try {
              const img = await loadImage(imageUrl); 
              
              if (contestant.isSeason) {
                // For season logos, maintain aspect ratio within the larger available space
                const maxHeight = seasonImageHeight;
                const maxWidth = seasonImageWidth;
                
                // Calculate scaling to fit within bounds while preserving aspect ratio
                const scale = Math.min(
                  maxWidth / img.width,
                  maxHeight / img.height
                );
                
                // Calculate dimensions that preserve aspect ratio
                const scaledWidth = img.width * scale;
                const scaledHeight = img.height * scale;
                
                // Center the image in the available space
                const xOffset = entryX + (maxWidth - scaledWidth) / 2;
                const yOffset = entryY + (maxHeight - scaledHeight) / 2;
                
                // Draw the season logo with preserved aspect ratio
                ctx.drawImage(img, xOffset, yOffset, scaledWidth, scaledHeight);
              } else {
                // For contestant images, use fixed square dimensions
                ctx.drawImage(img, entryX, entryY, imageWidth, imageHeight);
              }
            } catch (error) {
              console.error(`[Share Image Rank ${rank}] Error loading image for ${name}:`, error);
              // Draw placeholder if image fails
              ctx.fillStyle = '#eee';
              ctx.fillRect(entryX, entryY, imageWidth, imageHeight);
              ctx.fillStyle = 'black';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('?', entryX + imageWidth / 2, entryY + imageHeight / 2); 
              ctx.textAlign = 'left'; 
              ctx.textBaseline = 'middle';
            }
          } else {
            // Draw placeholder if no image URL
            console.log(`[Share Image Rank ${rank}] No image URL found for ${name}. Drawing placeholder.`);
            ctx.fillStyle = '#eee';
            ctx.fillRect(entryX, entryY, imageWidth, imageHeight);
            ctx.fillStyle = 'black'; 
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', entryX + imageWidth / 2, entryY + imageHeight / 2);
            ctx.textAlign = 'left'; 
            ctx.textBaseline = 'middle';
          }
        }

        // After all drawing is done (including async image loads), generate data URL
        try {
          const dataUrl = canvas.toDataURL('image/png');
          setShareImageDataUrl(dataUrl);
          setShowShareModal(true);
        } catch (error) {
          console.error("Error generating canvas data URL:", error);
          alert("Sorry, couldn't generate the shareable image.");
        } finally {
          setIsGeneratingImage(false);
        }
      };

      // Log the state of contestantImageUrls when starting
      console.log("[Share Image] contestantImageUrls state:", contestantImageUrls);
      // Call the async drawing function
      drawEntries();
    };

    backgroundImage.onerror = () => {
      console.error("Error loading background image '/images/Shareimage.png'");
      alert("Sorry, couldn't load the background image for sharing.");
      setIsGeneratingImage(false);
    };
  };

  const handleDownloadImage = () => {
    if (!shareImageDataUrl) return;
    const link = document.createElement('a');
    link.href = shareImageDataUrl;
    const filename = selectedList?.name ? `${selectedList.name.replace(/\s+/g, '_')}_ranking.png` : 'survivor_ranking.png';
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const closeShareModal = () => {
    setShowShareModal(false);
    setShareImageDataUrl(null); 
  };
  // ---------------------------
  
  if (loading) return <div className="other-lists loading">Loading rankings...</div>;
  if (error) return <div className="other-lists error">{error}</div>;
  
  // Get lists by user if viewing a specific user's lists
  const userLists = viewingUserId 
    ? publicLists.filter(list => list.userId === viewingUserId)
    : publicLists.filter(list => list.public === true);
  
  const sortedUserLists = sortLists(userLists);
  
  // Render the full detailed view of a selected list
  if (selectedList) {
    const hasSpoilerTag = selectedList.tags && selectedList.tags.includes('spoiler');
    console.log("[OtherLists Render] isMobile:", isMobile);
    return (
      <div className="full-list-view other-lists"> 
        {/* Back Button */}
        <div className="back-button-container">
          <button className="back-to-lists-button" onClick={handleBackToLists}>
            ← Back to Lists
          </button>
        </div>
        {/* List Header */} 
        <div className="full-list-header">
          {/* Favorite Button */}
          <div className="top-left-favorite">
              <button 
              className={`favorite-button ${isFavorited(selectedList.userId, selectedList.id) ? 'favorited' : ''}`} 
              onClick={(e) => toggleFavorite(selectedList.userId, selectedList.id, selectedList.name, e)}
              title={user ? (isFavorited(selectedList.userId, selectedList.id) ? "Remove from favorites" : "Add to favorites") : "Login to favorite lists"} 
              disabled={!user}
            >
              <span className="favorite-icon">★</span>
              </button>
            </div>
          
          {/* Title & Author */} 
          <div className="title-container">
             <h2 className="centered-title">{selectedList.name}</h2>
            <span className="created-by">
               By: <span className="username" onClick={(e) => viewUserLists(selectedList.userId, selectedList.userName, e)}>{selectedList.userName || 'Unknown User'}</span>
              </span>
          </div>
          
          {/* Upvote Button */}
          <div className="top-right-upvote">
            <button 
              className={`upvote-button ${hasUserUpvoted(selectedList) ? 'upvoted' : ''}`}
                onClick={(e) => handleUpvote(selectedList.userId, selectedList.id, e)}
              disabled={!user}
                title={user ? "Upvote list" : "Login to upvote"}
            >
                <span className="upvote-icon">▲</span> {selectedList.upvoteCount || 0}
            </button>
          </div>
          
          {/* --- Share Button (Desktop Only) --- */} 
          {!isMobile && (
            <button 
              onClick={handleShareClick}
              disabled={isGeneratingImage}
              className="share-list-button" 
              title="Share List as Image"
              style={{ position: 'absolute', top: '15px', right: '70px' }}
            >
              {isGeneratingImage ? 'Generating...' : 'Share'} 
            </button>
          )}
          {/* --- End Share Button --- */} 

          </div>
          
        {/* Meta Info (Date, Desc, Tags) */} 
        <div className="list-meta-section">
           {selectedList.description && (<p className="list-description">{selectedList.description}</p>)}
           <div className="list-meta-details">
              {(selectedList.tags && selectedList.tags.length > 0) && (
          <div className="full-list-tags">
                    {selectedList.tags.filter(t => t !== 'season-ranking' && t !== 'survivor-ranking').map(tag => <span key={tag} className={`list-tag ${tag === 'spoiler' ? 'spoiler-tag' : ''}`}>{tag}</span>)}
                 </div>
            )}
           </div>
          </div>
          
        {/* Spoiler Toggle */} 
        {hasSpoilerTag && (
          <div className="spoiler-reveal-container">
            <button className="spoiler-reveal-button" onClick={toggleSpoilerReveal}>
               <span className="eye-icon">{spoilerRevealed ? '👁️' : '👁️‍🗨️'}</span> {spoilerRevealed ? 'Hide Spoilers' : 'Show Spoilers'}
            </button>
            </div>
          )}
        
        {/* Ranking List Display */}
        <div className="ranking-list-container full-list">
          <div className={`ranking-list ${hasSpoilerTag && !spoilerRevealed ? 'spoiler-blur' : ''}`}> 
            {(selectedList.contestants || []).length > 0 ? (
              selectedList.contestants.map((contestant, index) => (
                <div key={`${contestant.id}-${index}`} className="ranking-item">
                  <div className="ranking-number">{index + 1}</div>
                  <img
                    src={contestantImageUrls[contestant.id] || contestant.imageUrl || "/placeholder.jpg"}
                    alt={contestant.name}
                    className={`contestant-image rankings-grid-image ${contestant.isSeason ? 'season-logo' : ''}`}
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

        {/* Share Modal */} 
        {showShareModal && (
          <div className="share-modal-overlay" onClick={closeShareModal}>
            <div className="share-modal-content" onClick={(e) => e.stopPropagation()}> 
              <h3>Share List Image</h3>
              {shareImageDataUrl ? (
                <img src={shareImageDataUrl} alt={`${selectedList.name} Ranking`} className="share-preview-image" />
              ) : (
                <p>Loading image preview...</p> 
              )}
              <div className="share-modal-actions">
                <button onClick={handleDownloadImage} className="download-image-button">Download Image</button>
                <button onClick={closeShareModal} className="close-modal-button">Close</button>
          </div>
                </div>
                </div>
        )}

                  </div>
    );
  }

  // Render the grid of public lists (default view)
  return (
    <div className="other-lists">
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
                    {/* Combine availableTags with allTags from lists, ensuring uniqueness */}
                    {[...new Set([...availableTags.map(t => t.id), ...allTags])]
                     .map(tagId => {
                        const tagInfo = availableTags.find(t => t.id === tagId);
                        const label = tagInfo ? tagInfo.label : tagId; // Fallback to ID if not in predefined
                        return (
                          <button
                            key={tagId}
                            className={selectedTags.includes(tagId) ? 'tag-button selected' : 'tag-button'}
                            onClick={() => handleTagSelect(tagId)}
                          >
                            {label}
                          </button>
                        );
                     })
                    }
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {loading ? (
          <div className="loading">Loading lists...</div>
      ) : sortedLists.length === 0 ? (
          <div className="no-lists-message">No lists found matching your criteria.</div>
      ) : (
        <div className="public-lists-grid other-rankings-grid">
              {sortedLists.map(list => (
                <div 
                  key={`${list.userId}-${list.id}`} 
                  className="other-rankings-list-container" 
                  onClick={() => viewFullList(list)}
                >
                    <div className="top-left-favorite" onClick={(e) => e.stopPropagation()}> {/* Prevent card click */} 
                      <button 
                        className={`favorite-button ${isFavorited(list.userId, list.id) ? 'favorited' : ''}`}
                        onClick={(e) => toggleFavorite(list.userId, list.id, list.name, e)}
                        disabled={!user}
                        title={user ? (isFavorited(list.userId, list.id) ? "Remove from favorites" : "Add to favorites") : "Login to favorite lists"}
                      >
                        <span className="favorite-icon">★</span>
                      </button>
                    </div>
                  
                  <div className="top-right-upvote" onClick={(e) => e.stopPropagation()}> {/* Prevent card click */} 
                      <button 
                        className={`upvote-button ${hasUserUpvoted(list) ? 'upvoted' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent card click
                          handleUpvote(list.userId, list.id, e); // Pass event
                        }}
                        disabled={!user}
                        title={user ? (hasUserUpvoted(list) ? "Remove upvote" : "Upvote this list") : "Sign in to upvote"}
                      >
                      <span className="upvote-icon">▲</span>
                      <span className="upvote-count">{list.upvoteCount || 0}</span>
                      </button>
                  </div>
                  
                  <h2 className="list-title">{list.name}</h2>
                  
                  <p className="list-creator">
                    By <span 
                      className="username"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent card click
                        viewUserLists(list.userId, list.userName, e);
                      }}
                      title="View all rankings by this user"
                    >
                      {list.userName || "Unknown User"}
                    </span>
                  </p>
                  
                  {list.tags && list.tags.includes('spoiler') && (
                    <div className="spoiler-warning">Contains Spoilers</div>
                  )}
                  
                  <div className={`other-rankings-list clickable ${list.tags && list.tags.includes('spoiler') ? 'spoiler-blur' : ''}`}> 
                    {list.contestants && list.contestants.length > 0 ? (
                      list.contestants.slice(0, 3).map((contestant, index) => (
                        <div
                          key={`${contestant.id}-${index}`}
                          className="ranking-item"
                        >
                          <div className="ranking-number">{index + 1}</div>
                          <img
                            src={contestantImageUrls[contestant.id] || contestant.imageUrl || "/placeholder.jpg"}
                            alt={contestant.name}
                            className={`contestant-image rankings-grid-image ${contestant.isSeason ? 'season-logo' : ''}`}
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
                      <div className="other-rankings-empty-list-message"> 
                        This list is empty
                      </div>
                    )}
                  </div>
                </div>
              ))}
        </div>
      )}
      {/* Feedback Popup */} 
      {showFeedback && (
         <div className={`feedback-popup ${feedbackMessage.isAdd ? 'add-favorite' : 'remove-favorite'}`} style={{ position: 'fixed', left: `${feedbackMessage.position.x}px`, top: `${feedbackMessage.position.y}px`, transform: 'translate(-50%, -100%)' }}>
            <div className="popup-content"><span className="popup-icon">{feedbackMessage.isAdd ? '★' : '☆'}</span><span className="popup-text">{feedbackMessage.text}</span></div>
        </div>
      )}
    </div>
  );
};

export default OtherLists; 
 
 
 