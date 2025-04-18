import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { getContestantImageUrl, getSeasonLogoUrl } from '../firebase';
import { survivorSeasons } from '../data/survivorData';
import './UserListCreator.css';
import { useNavigate } from 'react-router-dom';
import SeasonList from './SeasonList';

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
  const [contestantImageUrls, setContestantImageUrls] = useState({});
  const [currentListId, setCurrentListId] = useState(editingListId || null);
  const navigate = useNavigate();
  
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
  // ----------------------------------------------

  // Available tag options
  const availableTags = [
    { id: 'favorites', label: 'Favorites' },
    { id: 'social', label: 'Social' },
    { id: 'strategic', label: 'Strategic' },
    { id: 'challenge', label: 'Challenge Beasts' },
    { id: 'spoiler', label: 'Spoiler' }
  ];
  
  // Load any existing draft from local storage if not editing an existing list
  useEffect(() => {
    const loadExistingDraft = async () => {
      if (user && !listName && !editingListId && userList.length === 0) {
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
  }, [user, setListName, setListDescription, setListTags, setUserList, listName, editingListId, userList.length]);
  
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
  
  // Load image URLs for contestants in the list
  useEffect(() => {
    const loadImages = async () => {
      if (userList.length === 0) return;
      
      const newImageUrls = { ...contestantImageUrls };
      
      for (const contestant of userList) {
        if (!contestantImageUrls[contestant.id] && !contestant.isSeason) {
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
            } catch (error) {
              console.error(`Error loading image for ${contestant.name}:`, error);
              newImageUrls[contestant.id] = '/images/placeholder.jpg';
            }
          }
        } else if (!contestantImageUrls[contestant.id] && contestant.isSeason) {
          try {
            const url = await getSeasonLogoUrl(contestant.id);
            newImageUrls[contestant.id] = url;
          } catch (error) {
            console.error(`Error loading logo for season ${contestant.id}:`, error);
            newImageUrls[contestant.id] = '/images/placeholder.jpg';
          }
        }
      }
      
      setContestantImageUrls(newImageUrls);
    };
    
    loadImages();
  }, [userList]);
  
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
    setContestantImageUrls({});
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
          
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
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
          draft: null
        }, { merge: true });
        
        // Store the ID of the newly created list
        setCurrentListId(newListId);
        
        setSaveSuccess(true);
        setTimeout(() => {
          setSaveSuccess(false);
          // Don't clear the form after saving - let the user continue editing the list
        }, 3000);
      }
    } catch (error) {
      console.error("Error saving list:", error);
      setError('Failed to save your list. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  
  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
    console.log('Drag over user list');
  };
  
  const handleDragLeave = () => {
    setDragOver(false);
    console.log('Drag left user list');
  };
  
  // Make list items draggable for reordering
  const handleItemDragStart = (e, index) => {
    console.log('Starting to drag item at index:', index);
    e.dataTransfer.setData('application/reorder', index.toString());
    e.target.classList.add('dragging-item');
  };
  
  const handleItemDragEnd = (e) => {
    e.target.classList.remove('dragging-item');
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    
    console.log('Drop event on user list');
    
    try {
      // Check if this is a reordering operation
      const reorderIndex = e.dataTransfer.getData('application/reorder');
      
      if (reorderIndex && reorderIndex !== '') {
        // This is a reordering operation
        const fromIndex = parseInt(reorderIndex, 10);
        
        // Calculate target index (approximate position by mouse position)
        let targetIndex;
        
        if (listRef.current) {
          const listRect = listRef.current.getBoundingClientRect();
          const mouseY = e.clientY - listRect.top;
          const itemHeight = listRect.height / (userList.length || 1);
          targetIndex = Math.floor(mouseY / itemHeight);
          
          // Ensure index is within bounds
          targetIndex = Math.max(0, Math.min(targetIndex, userList.length - 1));
          
          console.log('Reordering from', fromIndex, 'to', targetIndex);
          
          // Reorder the list
          const newList = [...userList];
          const [movedItem] = newList.splice(fromIndex, 1);
          newList.splice(targetIndex, 0, movedItem);
          setUserList(newList);
        }
        return;
      }
      
      // Try to get data in different formats
      let droppedItemData;
      const jsonData = e.dataTransfer.getData('application/json');
      const textData = e.dataTransfer.getData('text/plain');
      const dataSource = e.dataTransfer.getData('source');
      
      if (jsonData) {
        droppedItemData = JSON.parse(jsonData);
      } else if (textData) {
        try {
          droppedItemData = JSON.parse(textData);
        } catch (err) {
          console.error('Failed to parse text data:', err);
        }
      }
      
      if (!droppedItemData) {
        console.error('No valid data found in the drop');
        return;
      }
      
      // Determine if the dropped item is a season or contestant
      const isSeason = droppedItemData.isSeason || dataSource === 'season-grid';
      
      console.log('Dropped item data:', droppedItemData);
      console.log('Is a season:', isSeason);
      
      // Check existing list type (season or contestant)
      const hasSeasons = userList.some(item => item.isSeason);
      const hasContestants = userList.some(item => !item.isSeason);
      
      // Calculate drop index based on mouse position
      let dropIndex = userList.length; // Default to end of list
      
      if (listRef.current && userList.length > 0) {
        const listRect = listRef.current.getBoundingClientRect();
        const listItems = Array.from(listRef.current.querySelectorAll('.ranking-item'));
        const mouseY = e.clientY;
        
        // Find the nearest item based on mouse position
        for (let i = 0; i < listItems.length; i++) {
          const item = listItems[i];
          const rect = item.getBoundingClientRect();
          const itemCenter = rect.top + rect.height / 2;
          
          if (mouseY < itemCenter) {
            dropIndex = i;
            break;
          }
        }
      }
      
      // If the list is empty, any type is allowed
      if (userList.length === 0) {
        // Add the item to the empty list at position 0
        setUserList([droppedItemData]);
        console.log('Added item to empty list:', droppedItemData);
        return;
      }
      
      // If the list already has seasons, only allow seasons
      if (hasSeasons && !isSeason) {
        setError('This ranking contains seasons. You cannot mix seasons and contestants in the same list.');
        setTimeout(() => setError(''), 3000);
        return;
      }
      
      // If the list already has contestants, only allow contestants
      if (hasContestants && isSeason) {
        setError('This ranking contains contestants. You cannot mix contestants and seasons in the same list.');
        setTimeout(() => setError(''), 3000);
        return;
      }
      
      // Check if item is already in the list
      const isAlreadyInList = userList.some(
        item => item.id === droppedItemData.id
      );
      
      if (isAlreadyInList) {
        console.log('Item already in list, not adding duplicate');
        return;
      }
      
      // <<< ADD LIST LENGTH CHECK HERE >>>
      if (userList.length >= 10) {
        setError('You can only rank up to 10 items.');
        setTimeout(() => setError(''), 3000);
        console.error("Error: Cannot add more than 10 items via drop.");
        return; // Stop if the list is already full
      }
      
      // Add item to list at the calculated drop position
      const newList = [...userList];
      newList.splice(dropIndex, 0, droppedItemData);
      setUserList(newList);
      console.log('Added item to list at position', dropIndex, '. New list:', newList);
    } catch (error) {
      console.error('Error handling drop:', error);
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
  }, [isMobile, listRef]); 

  // <<< Update handleTouchStart >>>
  const handleTouchStart = (e, index) => {
    if (!isMobile) return; 

    e.stopPropagation(); 
    clearTimeout(touchDragTimer.current);
    const currentTarget = e.currentTarget;
    draggedItemElement.current = currentTarget;
    
    // <<< Record initial touch position for movement calculation >>>
    const touch = e.touches[0];
    initialTouchX.current = touch.clientX;
    initialTouchY.current = touch.clientY;

    touchDragTimer.current = setTimeout(() => {
      isTouchDragging.current = true;
      draggedItemIndex.current = index;
      if (currentTarget) {
          draggedItemHeight.current = currentTarget.offsetHeight; 
          currentTarget.classList.add('touch-dragging-item');
          // Note: Scale transform is now applied dynamically in handleTouchMove
      }
      originalBodyOverflow.current = document.body.style.overflow; 
      document.body.style.overflow = 'hidden';
      console.log('[TouchDrag - Create] Drag started. Initial Touch Y:', initialTouchY.current);
    }, 300); 
  };

  // <<< Update handleTouchMove >>>
  const handleTouchMove = (e) => {
    if (!isTouchDragging.current || !isMobile || draggedItemIndex.current === null) return;
    
    e.preventDefault(); 

    const touch = e.touches[0];
    const listContainer = listRef.current; 
    const draggedElement = draggedItemElement.current;
    if (!touch || !listContainer || !draggedElement) return;

    // Apply transform to follow finger (existing logic)
    const deltaX = touch.clientX - initialTouchX.current;
    const deltaY = touch.clientY - initialTouchY.current;
    draggedElement.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.03)`;

    // --- Target Index Calculation using offsetTop --- 
    const touchY = touch.clientY;
    const listRect = listContainer.getBoundingClientRect();
    const touchRelativeToContainer = touchY - listRect.top;
    const listItems = Array.from(listContainer.querySelectorAll('.ranking-item'));
    
    let targetIndex = -1;
    let closestItemOriginalIndex = -1;
    let minDistance = Infinity;

    // Find item whose original center is closest to the touch point
    for (let i = 0; i < listItems.length; i++) {
        const item = listItems[i];
        if (item === draggedElement) continue; // Skip self
        
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
    
    // Determine target index based on touch relative to closest item's original center
    if (closestItemOriginalIndex !== -1 && closestItemOriginalIndex < listItems.length) {
        const closestItem = listItems.find(item => parseInt(item.dataset.index, 10) === closestItemOriginalIndex);
        if (closestItem) {
            const closestItemOriginalOffsetTop = closestItem.offsetTop;
            const closestItemHeight = closestItem.offsetHeight;
            const closestItemOriginalCenterY = closestItemOriginalOffsetTop + closestItemHeight / 2;
            
            // Use the original center for comparison
            targetIndex = (touchRelativeToContainer < closestItemOriginalCenterY) ? closestItemOriginalIndex : closestItemOriginalIndex + 1;
        } else {
             // Fallback: Use previous simpler calculation if item not found (shouldn't happen)
             const draggedHeight = draggedItemHeight.current;
             if (draggedHeight > 0) {
                targetIndex = Math.max(0, Math.min(Math.floor(touchRelativeToContainer / draggedHeight), userList.length));
             } else {
                 targetIndex = 0;
             }
             console.warn("[TouchDrag - Move] Could not find closest item by index for offsetTop calc.");
        }
    } else {
        // If no closest item (e.g., list has only the dragged item, or calculation issue)
        // Fallback to simple calculation
        const draggedHeight = draggedItemHeight.current;
         if (draggedHeight > 0) {
            targetIndex = Math.max(0, Math.min(Math.floor(touchRelativeToContainer / draggedHeight), userList.length));
         } else {
             targetIndex = 0;
         }
        console.log("[TouchDrag - Move] No specific closest item for offsetTop calc.");
    }
    
    // Clamp final index
    targetIndex = Math.max(0, Math.min(targetIndex, userList.length));
    // console.log(`[TouchDrag - Move] Start: ${draggedItemIndex.current}, Target: ${targetIndex}, Closest Original Idx: ${closestItemOriginalIndex}`);

    // --- Apply Transforms to Create Gap AND Fill Origin (Existing Logic) --- 
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

  // <<< Update handleTouchEnd >>>
  const handleTouchEnd = (e) => {
    clearTimeout(touchDragTimer.current); 
    const wasDragging = isTouchDragging.current;
    const draggedElement = draggedItemElement.current; // Keep reference

    // --- Clear Transforms and Styles --- 
    const listContainer = listRef.current; 
    if(listContainer) {
        const allItems = listContainer.querySelectorAll('.ranking-item');
        allItems.forEach(item => {
          item.style.transform = ''; // Clear transforms from other items
        });
    }
    if (draggedElement) {
        draggedElement.classList.remove('touch-dragging-item');
        // <<< Clear transform from the dragged item itself >>>
        draggedElement.style.transform = ''; 
    }
    if (document.body.style.overflow === 'hidden') {
        document.body.style.overflow = originalBodyOverflow.current;
    }
    // --- End Clear Transforms --- 

    // Exit if not actually dragging
    if (!wasDragging || !isMobile) {
      // ... (reset refs including initialTouchX/Y) ...
      isTouchDragging.current = false;
      draggedItemIndex.current = null;
      draggedItemElement.current = null;
      draggedItemHeight.current = 0;
      initialTouchX.current = 0;
      initialTouchY.current = 0;
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();

    const touch = e.changedTouches[0]; 
    let targetIndex = -1; // Default to invalid
    
    // --- Target Index Calculation using offsetTop --- 
    if (touch && listContainer) { 
        const listRect = listContainer.getBoundingClientRect();
        const touchY = touch.clientY;
        const touchRelativeToContainer = touchY - listRect.top;
        const listItems = Array.from(listContainer.querySelectorAll('.ranking-item'));
        
        let closestItemOriginalIndex = -1;
        let minDistance = Infinity;

        for (let i = 0; i < listItems.length; i++) {
            const item = listItems[i];
            // Allow comparing against the final position of the item being dropped
            // if (item === draggedElement) continue; 
            
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
                 const draggedHeight = draggedItemHeight.current;
                 if (draggedHeight > 0) {
                    targetIndex = Math.max(0, Math.min(Math.floor(touchRelativeToContainer / draggedHeight), userList.length));
                 } else {
                     targetIndex = draggedItemIndex.current !== null ? draggedItemIndex.current : 0;
                 }
                 console.warn("[TouchDrag - End] Could not find closest item by index for offsetTop calc.");
            }
        } else {
             const draggedHeight = draggedItemHeight.current;
             if (draggedHeight > 0) {
                targetIndex = Math.max(0, Math.min(Math.floor(touchRelativeToContainer / draggedHeight), userList.length));
             } else {
                 targetIndex = draggedItemIndex.current !== null ? draggedItemIndex.current : 0;
             }
            console.log("[TouchDrag - End] No specific closest item for offsetTop calc.");
        }
        
        targetIndex = Math.max(0, Math.min(targetIndex, userList.length));
        console.log(`[TouchDrag - End] TouchY: ${touchY}, TouchRelativeToContainer: ${touchRelativeToContainer.toFixed(2)}, Closest Original Idx: ${closestItemOriginalIndex}, TargetIndex: ${targetIndex}`);

    } else if (listContainer && userList.length === 0) {
        targetIndex = 0; 
    } else {
        console.warn("[TouchDrag - End] Could not calculate target index (no touch or container).");
        targetIndex = draggedItemIndex.current !== null ? draggedItemIndex.current : 0; // Fallback
    }
    // --- End Target Index Calculation ---

    const startIndex = draggedItemIndex.current;

    // --- Perform Reordering (Existing Logic) --- 
    if (startIndex !== null && targetIndex !== -1) {
        let insertIndex = targetIndex;
        if (startIndex < targetIndex) { 
            insertIndex = targetIndex - 1; 
        }
        
        console.log(`[TouchDrag - End] Reordering from ${startIndex} to insert position ${insertIndex} (Original target: ${targetIndex})`);
        const newList = [...userList];
        const [movedItem] = newList.splice(startIndex, 1);
        insertIndex = Math.min(insertIndex, newList.length);
        newList.splice(insertIndex, 0, movedItem);
        setUserList(newList);
    } else {
      console.log(`[TouchDrag - End] Drop occurred on invalid target (Index: ${targetIndex}) or start index was null (${startIndex}). No reorder.`);
    }

    // Reset drag state refs AFTER potential reorder
    isTouchDragging.current = false;
    draggedItemIndex.current = null;
    draggedItemElement.current = null; 
    draggedItemHeight.current = 0;
    initialTouchX.current = 0;
    initialTouchY.current = 0;
  };
  
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
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleRankingListClick}
        >
          {userList.length === 0 ? (
            <div className="empty-list-message">
              {isMobile ? 
                "Tap here to open the seasons menu and start adding contestants!" : 
                "Your list is empty. Start adding contestants!"
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
                  src={contestantImageUrls[contestant.id] || contestant.imageUrl || "/images/placeholder.jpg"}
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
        {error && <div className="error-message">{error}</div>}
        {saveSuccess && <div className="success-message">List saved successfully!</div>}
        
        <div className="action-buttons">
          <button 
            className="save-list-button" 
            onClick={handleSaveList}
            disabled={saving || userList.length === 0}
          >
            {saving ? 'Saving...' : editingListId ? 'Update List' : 'Save List'}
          </button>
          
          <button 
            className="clear-button" 
            onClick={clearList}
            title="Clear the entire list and its details"
          >
            Clear
          </button>
          
          <button 
            className="cancel-button" 
            onClick={handleCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserListCreator; 
 
 
 