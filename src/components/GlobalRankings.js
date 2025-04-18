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
  
  // --- State for Mobile Touch Drag Reordering --- 
  const touchDragTimer = useRef(null); // Timer for long press detection
  const isTouchDragging = useRef(false); // Flag to indicate if dragging is active
  const draggedItemIndex = useRef(null); // Index of item being dragged
  const draggedItemElement = useRef(null); // Ref to the actual DOM element being dragged
  const originalBodyOverflow = useRef(document.body.style.overflow); // <<< Store original overflow
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

  // --- Drag and Drop Handlers ---

  const handleDragOver = (e) => {
    e.preventDefault(); // CRITICAL: Allows drop
    // console.log('Drag Over Fired'); // Can remove this now
    e.stopPropagation(); // Good practice to stop bubbling
    setDragOver(true);
  };
  
  const handleDragLeave = (e) => {
    // Simpler check: just set dragOver to false when leaving the container
    setDragOver(false);
  };
  
  // Handle drag start for reordering within the list
  const handleItemDragStart = (e, index) => {
    // console.log(`DRAG START Reordering item at index: ${index}`);
    e.dataTransfer.setData('application/reorder-global', index.toString());
    e.currentTarget.classList.add('dragging-item');
  };

  // Handle drag end for reordering
  const handleItemDragEnd = (e) => {
    // console.log('DRAG END Reordering');
    if (e.currentTarget) { // Add null check
      e.currentTarget.classList.remove('dragging-item');
    }
  };

  const handleDrop = (e) => {
    // console.log("--- handleDrop FIRING ---"); // Keep commented or remove
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    // <<< RESTORE ORIGINAL LOGIC >>>
    if (!currentRanking || showingGlobalRanking) { 
        console.log("Drop ignored: currentRanking is null or showing global ranking");
        return;
    }

    try {
      // Check if this is a reordering operation *within* this list
      const reorderIndexString = e.dataTransfer.getData("application/reorder-global");
      if (reorderIndexString) {
        // <<< PASTE REORDER LOGIC BACK HERE if needed >>>
        // console.log('Handling as REORDER drop.');
        const fromIndex = parseInt(reorderIndexString, 10);

        // Calculate target index based on drop position relative to list items
        let targetIndex = -1;
        if (listRef.current) {
          const listItems = Array.from(listRef.current.querySelectorAll('.ranking-item'));
          const mouseY = e.clientY;
          
          for (let i = 0; i < listItems.length; i++) {
            const item = listItems[i];
            const rect = item.getBoundingClientRect();
            
            // Check if the mouse cursor is vertically within the bounds of this item
            if (mouseY >= rect.top && mouseY <= rect.bottom) {
              targetIndex = i;
              break; // Found the target item
            }
          }
        }
        
        if (targetIndex !== -1 && targetIndex !== fromIndex) {
          // console.log('Reordering from', fromIndex, 'to', targetIndex);
          const newList = [...currentRanking.contestants];

          // Check if the target slot is already filled (and not the same as the source)
          if (!newList[targetIndex].isEmpty) {
            // SWAP the items
            // console.log('Target slot is filled. Swapping.');
            const movedItem = newList[fromIndex];
            const targetItem = newList[targetIndex];
            newList[targetIndex] = movedItem;
            newList[fromIndex] = targetItem;
          } else {
            // MOVE the item to an EMPTY slot - Target slot is empty
            // console.log('Target slot is empty. Moving.');
            const movedItem = { ...newList[fromIndex] }; // Copy the item being moved

            // Create a new empty slot placeholder for the original position
            const newEmptySlotForOrigin = {
              id: `slot-${selectedList.id}-${fromIndex + 1}-moved-${Date.now()}`, // Ensure unique ID
              name: `Vote for #${fromIndex + 1}`,
              imageUrl: '/images/placeholder.jpg',
              isEmpty: true
            };

            // Replace the original item with the empty slot
            newList[fromIndex] = newEmptySlotForOrigin;
            // Place the moved item into the target empty slot
            newList[targetIndex] = movedItem;
          }
          
          setCurrentRanking(prev => ({ ...prev, contestants: newList }));
        } else {
          // console.log('Reorder drop on same index or invalid index/target');
        }
        return; // Reordering handled, exit
      }

      // --- Handle dropping NEW item from SeasonList --- 
      const droppedItemDataString = e.dataTransfer.getData("text/plain");
      if (!droppedItemDataString) {
        console.log("No 'text/plain' data received for new item drop.");
        return;
      }
      const droppedItemData = JSON.parse(droppedItemDataString);

      // Prevent dropping seasons into these lists
      if (droppedItemData.isSeason) {
        alert("You can only rank individual contestants in these lists.");
        return;
      }
      
      // Check if item is already in the list (ignore empty slots)
      const isAlreadyInList = currentRanking.contestants.some(
        item => !item.isEmpty && item.id === droppedItemData.id
      );
      if (isAlreadyInList) {
        alert(`${droppedItemData.name} is already in this ranking.`);
        return;
      }

      // Calculate target index for the new item drop
      let targetDropIndex = -1;
      if (listRef.current) {
        const listItems = Array.from(listRef.current.querySelectorAll('.ranking-item'));
        const mouseY = e.clientY;

        for (let i = 0; i < listItems.length; i++) {
          const item = listItems[i];
          const rect = item.getBoundingClientRect();
          // Check if the drop point is within the vertical bounds of the item
          if (mouseY >= rect.top && mouseY <= rect.bottom) {
            targetDropIndex = i;
            break;
          }
        }
         // If not dropped directly on an item, check if dropped near the bottom
        if (targetDropIndex === -1) {
            const listRect = listRef.current.getBoundingClientRect();
            if (mouseY > listRect.bottom - 20) { // Allow dropping near bottom
                targetDropIndex = currentRanking.contestants.length - 1;
            } else { // Check if dropped near the top if list is empty
                targetDropIndex = 0; // Default to top if no items or drop is above first
            }
        } 
      }

      if (targetDropIndex >= 0 && targetDropIndex < currentRanking.contestants.length) {
          const newList = [...currentRanking.contestants];
          // Place the dropped item into the target slot
          newList[targetDropIndex] = { ...droppedItemData, isEmpty: false }; 
          setCurrentRanking(prev => ({ ...prev, contestants: newList }));
      } else {
          console.log("New item drop occurred outside a valid slot index or list was empty and index wasn't 0.");
      }

    } catch (error) {
      console.error("Error handling drop:", error);
      alert("Failed to process drop operation.");
    }
    // <<< END RESTORED LOGIC >>>
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
                    {/* Show average position if calculated */} 
                    {averagePosition !== null && 
                      <span className="global-score"> (Avg Pos: {averagePosition})</span>
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

  // --- Touch Handlers for Mobile Reordering --- 
  const handleTouchStart = (e, index) => {
    if (!isMobile || !isEditable) return;
    e.stopPropagation(); 
    clearTimeout(touchDragTimer.current);
    draggedItemElement.current = e.currentTarget;

    touchDragTimer.current = setTimeout(() => {
      console.log(`[TouchDrag] Long press detected on index ${index}`);
      isTouchDragging.current = true;
      draggedItemIndex.current = index;
      if (draggedItemElement.current) {
          draggedItemElement.current.classList.add('touch-dragging-item');
      }
      
      // <<< Disable body scroll >>>
      originalBodyOverflow.current = document.body.style.overflow; // Store current
      document.body.style.overflow = 'hidden';
      console.log('[TouchDrag] Disabled body scroll');
      
      // e.preventDefault(); // Keep this? Maybe not needed if scroll is disabled.
    }, 300); 
  };

  const handleTouchMove = (e) => {
    if (!isTouchDragging.current || !isMobile || !isEditable) return;
    // Still prevent default to potentially stop other touch actions
    e.preventDefault(); 

    const touch = e.touches[0]; // Get the first touch point
    const listContainer = listRef.current;
    if (!touch || !listContainer) return;

    const currentY = touch.clientY;

    // Find the element currently under the touch point
    const targetElement = document.elementFromPoint(touch.clientX, currentY);
    const targetItem = targetElement?.closest('.ranking-item');

    // Clear previous drag-over styles
    const allItems = listContainer.querySelectorAll('.ranking-item');
    allItems.forEach(item => item.classList.remove('drag-over'));

    if (targetItem && listContainer.contains(targetItem)) {
      // Add drag-over style to the item under the finger
      targetItem.classList.add('drag-over');
    }
    
    // Optional: Could add logic here to visually move the draggedItemElement 
    // based on touch position, but this adds complexity.
  };

  const handleTouchEnd = (e) => {
    clearTimeout(touchDragTimer.current); 

    const wasDragging = isTouchDragging.current; // Store flag before resetting

    if (!wasDragging || !isMobile || !isEditable) {
      // Cleanup if not dragging
      isTouchDragging.current = false;
      draggedItemIndex.current = null;
      if (draggedItemElement.current) {
          draggedItemElement.current.classList.remove('touch-dragging-item');
          draggedItemElement.current = null;
      }
      // <<< Ensure scroll is re-enabled if drag didn't properly start but timer existed >>>
      if (document.body.style.overflow === 'hidden') {
          console.log('[TouchDrag] Re-enabling body scroll (cleanup - no drag)');
          document.body.style.overflow = originalBodyOverflow.current;
      }
      return;
    }

    // Prevent triggering onClick after drag ends
    e.preventDefault(); 
    e.stopPropagation();

    console.log("[TouchDrag] Touch end");

    // Find the element where touch ended
    // Use changedTouches for touchend event
    const touch = e.changedTouches[0]; 
    const listContainer = listRef.current;
    let targetIndex = -1;
    
    // Clear drag-over styles
    if(listContainer) {
        const allItems = listContainer.querySelectorAll('.ranking-item');
        allItems.forEach(item => item.classList.remove('drag-over'));
    }

    if (touch && listContainer) {
      const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
      const targetItem = targetElement?.closest('.ranking-item');

      if (targetItem && listContainer.contains(targetItem)) {
        targetIndex = parseInt(targetItem.dataset.index, 10);
        console.log(`[TouchDrag] Dropped onto index: ${targetIndex}`);
      }
    }

    // Perform the reorder if drop target is valid and different
    const startIndex = draggedItemIndex.current;
    if (targetIndex !== -1 && targetIndex !== startIndex && startIndex !== null) {
      console.log(`[TouchDrag] Reordering from ${startIndex} to ${targetIndex}`);
      const newList = [...currentRanking.contestants];
      const [movedItem] = newList.splice(startIndex, 1);
      newList.splice(targetIndex, 0, movedItem);
      setCurrentRanking(prev => ({ ...prev, contestants: newList }));
    } else {
      console.log("[TouchDrag] Drop occurred on invalid target or same index.");
    }

    // --- Cleanup --- 
    if (draggedItemElement.current) {
      draggedItemElement.current.classList.remove('touch-dragging-item');
      draggedItemElement.current = null;
    }
    isTouchDragging.current = false;
    draggedItemIndex.current = null;

    // <<< Re-enable body scroll >>>
    console.log('[TouchDrag] Re-enabling body scroll (end)');
    document.body.style.overflow = originalBodyOverflow.current;
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
                                        {/* Conditionally display average position if calculated */} 
                                        {averagePositionDetail !== null && 
                                          <span className="global-score"> (Avg Pos: {averagePositionDetail})</span> 
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