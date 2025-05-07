import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { survivorSeasons } from '../data/survivorData';
import './UserListCreator.css';
import { useNavigate, useLocation } from 'react-router-dom';
import { getCachedImageUrl } from '../utils/imageCache';

const UserListCreator = ({ 
  userList, 
  setUserList, 
  listName, 
  setListName, 
  listDescription,
  setListDescription,
  listTags, 
  setListTags, 
  user,
  editingListId,
  onCancel,
  seasonListRef,
  isMobile
}) => {
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const listRef = useRef(null);
  const [currentListId, setCurrentListId] = useState(editingListId || null);
  const navigate = useNavigate();
  const location = useLocation();
  
  // --- State/Refs for Mobile Touch Drag Reordering --- 
  const touchDragTimer = useRef(null);
  const isTouchDragging = useRef(false);
  const draggedItemIndex = useRef(null);
  const draggedItemElement = useRef(null);
  const originalBodyOverflow = useRef(document.body.style.overflow);
  const draggedItemHeight = useRef(0);
  const listItemRefs = useRef({});
  // <<< Add refs for initial touch position >>>
  const initialTouchX = useRef(0);
  const initialTouchY = useRef(0);
  const initialScrollX = useRef(0); // For scroll compensation
  const initialScrollY = useRef(0); // For scroll compensation
  const scrollAnimationRef = useRef(null); // For requestAnimationFrame
  const scrollDirectionRef = useRef(null); // For requestAnimationFrame ('up', 'down', null)
  // ----------------------------------------------

  // --- State for Desktop Drag Visual Feedback ---
  const draggedItemDesktopRef = useRef(null); // Store the element being dragged on desktop
  const draggedItemFromIndexRef = useRef(null); // Store the starting index for desktop drag
  // -------------------------------------------

  // Available tag options
  const availableTags = [
    { id: 'favorites', label: 'Favorites' },
    { id: 'social', label: 'Social' },
    { id: 'strategic', label: 'Strategic' },
    { id: 'challenge', label: 'Challenge Beasts' },
    { id: 'spoiler', label: 'Spoiler' }
  ];
  
  // Desktop scroll parameters (user-defined)
  const DESKTOP_SCROLL_THRESHOLD = 200;
  const DESKTOP_SCROLL_SPEED = 15;
  
  // <<< ADDED: Effect to load pending list data from navigation state >>>
  useEffect(() => {
    // First try to get data from location state (primary method)
    if (location.state?.pendingListData) {
      console.log('[UserListCreator] Loading pending list data from location state');
      const { name, description, tags, contestants } = location.state.pendingListData;
      setListName(name || '');
      setListDescription(description || '');
      setListTags(tags || []);
      setUserList(contestants || []);
      
      // Clear the location state after loading to prevent reload on refresh/revisit
      navigate(location.pathname, { replace: true, state: {} });
    } 
    // FALLBACK: Check sessionStorage directly if location state wasn't passed
    else {
      const postLoginActionString = sessionStorage.getItem('postLoginAction');
      if (postLoginActionString) {
        try {
          const action = JSON.parse(postLoginActionString);
          if (action.path === '/create' && action.data) {
            console.log('[UserListCreator] FALLBACK: Loading pending list data from sessionStorage');
            const { name, description, tags, contestants } = action.data;
            setListName(name || '');
            setListDescription(description || '');
            setListTags(tags || []);
            setUserList(contestants || []);
            
            // Clear from storage after loading
            sessionStorage.removeItem('postLoginAction');
          }
        } catch (error) {
          console.error('Error loading from sessionStorage:', error);
        }
      }
    }
    // Run when location state or navigate changes
  }, [location.state?.pendingListData, setListName, setListDescription, setListTags, setUserList, navigate, location.pathname]);
  
  // Load any existing draft from local storage if not editing an existing list
  useEffect(() => {
    const loadExistingDraft = async () => {
      // Only load draft if we haven't already loaded pending data or are editing
      if (!location.state?.pendingListData && user && !listName && !editingListId && userList.length === 0) {
        try {
          const userDocRef = doc(db, "userLists", user.uid);
          const userDoc = await getDoc(userDocRef);
          
          // If this user has a draft in progress, load it
          if (userDoc.exists() && userDoc.data().draft) {
            const draftData = userDoc.data().draft;
            setListName(draftData.name || '');
            setListDescription(draftData.description || '');
            setListTags(draftData.tags || []);
            setUserList(draftData.contestants || []);
          }
        } catch (error) {
          console.error("Error loading draft:", error);
        }
      }
    };
    
    loadExistingDraft();
  }, [user, setListName, setListDescription, setListTags, setUserList, listName, editingListId, userList.length, location.state?.pendingListData]);
  
  // Auto-save draft to Firestore when user makes changes
  useEffect(() => {
    // Only autosave if we're not editing an existing list
    if (editingListId) return;
    
    const autosaveDraft = async () => {
      if (user && (userList.length > 0 || listName || listDescription || listTags.length > 0)) {
        try {
          // Determine list type and add appropriate hidden tag for the draft
          const hasSeason = userList.some(item => item.isSeason);
          const listType = hasSeason ? "season-ranking" : "survivor-ranking";
          
          // Make sure the correct hidden tag is included and the other is removed
          let draftTags = [...listTags];
          
          // Remove both tags first
          draftTags = draftTags.filter(tag => tag !== "season-ranking" && tag !== "survivor-ranking");
          
          // Then add the correct one if there are contestants
          if (userList.length > 0) {
            draftTags.push(listType);
          }
          
          const userDocRef = doc(db, "userLists", user.uid);
          await setDoc(userDocRef, {
            draft: {
              name: listName,
              description: listDescription,
              tags: draftTags,
              contestants: userList,
              updatedAt: new Date().toISOString()
            }
          }, { merge: true });
        } catch (error) {
          console.error("Error autosaving draft:", error);
        }
      }
    };
    
    // Debounce autosave to avoid too many writes
    const autosaveTimer = setTimeout(autosaveDraft, 2000);
    return () => clearTimeout(autosaveTimer);
  }, [userList, listName, listDescription, listTags, user, editingListId]);
  
  // <<< ADDED: Effect to load existing list data when editingListId is provided >>>
  useEffect(() => {
    const loadListForEditing = async () => {
      // Only run if we have a user and an editingListId
      if (user && editingListId) {
        console.log(`[UserListCreator] Attempting to load list ${editingListId} for user ${user.uid}`);
        try {
          const userDocRef = doc(db, "userLists", user.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists() && userDoc.data().lists) {
            const lists = userDoc.data().lists;
            const listToEdit = lists.find(list => list.id === editingListId);
            
            if (listToEdit) {
              console.log('[UserListCreator] Found list to edit:', listToEdit.name);
              // Set the state with the loaded list data
              setListName(listToEdit.name || '');
              setListDescription(listToEdit.description || '');
              setListTags(listToEdit.tags || []);
              setUserList(listToEdit.contestants || []);
              setCurrentListId(editingListId); // Ensure internal ID state is set
            } else {
              console.error(`[UserListCreator] List with ID ${editingListId} not found for user ${user.uid}`);
              setError('Failed to load the list for editing. It may have been deleted.');
              // Optionally clear the form or navigate back
              // onCancel(); 
            }
          } else {
            console.error(`[UserListCreator] User document not found or has no lists: ${user.uid}`);
            setError('Failed to load user data for editing.');
          }
            } catch (error) {
          console.error('[UserListCreator] Error loading list for editing:', error);
          setError('An error occurred while loading the list.');
        }
      } else if (!editingListId) {
          // If editingListId becomes null/undefined (e.g., creating new after editing), clear the form
          // This might be handled by parent component state management already, but good to be safe.
          // Consider if clearListData() should be called here or rely on parent logic.
          // clearListData(); 
      }
    };
    
    loadListForEditing();
    // Dependencies: user and editingListId
  }, [user, editingListId, setListName, setListDescription, setListTags, setUserList]);
  
  const handleTagToggle = (tagId) => {
    if (listTags.includes(tagId)) {
      setListTags(listTags.filter(tag => tag !== tagId));
    } else {
      setListTags([...listTags, tagId]);
    }
  };
  
  // Add a clearList function to handle clearing the list and its details
  const clearList = () => {
    // Reset state with confirmation if list is not empty
    if (userList.length > 0 || listName || listDescription) {
      if (window.confirm("Are you sure you want to clear this list? This action cannot be undone.")) {
        clearListData();
      }
    } else {
      // No need to confirm if the list is already empty
      clearListData();
    }
  };
  
  // Helper function to clear all list data
  const clearListData = () => {
    // Clear the list and its details
    setUserList([]);
    setListName('');
    setListDescription('');
    setListTags([]);
    setError('');
    // Reset the current list ID when clearing the list
    setCurrentListId(null);
    
    // Also clear the draft in Firestore if the user is logged in
    if (user) {
      try {
        const userDocRef = doc(db, "userLists", user.uid);
        setDoc(userDocRef, { draft: null }, { merge: true });
        console.log('Cleared list and draft');
      } catch (error) {
        console.error("Error clearing draft:", error);
      }
    }
  };
  
  const handleSaveList = async () => {
    if (!listName.trim()) {
      setError('Please enter a name for your list');
      return;
    }
    
    setSaving(true);
    setError('');
    
    try {
      const userDocRef = doc(db, "userLists", user.uid);
      const userDoc = await getDoc(userDocRef);
      
      // Determine list type and add appropriate hidden tag
      const hasSeason = userList.some(item => item.isSeason);
      const listType = hasSeason ? "season-ranking" : "survivor-ranking";
      
      // Make sure only the correct list type tag is included
      const updatedListTags = [...listTags];
      
      // Remove both list type tags first
      const filteredTags = updatedListTags.filter(tag => 
        tag !== "season-ranking" && tag !== "survivor-ranking"
      );
      
      // Then add the correct one
      filteredTags.push(listType);
      
      if (currentListId) {
        // We're updating a previously created or edited list
        const existingLists = userDoc.exists() ? userDoc.data().lists || [] : [];
        const listIndex = existingLists.findIndex(list => list.id === currentListId);
        
        if (listIndex >= 0) {
          // Update the list
          const updatedList = {
            ...existingLists[listIndex],
            name: listName,
            description: listDescription,
            tags: filteredTags,
            contestants: userList,
            updatedAt: new Date().toISOString(),
            userName: user.displayName || "Unknown User",
            isPublic: true
          };
          
          existingLists[listIndex] = updatedList;
          
          await updateDoc(userDocRef, {
            lists: existingLists
          });
          sessionStorage.removeItem('listCreatorDraft'); // Clear draft after successful update
          console.log('[UserListCreator] List updated, draft cleared.');
          // Navigate to the updated list page
          navigate(`/list/${user.uid}/${currentListId}`);
          
        } else {
          setError('List not found. It may have been deleted.');
        }
      } else {
        // Creating a new list
        const existingLists = userDoc.exists() ? userDoc.data().lists || [] : [];
        
        // Create new list object with a unique ID
        const newListId = `list_${Date.now()}`;
        const newList = {
          id: newListId,
          name: listName,
          description: listDescription,
          tags: filteredTags,
          contestants: userList,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          upvotes: [],
          userName: user.displayName || "Unknown User",
          isPublic: true
        };
        
        // Add to existing lists
        await setDoc(userDocRef, {
          lists: [...existingLists, newList],
          // Clear draft after saving
          draft: null // This clears the Firestore draft, keep it.
        }, { merge: true });
        sessionStorage.removeItem('listCreatorDraft'); // Clear draft after successful save
        console.log('[UserListCreator] New list saved, draft cleared.');
        
        // Store the ID of the newly created list
        // setCurrentListId(newListId); // No longer needed if we navigate away
        
        // Navigate to the new list page
        navigate(`/list/${user.uid}/${newListId}`);
      }
    } catch (error) {
      console.error("Error saving list:", error);
      setError('Failed to save your list. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  
  // <<< MODIFIED: This function will now ONLY handle item shifting, not scrolling >>>
  const handleDragOver = (e) => {
    if (isMobile) return;

    // Always call preventDefault and setDragOver for the list container to be a valid drop target
    // and to show visual feedback when dragging over it.
    e.preventDefault();
    e.stopPropagation(); // Good practice for nested drag/drop scenarios
    setDragOver(true);

    // Scrolling is now handled by the window event listener for desktop.

    const fromIndex = draggedItemFromIndexRef.current;
    const listContainer = listRef.current;
    const draggedElement = draggedItemDesktopRef.current;

    // Only perform item reordering visuals (shifting items) if it's an internal reorder drag.
    if (fromIndex !== null && listContainer && draggedElement) {
    const mouseY = e.clientY;
    const allListItems = Array.from(listContainer.querySelectorAll('.ranking-item'));
    
    let currentTargetIndex = userList.length; // Default to the end

    for (let i = 0; i < allListItems.length; i++) {
        const item = allListItems[i];
        if (item === draggedElement) continue; 

        const itemRect = item.getBoundingClientRect();
        
            if (mouseY < itemRect.top + itemRect.height / 2) {
            currentTargetIndex = parseInt(item.dataset.index, 10);
                break; 
            }
        }
        
    const draggedHeight = draggedElement.offsetHeight > 0 ? draggedElement.offsetHeight : 50;

    allListItems.forEach((item) => {
          if (item === draggedElement) return; 
      
      const itemIndex = parseInt(item.dataset.index, 10);
      let transformY = 0;

          if (fromIndex < currentTargetIndex) { 
         if (itemIndex > fromIndex && itemIndex < currentTargetIndex) {
            transformY = -draggedHeight;
         }
          } else if (fromIndex > currentTargetIndex) { 
         if (itemIndex >= currentTargetIndex && itemIndex < fromIndex) {
            transformY = draggedHeight;
         }
      }
      item.style.transform = `translateY(${transformY}px)`;
    });
    } 
    // If not an internal reorder (e.g., external item), the item shifting logic above is skipped,
    // but e.preventDefault() has been called, allowing the drop.
  };
  
  const handleDragLeave = () => {
    if (isMobile) return;
    setDragOver(false);
    // Clear transforms only if we are truly leaving the list container 
    // (handleDragOver will reset transforms for other items if needed)
    // We might need a more robust way to detect leaving vs moving between items
    // For now, rely on dragend/drop for definitive cleanup
    // clearItemTransforms(); // Maybe remove this to prevent flicker
     console.log('[DragLeave] Fired');
    // Resetting fromIndex here might be premature if leaving temporarily
    // draggedItemFromIndexRef.current = null; 
  };

  // Function to clear transforms from list items
  const clearItemTransforms = () => {
     console.log('Clearing item transforms');
     const listContainer = listRef.current;
     if (listContainer) {
        const allItems = listContainer.querySelectorAll('.ranking-item');
        allItems.forEach(item => {
          if (item.style.transform) { // Only log if transform was set
             // console.log(`  Clearing transform from item ${item.dataset.index}`);
             item.style.transform = ''; 
          }
        });
     }
  }
  
  // <<< NEW: Handler for window dragover to manage scrolling the list >>>
  const handleWindowDragOverForScroll = (e) => {
    if (draggedItemFromIndexRef.current === null || !listRef.current || isMobile) {
      return; // Not a desktop drag from our component, or list isn't ready
    }
    
    e.preventDefault(); // Crucial to allow drop events on potential targets

    const mouseY = e.clientY;

    if (mouseY < DESKTOP_SCROLL_THRESHOLD) {
      listRef.current.scrollTop -= DESKTOP_SCROLL_SPEED;
    } else if (mouseY > window.innerHeight - DESKTOP_SCROLL_THRESHOLD) {
      listRef.current.scrollTop += DESKTOP_SCROLL_SPEED;
    }
  };

  // <<< NEW: Function to remove window listeners >>>
  const removeDesktopWindowListeners = () => {
    window.removeEventListener('dragover', handleWindowDragOverForScroll);
    window.removeEventListener('drop', removeDesktopWindowListeners);
    window.removeEventListener('dragend', removeDesktopWindowListeners);
    console.log('[Desktop Drag] Removed window scroll listeners');
  };
  
  // Make list items draggable for reordering
  const handleItemDragStart = (e, index) => {
    if (isMobile) return;
    console.log('Starting desktop drag for item at index:', index);
    e.dataTransfer.setData('application/reorder', index.toString()); // Keep for drop check
    e.dataTransfer.effectAllowed = "move";
    e.target.classList.add('dragging-item');
    draggedItemDesktopRef.current = e.target; 
    draggedItemFromIndexRef.current = index; // Store the starting index in the ref

    // <<< ADDED: Attach window listeners for desktop scroll >>>
    window.addEventListener('dragover', handleWindowDragOverForScroll);
    window.addEventListener('drop', removeDesktopWindowListeners);
    window.addEventListener('dragend', removeDesktopWindowListeners);
    console.log('[Desktop Drag] Added window scroll listeners');
  };
  
  const handleItemDragEnd = (e) => {
    if (isMobile) return;
    console.log('Desktop drag ended');

    // <<< ADDED: Ensure window listeners are removed >>>
    removeDesktopWindowListeners();

    if(e.target && e.target.classList) {
    e.target.classList.remove('dragging-item');
    }
    clearItemTransforms(); // Ensure transforms are cleared
    draggedItemDesktopRef.current = null;
    draggedItemFromIndexRef.current = null; // Reset start index ref
    setDragOver(false); 
  };
  
  const handleDrop = (e) => {
    console.log('Drop event started');
    e.preventDefault();
    e.stopPropagation();
    clearItemTransforms(); // Clear visual transforms first
    setDragOver(false);
    
    const fromIndex = draggedItemFromIndexRef.current; // Get start index from ref
    const reorderCheck = e.dataTransfer.getData('application/reorder'); // Confirm it was a reorder

    // Reset refs immediately after getting necessary data
    draggedItemDesktopRef.current = null;
    draggedItemFromIndexRef.current = null;

    try {
      // --- Handle Reorder Drop --- 
      if (fromIndex !== null && reorderCheck === fromIndex.toString()) {
        console.log(`Handling reorder drop. Started from index: ${fromIndex}`);
        
        // Recalculate target index based on final drop position (like handleTouchEnd)
        let targetIndex = -1;
        const listContainer = listRef.current;
        if (listContainer) {
          const listRect = listContainer.getBoundingClientRect();
          const mouseY = e.clientY;
          const allListItems = Array.from(listContainer.querySelectorAll('.ranking-item'));

          let closestItemIndex = -1;
          let minDistance = Infinity;

          // Calculate closest based on final mouse position
          for (let i = 0; i < allListItems.length; i++) {
             const item = allListItems[i];
             // No need to exclude the dropped item here as we check its final position
             const itemRect = item.getBoundingClientRect();
             const itemCenterY = itemRect.top + itemRect.height / 2;
             const distance = Math.abs(mouseY - itemCenterY);
             if (distance < minDistance) {
               minDistance = distance;
               closestItemIndex = i;
             }
          }

          if (closestItemIndex !== -1) {
              const closestItem = allListItems[closestItemIndex];
              if (closestItem) {
                  const closestItemRect = closestItem.getBoundingClientRect();
                  const closestItemCenterY = closestItemRect.top + closestItemRect.height / 2;
                  targetIndex = (mouseY < closestItemCenterY) ? closestItemIndex : closestItemIndex + 1;
                  // Adjust target index based on original position *before* splice
                  if (targetIndex > fromIndex) {
                      // If dropping after the original position, the effective target index
                      // in the list *before* removing the item might need adjustment.
                      // However, since we splice *then* insert, using the raw calculated
                      // targetIndex relative to the original list might be correct.
                      // Let's try without adjustment first.
                  } else if (targetIndex > fromIndex) {
                      // Correction: If target > from, the insertion point should be targetIndex-1 
                      // AFTER the splice. Let's recalculate insertIndex later.
                  }
              } else { targetIndex = userList.length; } // Fallback if item not found
          } else { targetIndex = userList.length; } // Fallback if no closest found
          
          // Clamp index
          targetIndex = Math.max(0, Math.min(targetIndex, userList.length));
          console.log(`Recalculated Drop Target Index: ${targetIndex}`);

        } else {
            console.error("Drop failed: listContainer ref is null");
            return; // Cannot proceed without list container
        }

        // Determine the actual insertion index *after* the splice
        let insertIndex = targetIndex;
        if (fromIndex < targetIndex) {
            insertIndex = targetIndex - 1;
        }
        insertIndex = Math.max(0, Math.min(insertIndex, userList.length -1)); // Clamp insert index

        console.log(`Final Reorder: from ${fromIndex} to insert at ${insertIndex} (target: ${targetIndex})`);

        if (fromIndex === insertIndex) {
           console.log("Dropped at the same effective index, no reorder needed.");
           return;
        }

        // Perform the list update
          const newList = [...userList];
          const [movedItem] = newList.splice(fromIndex, 1);
        newList.splice(insertIndex, 0, movedItem);
          setUserList(newList);
        console.log('Reorder successful');
        return; // Handled reorder, exit
      }
      
      // --- Handle Drop from Season List (Existing Logic - slightly modified) --- 
      console.log('Handling drop from external source (Season List)');
      let droppedItemData;
      const jsonData = e.dataTransfer.getData('application/json');
      const textData = e.dataTransfer.getData('text/plain');
      const dataSource = e.dataTransfer.getData('source');
      
      if (jsonData) {
        try { droppedItemData = JSON.parse(jsonData); } catch (err) { console.error('Failed to parse JSON data:', err); }
      } else if (textData) {
        try { droppedItemData = JSON.parse(textData); } catch (err) { console.error('Failed to parse text data:', err); }
      }
      
      if (!droppedItemData) {
        console.error('Drop failed: No valid data found');
        return;
      }
      
      // Calculate dropIndex for external item (simplified)
      let dropIndex = userList.length; 
      const listContainer = listRef.current;
      if (listContainer) {
          const listRect = listContainer.getBoundingClientRect();
        const mouseY = e.clientY;
          const allListItems = Array.from(listContainer.querySelectorAll('.ranking-item'));
          for (let i = 0; i < allListItems.length; i++) {
              const item = allListItems[i];
          const rect = item.getBoundingClientRect();
          const itemCenter = rect.top + rect.height / 2;
          if (mouseY < itemCenter) {
            dropIndex = i;
            break;
          }
        }
      }
      dropIndex = Math.max(0, Math.min(dropIndex, userList.length));
      console.log(`Calculated drop index for external item: ${dropIndex}`);

      // Existing type checks and add logic...
      const isSeason = droppedItemData.isSeason || dataSource === 'season-grid';
      const hasSeasons = userList.some(item => item.isSeason);
      const hasContestants = userList.some(item => !item.isSeason);

      if (userList.length > 0) {
      if (hasSeasons && !isSeason) {
              setError('Cannot mix seasons and contestants.'); setTimeout(() => setError(''), 3000); return;
      }
      if (hasContestants && isSeason) {
              setError('Cannot mix contestants and seasons.'); setTimeout(() => setError(''), 3000); return;
          }
      }
      const isAlreadyInList = userList.some(item => item.id === droppedItemData.id);
      if (isAlreadyInList) {
          console.log('Item already in list'); return;
      }
      
      const newList = [...userList];
      newList.splice(dropIndex, 0, droppedItemData);
      setUserList(newList);
      console.log('Added external item successfully');

    } catch (error) {
      console.error('Error handling drop:', error);
    } finally {
        // Ensure cleanup happens regardless of success/error
        console.log('Executing drop finally block');
        clearItemTransforms(); 
        setDragOver(false);
        // Reset refs if not already reset
        if (draggedItemDesktopRef.current) draggedItemDesktopRef.current = null;
        if (draggedItemFromIndexRef.current !== null) draggedItemFromIndexRef.current = null;
    }
  };
  
  const handleRemoveContestant = (index, e) => {
    // Stop event propagation to prevent the parent container's click handler from firing
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    const newList = [...userList];
    const removedItem = newList.splice(index, 1)[0];
    setUserList(newList);
    
    // Check if we need to update the list type tags
    if (newList.length > 0) {
      const wasRemovingSeason = removedItem.isSeason;
      const hasRemainingSeasons = newList.some(item => item.isSeason);
      const hasRemainingContestants = newList.some(item => !item.isSeason);
      
      // Update tags if needed
      if (wasRemovingSeason && !hasRemainingSeasons) {
        // We removed the last season, switch to contestant ranking
        const updatedTags = listTags.filter(tag => tag !== 'season-ranking');
        if (!updatedTags.includes('survivor-ranking')) {
          updatedTags.push('survivor-ranking');
        }
        setListTags(updatedTags);
      } else if (!wasRemovingSeason && !hasRemainingContestants) {
        // We removed the last contestant, switch to season ranking
        const updatedTags = listTags.filter(tag => tag !== 'survivor-ranking');
        if (!updatedTags.includes('season-ranking')) {
          updatedTags.push('season-ranking');
        }
        setListTags(updatedTags);
      }
    }
    
    console.log('Removed contestant at index', index);
  };
  
  // Handler for when user wants to exit the list creator
  const handleCancel = () => {
    // Clear the list data before exiting
    clearListData();
    // Reset the current list ID
    setCurrentListId(null);
    // Navigate back to My Lists page
    navigate('/mylists');
  };
  
  // Function to toggle the seasons menu on mobile
  const toggleSeasonsMenuMobile = () => {
    if (isMobile) {
      // Check if we're in create/edit mode
      if (document.body.getAttribute('data-page') === 'create') {
        document.body.classList.toggle('show-seasons-mobile');
      }
    }
  };

  // Handle click on the ranking list container for mobile
  const handleRankingListClick = (e) => {
    if (isMobile) {
      // Use the seasonListRef to show the menu
      if (seasonListRef && seasonListRef.current) {
        console.log('Showing season menu from ranking list click');
        seasonListRef.current.showMenu();
      } else {
        console.error('seasonListRef is not available');
      }
    }
  };

  // Also handle background click to close the seasons menu
  useEffect(() => {
    if (isMobile) {
      const handleBackgroundClick = (e) => {
        // If we're clicking outside the seasons menu and the ranking list, close the menu
        const seasonsSection = document.querySelector('.seasons-section');
        const userRankingList = listRef.current;
        
        if (seasonsSection && userRankingList && 
            !seasonsSection.contains(e.target) && 
            !userRankingList.contains(e.target) &&
            document.body.classList.contains('show-seasons-mobile')) {
          document.body.classList.remove('show-seasons-mobile');
        }
      };
      
      document.addEventListener('click', handleBackgroundClick);
      
      return () => {
        document.removeEventListener('click', handleBackgroundClick);
      };
    }
  }, [isMobile]);

  // <<< Add useEffect to handle touchmove listener manually >>>
  useEffect(() => {
    const listElement = listRef.current;
    if (!listElement || !isMobile) return;

    const handleMove = (e) => {
      // Call the existing handleTouchMove logic
      handleTouchMove(e); 
    };

    // Add listener with passive: false
    listElement.addEventListener('touchmove', handleMove, { passive: false });
    console.log('[TouchDrag - Create] Added passive:false touchmove listener to container');

    // Cleanup function
    return () => {
      listElement.removeEventListener('touchmove', handleMove, { passive: false });
      console.log('[TouchDrag - Create] Removed touchmove listener from container');
    };
    // Rerun effect if isMobile changes or listRef becomes available
  }, [isMobile, listRef.current]); 

  // <<< REPLACED Touch Handlers (Adapted from GlobalRankings.js) >>>
  const handleTouchStart = (e, index) => {
    // Check if editing is allowed (e.g., not viewing read-only list)
    // For UserListCreator, we assume it's always editable when this component is active
    if (!isMobile) return; 

    e.stopPropagation(); // Prevent triggering parent handlers if needed
    clearTimeout(touchDragTimer.current);
    const currentTarget = e.currentTarget;
    draggedItemElement.current = currentTarget;
    
    const touch = e.touches[0];
    initialTouchX.current = touch.clientX;
    initialTouchY.current = touch.clientY;
    initialScrollX.current = window.scrollX; // Store initial scroll X
    initialScrollY.current = window.scrollY; // Store initial scroll Y

    // Start timer to initiate drag
    touchDragTimer.current = setTimeout(() => {
      isTouchDragging.current = true;
      draggedItemIndex.current = index;
      if (currentTarget) {
          draggedItemHeight.current = currentTarget.offsetHeight; // Store height
          // Apply dragging class
          currentTarget.classList.add('touch-dragging-item'); // Or a specific class for UserListCreator
      }
      // // Prevent body scroll (REMOVED - We want the page to scroll)
      // originalBodyOverflow.current = document.body.style.overflow; 
      // document.body.style.overflow = 'hidden';
      console.log('[TouchDrag - UserListCreator] Drag started after delay.');
    }, 80); // Adjusted delay from 150ms to 80ms
  };

  const handleTouchMove = (e) => {
    if (!isTouchDragging.current || !isMobile || draggedItemIndex.current === null) return;
    
    e.preventDefault(); // Prevent page scroll while dragging item

    const touch = e.touches[0];
    const listContainer = listRef.current; 
    const draggedElement = draggedItemElement.current;
    if (!touch || !listContainer || !draggedElement) return;

    // --- Auto-scroll logic for touch (using requestAnimationFrame) ---
    const scrollThreshold = 100; // Pixels from viewport edge (Adjusted from user's 1000)
    const continuousScrollSpeed = 7; // Pixels to scroll per frame (Adjusted from user's 30 for rAF)
    const touchClientY = touch.clientY; // Viewport Y coordinate of the touch

    const smoothScrollStep = () => {
      if (!scrollDirectionRef.current) {
        if (scrollAnimationRef.current) {
          cancelAnimationFrame(scrollAnimationRef.current);
          scrollAnimationRef.current = null;
        }
        return;
      }

      if (scrollDirectionRef.current === 'up') {
        window.scrollBy(0, -continuousScrollSpeed);
      } else if (scrollDirectionRef.current === 'down') {
        window.scrollBy(0, continuousScrollSpeed);
      }
      
      scrollAnimationRef.current = requestAnimationFrame(smoothScrollStep);
    };

    if (touchClientY < scrollThreshold) { // Near top of viewport
      if (scrollDirectionRef.current !== 'up') {
        scrollDirectionRef.current = 'up';
        if (!scrollAnimationRef.current) { // Start animation loop if not already running
          smoothScrollStep();
        }
      }
    } else if (touchClientY > window.innerHeight - scrollThreshold) { // Near bottom of viewport
      if (scrollDirectionRef.current !== 'down') {
        scrollDirectionRef.current = 'down';
        if (!scrollAnimationRef.current) { // Start animation loop if not already running
          smoothScrollStep();
        }
      }
    } else {
      // Finger is not in a scroll zone
      if (scrollDirectionRef.current) { // If it was scrolling
        scrollDirectionRef.current = null; // Stop scrolling direction
        // The animation loop will stop itself on the next frame when it sees direction is null
      }
    }
    // --- End auto-scroll logic ---

    // Apply transform to follow finger, compensating for page scroll
    const fingerDeltaX = touch.clientX - initialTouchX.current;
    const fingerDeltaY = touch.clientY - initialTouchY.current; 
    
    const currentScrollX = window.scrollX;
    const currentScrollY = window.scrollY;
    
    const scrollCompensateX = currentScrollX - initialScrollX.current;
    const scrollCompensateY = currentScrollY - initialScrollY.current;
    
    const transformX = fingerDeltaX + scrollCompensateX;
    const transformY = fingerDeltaY + scrollCompensateY;
    
    draggedElement.style.transform = `translate(${transformX}px, ${transformY}px) scale(1.03)`;

    // Target Index Calculation based on finger position relative to other items
    const containerRect = listContainer.getBoundingClientRect(); // Define containerRect here
    // Correctly calculate touch position relative to the scrollable content
    const touchYInContainerContent = touchClientY - containerRect.top + listContainer.scrollTop;
    
    const listItems = Array.from(listContainer.querySelectorAll('.ranking-item')); 
    
    let targetIndex = -1;
    let closestItemOriginalIndex = -1;
    let minDistance = Infinity;

    // Calculate target based on proximity to center of other items
    for (let i = 0; i < listItems.length; i++) {
        const item = listItems[i];
        // Skip the element currently being dragged
        if (item === draggedElement) continue;
        
        const itemOriginalOffsetTop = item.offsetTop; 
        const itemHeight = item.offsetHeight;
        const itemOriginalCenterY = itemOriginalOffsetTop + itemHeight / 2;
        // Use touchYInContainerContent for comparison
        const distance = Math.abs(touchYInContainerContent - itemOriginalCenterY);

        if (distance < minDistance) {
            minDistance = distance;
            closestItemOriginalIndex = i; 
        }
    }

    if (closestItemOriginalIndex !== -1) {
        const closestItem = listItems[closestItemOriginalIndex];
        const itemOriginalOffsetTop = closestItem.offsetTop;
        const itemOriginalCenterY = itemOriginalOffsetTop + closestItem.offsetHeight / 2;
        
        if (touchYInContainerContent < itemOriginalCenterY) {
            targetIndex = closestItemOriginalIndex;
        } else {
            targetIndex = closestItemOriginalIndex + 1;
        }
    } else if (listItems.length > 0) { 
        if (touchYInContainerContent < listItems[0].offsetTop + listItems[0].offsetHeight / 2) {
            targetIndex = 0; 
             } else {
            targetIndex = listItems.length; 
        }
    } else {
        targetIndex = 0; 
    }

    // --- Shift items visually --- 
    const currentDraggedIndex = draggedItemIndex.current;
    const currentDraggedHeight = draggedItemHeight.current || draggedElement.offsetHeight; // Fallback height
    const gap = 10; // Assumed gap between items from CSS

    listItems.forEach((item, index) => {
      if (item === draggedElement) {
        // Ensure transition is off for the actively moved item
        item.style.transition = 'none';
        return; // Don't shift the item being dragged
      } 

      let shiftY = 0;
      if (currentDraggedIndex === null) return;

      // Determine shift based on target insertion point and original position
      if (index >= targetIndex && index < currentDraggedIndex) {
          // Item is below target insertion, but above original position -> shift down
          shiftY = currentDraggedHeight + gap;
      } else if (index < targetIndex && index >= currentDraggedIndex) {
          // Item is above target insertion, but below original position -> shift up
          shiftY = -(currentDraggedHeight + gap);
      } else {
          // Item is unaffected by this specific drop target relative to original position
          shiftY = 0;
      }
      
      // Apply smooth transition for shifting items
      item.style.transition = 'transform 0.2s ease-in-out';
      item.style.transform = `translateY(${shiftY}px)`;
    });
  };

  const handleTouchEnd = (e) => {
    if (!isMobile || !isTouchDragging.current) { // Check isTouchDragging flag
    clearTimeout(touchDragTimer.current); 
      touchDragTimer.current = null;
      // Clear scroll animation if touch ends prematurely or not dragging
      if (scrollAnimationRef.current) {
        cancelAnimationFrame(scrollAnimationRef.current);
        scrollAnimationRef.current = null;
      }
      scrollDirectionRef.current = null;
      return; // Exit if not dragging
    }
    
    clearTimeout(touchDragTimer.current);
    touchDragTimer.current = null;
    e.stopPropagation();

    // Clear any active scroll animation when touch ends
    if (scrollAnimationRef.current) {
      cancelAnimationFrame(scrollAnimationRef.current);
      scrollAnimationRef.current = null;
    }
    scrollDirectionRef.current = null;

    const draggedElement = draggedItemElement.current;
    const startIndex = draggedItemIndex.current;

    // Reset visual styles
    if (draggedElement) {
        draggedElement.classList.remove('touch-dragging-item');
        draggedElement.style.transform = ''; 
      draggedElement.style.transition = ''; // Let CSS handle transitions again
    }
    // Reset shifts on other items
    Object.values(listItemRefs.current).forEach(el => {
       if (el && el !== draggedElement) { // Ensure el exists
         el.style.transform = '';
         el.style.transition = ''; 
       }
     });

    // // Restore body scroll (REMOVED)
    // document.body.style.overflow = originalBodyOverflow.current;

    // --- Determine Final Drop Target Index --- 
    const listContainer = listRef.current;
    let targetIndex = -1;
    if (listContainer && startIndex !== null) {
        const listRect = listContainer.getBoundingClientRect();
      // Use changedTouches as e.touches might be empty
      const lastTouch = e.changedTouches?.[0]; 
      
      if (lastTouch) {
          const finalTouchY = lastTouch.clientY;
          // Correctly calculate final touch position relative to scrollable content for targetIndex
          const finalTouchYInContainerContent = finalTouchY - listRect.top + listContainer.scrollTop;

        const listItems = Array.from(listContainer.querySelectorAll('.ranking-item'));
        
        let closestItemOriginalIndex = -1;
        let minDistance = Infinity;

          // Find closest item center logic (same as move)
        for (let i = 0; i < listItems.length; i++) {
            const item = listItems[i];
            // Use the static original position, not the potentially transformed one
            if (i === startIndex) continue; // Skip self
            const itemOriginalOffsetTop = item.offsetTop;
            const itemHeight = item.offsetHeight;
            const itemOriginalCenterY = itemOriginalOffsetTop + itemHeight / 2;
            // Use finalTouchYInContainerContent for comparison
            const distance = Math.abs(finalTouchYInContainerContent - itemOriginalCenterY);
            if (distance < minDistance) {
                minDistance = distance;
                closestItemOriginalIndex = i; 
            }
          }
          
          // Determine target index based on closest item
          if (closestItemOriginalIndex !== -1) {
            const closestItem = listItems[closestItemOriginalIndex];
            const itemOriginalOffsetTop = closestItem.offsetTop;
            const itemOriginalCenterY = itemOriginalOffsetTop + closestItem.offsetHeight / 2;
            // Use finalTouchYInContainerContent for comparison
            if (finalTouchYInContainerContent < itemOriginalCenterY) {
                targetIndex = closestItemOriginalIndex;
            } else {
                targetIndex = closestItemOriginalIndex + 1;
            }
          } else if (listItems.length > 0) {
            // Use finalTouchYInContainerContent for comparison
            if (finalTouchYInContainerContent < listItems[0].offsetTop + listItems[0].offsetHeight / 2) {
              targetIndex = 0;
                 } else {
              targetIndex = listItems.length; 
            }
        } else {
            targetIndex = 0;
          }

          // Adjust index if dragging downwards past original spot
          if (targetIndex > startIndex) {
            targetIndex--;
          }
          
    } else {
          console.log("[TouchDrag - UserListCreator End] No touch data found on touchend.");
          targetIndex = startIndex; // Fallback: No move
      }
      
      // --- Perform State Update --- 
      if (targetIndex !== -1 && targetIndex !== startIndex && startIndex !== null) {
         console.log(`[TouchDrag - UserListCreator End] Reordering: Item from index ${startIndex} to ${targetIndex}`);
         // <<< Use userList and setUserList >>>
         const itemToMove = userList[startIndex]; 
         const remainingItems = userList.filter((_, i) => i !== startIndex);
         const newList = [
            ...remainingItems.slice(0, targetIndex),
            itemToMove,
            ...remainingItems.slice(targetIndex)
         ];
         setUserList(newList); // Update the state
      } else {
         console.log(`[TouchDrag - UserListCreator End] Drop occurred but target index (${targetIndex}) is same as start (${startIndex}) or invalid. No reorder.`);
      }
    } else {
      console.log("[TouchDrag - UserListCreator End] List element or start index missing.");
    }

    // Final state reset
    isTouchDragging.current = false;
    draggedItemIndex.current = null;
    draggedItemElement.current = null; 
    initialTouchX.current = 0;
    initialTouchY.current = 0;
  };
  // --- End REPLACED Handlers --- 

  // <<< Keep existing useEffect for Desktop DragOver Listener >>>
  useEffect(() => {
    const listElement = listRef.current;
    if (isMobile || !listElement) return; // Only for desktop and if element exists

    const handleDirectDragOver = (e) => {
        // Call the existing handler logic
        handleDragOver(e); 
    };

    console.log('[Desktop Drag] Adding dragover listener to list container');
    listElement.addEventListener('dragover', handleDirectDragOver);

    // Cleanup function
    return () => {
      console.log('[Desktop Drag] Removing dragover listener from list container');
      if (listElement) { // Check again in case element is gone before cleanup
        listElement.removeEventListener('dragover', handleDirectDragOver);
      }
    };
    // Rerun effect if isMobile changes or listRef becomes available
  }, [isMobile, listRef.current]); // Dependency on listRef.current ensures it re-runs if ref changes
  
  return (
    <div className="user-list-creator">
      <h2 className="section-title">
        {editingListId ? 'Edit Ranking' : 'Create New Ranking'}
      </h2>
      
      <div className="list-details">
        <div className="list-name-input">
          <label htmlFor="list-name">List Name</label>
          <input
            id="list-name"
            type="text"
            value={listName}
            onChange={(e) => setListName(e.target.value)}
            placeholder="My Survivor Ranking"
            maxLength={50}
          />
        </div>
        
        <div className="list-description-input">
          <label htmlFor="list-description">List Description</label>
          <textarea
            id="list-description"
            value={listDescription}
            onChange={(e) => setListDescription(e.target.value)}
            placeholder="Enter a description for your list"
            maxLength={200}
          />
        </div>
        
        <div className="spoiler-tip">
          <span className="tip-icon">💡</span>
          <span className="tip-text">Tip: Add the "Spoiler" tag if your list contains potential spoilers for viewers who haven't watched all seasons.</span>
        </div>
        
        <div className="list-tags">
          <label>Tags (Optional)</label>
          <div className="tags-container">
            {availableTags.map(tag => (
              <button
                key={tag.id}
                className={`tag-button ${listTags.includes(tag.id) ? 'active' : ''}`}
                onClick={() => handleTagToggle(tag.id)}
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      <div className="user-ranking-container">
        <h3>Your Ranking</h3>
        <p className="instructions">
          {isMobile ? 
            "Tap below to open the seasons menu, then drag contestants to build your ranking" : 
            "Drag contestants from the seasons list on the right to build your ranking below"
          }
        </p>
        
        <div 
          ref={listRef}
          className={`user-ranking-list ${dragOver ? 'drag-over' : ''}`}
          style={{ minHeight: userList.length ? 'auto' : '200px' }}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleRankingListClick}
        >
          {userList.length === 0 ? (
            <div className="empty-list-message">
              {isMobile ? 
                "Tap here to open the seasons menu and start adding contestants!" : 
                "Your list is empty. Start adding contestants / seasons by dragging them here!"
              }
            </div>
          ) : (
            userList.map((contestant, index) => (
              <div 
                key={`${contestant.id}-${index}`} 
                className="ranking-item"
                draggable={!isMobile}
                onDragStart={!isMobile ? (e) => handleItemDragStart(e, index) : undefined}
                onDragEnd={!isMobile ? handleItemDragEnd : undefined}
                onTouchStart={isMobile ? (e) => handleTouchStart(e, index) : undefined}
                onTouchEnd={isMobile ? handleTouchEnd : undefined}
                data-index={index}
              >
                <div className="ranking-number">{index + 1}</div>
                <img
                  src={getCachedImageUrl(contestant.id)}
                  alt={contestant.name}
                  className={`contestant-image ${contestant.isSeason ? 'season-logo' : ''}`}
                  draggable={false}
                />
                <div className={contestant.isSeason ? "season-name" : "contestant-name"}>
                  {contestant.isSeason 
                    ? contestant.name.replace('Survivor: ', '').replace('Survivor ', '') 
                    : contestant.name}
                </div>
                <button 
                  className="remove-contestant-button" 
                  onClick={(e) => handleRemoveContestant(index, e)}
                  title="Remove from list"
                >
                  &times;
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      
      <div className="list-actions">
        <button onClick={clearList} className="clear-button" disabled={saving}>
          Clear List
          </button>
        {user ? ( // Check if user is logged in
           <button onClick={handleSaveList} className="save-button" disabled={saving}>
             {saving ? 'Saving...' : (currentListId ? 'Update List' : 'Save List')}
          </button>
        ) : (
          <button 
             onClick={() => {
               // Create the action object with path and data
               const postLoginAction = {
                 action: 'loadPendingList', // Identify the action
                 path: '/create',          // Target path
                 data: {                  // The data needed on the target page
                   name: listName,
                   description: listDescription,
                   tags: listTags,
                   contestants: userList
                 }
               };
               try {
                 // Store the entire action object in sessionStorage
                 sessionStorage.setItem('postLoginAction', JSON.stringify(postLoginAction));
                 console.log('Saved post-login action to sessionStorage:', postLoginAction);
               } catch (error) {
                 console.error('Error saving post-login action:', error);
                 // Optionally clear storage if saving failed partially
                 sessionStorage.removeItem('postLoginAction'); 
               }
               // Navigate to login page
               navigate('/login');
             }}
             className="login-to-save-button"
           >
             Sign in to Save
           </button>
        )}
        <button onClick={handleCancel} className="cancel-button" disabled={saving}>
            Cancel
          </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {saveSuccess && <div className="success-message">List saved successfully!</div>}
    </div>
  );
};

export default UserListCreator; 
 
 
 
 