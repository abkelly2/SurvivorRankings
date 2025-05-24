import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, orderBy, getDocs, addDoc, updateDoc, deleteDoc, Timestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { UserContext } from '../UserContext';
import { survivorSeasons } from '../data/survivorData';
import './GlobalRankings.css';
// We need to import the HomePageLists.css to use its styles
import './HomePageLists.css';
// Import OtherLists.css for the list detail view styling AND comments
import './OtherLists.css';
// <<< Import the new effect component >>>
import RainingTrophiesEffect from './RainingTrophiesEffect';

// Import placeholder image
// import placeholderCommenterPic from '../images/placeholder-commenter.png'; // <<< COMMENTED OUT

// Define commentsRef at the component level
const commentsRef = collection(db, 'comments');

// <<< Configuration for Raining Trophies >>>
/*
const NUM_TROPHIES = 25; // How many trophies to render
const MIN_SPEED = 0.5;    // Min falling speed (pixels per frame)
const MAX_SPEED = 1.5;    // Max falling speed
const MIN_SIZE = 18;     // Min font size (px)
const MAX_SIZE = 35;     // Max font size (px)
const MIN_ROTATION = -30; // Min rotation (degrees)
const MAX_ROTATION = 30;  // Max rotation (degrees)
*/

const GlobalRankings = ({ seasonListRef }) => {
  console.log("[GlobalRankings] Component initialized with seasonListRef:", !!seasonListRef);
  
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
  
  // DEBUG: Log mobile status when component mounts
  useEffect(() => {
    console.log("**** MOBILE DEBUG ****");
    console.log("✅ Window width:", window.innerWidth);
    console.log("✅ isMobile state:", isMobile);
    console.log("✅ CSS Media Query match:", window.matchMedia("(max-width: 768px)").matches);
    
    // Force isMobile to true on small screens
    if (window.innerWidth <= 768 && !isMobile) {
      console.log("🔄 Forcing isMobile to TRUE");
      setIsMobile(true);
    }
  }, []);
  
  const [targetMobileAddIndex, setTargetMobileAddIndex] = useState(null);
  const targetMobileAddIndexRef = useRef(null);

  // Add effect to sync ref with state and data attribute
  useEffect(() => {
    targetMobileAddIndexRef.current = targetMobileAddIndex;
    // Also store in a data attribute on the list container for persistence
    if (listRef.current) {
      if (targetMobileAddIndex !== null) {
        listRef.current.dataset.targetIndex = targetMobileAddIndex;
      } else {
        delete listRef.current.dataset.targetIndex;
      }
    }
  }, [targetMobileAddIndex]);

  // Add effect to restore target index on mount
  useEffect(() => {
    if (listRef.current && listRef.current.dataset.targetIndex !== undefined) {
      const restoredIndex = parseInt(listRef.current.dataset.targetIndex, 10);
      setTargetMobileAddIndex(restoredIndex);
      targetMobileAddIndexRef.current = restoredIndex;
      
      // Restore visual highlight
      const allItems = document.querySelectorAll('.ranking-item');
      allItems.forEach(item => item.classList.remove('mobile-clicked'));
      const clickedItem = document.querySelector(`.ranking-item[data-index="${restoredIndex}"]`);
      if (clickedItem) {
        clickedItem.classList.add('mobile-clicked');
      }
    }
  }, []);

  // --- State/Refs for Mobile Touch Drag Reordering (COPIED FROM UserListCreator) --- 
  const touchDragTimer = useRef(null);
  const isTouchDragging = useRef(false);
  const draggedItemIndex = useRef(null);
  const draggedItemElement = useRef(null);
  const originalBodyOverflow = useRef(document.body.style.overflow);
  const draggedItemHeight = useRef(0); 
  const listItemRefs = useRef({}); // Copied, though might not be used heavily here
  const initialTouchX = useRef(0);
  const initialTouchY = useRef(0);
  // ----------------------------------------------

  // <<< Refs for Desktop Drag Reordering >>>
  const draggedItemDesktopIndexRef = useRef(null);
  const draggedItemDesktopHeightRef = useRef(0);
  const desktopDropTargetIndexRef = useRef(null);
  // -------------------------------------

  // <<< State for Raining Trophies (separate component now) >>>
  // const [rainingTrophies, setRainingTrophies] = useState([]);
  // const containerRef = useRef(null); // Ref for the container element for bounds
  // const animationFrameId = useRef(null); // Ref to store animation frame ID
  // -------------------------------------

  // <<< CALCULATE isEditable at the top level >>>
  const isEditable = user && (!userHasSubmitted || !showingGlobalRanking);

  // --- Comment State --- 
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null); // { id: commentId, userName: commentUserName }
  const [replyText, setReplyText] = useState('');
  const [commentAuthorProfilePics, setCommentAuthorProfilePics] = useState({}); // ADDED state for profile pics
  // ---------------------

  // Sample data for the list cards - this would be replaced with real data from your API
  const sampleLists = [
    {
      id: 'season-49',
      name: 'Season 49',
      userName: 'Global Rankings',
      createdAt: new Date().toISOString(), // Use a consistent creation time or fetch it?
      description: 'Vote for your favorite castaways from Survivor Season 49!',
      contestants: Array(10).fill(null).map((_, i) => ({ id: `slot-s49-${i+1}`, name: `Vote for #${i+1}`, imageUrl: '/images/placeholder.jpg', isEmpty: true }))
    }
    // Removed other sample lists
  ];

  // Effect to find the selected list, load user's ranking, check submission status, and load global ranking if needed
  useEffect(() => {
    const loadData = async () => {
      console.log('🔍 [GlobalRankings] Loading Data Debug:', {
        listId,
        userHasSubmitted,
        showingGlobalRanking,
        dataPage: document.body.getAttribute('data-page'),
        bodyClasses: document.body.className
      });
      
      setCheckingSubmissionStatus(true);
      setUserHasSubmitted(null);
      setShowingGlobalRanking(false);
      setGlobalTop10(null);
      setLoadingGlobalRanking(false);
      setErrorGlobalRanking('');
      setCurrentRanking(null);
      setCurrentListTotalVotes(0);

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

        // --- MODIFIED: Fetch global ranking regardless of submission status --- 
        // Default to showing global view if user HAS submitted OR if user is NOT logged in
        const shouldShowGlobalView = submitted || !user;
        console.log(`[GlobalRankings] Setting initial view: showingGlobalRanking=${shouldShowGlobalView} (submitted=${submitted}, user=${!!user})`);
        setShowingGlobalRanking(shouldShowGlobalView);
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
      // Removed: if (!user) return; // Load even if user is not logged in
        
      // Set loading state for all lists initially
      const initialLoadingState = {};
      sampleLists.forEach(list => {
        initialLoadingState[list.id] = true;
        });
      setLoadingGlobalRankings(initialLoadingState);
        
      // Load global rankings for each list defined in sampleLists
      const newGlobalRankings = {};
        
      for (const list of sampleLists) {
        const listId = list.id;
          try {
            const globalRankingRef = doc(db, 'globalRankingsData', listId);
            const globalSnap = await getDoc(globalRankingRef);
            
            if (globalSnap.exists()) {
              const globalData = globalSnap.data();
              newGlobalRankings[listId] = {
                top10: globalData.top10 || [],
                totalVotes: globalData.totalVotes || 0 
              };
            } else {
            // If no data, store empty structure
              newGlobalRankings[listId] = { top10: [], totalVotes: 0 };
            }
          } catch (error) {
          console.error(`Error loading global ranking for ${listId}:`, error);
          newGlobalRankings[listId] = { top10: [], totalVotes: 0, error: 'Failed to load' }; // Indicate error
        } finally {
          // Update loading state for this specific list
          setLoadingGlobalRankings(prev => ({ ...prev, [listId]: false }));
          }
        }
        
        setGlobalRankings(newGlobalRankings);
      console.log("Finished loading all global rankings overview:", newGlobalRankings);

      /* --- OLD LOGIC --- 
      // Check which lists the user has submitted
      // const userRankingRef = doc(db, 'userGlobalRankings', user.uid);
      // try {
      //   const userRankingSnap = await getDoc(userRankingRef);
      //   if (!userRankingSnap.exists()) return;
      //   
      //   const userData = userRankingSnap.data();
      //   const submittedListIds = Object.keys(userData);
      //   
      //   if (submittedListIds.length === 0) return;
      //   
      //   // Set loading state for all submitted lists at once
      //   const newLoadingState = {};
      //   submittedListIds.forEach(id => {
      //     newLoadingState[id] = true;
      //   });
      //   setLoadingGlobalRankings(newLoadingState);
      //   
      //   // Load global rankings for each submitted list
      //   const newGlobalRankings = { ...globalRankings };
      //   
      //   for (const listId of submittedListIds) {
      //     try {
      //       const globalRankingRef = doc(db, 'globalRankingsData', listId);
      //       const globalSnap = await getDoc(globalRankingRef);
      //       
      //       if (globalSnap.exists()) {
      //         const globalData = globalSnap.data();
      //         // Store both top10 and totalVotes
      //         newGlobalRankings[listId] = {
      //           top10: globalData.top10 || [],
      //           totalVotes: globalData.totalVotes || 0
      //         };
      //       } else {
      //         newGlobalRankings[listId] = { top10: [], totalVotes: 0 }; // Default if no data
      //       }
      //     } catch (error) {
      //       console.error(`Error loading global ranking for ${listId}:`, error);
      //       newGlobalRankings[listId] = { top10: [], totalVotes: 0, error: 'Failed to load' };
      //     }
      //   }
      //   setGlobalRankings(newGlobalRankings);
      // }
      // catch (error) {
      //   console.error("Error fetching user submissions for global overview:", error);
      // }
      // finally {
      //    // Ensure loading state is false for all lists after attempting fetch
      //   setLoadingGlobalRankings(prev => {
      //       const finalLoadingState = {};
      //       Object.keys(prev).forEach(id => { finalLoadingState[id] = false; });
      //       return finalLoadingState;
      //   });
      // }
      */
    };
    
    loadGlobalRankings();
  }, []); // Run only once on mount

  // --- Effect to Fetch Comments --- 
  useEffect(() => {
    if (selectedList && listId) {
      fetchComments(listId); // Fetch comments when a list is selected
    }
  }, [selectedList, listId]); // Rerun when selectedList or listId changes
  // ----------------------------

  // Effect to check mobile on resize
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // <<< ADDED useEffect for TouchMove Listener (COPIED FROM UserListCreator) >>>
  useEffect(() => {
    const listElement = listRef.current; // Uses the same listRef
    if (!listElement || !isMobile) return;

    // Handler for touchstart to prevent default scroll
    const handleListTouchStartCapture = (e) => {
      // Only prevent default if editable and touch is on a list item
      if (isEditable && e.target.closest('.ranking-item')) {
        console.log('[TouchStart Capture] Preventing default scroll.');
        e.preventDefault(); 
      }
    };

    // Handler for touchmove (references the component's handleTouchMove)
    const handleMove = (e) => {
      handleTouchMove(e); 
    };

    // Add listeners with passive: false
    listElement.addEventListener('touchstart', handleListTouchStartCapture, { passive: false });
    listElement.addEventListener('touchmove', handleMove, { passive: false });
    console.log('[TouchDrag - Global] Added passive:false touchstart and touchmove listeners');

    // Cleanup function
    return () => {
      listElement.removeEventListener('touchstart', handleListTouchStartCapture, { passive: false });
      listElement.removeEventListener('touchmove', handleMove, { passive: false });
      console.log('[TouchDrag - Global] Removed touchstart and touchmove listeners');
    };
    // Rerun effect if isMobile or isEditable changes, or listRef becomes available
  }, [isMobile, isEditable, listRef.current]); // Added isEditable dependency

  // --- Drag and Drop Handlers (DESKTOP) ---

  const handleDragOver = (e) => {
    if (!isEditable || isMobile) return; // <<< Added isMobile check >>>
    
    const isReorder = e.dataTransfer.types.includes('application/reorder-global');
    const isContestant = e.dataTransfer.types.includes('text/plain');

    if (isReorder || isContestant) {
    e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver(true); // Keep general dragOver state if needed for overall container styling
    } else {
    setDragOver(false);
      return; // Don't proceed if not a valid drop type
    }

    // --- Logic for visual gap during reorder (mimics handleTouchMove) --- 
    if (isReorder && listRef.current && draggedItemDesktopIndexRef.current !== null) {
        const listContainer = listRef.current;
        const draggedIndex = draggedItemDesktopIndexRef.current;
        const draggedHeight = draggedItemDesktopHeightRef.current;
        if (draggedHeight <= 0) return; // Don't do anything if height is unknown

          const mouseY = e.clientY;
        const listRect = listContainer.getBoundingClientRect();
        const mouseYRelativeToContainer = mouseY - listRect.top;
          
        const listItems = Array.from(listContainer.querySelectorAll('.ranking-item'));
        let currentTargetIndex = -1;
        let minDistance = Infinity;
        
        // Find the item the mouse is closest to (using center logic like mobile)
          for (let i = 0; i < listItems.length; i++) {
            const item = listItems[i];
            // Skip the item being dragged itself
            if (parseInt(item.dataset.index, 10) === draggedIndex) continue; 
            
            const itemRect = item.getBoundingClientRect();
            const itemCenterY = itemRect.top + itemRect.height / 2;
            const distance = Math.abs(mouseY - itemCenterY);

            if (distance < minDistance) {
                minDistance = distance;
                currentTargetIndex = i; // Index in the current DOM query
            }
        }

        let potentialDropIndex = -1;
        // Determine insertion point based on closest item
        if (currentTargetIndex !== -1) {
            const closestItem = listItems[currentTargetIndex];
            const closestItemRect = closestItem.getBoundingClientRect();
            const closestItemCenterY = closestItemRect.top + closestItemRect.height / 2;
            const closestItemIndex = parseInt(closestItem.dataset.index, 10);
            potentialDropIndex = (mouseY < closestItemCenterY) ? closestItemIndex : closestItemIndex + 1;
        } else if (listItems.length > 0) {
             // Fallback if no closest item found (e.g., dragging below list)
             const lastItem = listItems[listItems.length - 1];
             const lastItemRect = lastItem.getBoundingClientRect();
             potentialDropIndex = (mouseY > lastItemRect.bottom) ? listItems.length : 0;
        } else {
             potentialDropIndex = 0; // Dropping into an empty list
        }
        
        potentialDropIndex = Math.max(0, Math.min(potentialDropIndex, currentRanking?.contestants?.length ?? 0));
        
        // Update the target index ref if it changed
        if (potentialDropIndex !== desktopDropTargetIndexRef.current) {
             desktopDropTargetIndexRef.current = potentialDropIndex;
             console.log(`[Desktop Drag Over] Potential Drop Index: ${potentialDropIndex}`);
        }
        
        // Apply transforms to create gap
        listItems.forEach((item) => {
            const itemIndex = parseInt(item.dataset.index, 10);
            
            // <<< Handle the item being dragged >>>
            if (itemIndex === draggedIndex) {
                 item.style.transform = ''; // Ensure dragged item is not shifted
                 // Make sure the dragging class is applied for opacity/styling
                 if (!item.classList.contains('dragging-item')) {
                     item.classList.add('dragging-item');
                 }
                 return; // Don't apply shift transform to the item being dragged
            }            
            
            // <<< Apply shift to other items >>>
            let transformY = 0;
            if (potentialDropIndex > draggedIndex) { // Moving down
                if (itemIndex > draggedIndex && itemIndex < potentialDropIndex) {
                    transformY = -draggedHeight;
                }
            } else if (potentialDropIndex < draggedIndex) { // Moving up
                if (itemIndex >= potentialDropIndex && itemIndex < draggedIndex) {
                    transformY = draggedHeight;
                }
            }
            item.style.transform = `translateY(${transformY}px)`;
            // Ensure non-dragged items don't have the dragging style
            if (item.classList.contains('dragging-item')) {
                 item.classList.remove('dragging-item');
            }
        });
    }
  };
  
  const handleDragLeave = (e) => {
    if (!isEditable || isMobile) return; // <<< Added isMobile check >>>

    // Check if leaving the list container itself, not just moving between items
    const listElement = listRef.current;
    if (listElement && !listElement.contains(e.relatedTarget)) {
        console.log("[Desktop Drag Leave] Left list container.");
    setDragOver(false);
        // Clear transforms when leaving the container
        const allItems = listElement.querySelectorAll('.ranking-item'); 
        allItems.forEach(item => item.style.transform = '');
        desktopDropTargetIndexRef.current = null; // Reset target index
    }
  };
  
  // Handle drag start for reordering within the list
  const handleItemDragStart = (e, index) => {
    if (!isEditable || isMobile) return; 
    
    e.dataTransfer.setData('application/reorder-global', index.toString());
    e.dataTransfer.effectAllowed = 'move';
    
    draggedItemDesktopIndexRef.current = index;
    draggedItemDesktopHeightRef.current = e.currentTarget.offsetHeight;
    desktopDropTargetIndexRef.current = index; 
    
    const draggedElement = e.currentTarget;
    
    // Add dragging-item class for general styling (opacity)
    // Use setTimeout 0 to allow the browser to process the drag start event first
    setTimeout(() => {
        if (draggedElement) { 
             draggedElement.classList.add('dragging-item');
        }
    }, 0);

    // <<< Add drag-source--hidden class slightly later to hide original >>>
    setTimeout(() => {
        if (draggedElement) {
            draggedElement.classList.add('drag-source--hidden');
        }
    }, 10); // Small delay (10ms) should be enough

    console.log(`[Desktop Drag Start] Index: ${index}, Height: ${draggedItemDesktopHeightRef.current}`);
  };

  // Handle drag end for reordering
  const handleItemDragEnd = (e) => {
    if (!isEditable || isMobile) return; 
    
    console.log("[Desktop Drag End]");
    
    const listElement = listRef.current;
    let draggedElement = null;
    if (listElement && draggedItemDesktopIndexRef.current !== null) {
        // Find the element that *was* being dragged based on the stored index
        draggedElement = listElement.querySelector(`[data-index="${draggedItemDesktopIndexRef.current}"]`);
    }

    // Clear transforms on all items
    if(listElement) {
        const allItems = listElement.querySelectorAll('.ranking-item'); 
        allItems.forEach(item => {
            item.style.transform = '';
            // <<< Also remove helper classes just in case >>>
            item.classList.remove('dragging-item');
            item.classList.remove('drag-source--hidden');
        });
    }

    // <<< Remove classes from the specific dragged element if found >>>
    if (draggedElement) {
        draggedElement.classList.remove('dragging-item');
        draggedElement.classList.remove('drag-source--hidden');
    } else if (e.currentTarget) {
         // Fallback to currentTarget if querySelector failed (less reliable)
        e.currentTarget.classList.remove('dragging-item');
         e.currentTarget.classList.remove('drag-source--hidden');
    }
    
    // Reset refs
    draggedItemDesktopIndexRef.current = null;
    draggedItemDesktopHeightRef.current = 0;
    desktopDropTargetIndexRef.current = null;
  };

  const handleDrop = (e) => {
    if (!isEditable || isMobile) return; // <<< Added isMobile check >>>
    e.preventDefault();
    setDragOver(false);

    // Check for reorder first
    const reorderIndexStr = e.dataTransfer.getData('application/reorder-global');
    if (reorderIndexStr && draggedItemDesktopIndexRef.current !== null) { // <<< Added check for desktop drag ref >>>
        const fromIndex = parseInt(reorderIndexStr, 10);
        const targetIndex = desktopDropTargetIndexRef.current; // <<< Use the target index from dragOver >>>

        // Clear transforms immediately before state update
        const listElement = listRef.current;
        if(listElement) {
            const allItems = listElement.querySelectorAll('.ranking-item'); 
            allItems.forEach(item => item.style.transform = '');
        }

        // Reset desktop drag refs before state update
        const startIndex = draggedItemDesktopIndexRef.current; // Store before resetting
        draggedItemDesktopIndexRef.current = null;
        draggedItemDesktopHeightRef.current = 0;
        desktopDropTargetIndexRef.current = null;

        // Validate indices
        if (isNaN(fromIndex) || targetIndex === null || !currentRanking || !currentRanking.contestants) {
             console.error("[Desktop Drop Reorder] Invalid state for reorder.", { fromIndex, targetIndex });
        return;
      }
      
        // Calculate final insertion index
        let insertIndex = targetIndex;
        if (fromIndex < targetIndex) {
            insertIndex = targetIndex - 1;
        }
        // Clamp insert index to valid range
        insertIndex = Math.max(0, Math.min(insertIndex, currentRanking.contestants.length -1)); 
        
        console.log(`[Desktop Drop Reorder] From: ${fromIndex}, Target: ${targetIndex}, Insert: ${insertIndex}`);

        // No reorder if indices are effectively the same
        if (fromIndex === insertIndex) {
            console.log("[Desktop Drop Reorder] Same index, no reorder needed.");
            return;
        }

        // Perform state update
        const newList = [...currentRanking.contestants];
        const [movedItem] = newList.splice(fromIndex, 1);
        newList.splice(insertIndex, 0, movedItem);
        setCurrentRanking({ ...currentRanking, contestants: newList });
        console.log("[Desktop Drop Reorder] Reorder successful");
        return; // Exit after handling reorder
    }

    // Handle drop from SeasonList (text/plain)
    const contestantDataStr = e.dataTransfer.getData('text/plain');
    if (contestantDataStr) {
        let droppedContestant;
        try {
            // Check if the data starts with http - it might be a URL instead of JSON
            if (contestantDataStr.startsWith('http')) {
                console.log("Received URL instead of JSON, creating contestant from URL");
                // Create a basic contestant object from the URL
                // Extract id from image URL if possible, or use a timestamp
                const urlParts = contestantDataStr.split('/');
                const fileName = urlParts[urlParts.length - 1];
                const possibleId = fileName.split('.')[0]; // Try to get id from filename
                
                droppedContestant = {
                    id: possibleId || `contestant-${Date.now()}`,
                    name: "Unknown Contestant", // We don't know the name from just the URL
                    imageUrl: contestantDataStr,
                    isEmpty: false
                };
            } else {
                // Normal case - parse JSON data
                droppedContestant = JSON.parse(contestantDataStr);
            }
            
            // Basic validation
            if (!droppedContestant || typeof droppedContestant.id === 'undefined') {
                throw new Error("Invalid contestant data format.");
            }

            // If name is missing or "Unknown Contestant", look it up in survivorData
            if (!droppedContestant.name || droppedContestant.name === "Unknown Contestant") {
                console.log(`Looking up contestant id: ${droppedContestant.id} in survivorData`);
                
                let contestantFound = false;
                
                // First try direct ID match
                for (const season of survivorSeasons) {
                    const foundContestant = season.contestants.find(c => c.id === droppedContestant.id);
                    if (foundContestant) {
                        console.log(`Found contestant by direct ID match in season ${season.name}:`, foundContestant);
                        droppedContestant.name = foundContestant.name;
                        if (!droppedContestant.seasonId) droppedContestant.seasonId = season.id;
                        if (!droppedContestant.seasonName) droppedContestant.seasonName = season.name;
                        contestantFound = true;
                        break;
                    }
                }
                
                // If not found by ID, try to extract contestant name from URL path
                if (!contestantFound && typeof droppedContestant.id === 'string') {
                    // Check if it's a URL path (likely contains '/' or '%2F')
                    if (droppedContestant.id.includes('/') || droppedContestant.id.includes('%2F')) {
                        // Extract last part of path (after last '/' or '%2F')
                        let possibleName = droppedContestant.id;
                        if (possibleName.includes('/')) {
                            possibleName = possibleName.split('/').pop();
                        } 
                        if (possibleName.includes('%2F')) {
                            possibleName = possibleName.split('%2F').pop();
                        }
                        
                        // Clean up the name (remove file extension, etc.)
                        possibleName = possibleName.replace(/\.\w+$/, '') // Remove file extension
                                                   .replace(/_/g, ' ')     // Replace underscores with spaces
                                                   .replace(/-/g, ' ')     // Replace hyphens with spaces
                                                   .toLowerCase().trim();
                        
                        console.log(`Extracted possible name fragment: "${possibleName}" from URL`);
                        
                        // Search through all contestants for name matches
                        for (const season of survivorSeasons) {
                            // Look for contestants whose names include the extracted fragment
                            const matchingContestants = season.contestants.filter(c => 
                                c.name.toLowerCase().includes(possibleName) || 
                                c.id.toLowerCase().includes(possibleName)
                            );
                            
                            if (matchingContestants.length > 0) {
                                // Use the first match (could be refined further if needed)
                                const foundContestant = matchingContestants[0];
                                console.log(`Found contestant by name fragment in season ${season.name}:`, foundContestant);
                                droppedContestant.name = foundContestant.name;
                                droppedContestant.originalId = droppedContestant.id; // Save original for reference
                                droppedContestant.id = foundContestant.id; // Update to correct ID
                                if (!droppedContestant.seasonId) droppedContestant.seasonId = season.id;
                                if (!droppedContestant.seasonName) droppedContestant.seasonName = season.name;
                                contestantFound = true;
                                break;
                            }
                        }
                    }
                }
                
                // If still not found, use ID as name (fallback)
                if (!contestantFound) {
                    console.warn(`Could not find contestant with id: ${droppedContestant.id} in survivorData`);
                    // Extract a more readable name from the URL if possible
                    if (typeof droppedContestant.id === 'string' && 
                        (droppedContestant.id.includes('/') || droppedContestant.id.includes('%2F'))) {
                        let readableName = droppedContestant.id;
                        // Get the last part of the path
                        if (readableName.includes('/')) {
                            readableName = readableName.split('/').pop();
                        }
                        if (readableName.includes('%2F')) {
                            readableName = readableName.split('%2F').pop();
                        }
                        // Clean up and capitalize
                        readableName = readableName
                            .replace(/\.\w+$/, '') // Remove file extension
                            .replace(/_/g, ' ')    // Replace underscores with spaces
                            .replace(/-/g, ' ')    // Replace hyphens with spaces
                            .replace(/%20/g, ' '); // Replace URL encoded spaces
                            
                        // Capitalize each word
                        readableName = readableName.split(' ')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                            .join(' ');
                            
                        droppedContestant.name = readableName;
                    } else {
                        droppedContestant.name = droppedContestant.id;
                    }
                } else {
                    console.log(`Updated contestant name to: ${droppedContestant.name}`);
                }
            } else {
                console.log(`Using existing contestant name: ${droppedContestant.name}`);
            }
        } catch (error) {
            console.error("Failed to parse dropped contestant data:", error);
            return; // Exit if data is invalid
        }

        // Ensure we don't mix types (assuming global lists are contestant-only)
        if (droppedContestant.isSeason) {
            console.warn("Attempted to drop a season onto a contestant list.");
            // Optionally show an error message to the user
        return;
      }

        // Calculate target index based on drop position
        let targetIndex = -1; // Initialize to -1 (no target found yet)
        const listElement = listRef.current;
        if (listElement) {
        const mouseY = e.clientY;
            const items = listElement.querySelectorAll('.ranking-item'); // Use the correct selector
            
            // <<< Change logic to find direct hit >>>
            for(let i = 0; i < items.length; i++) {
                const itemRect = items[i].getBoundingClientRect();
                // Check if the drop Y coordinate is within the item's vertical bounds
                if (mouseY >= itemRect.top && mouseY <= itemRect.bottom) { 
                    targetIndex = i; // Found a direct hit
                    break; // Stop searching
                }
            }
            // <<< End change >>>

        } else {
            console.warn("List ref not found, cannot calculate drop index accurately.");
            // If ref is missing, we can't reliably determine the target, so do nothing
            return; 
        }

        // <<< Add check: If no direct hit, do nothing >>>
        if (targetIndex === -1) {
            console.log("[Desktop Drop] Drop did not occur directly on a list item. No action taken.");
            return; 
        }

        console.log(`[Desktop Drop] Dropped contestant ${droppedContestant.name} onto index ${targetIndex}`);

        // Check if contestant is already in the list (at a DIFFERENT index)
        const existingIndex = currentRanking.contestants.findIndex(c => !c.isEmpty && c.id === droppedContestant.id);
        if (existingIndex !== -1 && existingIndex !== targetIndex) { // Allow dropping onto its own current slot (effectively no change)
            alert(`${droppedContestant.name} is already ranked at position ${existingIndex + 1}.`);
            return;
        }

        // Update the list
          const newList = [...currentRanking.contestants];
        // Replace the item at the target index
        newList[targetIndex] = { 
            ...droppedContestant, 
            isEmpty: false // Ensure it's marked as not empty
        };
        setCurrentRanking({ ...currentRanking, contestants: newList });
        return; // Exit after handling contestant drop
    }

    console.warn("[Desktop Drop] Drop occurred but no recognized data type found.");
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

    // Clear target index from all sources
    setTargetMobileAddIndex(null);
    targetMobileAddIndexRef.current = null;
    if (listRef.current) {
      delete listRef.current.dataset.targetIndex;
    }
    
    // Remove highlight from all items
    const allItems = document.querySelectorAll('.ranking-item');
    allItems.forEach(item => item.classList.remove('mobile-clicked'));
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
    console.log('🔄 [GlobalRankings] Toggle View Debug - Before:', {
      currentView: showingGlobalRanking ? 'global' : 'user',
      dataPage: document.body.getAttribute('data-page'),
      bodyClasses: document.body.className
    });
    
    setShowingGlobalRanking(prev => !prev);
    // Reset submission feedback when toggling
    setSubmitSuccess(false);
    setSubmitError('');
    
    // Ensure we maintain global background
    document.body.setAttribute('data-page', 'global');
    
    console.log('🔄 [GlobalRankings] Toggle View Debug - After:', {
      newView: !showingGlobalRanking ? 'global' : 'user',
      dataPage: document.body.getAttribute('data-page'),
      bodyClasses: document.body.className
    });
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
    
    const globalDataForList = globalRankings[list.id];
    const isLoading = loadingGlobalRankings[list.id] === true;
    const listTotalVotes = globalDataForList?.totalVotes || 0;
    
    // --- MODIFIED: Determine contestants to display --- 
    let displayContestants = list.contestants; // Default to empty slots
    let isDisplayingGlobal = false;
    if (!isLoading && globalDataForList?.top10 && globalDataForList.top10.length > 0) {
      // If global data is loaded and has entries, display it
      displayContestants = globalDataForList.top10;
      isDisplayingGlobal = true;
    } // Otherwise, keep the default empty slots
    
    // Check if the user *specifically* has submitted for this list (used for points calc maybe)
    const userHasSubmittedForThisList = user && globalDataForList !== undefined; 
    
    return (
      <div 
        className="ranking-list-container" 
        onClick={() => viewFullList(list)}
        style={{ position: 'relative' }} 
      >
        <RainingTrophiesEffect />

        <h2 className="list-title">{list.name}</h2>
        
        {/*
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
        */}
        
        <div className="ranking-list clickable">
          {isLoading ? (
            <div className="loading-message">Loading global rankings...</div>
          ) : displayContestants.length === 0 ? (
            <div className="empty-list-message">
              This list is empty
            </div>
          ) : (
            displayContestants.map((contestant, index) => {
              const averagePoints = (userHasSubmittedForThisList && typeof contestant.totalScore === 'number' && listTotalVotes > 0)
                ? contestant.totalScore / listTotalVotes 
                : null;
              const averagePosition = (averagePoints !== null)
                ? (11 - averagePoints).toFixed(1)
                : null;
              // Only show "Submit your votes!" if NOT displaying global ranking AND it's the first empty slot
              const isFirstEmptySlot = !isDisplayingGlobal && index === 0 && contestant.isEmpty; 

              return (
                                                <div 
                                  key={`${contestant.id}-${index}`} 
                                  className="ranking-item"
                                  onClick={(e) => handleMobileSlotClick(index)}
                                  onTouchStart={(e) => handleMobileSlotClick(index)}
                                >
                    <div className="ranking-number">{index + 1}</div>
                    <img
                        src={contestant.imageUrl || "/images/placeholder.jpg"}
                        className={`contestant-image`} 
                        draggable="false"
                    />
                    <div className="contestant-name">
                        {contestant.name}
                        {/* Show total points if available */} 
                        {contestant.totalScore !== undefined && 
                          <span className="global-score"> {contestant.totalScore} pts</span> 
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
    if (!currentRanking || showingGlobalRanking) {
      console.log("[GlobalRankings] Can't add contestant: currentRanking empty or showing global view");
      return;
    }
    
    // Get target index from all available sources
    const currentTargetIndex = targetMobileAddIndexRef.current ?? 
                             targetMobileAddIndex ?? 
                             (listRef.current ? parseInt(listRef.current.dataset.targetIndex, 10) : null);
    
    console.log("[GlobalRankings] Adding contestant locally:", contestant, "targetIndex:", currentTargetIndex);
    
    if (currentTargetIndex === null || isNaN(currentTargetIndex)) {
      console.log("[GlobalRankings] No target index set. Please click a ranking slot first.");
      alert("Please click a ranking slot first to select where to add the contestant.");
      return;
    }
    
    if (currentTargetIndex >= 0 && currentTargetIndex < currentRanking.contestants.length) {
      // Check if already in list (at a *different* index)
      const existingIndex = currentRanking.contestants.findIndex(
        item => !item.isEmpty && item.id === contestant.id
      );
      
      if (existingIndex !== -1 && existingIndex !== currentTargetIndex) {
        alert(`${contestant.name} is already ranked at position ${existingIndex + 1}.`);
        // Clear target index from all sources
        setTargetMobileAddIndex(null);
        targetMobileAddIndexRef.current = null;
        if (listRef.current) {
          delete listRef.current.dataset.targetIndex;
        }
        
        // Remove highlight from all items
        const allItems = document.querySelectorAll('.ranking-item');
        allItems.forEach(item => item.classList.remove('mobile-clicked'));
        return;
      }

      // Debug log the contestant data
      console.log("[GlobalRankings] Contestant data:", contestant);

      const newList = [...currentRanking.contestants];
      
      // Get the image URL from the clicked contestant card
      const seasonListContainer = document.querySelector('.seasons-section');
      const contestantCard = seasonListContainer?.querySelector(`[data-contestant-id="${contestant.id}"]`);
      const imgElement = contestantCard?.querySelector('.contestant-image');
      const imageUrl = imgElement?.src || contestant.imageUrl || '/images/placeholder.jpg';
      
      console.log("[GlobalRankings] Found image URL:", imageUrl);

      // Create the contestant object with required properties first
      const updatedContestant = {
        id: contestant.id,
        name: contestant.name || "Unknown Contestant",
        imageUrl: imageUrl, // Use the found image URL or fallback to contestant.imageUrl
        seasonId: contestant.seasonId,
        seasonName: contestant.seasonName,
        isEmpty: false,
        isSeason: false
      };

      // Debug log the updated contestant
      console.log("[GlobalRankings] Updated contestant:", updatedContestant);

      newList[currentTargetIndex] = updatedContestant;
      setCurrentRanking(prev => ({ ...prev, contestants: newList }));
      console.log("[GlobalRankings] Successfully added contestant at index", currentTargetIndex);
      
      // After successful addition, clear target index from all sources
      setTargetMobileAddIndex(null);
      targetMobileAddIndexRef.current = null;
      if (listRef.current) {
        delete listRef.current.dataset.targetIndex;
      }
      
      // Remove highlight from all items
      const allItems = document.querySelectorAll('.ranking-item');
      allItems.forEach(item => item.classList.remove('mobile-clicked'));
      
      // Keep the menu open for a moment so user can see the selection
      setTimeout(() => {
        if (seasonListRef?.current?.hideMenu) {
          seasonListRef.current.hideMenu();
        }
      }, 500);
    } else {
      console.log("[GlobalRankings] Invalid target index:", currentTargetIndex);
      // Clear target index from all sources
      setTargetMobileAddIndex(null);
      targetMobileAddIndexRef.current = null;
      if (listRef.current) {
        delete listRef.current.dataset.targetIndex;
      }
      
      // Remove highlight from all items
      const allItems = document.querySelectorAll('.ranking-item');
      allItems.forEach(item => item.classList.remove('mobile-clicked'));
    }
  };

  // Effect to register/unregister the update callback with SeasonList
  useEffect(() => {
    // Determine if the current view is editable on mobile
    const isGlobalRankingDetailView = isMobile && 
                                      window.location.pathname.includes('/global-rankings/season-') && 
                                      !showingGlobalRanking;

    if (isGlobalRankingDetailView && seasonListRef && seasonListRef.current && 
        typeof seasonListRef.current.setListUpdateCallback === 'function') {
      console.log('[GlobalRankings] Registering contestant callback for mobile editing');
      seasonListRef.current.setListUpdateCallback(handleAddContestantLocally);
    } else if (seasonListRef && seasonListRef.current && 
               typeof seasonListRef.current.setListUpdateCallback === 'function') {
      seasonListRef.current.setListUpdateCallback(null);
    }

    // Cleanup function
    return () => {
      if (seasonListRef && seasonListRef.current && 
          typeof seasonListRef.current.setListUpdateCallback === 'function') {
        seasonListRef.current.setListUpdateCallback(null);
      }
    };
  }, [isMobile, showingGlobalRanking, seasonListRef]);

  // --- REPLACED Touch Handlers (COPIED FROM UserListCreator) --- 
  const handleTouchStart = (e, index) => {
    if (!isMobile || !isEditable) return;

    console.log('[TouchStart] Starting touch interaction');
    e.stopPropagation(); 
    clearTimeout(touchDragTimer.current);
    const currentTarget = e.currentTarget;
    draggedItemElement.current = currentTarget;
    draggedItemIndex.current = index; // Store index immediately
    
    const touch = e.touches[0];
    initialTouchX.current = touch.clientX;
    initialTouchY.current = touch.clientY;

    // Use timer to differentiate between tap and drag
    touchDragTimer.current = setTimeout(() => {
      console.log('[TouchStart] Long press detected - starting drag');
      isTouchDragging.current = true;
      if (currentTarget) {
          draggedItemHeight.current = currentTarget.offsetHeight; 
          currentTarget.classList.add('touch-dragging-item');
      }
      originalBodyOverflow.current = document.body.style.overflow; 
      document.body.style.overflow = 'hidden';
    }, 150);
  };

  const handleTouchMove = (e) => {
    if (!isMobile || !isEditable || !isTouchDragging.current || draggedItemIndex.current === null) return; // Added isEditable check & isTouchDragging check
    
    // e.preventDefault(); // REMOVED: Default is now prevented in touchstart capture listener

    const touch = e.touches[0];
    const listContainer = listRef.current; 
    const draggedElement = draggedItemElement.current;
    if (!touch || !listContainer || !draggedElement) return;

    // Apply transform to follow finger
    const deltaX = touch.clientX - initialTouchX.current;
    const deltaY = touch.clientY - initialTouchY.current;
    draggedElement.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.03)`;

    // Target Index Calculation using offsetTop (Copied logic)
    const touchY = touch.clientY;
    const listRect = listContainer.getBoundingClientRect();
    const touchRelativeToContainer = touchY - listRect.top;
    const listItems = Array.from(listContainer.querySelectorAll('.ranking-item')); 
    
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
            // Store the actual index from the data-index attribute if available, otherwise fall back to loop index
            const itemIndexAttr = item.dataset.index;
            closestItemOriginalIndex = itemIndexAttr !== undefined ? parseInt(itemIndexAttr, 10) : i;
        }
    }
    
    if (closestItemOriginalIndex !== -1 && closestItemOriginalIndex < listItems.length) {
        const closestItem = listItems.find(item => (parseInt(item.dataset.index, 10) === closestItemOriginalIndex));
        if (closestItem) {
            const closestItemOriginalOffsetTop = closestItem.offsetTop;
            const closestItemHeight = closestItem.offsetHeight;
            const closestItemOriginalCenterY = closestItemOriginalOffsetTop + closestItemHeight / 2;
            targetIndex = (touchRelativeToContainer < closestItemOriginalCenterY) ? closestItemOriginalIndex : closestItemOriginalIndex + 1;
        } else { 
             // Fallback if closest item by index wasn't found (unlikely but safe)
             const tempHeight = draggedItemHeight.current > 0 ? draggedItemHeight.current : 50;
             targetIndex = Math.max(0, Math.min(Math.floor(touchRelativeToContainer / tempHeight), currentRanking?.contestants?.length ?? 0));
        }
    } else if (listItems.length > 0) { 
        // If no closest found but list isn't empty, likely near top/bottom
        const firstItem = listItems.find(item => parseInt(item.dataset.index, 10) === 0);
        const lastItem = listItems.find(item => parseInt(item.dataset.index, 10) === (currentRanking?.contestants?.length ?? 1) -1);
        if (firstItem && touchRelativeToContainer < firstItem.offsetTop + firstItem.offsetHeight / 2) {
            targetIndex = 0; // Hovering above the first item
        } else if (lastItem && touchRelativeToContainer > lastItem.offsetTop + lastItem.offsetHeight / 2) {
            targetIndex = listItems.length; // Hovering below the last item
    } else {
            // Fallback (middle of list, but somehow no closest found?)
            const tempHeight = draggedItemHeight.current > 0 ? draggedItemHeight.current : 50;
            targetIndex = Math.max(0, Math.min(Math.floor(touchRelativeToContainer / tempHeight), currentRanking?.contestants?.length ?? 0));
        }
    } else {
        targetIndex = 0; // List was empty, insert at start
    }
    
    // Clamp target index
    targetIndex = Math.max(0, Math.min(targetIndex, currentRanking?.contestants?.length ?? 0));

    // Apply Transforms to Create Gap
    const draggedHeight = draggedItemHeight.current;
    const startIndex = draggedItemIndex.current; 
    const gap = 10; // Assumed gap

    if (draggedHeight > 0 && startIndex !== null) {
        listItems.forEach((item) => {
            if (item === draggedElement) {
                 item.style.transition = 'none'; // Ensure dragged item moves instantly
                 return;
            }             
            const itemIndex = parseInt(item.dataset.index, 10);
            let transformY = 0; 
            
            if (targetIndex > startIndex) { // Moving Down
                // Item is between old spot and target spot
                if (itemIndex > startIndex && itemIndex < targetIndex) {
                    transformY = -(draggedHeight + gap);
                }
            } else if (targetIndex < startIndex) { // Moving Up
                // Item is between target spot and old spot
                if (itemIndex >= targetIndex && itemIndex < startIndex) {
                    transformY = draggedHeight + gap;
                }
            }
            item.style.transition = 'transform 0.2s ease-in-out'; // Smooth transition for others
            item.style.transform = `translateY(${transformY}px)`;
        });
    }
  };

  const handleTouchEnd = (e) => {
    console.log('[TouchEnd] Touch interaction ended');
    
    // Clear the drag timer first
    clearTimeout(touchDragTimer.current); 
    touchDragTimer.current = null;
    
    // If we didn't start dragging, this was a tap
    if (!isTouchDragging.current && draggedItemIndex.current !== null) {
      console.log('[TouchEnd] Detected as tap, calling handleMobileSlotClick');
      const index = draggedItemIndex.current;
      // Reset touch state
      draggedItemIndex.current = null;
      draggedItemElement.current = null; 
      // Call the click handler
      handleMobileSlotClick(index);
      return; 
    }
    
    // Handle drag end if we were dragging
    if (isTouchDragging.current) {
      console.log('[TouchEnd] Ending drag operation');
      const draggedElement = draggedItemElement.current;
      const startIndex = draggedItemIndex.current;
      const listContainer = listRef.current;

      // Find the final drop position
      if (listContainer && draggedElement && startIndex !== null) {
        const touch = e.changedTouches[0];
        const listRect = listContainer.getBoundingClientRect();
        const touchRelativeToContainer = touch.clientY - listRect.top;
        const listItems = Array.from(listContainer.querySelectorAll('.ranking-item'));
        
        let targetIndex = -1;
        let minDistance = Infinity;

        // Find the closest item to the touch point
        listItems.forEach((item, index) => {
          if (item === draggedElement) return; // Skip the dragged item
          
          const itemRect = item.getBoundingClientRect();
          const itemCenterY = itemRect.top + itemRect.height / 2;
          const distance = Math.abs(touch.clientY - itemCenterY);
          
          if (distance < minDistance) {
            minDistance = distance;
            targetIndex = parseInt(item.dataset.index, 10);
          }
        });

        // Adjust target index based on whether we're dropping above or below the closest item
        if (targetIndex !== -1) {
          const closestItem = listItems.find(item => parseInt(item.dataset.index, 10) === targetIndex);
          if (closestItem) {
            const itemRect = closestItem.getBoundingClientRect();
            const itemCenterY = itemRect.top + itemRect.height / 2;
            if (touch.clientY > itemCenterY) {
              targetIndex++; // Drop below if touch is below center
            }
          }
        } else {
          // If no closest item found, determine if we should place at start or end
          targetIndex = touchRelativeToContainer < listContainer.offsetHeight / 2 ? 0 : listItems.length;
        }

        // Clamp target index to valid range
        targetIndex = Math.max(0, Math.min(targetIndex, currentRanking.contestants.length - 1));
        
        console.log(`[TouchEnd] Moving item from index ${startIndex} to ${targetIndex}`);

        // Only reorder if indices are different
        if (startIndex !== targetIndex) {
          const newList = [...currentRanking.contestants];
          const [movedItem] = newList.splice(startIndex, 1);
          newList.splice(targetIndex, 0, movedItem);
          setCurrentRanking(prev => ({ ...prev, contestants: newList }));
        }
      }

      // Reset visual styles
      if (listContainer) {
        const allItems = listContainer.querySelectorAll('.ranking-item');
        allItems.forEach(item => {
          item.style.transform = '';
          item.style.transition = '';
        });
      }
      if (draggedElement) {
        draggedElement.classList.remove('touch-dragging-item');
        draggedElement.style.transform = '';
        draggedElement.style.transition = '';
      }

      // Restore body scroll
      if (document.body.style.overflow === 'hidden') {
        document.body.style.overflow = originalBodyOverflow.current;
      }
    }

    // Reset all state
    isTouchDragging.current = false;
    draggedItemIndex.current = null;
    draggedItemElement.current = null;
    draggedItemHeight.current = 0;
    initialTouchX.current = 0;
    initialTouchY.current = 0;
  };
  // --- End REPLACED Handlers --- 

  // --- Comment Functions --- 

  // Function to fetch comments for a specific GLOBAL list
  const fetchComments = async (globalListId) => {
    if (!globalListId) return;
    setLoadingComments(true);
    try {
      const q = query(commentsRef, where('listId', '==', globalListId), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const fetchedComments = [];
      const authorIds = new Set(); // To avoid duplicate fetches for the same author

      querySnapshot.forEach((doc) => {
        const commentData = { id: doc.id, ...doc.data() };
        fetchedComments.push(commentData);
        if (commentData.userId) {
          authorIds.add(commentData.userId);
        }
      });

      // Fetch profile pictures for authors
      const profilePics = {};
      for (const userId of authorIds) {
        try {
          const userDocRef = doc(db, 'users', userId);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists() && userDocSnap.data().profilePictureUrl) {
            profilePics[userId] = userDocSnap.data().profilePictureUrl;
          } else {
            profilePics[userId] = null; // Fallback if no URL (MODIFIED: was placeholderCommenterPic)
          }
        } catch (error) {
          console.error(`Error fetching profile picture for user ${userId}:`, error);
          profilePics[userId] = null; // Fallback on error (MODIFIED: was placeholderCommenterPic)
        }
      }
      setCommentAuthorProfilePics(profilePics);
      
      // Sort comments: parent comments first, then by createdAt. Replies will be nested later.
      const sortedComments = fetchedComments.sort((a, b) => {
        // Prioritize parent comments (those without parentId)
        if (!a.parentId && b.parentId) return -1;
        if (a.parentId && !b.parentId) return 1;
        // Then sort by creation date (newest first for parents, oldest for replies handled in render)
        return (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0);
      });

      setComments(sortedComments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      // Handle error state if necessary
    }
    setLoadingComments(false);
  };

  // Function to add a new comment or reply for a GLOBAL list
  const addComment = async (parentId = null) => {
    if (!user) {
      alert('You must be logged in to comment.');
      return;
    }
    if (!listId) {
        console.error("Cannot add comment: listId is missing.");
        return;
    }

    const text = parentId ? replyText.trim() : newComment.trim();
    if (!text) {
      alert('Comment cannot be empty.');
      return;
    }

    try {
      const commentData = {
        // listUserId: null, // No specific listUserId for global lists
        listId: listId, // Use the global list ID
        userId: user.uid,
        userName: user.displayName || 'Anonymous',
        text: text,
        createdAt: serverTimestamp(),
        upvotes: [],
        downvotes: [],
        parentId: parentId || null,
        isReply: !!parentId
      };

      // Use the component-level commentsRef
      const docRef = await addDoc(commentsRef, commentData);
      console.log("Comment added with ID:", docRef.id);

      // Optimistically update UI or refetch
      // Refetching might be simpler to ensure correct timestamp order
      fetchComments(listId);

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
  const handleReplyClick = (commentId, userName) => {
    if (replyingTo?.id === commentId) {
      setReplyingTo(null); // Toggle off if clicking the same reply button
    } else {
      setReplyingTo({ id: commentId, userName: userName });
      setReplyText(''); // Clear reply text when switching targets
    }
  };

  // Function to cancel reply
  const cancelReply = () => {
    setReplyingTo(null);
    setReplyText('');
  };

  // Function to handle comment votes
  const handleCommentVote = async (commentId, voteType) => {
    if (!user) {
      alert('You must be logged in to vote.');
      return;
    }

    const commentRef = doc(db, 'comments', commentId);
    try {
      const commentSnapshot = await getDoc(commentRef);
      if (!commentSnapshot.exists()) return;

      const commentData = commentSnapshot.data();
      const upvotes = commentData.upvotes || [];
      const downvotes = commentData.downvotes || [];
      const userId = user.uid;

      let newUpvotes = [...upvotes];
      let newDownvotes = [...downvotes];

      if (voteType === 'upvote') {
        if (newUpvotes.includes(userId)) {
          newUpvotes = newUpvotes.filter(id => id !== userId); // Remove upvote
        } else {
          newUpvotes.push(userId); // Add upvote
          newDownvotes = newDownvotes.filter(id => id !== userId); // Remove downvote if exists
        }
      } else { // downvote
        if (newDownvotes.includes(userId)) {
          newDownvotes = newDownvotes.filter(id => id !== userId); // Remove downvote
        } else {
          newDownvotes.push(userId); // Add downvote
          newUpvotes = newUpvotes.filter(id => id !== userId); // Remove upvote if exists
        }
      }

      await updateDoc(commentRef, {
        upvotes: newUpvotes,
        downvotes: newDownvotes
      });

      // Update local state optimistically
      setComments(prevComments => prevComments.map(comment => 
        comment.id === commentId 
          ? { ...comment, upvotes: newUpvotes, downvotes: newDownvotes } 
          : comment
      ));

    } catch (error) {
      console.error('Error voting on comment:', error);
      alert('Failed to process vote.');
    }
  };

  // Function to handle comment deletion
  const handleDeleteComment = async (commentId) => {
    if (!user) return;

    const commentToDelete = comments.find(c => c.id === commentId);
    if (!commentToDelete || commentToDelete.userId !== user.uid) {
        alert("You can only delete your own comments.");
        return;
    }

    if (window.confirm('Are you sure you want to delete this comment?')) {
      try {
        await deleteDoc(doc(db, 'comments', commentId));
        // Refetch comments to ensure replies are handled correctly if needed,
        // or filter locally if replies aren't a concern for deletion propagation
        fetchComments(listId);
      } catch (error) {
        console.error('Error deleting comment:', error);
        alert('Failed to delete comment.');
      }
    }
  };

  // Function to check if the current user is the author of a comment
  const isCommentAuthor = (comment) => {
    return user && comment.userId === user.uid;
  };

  // Function to format comment timestamps
  const formatCommentDate = (timestamp) => {
    if (!timestamp) return 'Just now';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp);
    // More robust formatting needed, but this is basic
    return date.toLocaleString(); 
  };

  // Function to get vote count
  const getVoteCount = (comment) => {
    return (comment.upvotes?.length || 0) - (comment.downvotes?.length || 0);
  };

  // Function to check if user has upvoted a comment
  const hasUserUpvotedComment = (comment) => {
    return user && comment.upvotes?.includes(user.uid);
  };

  // Function to check if user has downvoted a comment
  const hasUserDownvotedComment = (comment) => {
    return user && comment.downvotes?.includes(user.uid);
  };

  // -----------------------

  // State for visual feedback on mobile clicks
  const [lastClickedIndex, setLastClickedIndex] = useState(null);
  const lastClickedTimeoutRef = useRef(null);
  
  // Function to handle mobile slot click
  const handleMobileSlotClick = (index) => {
    console.log('🎯 [GlobalRankings] Mobile Slot Click Debug:', {
      index,
      isMobile,
      showingGlobalRanking,
      isEditable,
      userHasSubmitted,
      pathname: window.location.pathname,
      currentDataPage: document.body.getAttribute('data-page'),
      bodyClasses: document.body.className
    });
    
    // Only proceed if we're:
    // 1. On the detail page (/global-rankings/season-49)
    // 2. In the edit view (not showing global ranking)
    // 3. The list is editable
    if (showingGlobalRanking) {
      console.log('❌ [GlobalRankings] Stopped: Showing global ranking view');
      return;
    }
    
    if (!window.location.pathname.includes('/global-rankings/')) {
      console.log('❌ [GlobalRankings] Stopped: Not on global rankings detail page');
      return;
    }

    if (!isEditable) {
      console.log('❌ [GlobalRankings] Stopped: List is not editable');
      return;
    }

    console.log('✅ [GlobalRankings] Passed initial checks');

    // IMPORTANT: Ensure we preserve the global background
    console.log('🎨 [GlobalRankings] Setting data-page to "global"');
    document.body.setAttribute('data-page', 'global');

    // Remove highlight from previously clicked item
    const allItems = document.querySelectorAll('.ranking-item');
    allItems.forEach(item => item.classList.remove('mobile-clicked'));

    // Add highlight to newly clicked item
    const clickedItem = document.querySelector(`.ranking-item[data-index="${index}"]`);
    if (clickedItem) {
      console.log('✨ [GlobalRankings] Adding mobile-clicked class to item:', index);
      clickedItem.classList.add('mobile-clicked');
    }

    // Store the index in all available places
    console.log('📝 [GlobalRankings] Updating target indices:', {
      newIndex: index,
      currentTargetMobileAddIndex: targetMobileAddIndex,
      currentTargetMobileAddIndexRef: targetMobileAddIndexRef.current
    });
    
    setTargetMobileAddIndex(index);
    targetMobileAddIndexRef.current = index;
    if (listRef.current) {
      listRef.current.dataset.targetIndex = index;
    }
      
    // First make sure the callback is registered
    if (seasonListRef && seasonListRef.current) {
      if (typeof seasonListRef.current.setListUpdateCallback === 'function') {
        console.log('5. Registering contestant callback');
        seasonListRef.current.setListUpdateCallback(handleAddContestantLocally);
      }
      
      if (typeof seasonListRef.current.showMenu === 'function') {
        console.log('6. Attempting to show menu');
        // Show the menu - SeasonList will handle Season 49 selection internally
        seasonListRef.current.showMenu();
      }
    } else {
      console.log('❌ Could not access seasonListRef methods');
    }
  };

  // Remove or modify the DEBUG_handleClick function
  // Replace this entire function with a simple version that uses handleMobileSlotClick
  const DEBUG_handleClick = (e, index) => {
    e.stopPropagation();
    
    // Only use this for debugging - actual handling should go through handleMobileSlotClick
    console.log("[DEBUG CLICK] Index:", index);
    console.log("[DEBUG CLICK] View state: showingGlobalRanking=", showingGlobalRanking);
    console.log("[DEBUG CLICK] Edit allowed: isEditable=", isEditable);
    console.log("[DEBUG CLICK] User submitted:", userHasSubmitted);
    console.log("[DEBUG CLICK] Path:", window.location.pathname);
    
    // If we're in the right context, call the real handler
    if (isMobile && isEditable && !showingGlobalRanking && window.location.pathname.includes('/global-rankings/')) {
      handleMobileSlotClick(index);
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
        {(userHasSubmitted === true || isEditable) && (
             <>
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
             </>
        )}
         </div>

        {/* Ranking List Area */}
        {showingGlobalRanking ? (
            // --- Render Read-Only Global Ranking ---
            <div className="ranking-list-container global-results">
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
                                <div 
                                  key={`${contestant.id}-${index}`} 
                                  className="ranking-item"
                                  onClick={(e) => handleMobileSlotClick(index)}
                                  onTouchStart={(e) => handleMobileSlotClick(index)}
                                >
                                    <div className="ranking-number">{index + 1}</div>
                                    <img
                                        src={contestant.imageUrl || "/images/placeholder.jpg"}
                                        className={`contestant-image`} 
                                        draggable="false"
                                    />
                                    <div className="contestant-name">
                                        {contestant.name}
                                        {/* Show total points if available */} 
                                        {contestant.totalScore !== undefined && 
                                          <span className="global-score"> {contestant.totalScore} pts</span> 
                                        }
                                    </div>
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
                      className={`ranking-item ${contestant.isEmpty ? 'empty-slot' : ''} ${isMobile ? 'clickable-mobile' : ''}`}
                      data-index={index}
                      draggable={isEditable && !contestant.isEmpty}
                      onDragStart={(e) => isEditable && !contestant.isEmpty && handleItemDragStart(e, index)}
                      onDragEnd={isEditable ? handleItemDragEnd : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isMobile && isEditable && !showingGlobalRanking) {
                          handleMobileSlotClick(index);
                        }
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        if (isMobile && isEditable && !showingGlobalRanking) {
                          handleTouchStart(e, index);
                        }
                      }}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onTouchCancel={handleTouchEnd}
                    >
                       <div className={`ranking-number ${!userHasSubmitted ? 'number-hidden' : ''}`}>
                         {index + 1}
                       </div>
                       <img
                          src={contestant.imageUrl || "/images/placeholder.jpg"}
                          className={`contestant-image ${contestant.isSeason ? 'season-logo' : ''}`}
                          draggable="false"
                       />
                       <div className={`${contestant.isSeason ? "season-name" : "contestant-name"} ${contestant.isEmpty ? 'empty-name' : ''}`} 
                            style={{ color: contestant.isEmpty ? '#999' : '#000000' }}>
                          {contestant.isEmpty ? 
                            (isMobile ? "tap to vote!" : contestant.name) :
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
                         <div 
                           className="remove-button-wrapper"
                           onClick={(e) => {
                             e.preventDefault();
                             e.stopPropagation();
                             handleRemoveContestant(index);
                           }}
                           onTouchStart={(e) => {
                             e.preventDefault();
                             e.stopPropagation();
                             handleRemoveContestant(index);
                           }}
                         >
                           <button className="remove-contestant-button">
                             &times;
                           </button>
                         </div>
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

        {/* --- ADDED COMMENTS SECTION --- */}
        <div className="comments-section">
          <h3 className="comments-title">Discussion</h3>
          
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
                 <span className="char-count">{500 - newComment.length}</span>
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
              Please <button onClick={() => navigate('/login')} className="inline-login-button">log in</button> to join the discussion.
            </div>
          )}
          
          {/* Comments List */}
          {loadingComments ? (
            <div className="loading-comments">Loading comments...</div>
          ) : comments.length === 0 ? (
            <div className="no-comments">No comments yet. Be the first!</div>
          ) : (
            <div className="comments-list">
              {comments
                .filter(comment => !comment.parentId) // Only top-level comments
                .map(comment => {
                  const replies = comments.filter(reply => reply.parentId === comment.id)
                                      .sort((a, b) => (a.createdAt?.toDate() || 0) - (b.createdAt?.toDate() || 0)); // Sort replies ascending
                  
                  return (
                    <div key={comment.id} className="comment-item">
                      <div className="comment-header">
                        {/* Conditionally render image */}
                        {commentAuthorProfilePics[comment.userId] && (
                          <img 
                            src={commentAuthorProfilePics[comment.userId]} // Use the fetched URL
                            alt={`${comment.userName || 'User'}'s avatar`}
                            className="comment-author-avatar"
                          />
                        )}
                        <span className="comment-author">
                           {/* Add link to user profile later if needed */} 
                           {comment.userName}
                        </span>
                        <span className="comment-date">{formatCommentDate(comment.createdAt)}</span>
                      </div>
                      <div className="comment-content">{comment.text}</div>
                      <div className="comment-footer">
                        <div className="comment-actions-group">
                           <div className="comment-votes">
                              <button 
                                 className={`comment-vote upvote ${hasUserUpvotedComment(comment) ? 'voted' : ''}`}
                                 onClick={() => handleCommentVote(comment.id, 'upvote')}
                                 disabled={!user} title={!user ? "Log in to vote" : "Upvote"}
                              >▲</button>
                              <span className="vote-count">{getVoteCount(comment)}</span>
                              <button 
                                 className={`comment-vote downvote ${hasUserDownvotedComment(comment) ? 'voted' : ''}`}
                                 onClick={() => handleCommentVote(comment.id, 'downvote')}
                                 disabled={!user} title={!user ? "Log in to vote" : "Downvote"}
                              >▼</button>
                           </div>
                           {user && (
                              <button 
                                 className="reply-button" 
                                 onClick={() => handleReplyClick(comment.id, comment.userName)}
                                 title="Reply"
                              >
                                 {replyingTo?.id === comment.id ? 'Cancel' : 'Reply'}
                              </button>
                           )}
                        </div>
                        {isCommentAuthor(comment) && (
                          <button 
                             className="delete-comment-button" 
                             onClick={() => handleDeleteComment(comment.id)}
                             title="Delete Comment"
                          ></button> // Icon handled by CSS
                        )}
                      </div>

                      {/* Reply Form */} 
                      {replyingTo?.id === comment.id && user && (
                        <div className="reply-form">
                          <textarea
                            placeholder={`Replying to ${replyingTo.userName}...`}
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            rows={2}
                            maxLength={500}
                            autoFocus
                          />
                          <div className="reply-actions">
                            <span className="char-count">{500 - replyText.length}</span>
                            <button className="cancel-reply-button" onClick={cancelReply}>Cancel</button>
                            <button 
                               className="post-reply-button" 
                               onClick={() => addComment(comment.id)} 
                               disabled={!replyText.trim()}
                            >Post Reply</button>
                          </div>
                        </div>
                      )}

                      {/* Replies */} 
                      {replies.length > 0 && (
                        <div className="comment-replies">
                          {replies.map(reply => (
                            <div key={reply.id} className="reply-item">
                              <div className="reply-header">
                                 {/* Conditionally render image */}
                                 {commentAuthorProfilePics[reply.userId] && (
                                   <img 
                                    src={commentAuthorProfilePics[reply.userId]} // Use the fetched URL
                                    alt={`${reply.userName || 'User'}'s avatar`}
                                    className="comment-author-avatar"
                                  />
                                 )}
                                 <span className="reply-author">{reply.userName}</span>
                                 <span className="reply-date">{formatCommentDate(reply.createdAt)}</span>
                              </div>
                              <div className="reply-content">{reply.text}</div>
                              <div className="reply-footer">
                                <div className="reply-votes">
                                    <button 
                                       className={`reply-vote upvote ${hasUserUpvotedComment(reply) ? 'voted' : ''}`}
                                       onClick={() => handleCommentVote(reply.id, 'upvote')}
                                       disabled={!user} title={!user ? "Log in to vote" : "Upvote"}
                                    >▲</button>
                                    <span className="vote-count">{getVoteCount(reply)}</span>
                                    <button 
                                       className={`reply-vote downvote ${hasUserDownvotedComment(reply) ? 'voted' : ''}`}
                                       onClick={() => handleCommentVote(reply.id, 'downvote')}
                                       disabled={!user} title={!user ? "Log in to vote" : "Downvote"}
                                    >▼</button>
                                </div>
                                {isCommentAuthor(reply) && (
                                  <button 
                                      className="delete-reply-button" 
                                      onClick={() => handleDeleteComment(reply.id)}
                                      title="Delete Reply"
                                  ></button> // Icon handled by CSS
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
        {/* --- END COMMENTS SECTION --- */}
      </div>
    );
  }

  // Render main listings page
  return (
    <div className="global-rankings-main-view global-rankings-page-wrapper">
      <h1 className="global-rankings-title">Global Rankings</h1>

      <div className="global-rankings-description">
        <p>
          Welcome to the Global Rankings! This page features special ranking categories that change periodically. Submit your votes for the current category to see how your choices compare to the community's overall ranking. Check back often for new ranking challenges!
        </p>
      </div>
      
      <hr className="title-separator" /> {/* ADDED SEPARATOR LINE */}

      {/* <h2 className="section-title">Current Global Ranking</h2> */} {/* REMOVED */}
      <div className="global-lists-container">
        {sampleLists.map(list => renderRankingListCard(list))}
      </div>
    </div>
  );
};

export default GlobalRankings; 