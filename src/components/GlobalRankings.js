import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { UserContext } from '../UserContext';
import './GlobalRankings.css';
// We need to import the HomePageLists.css to use its styles
import './HomePageLists.css';
// Import OtherLists.css for the list detail view styling
import './OtherLists.css';

const GlobalRankings = ({ seasonListRef }) => {
  const { listId } = useParams();
  const navigate = useNavigate();
  const [selectedList, setSelectedList] = useState(null);
  const [currentRanking, setCurrentRanking] = useState(null); // State for modifiable list
  const [dragOver, setDragOver] = useState(false);
  const listRef = useRef(null);
  const { user } = useContext(UserContext);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [userHasSubmitted, setUserHasSubmitted] = useState(null); // null: checking, false: no, true: yes
  const [checkingSubmissionStatus, setCheckingSubmissionStatus] = useState(true);
  const [showingGlobalRanking, setShowingGlobalRanking] = useState(false); // Start by showing user's list or editor
  const [globalTop10, setGlobalTop10] = useState(null);
  const [loadingGlobalRanking, setLoadingGlobalRanking] = useState(false);
  const [errorGlobalRanking, setErrorGlobalRanking] = useState('');
  const [globalRankings, setGlobalRankings] = useState({});
  const [loadingGlobalRankings, setLoadingGlobalRankings] = useState({});
  const [currentListTotalVotes, setCurrentListTotalVotes] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [targetMobileAddIndex, setTargetMobileAddIndex] = useState(null);
  
  // --- State/Refs for Mobile Touch Drag Reordering (FROM UserListCreator) --- 
  const touchDragTimer = useRef(null);
  const isTouchDragging = useRef(false);
  const draggedItemIndex = useRef(null);
  const draggedItemElement = useRef(null);
  const originalBodyOverflow = useRef(document.body.style.overflow);
  // <<< Add refs for item height and initial touch >>>
  const draggedItemHeight = useRef(0); 
  const initialTouchX = useRef(0);
  const initialTouchY = useRef(0);
  // ----------------------------------------------

  // <<< CALCULATE isEditable at the top level >>>
  const isEditable = user && (!userHasSubmitted || !showingGlobalRanking);

  // Sample data for the list cards - this would be replaced with real data from your API
  const sampleLists = [
    {
      id: 'goat-strategy',
      name: 'GOAT Strategy',
      userName: 'SurvivorGuru',
      createdAt: new Date().toISOString(),
      description: 'Vote for the greatest strategic players in Survivor history',
      contestants: Array(10).fill(null).map((_, i) => ({ id: `slot-strategy-${i+1}`, name: `Vote for #${i+1}`, imageUrl: '/images/placeholder.jpg', isEmpty: true }))
    },
    {
      id: 'goat-social',
      name: 'GOAT Social',
      userName: 'IslandFan',
      createdAt: new Date().toISOString(),
      description: 'Vote for the greatest social players in Survivor history',
      contestants: Array(10).fill(null).map((_, i) => ({ id: `slot-social-${i+1}`, name: `Vote for #${i+1}`, imageUrl: '/images/placeholder.jpg', isEmpty: true }))
    },
    {
      id: 'goat-competitor',
      name: 'GOAT Competitor',
      userName: 'StrategicMoves',
      createdAt: new Date().toISOString(),
      description: 'Vote for the greatest challenge competitors in Survivor history',
      contestants: Array(10).fill(null).map((_, i) => ({ id: `slot-competitor-${i+1}`, name: `Vote for #${i+1}`, imageUrl: '/images/placeholder.jpg', isEmpty: true }))
    }
  ];

  // Effect to find the selected list, load user's ranking, check submission status, and load global ranking if needed
  useEffect(() => {
    const loadData = async () => {
      setCheckingSubmissionStatus(true);
      setUserHasSubmitted(null);
      setShowingGlobalRanking(false); // Default to user's view first
      setGlobalTop10(null);
      setLoadingGlobalRanking(false);
      setErrorGlobalRanking('');
      setCurrentRanking(null); // Reset current ranking
      setCurrentListTotalVotes(0); // Reset current list total votes

      if (listId) {
        const baseList = sampleLists.find(list => list.id === listId);
        if (!baseList) {
          navigate('/global-rankings');
          setCheckingSubmissionStatus(false);
          return;
        }

        setSelectedList(baseList); // Keep base info

        let initialUserRanking = JSON.parse(JSON.stringify(baseList.contestants)); // Start with empty slots
        let submitted = false;

        if (user) {
          const userRankingRef = doc(db, 'userGlobalRankings', user.uid);
          try {
            const userRankingSnap = await getDoc(userRankingRef);
            if (userRankingSnap.exists() && userRankingSnap.data()[listId]) {
              console.log("User has submission for:", listId);
              submitted = true;
              // --- MODIFIED DATA EXTRACTION --- 
              let loadedRankingData = userRankingSnap.data()[listId].ranking;
              
              // Check if loaded data is the incorrect object structure
              if (typeof loadedRankingData === 'object' && loadedRankingData !== null && !Array.isArray(loadedRankingData) && loadedRankingData.hasOwnProperty('contestants') && Array.isArray(loadedRankingData.contestants)) {
                console.warn(`Correcting malformed ranking data structure for ${listId}. Using nested 'contestants' array.`);
                initialUserRanking = loadedRankingData.contestants; // Use the nested array
              } else if (Array.isArray(loadedRankingData)){
                 initialUserRanking = loadedRankingData; // Use the data as is if it's already an array
              } else {
                console.warn(`Loaded ranking data for ${listId} is not a valid array or the expected malformed object. Using default empty slots.`);
                // Fallback to default if data is unusable
                initialUserRanking = JSON.parse(JSON.stringify(baseList.contestants)); 
              }
              // --- END MODIFIED DATA EXTRACTION ---
            } else {
              console.log("User has no submission for:", listId);
              // Keep initialUserRanking as empty slots (this part is fine)
              initialUserRanking = JSON.parse(JSON.stringify(baseList.contestants)); 
            }
          } catch (error) {
            console.error("Error checking user submission status:", error);
            initialUserRanking = JSON.parse(JSON.stringify(baseList.contestants)); // Ensure fallback on error
          }
        }
        // Always set currentRanking to the user's data (or empty slots)
        setCurrentRanking({ ...baseList, contestants: initialUserRanking });
        setUserHasSubmitted(submitted);

        // If user has submitted, fetch global data and set initial view
        if (submitted) {
          setShowingGlobalRanking(true); // Default to global view if submitted
          setLoadingGlobalRanking(true);
          const globalRankingRef = doc(db, 'globalRankingsData', listId);
          try {
            const globalSnap = await getDoc(globalRankingRef);
            if (globalSnap.exists()) {
              const globalData = globalSnap.data();
              setGlobalTop10(globalData.top10 || []);
              setCurrentListTotalVotes(globalData.totalVotes || 0);
              console.log(`Loaded global top 10 and total votes (${globalData.totalVotes || 0}) for:`, listId);
            } else {
              console.log("No global ranking data found for:", listId);
              setGlobalTop10([]);
              setCurrentListTotalVotes(0);
            }
          } catch (error) {
            console.error("Error loading global ranking:", error);
            setErrorGlobalRanking('Failed to load global ranking.');
            setGlobalTop10([]);
            setCurrentListTotalVotes(0);
          } finally {
            setLoadingGlobalRanking(false);
          }
        }

        setCheckingSubmissionStatus(false);

      } else {
        // Not viewing a detail page
        setSelectedList(null);
        setCurrentRanking(null);
        setCheckingSubmissionStatus(false);
        setCurrentListTotalVotes(0);
      }
    };

    loadData();
  }, [listId, user, navigate]); // Rerun when listId or user changes

  // New effect to load global rankings for all lists
  useEffect(() => {
    const loadGlobalRankings = async () => {
      if (!user) return; // Only load if user is logged in
      
      // Check which lists the user has submitted
      const userRankingRef = doc(db, 'userGlobalRankings', user.uid);
      try {
        const userRankingSnap = await getDoc(userRankingRef);
        if (!userRankingSnap.exists()) return;
        
        const userData = userRankingSnap.data();
        const submittedListIds = Object.keys(userData);
        
        if (submittedListIds.length === 0) return;
        
        // Set loading state for all submitted lists at once
        const newLoadingState = {};
        submittedListIds.forEach(id => {
          newLoadingState[id] = true;
        });
        setLoadingGlobalRankings(newLoadingState);
        
        // Load global rankings for each submitted list
        const newGlobalRankings = { ...globalRankings };
        
        for (const listId of submittedListIds) {
          try {
            const globalRankingRef = doc(db, 'globalRankingsData', listId);
            const globalSnap = await getDoc(globalRankingRef);
            
            if (globalSnap.exists()) {
              const globalData = globalSnap.data();
              // Store both top10 and totalVotes
              newGlobalRankings[listId] = {
                top10: globalData.top10 || [],
                totalVotes: globalData.totalVotes || 0 
              };
              console.log(`Loaded global ranking for list: ${listId} (Total Votes: ${globalData.totalVotes || 0})`);
            } else {
              // Set default structure if not found
              newGlobalRankings[listId] = { top10: [], totalVotes: 0 };
              console.log(`No global ranking found for list: ${listId}`);
            }
          } catch (error) {
            console.error(`Error loading global ranking for list ${listId}:`, error);
            // Set default structure on error
            newGlobalRankings[listId] = { top10: [], totalVotes: 0 };
          }
        }
        
        setGlobalRankings(newGlobalRankings);
        
        // Clear loading state for all lists at once
        const clearedLoadingState = {};
        submittedListIds.forEach(id => {
          clearedLoadingState[id] = false;
        });
        setLoadingGlobalRankings(clearedLoadingState);
        
      } catch (error) {
        console.error("Error checking user submissions:", error);
      }
    };
    
    loadGlobalRankings();
  }, [user]); // Only run when user changes

  // Effect to check mobile on resize
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // <<< Add useEffect for TouchMove Listener on Container >>>
  useEffect(() => {
    const listElement = listRef.current; // Assuming listRef points to the list container
    if (!listElement || !isMobile) return;

    const handleMove = (e) => {
      // Call the handleTouchMove logic (defined below)
      handleTouchMove(e); 
    };

    listElement.addEventListener('touchmove', handleMove, { passive: false });
    console.log('[TouchDrag - Global] Added passive:false touchmove listener');

    return () => {
      listElement.removeEventListener('touchmove', handleMove, { passive: false });
      console.log('[TouchDrag - Global] Removed touchmove listener');
    };
  }, [isMobile, listRef]); // Add listRef if it might change, otherwise just isMobile

  // --- Drag and Drop Handlers ---

  const handleDragOver = (e) => {
    if (!isEditable) return;
    e.preventDefault();
    setDragOver(true);
  };
  
  const handleDragLeave = (e) => {
    if (!isEditable) return;
    setDragOver(false);
  };
  
  // Handle drag start for reordering within the list
  const handleItemDragStart = (e, index) => {
    if (!isEditable) return;
    e.dataTransfer.setData('application/reorder-global', index.toString());
    e.currentTarget.classList.add('dragging-item');
  };

  // Handle drag end for reordering
  const handleItemDragEnd = (e) => {
    if (!isEditable) return;
    if (e.currentTarget) { // Check if currentTarget exists
        e.currentTarget.classList.remove('dragging-item');
    }
  };

  const handleDrop = (e) => {
    if (!isEditable) return;
    e.preventDefault();
    setDragOver(false);
    const fromIndexStr = e.dataTransfer.getData('application/reorder-global');
    const fromIndex = parseInt(fromIndexStr, 10);

    if (!isNaN(fromIndex) && currentRanking && currentRanking.contestants) {
        let targetIndex;
        const listElement = listRef.current;
        if (listElement) {
            const listRect = listElement.getBoundingClientRect();
            const mouseY = e.clientY - listRect.top;
            const items = listElement.querySelectorAll('.ranking-item');
            let accumulatedHeight = 0;
            targetIndex = items.length; // Default to end
            for(let i = 0; i < items.length; i++) {
                const itemHeight = items[i].offsetHeight;
                 // Use middle of the item as the threshold
                if (mouseY < accumulatedHeight + itemHeight / 2) { 
                    targetIndex = i;
                    break;
                }
                accumulatedHeight += itemHeight;
            }
            targetIndex = Math.max(0, Math.min(targetIndex, currentRanking.contestants.length));
        } else {
           // Fallback if ref not available
           targetIndex = currentRanking.contestants.length;
        }
        
        console.log(`[Desktop Drop] Reordering from ${fromIndex} to target ${targetIndex}`);

        let insertIndex = targetIndex;
        if (fromIndex < targetIndex) {
            insertIndex = targetIndex - 1;
        }
        
        if (fromIndex === insertIndex) {
            console.log("[Desktop Drop] Same index, no reorder.");
            return;
        }

        const newList = [...currentRanking.contestants];
        const [movedItem] = newList.splice(fromIndex, 1);
        newList.splice(insertIndex, 0, movedItem);
        setCurrentRanking({ ...currentRanking, contestants: newList });
    }
  };

  // Function to remove a contestant from a slot
  const handleRemoveContestant = (indexToRemove) => {
    if (!currentRanking || !selectedList || showingGlobalRanking) return; // Add check for selectedList & view mode

    const newList = [...currentRanking.contestants];
    // Reset the slot to its empty state
    newList[indexToRemove] = {
        id: `slot-${selectedList.id}-${indexToRemove + 1}`,
        name: `Vote for #${indexToRemove + 1}`,
        imageUrl: '/images/placeholder.jpg',
        isEmpty: true
    };
    setCurrentRanking(prev => ({ ...prev, contestants: newList }));
  };

  const handleSubmitRanking = async () => {
    if (!user) {
      setSubmitError("You must be logged in to submit a ranking.");
      return;
    }
    if (!currentRanking || !listId) {
      setSubmitError("Cannot submit ranking. List data is missing.");
      return;
    }

    setIsSubmitting(true);
    setSubmitSuccess(false);
    setSubmitError('');

    const userRankingRef = doc(db, 'userGlobalRankings', user.uid);
    const rankingData = {
      ranking: currentRanking.contestants, // Save the full list (including empty slots)
      submittedAt: serverTimestamp()
    };

    try {
      // Use setDoc with merge:true to update only the specific list's data
      await setDoc(userRankingRef, {
        [listId]: rankingData
      }, { merge: true });

      setSubmitSuccess(true);
      setUserHasSubmitted(true); // Mark as submitted
      setShowingGlobalRanking(true); // Switch view to global
      setTimeout(() => setSubmitSuccess(false), 3000);
      console.log(`Ranking submitted successfully for ${listId}`);

      // Trigger fetch for potentially updated global data
      setLoadingGlobalRanking(true);
      setErrorGlobalRanking(''); // Clear previous errors
      const globalRankingRef = doc(db, 'globalRankingsData', listId);
      try {
        const globalSnap = await getDoc(globalRankingRef);
        if (globalSnap.exists()) {
          setGlobalTop10(globalSnap.data().top10 || []);
        } else { setGlobalTop10([]); }
      } catch (error) { 
        console.error("Error reloading global ranking after submit:", error);
        setErrorGlobalRanking('Failed to reload global ranking.'); 
        setGlobalTop10([]); 
      }
      finally { setLoadingGlobalRanking(false); }

    } catch (error) {
      console.error("Error submitting ranking:", error);
      setSubmitError("Failed to submit ranking. Please try again.");
      setTimeout(() => setSubmitError(''), 5000); // Hide error after 5s
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleView = () => {
    setShowingGlobalRanking(prev => !prev);
    // Reset submission feedback when toggling
    setSubmitSuccess(false);
    setSubmitError('');
  };

  // --- Render Functions ---

  const viewUserLists = (userId, userName) => {
    // This would navigate to the user's lists page
    console.log(`Viewing lists for user ${userName} (${userId})`);
  };

  const viewFullList = (list) => {
    // Navigate to the list detail view
    navigate(`/global-rankings/${list.id}`);
  };

  const handleBackToLists = () => {
    // Navigate back to the main global rankings page
    navigate('/global-rankings');
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'; // Handle potentially undefined date
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  // Function to render a single ranking list card (for the main page)
  const renderRankingListCard = (list) => {
    if (!list || !list.contestants) return null;
    
    // Check if user has submitted and global data exists for this list
    const globalDataForList = globalRankings[list.id];
    const hasUserSubmitted = user && globalDataForList !== undefined;
    
    // Get the list's total votes from the global data
    const listTotalVotes = globalDataForList?.totalVotes || 0;
    
    // Get the appropriate contestants to display (either placeholders or global top 10)
    let displayContestants = list.contestants; // Default to placeholders
    if (hasUserSubmitted && globalDataForList?.top10 && globalDataForList.top10.length > 0) {
      displayContestants = globalDataForList.top10;
    }
    
    // Check if this list is currently loading global rankings
    const isLoading = loadingGlobalRankings[list.id] === true;
    
    return (
      <div 
        className="ranking-list-container" 
        onClick={() => viewFullList(list)}
      >
        <h2 className="list-title">{list.name}</h2>
        
        <p className="list-creator">
          By <span 
            className="username"
            onClick={(e) => {
              e.stopPropagation();
              viewUserLists('user-id', list.userName, e);
            }}
            title="View all rankings by this user"
          >
            {list.userName || "Unknown User"}
          </span>
        </p>
        
        <div className="ranking-list clickable">
          {isLoading ? (
            <div className="loading-message">Loading global rankings...</div>
          ) : displayContestants.length === 0 ? (
            <div className="empty-list-message">
              This list is empty
            </div>
          ) : (
            displayContestants.map((contestant, index) => {
              // Calculate average points using the list's total votes
              const averagePoints = (hasUserSubmitted && typeof contestant.totalScore === 'number' && listTotalVotes > 0)
                ? contestant.totalScore / listTotalVotes // <<< USE listTotalVotes
                : null;

              // Convert average points to average position (11 - avgPoints)
              const averagePosition = (averagePoints !== null)
                ? (11 - averagePoints).toFixed(1)
                : null;

              const isFirstEmptySlot = !hasUserSubmitted && index === 0 && contestant.isEmpty;

              return (
                <div
                  key={`${contestant.id}-${index}`}
                  className={`ranking-item ${contestant.isEmpty ? 'empty-slot' : ''}`}
                >
                  <div className={`ranking-number ${!hasUserSubmitted ? 'number-hidden' : ''}`}>
                    {index + 1}
                  </div>
                  <img
                    src={contestant.imageUrl || "/images/placeholder.jpg"}
                    alt={contestant.name}
                    className={`contestant-image ${contestant.isSeason ? 'season-logo' : ''} ${contestant.isEmpty ? 'placeholder-hidden' : ''}`}
                    draggable="false"
                  />
                  <div 
                    className={`${contestant.isSeason ? "season-name" : "contestant-name"} ${contestant.isEmpty ? 'empty-name' : ''} ${contestant.isEmpty && !isFirstEmptySlot ? 'placeholder-hidden' : ''}`} 
                    style={{ color: contestant.isEmpty ? '#999' : '#000000' }}
                  >
                    {isFirstEmptySlot
                        ? <span className="submit-prompt-text">Submit your votes!</span> // Special visible text
                        : contestant.isEmpty
                            ? contestant.name // Default hidden "Vote for #X" text
                            : // Real contestant name formatting
                              (contestant.isSeason 
                                ? contestant.name.replace("Survivor: ", "").replace("Survivor ", "") 
                                : contestant.name)
                    }
                    {/* Show total points if calculated */} 
                    {contestant.totalScore !== undefined && 
                      <span className="global-score"> ({contestant.totalScore} pts)</span>
                    }
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  // Function to add contestant locally (passed as callback)
  const handleAddContestantLocally = (contestant) => {
    if (!currentRanking || showingGlobalRanking) return; 
    if (targetMobileAddIndex !== null && targetMobileAddIndex >= 0 && targetMobileAddIndex < currentRanking.contestants.length) {
      // Check if already in list (at a *different* index)
      const existingIndex = currentRanking.contestants.findIndex(item => !item.isEmpty && item.id === contestant.id);
      if (existingIndex !== -1 && existingIndex !== targetMobileAddIndex) {
        alert(`${contestant.name} is already ranked at position ${existingIndex + 1}.`);
        setTargetMobileAddIndex(null); // Reset index
        return;
      }

      const newList = [...currentRanking.contestants];
      newList[targetMobileAddIndex] = { ...contestant, isEmpty: false }; // Place in target slot
      setCurrentRanking(prev => ({ ...prev, contestants: newList }));
      setTargetMobileAddIndex(null); // Reset index after adding
    } else {
        setTargetMobileAddIndex(null); // Reset index anyway
    }
  };

  // Effect to register/unregister the update callback with SeasonList
  useEffect(() => {
    // Determine if the current view is editable on mobile
    const isEditableMobile = isMobile && user && (!userHasSubmitted || !showingGlobalRanking);

    if (isEditableMobile && seasonListRef && seasonListRef.current && typeof seasonListRef.current.setListUpdateCallback === 'function') {
      seasonListRef.current.setListUpdateCallback(handleAddContestantLocally);
    } else if (seasonListRef && seasonListRef.current && typeof seasonListRef.current.setListUpdateCallback === 'function') {
      seasonListRef.current.setListUpdateCallback(null);
    }

    // Cleanup function
    return () => {
      if (seasonListRef && seasonListRef.current && typeof seasonListRef.current.setListUpdateCallback === 'function') {
        seasonListRef.current.setListUpdateCallback(null);
      }
    };
    // Dependencies ensure this runs when conditions change
  }, [isMobile, user, userHasSubmitted, showingGlobalRanking, seasonListRef, handleAddContestantLocally]); // Add handleAddContestantLocally if using useCallback

  // --- REPLACED Touch Handlers (Adapted from UserListCreator) --- 
  const handleTouchStart = (e, index) => {
    if (!isMobile || !isEditable) return; // Only apply on mobile AND if editable

    e.stopPropagation(); 
    clearTimeout(touchDragTimer.current);
    const currentTarget = e.currentTarget;
    draggedItemElement.current = currentTarget;
    
    const touch = e.touches[0];
    initialTouchX.current = touch.clientX;
    initialTouchY.current = touch.clientY;

    touchDragTimer.current = setTimeout(() => {
      isTouchDragging.current = true;
      draggedItemIndex.current = index;
      if (currentTarget) {
          draggedItemHeight.current = currentTarget.offsetHeight; 
          currentTarget.classList.add('touch-dragging-item');
      }
      originalBodyOverflow.current = document.body.style.overflow; 
      document.body.style.overflow = 'hidden';
      console.log('[TouchDrag - Global] Drag started after delay. Initial Touch Y:', initialTouchY.current);
    }, 150); // Use 150ms delay
  };

  const handleTouchMove = (e) => {
    if (!isTouchDragging.current || !isMobile || !isEditable || draggedItemIndex.current === null) return;
    
    e.preventDefault(); 

    const touch = e.touches[0];
    const listContainer = listRef.current; 
    const draggedElement = draggedItemElement.current;
    if (!touch || !listContainer || !draggedElement) return;

    // Apply transform to follow finger
    const deltaX = touch.clientX - initialTouchX.current;
    const deltaY = touch.clientY - initialTouchY.current;
    draggedElement.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.03)`;

    // Target Index Calculation using offsetTop
    const touchY = touch.clientY;
    const listRect = listContainer.getBoundingClientRect();
    const touchRelativeToContainer = touchY - listRect.top;
    const listItems = Array.from(listContainer.querySelectorAll('.ranking-item')); // Make sure selector is correct for this component
    
    let targetIndex = -1;
    let closestItemOriginalIndex = -1;
    let minDistance = Infinity;

    for (let i = 0; i < listItems.length; i++) {
        const item = listItems[i];
        if (item === draggedElement) continue;
        
        const itemOriginalOffsetTop = item.offsetTop;
        const itemHeight = item.offsetHeight;
        const itemOriginalCenterY = itemOriginalOffsetTop + itemHeight / 2;
        const distance = Math.abs(touchRelativeToContainer - itemOriginalCenterY);

        if (distance < minDistance) {
            minDistance = distance;
            const itemIndexAttr = item.dataset.index; // Ensure items have data-index attribute
            closestItemOriginalIndex = itemIndexAttr !== undefined ? parseInt(itemIndexAttr, 10) : i;
        }
    }
    
    if (closestItemOriginalIndex !== -1 && closestItemOriginalIndex < listItems.length) {
        const closestItem = listItems.find(item => parseInt(item.dataset.index, 10) === closestItemOriginalIndex);
        if (closestItem) {
            const closestItemOriginalOffsetTop = closestItem.offsetTop;
            const closestItemHeight = closestItem.offsetHeight;
            const closestItemOriginalCenterY = closestItemOriginalOffsetTop + closestItemHeight / 2;
            targetIndex = (touchRelativeToContainer < closestItemOriginalCenterY) ? closestItemOriginalIndex : closestItemOriginalIndex + 1;
        } else { 
             const draggedHeight = draggedItemHeight.current;
             targetIndex = (draggedHeight > 0) 
                 ? Math.max(0, Math.min(Math.floor(touchRelativeToContainer / draggedHeight), currentRanking?.contestants?.length ?? 0))
                 : 0;
        }
    } else {
        const draggedHeight = draggedItemHeight.current;
        targetIndex = (draggedHeight > 0) 
             ? Math.max(0, Math.min(Math.floor(touchRelativeToContainer / draggedHeight), currentRanking?.contestants?.length ?? 0))
             : 0;
    }
    targetIndex = Math.max(0, Math.min(targetIndex, currentRanking?.contestants?.length ?? 0));

    // Apply Transforms to Create Gap AND Fill Origin
    const draggedHeight = draggedItemHeight.current;
    const startIndex = draggedItemIndex.current; 
    if (draggedHeight > 0 && startIndex !== null) {
        listItems.forEach((item) => {
            if (item === draggedElement) return;             
            const itemIndex = parseInt(item.dataset.index, 10);
            let transformY = 0; 
            if (targetIndex > startIndex) {
                if (itemIndex > startIndex && itemIndex < targetIndex) {
                    transformY = -draggedHeight;
                }
            } else if (targetIndex < startIndex) {
                if (itemIndex >= targetIndex && itemIndex < startIndex) {
                    transformY = draggedHeight;
                }
            }
            item.style.transform = `translateY(${transformY}px)`;
        });
    }
  };

  const handleTouchEnd = (e) => {
    if (!isEditable) return; // Check editability
    
    clearTimeout(touchDragTimer.current); 
    const wasDragging = isTouchDragging.current;
    const draggedElement = draggedItemElement.current;

    // Clear Transforms and Styles
    const listContainer = listRef.current; 
    if(listContainer) {
        const allItems = listContainer.querySelectorAll('.ranking-item'); // Use correct selector
        allItems.forEach(item => {
          item.style.transform = ''; 
        });
    }
    if (draggedElement) {
        draggedElement.classList.remove('touch-dragging-item');
        draggedElement.style.transform = ''; 
    }
    if (document.body.style.overflow === 'hidden') {
        document.body.style.overflow = originalBodyOverflow.current;
    }

    // Reset refs immediately after clearing styles
    const startIndex = draggedItemIndex.current; // Store before resetting
    isTouchDragging.current = false;
    draggedItemIndex.current = null;
    draggedItemElement.current = null;
    draggedItemHeight.current = 0;
    initialTouchX.current = 0;
    initialTouchY.current = 0;

    // Exit if not actually dragging
    if (!wasDragging || !isMobile) {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();

    const touch = e.changedTouches[0]; 
    let targetIndex = -1; 
    
    // Target Index Calculation using offsetTop
    if (touch && listContainer && currentRanking?.contestants) { 
        const listRect = listContainer.getBoundingClientRect();
        const touchY = touch.clientY;
        const touchRelativeToContainer = touchY - listRect.top;
        const listItems = Array.from(listContainer.querySelectorAll('.ranking-item')); // Correct selector
        
        let closestItemOriginalIndex = -1;
        let minDistance = Infinity;

        for (let i = 0; i < listItems.length; i++) {
            const item = listItems[i];
            const itemOriginalOffsetTop = item.offsetTop;
            const itemHeight = item.offsetHeight;
            const itemOriginalCenterY = itemOriginalOffsetTop + itemHeight / 2;
            const distance = Math.abs(touchRelativeToContainer - itemOriginalCenterY);

            if (distance < minDistance) {
                minDistance = distance;
                const itemIndexAttr = item.dataset.index;
                closestItemOriginalIndex = itemIndexAttr !== undefined ? parseInt(itemIndexAttr, 10) : i;
            }
        }
        
        if (closestItemOriginalIndex !== -1 && closestItemOriginalIndex < listItems.length) {
            const closestItem = listItems.find(item => parseInt(item.dataset.index, 10) === closestItemOriginalIndex);
            if (closestItem) {
                const closestItemOriginalOffsetTop = closestItem.offsetTop;
                const closestItemHeight = closestItem.offsetHeight;
                const closestItemOriginalCenterY = closestItemOriginalOffsetTop + closestItemHeight / 2;
                targetIndex = (touchRelativeToContainer < closestItemOriginalCenterY) ? closestItemOriginalIndex : closestItemOriginalIndex + 1;
            } else { 
                 // Fallback
                 const tempHeight = draggedItemHeight.current > 0 ? draggedItemHeight.current : 50;
                 targetIndex = Math.max(0, Math.min(Math.floor(touchRelativeToContainer / tempHeight), currentRanking.contestants.length));
            }
        } else {
            // Fallback
             const tempHeight = draggedItemHeight.current > 0 ? draggedItemHeight.current : 50;
             targetIndex = Math.max(0, Math.min(Math.floor(touchRelativeToContainer / tempHeight), currentRanking.contestants.length));
        }
        targetIndex = Math.max(0, Math.min(targetIndex, currentRanking.contestants.length));
        console.log(`[TouchDrag - Global End] TargetIndex: ${targetIndex}`);

    } else if (listContainer && currentRanking?.contestants?.length === 0) {
        targetIndex = 0; 
    } else {
        console.warn("[TouchDrag - Global End] Could not calculate target index.");
        targetIndex = startIndex !== null ? startIndex : 0; // Fallback
    }

    // Perform Reordering
    if (startIndex !== null && targetIndex !== -1 && currentRanking && currentRanking.contestants) {
        let insertIndex = targetIndex;
        if (startIndex < targetIndex) { 
            insertIndex = targetIndex - 1; 
        }
        
        // No need to check for same index, splice handles it.
        console.log(`[TouchDrag - Global End] Reordering from ${startIndex} to insert ${insertIndex} (Target: ${targetIndex})`);
        const newList = [...currentRanking.contestants];
        const [movedItem] = newList.splice(startIndex, 1);
        insertIndex = Math.min(insertIndex, newList.length); 
        newList.splice(insertIndex, 0, movedItem);
        
        // <<< UPDATE State using setCurrentRanking >>>
        setCurrentRanking(prevRanking => ({
            ...prevRanking,
            contestants: newList
        }));
    } else {
      console.log(`[TouchDrag - Global End] Invalid drop (Target: ${targetIndex}, Start: ${startIndex})`);
    }
  };

  // Render list detail view
  if (checkingSubmissionStatus) {
    return <div className="loading">Checking submission status...</div>;
  }

  if (selectedList) { // Use selectedList for static info like name/desc
    return (
      <div className="other-lists full-list-view">
        {/* Header - RESTRUCTURED */}
        <div className="full-list-header redesigned">
          {/* Title */}  
          <h2>{selectedList.name}</h2>
          
          {/* Description (Now directly follows title) */}
          {selectedList.description && (
            <p className="list-description-inline">{selectedList.description}</p>
          )}
          
          {/* Total Submissions (Integrated into header) */}
          <p className="total-submissions">
            Total Submissions: <span className="submission-count">{currentListTotalVotes}</span>
          </p>
        </div>

        {/* Submit Section (Shows buttons conditionally) */}
        {(userHasSubmitted === true || isEditable) && (
          <div className="submit-global-ranking-section">
            {/* Toggle Button - Only show if user HAS submitted */}
            {userHasSubmitted === true && (
              <button onClick={toggleView} className="toggle-view-button">
                {showingGlobalRanking ? 'View/Edit My Submission' : 'View Global Ranking'}
              </button>
            )}

            {/* Submit Button & Feedback (Only shows when editable) */}
            {isEditable && (
              <>
                {submitSuccess && <div className="submit-feedback success">Ranking Submitted!</div>}
                {submitError && <div className="submit-feedback error">{submitError}</div>}
                <button
                  onClick={handleSubmitRanking}
                  disabled={isSubmitting || !user} // Ensure user check here too
                  className="submit-global-ranking-button"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit My Ranking'}
                </button>
                {!user && <p className="login-prompt">Please log in to submit your ranking.</p>}
              </>
            )}
          </div>
        )}

        {/* Ranking List Area */}
        {showingGlobalRanking ? (
            // --- Render Read-Only Global Ranking ---
            <div className="ranking-list-container global-results">
              <h3 className="view-title">Global Top 10</h3>
              {loadingGlobalRanking && <div className="loading">Loading Global Ranking...</div>}
              {errorGlobalRanking && <div className="submit-feedback error">{errorGlobalRanking}</div>}
              {!loadingGlobalRanking && !errorGlobalRanking && (
                  <div className="ranking-list read-only">
                      {globalTop10 && globalTop10.length > 0 ? (
                          globalTop10.map((contestant, index) => {
                              // Calculate average points using the list's total votes
                              const averagePointsDetail = (typeof contestant.totalScore === 'number' && currentListTotalVotes > 0)
                                ? contestant.totalScore / currentListTotalVotes
                                : null;
                                
                              // Convert average points to average position (11 - avgPoints)
                              const averagePositionDetail = (averagePointsDetail !== null)
                                ? (11 - averagePointsDetail).toFixed(1)
                                : null;

                              return (
                                <div key={`${contestant.id}-${index}`} className="ranking-item">
                                    <div className="ranking-number">{index + 1}</div>
                                    <img
                                        src={contestant.imageUrl || "/images/placeholder.jpg"}
                                        alt={contestant.name}
                                        className={`contestant-image`} 
                                        draggable="false"
                                    />
                                    <div className="contestant-name">
                                        {contestant.name}
                                        {/* Show total points if available */} 
                                        {contestant.totalScore !== undefined && 
                                          <span className="global-score"> ({contestant.totalScore} pts)</span> 
                                        }
                                    </div>
                                    {/* Optionally show vote count: <span className="global-votes">{currentListTotalVotes} votes</span> */}
                                </div>
                              );
                          })
                      ) : (
                          <div className="empty-list-message">Global ranking not yet available.</div>
                      )}
                  </div>
              )}
            </div>
        ) : (
            // --- Render Editable User Ranking ---
            <div
              className={`ranking-list-container ${isEditable ? '' : 'read-only-user'} ${dragOver ? 'drag-over' : ''}`}
              ref={listRef}
              onDragOver={isEditable ? handleDragOver : undefined}
              onDragLeave={isEditable ? handleDragLeave : undefined}
              onDrop={isEditable ? handleDrop : undefined}
            >
              <h3 className="view-title">{userHasSubmitted ? "My Submitted Ranking" : "Create Your Ranking"}</h3>
              <div className="ranking-list">
                {currentRanking && currentRanking.contestants && currentRanking.contestants.length > 0 ? (
                  currentRanking.contestants.map((contestant, index) => (
                    <div
                      key={`${contestant.id}-${index}`}
                      className={`ranking-item ${contestant.isEmpty ? 'empty-slot' : ''}`}
                      data-index={index}
                      draggable={isEditable && !contestant.isEmpty}
                      onDragStart={(e) => isEditable && !contestant.isEmpty && handleItemDragStart(e, index)}
                      onDragEnd={isEditable ? handleItemDragEnd : undefined}
                      onClick={() => {
                        if (isMobile && isEditable && seasonListRef && seasonListRef.current) {
                          setTargetMobileAddIndex(index);
                          seasonListRef.current.showMenu();
                        }
                      }}
                      onTouchStart={(e) => handleTouchStart(e, index)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onTouchCancel={handleTouchEnd}
                    >
                       <div className={`ranking-number ${!userHasSubmitted ? 'number-hidden' : ''}`}>
                         {index + 1}
                       </div>
                       <img
                          src={contestant.imageUrl || "/images/placeholder.jpg"}
                          alt={contestant.name}
                          className={`contestant-image ${contestant.isSeason ? 'season-logo' : ''}`}
                          draggable="false"
                       />
                       <div className={`${contestant.isSeason ? "season-name" : "contestant-name"} ${contestant.isEmpty ? 'empty-name' : ''}`} style={{ color: contestant.isEmpty ? '#999' : '#000000' }}>
                          {contestant.isEmpty ? contestant.name :
                             (contestant.isSeason
                               ? contestant.name.replace('Survivor: ', '').replace('Survivor ', '')
                               : contestant.name)
                          }
                          {/* Show total points if available */} 
                          {contestant.totalScore !== undefined && 
                            <span className="global-score"> ({contestant.totalScore} pts)</span> 
                          }
                       </div>
                       {/* Show remove button only if editable and not empty */} 
                       {isEditable && !contestant.isEmpty && (
                         <button 
                            className="remove-contestant-button" 
                            onClick={(e) => { e.stopPropagation(); handleRemoveContestant(index); }}
                            title="Remove from list"
                         >
                            &times;
                         </button>
                       )}
                    </div>
                  ))
                ) : (
                   // Added check for `currentRanking` being null before showing loading message
                   !currentRanking ? 
                     <div className="loading">Loading list...</div> :
                     <div className="empty-list-message">Drag items here to start ranking!</div> 
                )}
              </div>
            </div>
        )}

        {/* Vote Section Placeholder - update text based on view */}
        <div className="vote-section">
          <h3>{showingGlobalRanking ? "Global Top 10 Results" : (userHasSubmitted ? "Edit Your Submission" : "Vote for Your Top 10")}</h3>
          <p>
            {showingGlobalRanking
              ? "This is the current aggregated ranking based on user submissions."
              : isEditable
                ? 'Drag contestants from the right menu to rank them, or drag items within the list to reorder. Hit "Submit My Ranking" above to save your selections.'
                : 'Log in to create or edit your ranking.' // Message if not logged in
            }
          </p>
        </div>
      </div>
    );
  }


  // Render main listings page
  // Add a wrapper div with a new class for centering
  return (
    <div className="global-rankings-main-view">
      <h1>Global Rankings</h1>
      
      <div className="global-rankings-description">
        <p>
          Who is the Greatest Of All Time? Cast your votes in the ultimate Survivor showdown! 
          Rank your top 10 strategic masterminds, social butterflies, and challenge beasts. 
          Once you submit your list for a category, you'll unlock the community's global ranking!
        </p>
      </div>
      
      <h2 className="section-title">Vote for the GOATs</h2>
      <div className="global-lists-container">
        {sampleLists.map(list => renderRankingListCard(list))}
      </div>
    </div>
  );
};

export default GlobalRankings; 