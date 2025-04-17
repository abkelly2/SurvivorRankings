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
  seasonListRef
}) => {
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const listRef = useRef(null);
  const [contestantImageUrls, setContestantImageUrls] = useState({});
  const [currentListId, setCurrentListId] = useState(editingListId || null);
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(false);
  
  // States for touch dragging
  const [touchDragging, setTouchDragging] = useState(false);
  const [touchStartY, setTouchStartY] = useState(0);
  const [draggedItemIndex, setDraggedItemIndex] = useState(null);
  const [draggedElement, setDraggedElement] = useState(null);
  const [initialTouchY, setInitialTouchY] = useState(0);
  const [currentTouchY, setCurrentTouchY] = useState(0);
  const [itemHeight, setItemHeight] = useState(0);
  const longPressTimer = useRef(null);
  const touchPositionRef = useRef({ x: 0, y: 0 });
  const touchScrollStartRef = useRef(0);

  // Check if the device is mobile
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    // Initial check
    checkIfMobile();
    
    // Add event listener for window resize
    window.addEventListener('resize', checkIfMobile);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', checkIfMobile);
      // Make sure to remove any mobile class when component unmounts
      document.body.classList.remove('show-seasons-mobile');
    };
  }, []);

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

  // Add global touch event handlers to handle dragging
  useEffect(() => {
    // When dragging on mobile, prevent default scrolling behavior
    const preventScroll = (e) => {
      if (touchDragging) {
        e.preventDefault();
      }
    };

    // Clean up any leftover state if touch ends outside the drag area
    const handleGlobalTouchEnd = () => {
      if (touchDragging) {
        finishTouchDrag();
      }
      
      clearTimeout(longPressTimer.current);
      document.body.style.overflow = '';
    };

    if (isMobile) {
      document.addEventListener('touchmove', preventScroll, { passive: false });
      document.addEventListener('touchend', handleGlobalTouchEnd);
    }

    return () => {
      document.removeEventListener('touchmove', preventScroll);
      document.removeEventListener('touchend', handleGlobalTouchEnd);
      clearTimeout(longPressTimer.current);
      document.body.style.overflow = '';
    };
  }, [isMobile, touchDragging]);

  // Handle the start of a touch drag operation
  const handleTouchStart = (e, index) => {
    // Get the element being touched right away
    const element = e.currentTarget;
    console.log('Touch start on element:', element);
    
    // Capture touch coordinates immediately
    const touchClientX = e.touches[0].clientX;
    const touchClientY = e.touches[0].clientY;
    const elementTop = element.getBoundingClientRect().top;
    
    // Store the initial touch position
    touchPositionRef.current = {
      x: touchClientX,
      y: touchClientY
    };
    
    // Record the initial scroll position
    touchScrollStartRef.current = window.scrollY;
    
    // Clear any existing timer
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
    
    // Add a visual indication that the element is being held
    element.classList.add('touch-active');
    
    // Use a timer to detect long press
    longPressTimer.current = setTimeout(() => {
      console.log('Long press timer fired, element:', element);
      if (userList.length <= 1) return; // No need to drag if just one item
      
      // Check if element exists before continuing
      if (!element) {
        console.log('Element not found for touch drag');
        return;
      }
      
      // Remove the initial touch indicator class
      element.classList.remove('touch-active');
      
      // Calculate height of the item for positioning
      const height = element.offsetHeight || 0;
      
      // Start dragging
      setTouchDragging(true);
      setDraggedItemIndex(index);
      setDraggedElement(element);
      setInitialTouchY(touchClientY);
      setCurrentTouchY(touchClientY);
      setItemHeight(height);
      setTouchStartY(touchClientY - elementTop);
      
      // Add visual indication
      element.classList.add('touch-dragging');
      
      // Freeze page scrolling while dragging
      document.body.style.overflow = 'hidden';
      
      console.log('Touch drag started on item:', index, 'height:', height);
    }, 150); // Reduced from 300ms to 150ms for faster response
  };

  // Handle touch movement during drag
  const handleTouchMove = (e) => {
    try {
      // Check if we're in dragging mode
      if (!touchDragging || draggedItemIndex === null || !draggedElement) {
        // Not in dragging mode yet
        return;
      }
      
      console.log('Touch move while dragging, current Y:', e.touches[0].clientY);
      
      // Update the current touch position
      setCurrentTouchY(e.touches[0].clientY);
      
      // Ensure the list reference exists
      if (!listRef.current) {
        console.warn('List reference not available during touch move');
        return;
      }
      
      // Calculate the new position
      const listRect = listRef.current.getBoundingClientRect();
      const touchY = e.touches[0].clientY - listRect.top;
      
      // Use a safe itemHeight value to prevent division by zero
      const safeItemHeight = itemHeight || 50; // Default to 50px if not set
      
      // Calculate which index this position corresponds to
      const hoverIndex = Math.max(0, Math.min(
        Math.floor(touchY / safeItemHeight),
        userList.length - 1
      ));
      
      // Position the dragged element where the touch is
      const yOffset = e.touches[0].clientY - initialTouchY;
      console.log('Moving element by offset:', yOffset);
      
      // Safely apply transform
      if (draggedElement) {
        draggedElement.style.transform = `translateY(${yOffset}px)`;
      }
      
      // Reposition other elements as needed
      if (listRef.current) {
        Array.from(listRef.current.children).forEach((child, idx) => {
          if (idx !== draggedItemIndex && child && child.classList && child.classList.contains('ranking-item')) {
            // Reset any previous transformations
            child.style.transform = 'none';
            child.style.transition = 'transform 0.3s ease';
            
            // If we need to make space for the dragged item
            if (draggedItemIndex < hoverIndex && idx > draggedItemIndex && idx <= hoverIndex) {
              // Move up to make space below
              child.style.transform = `translateY(-${safeItemHeight}px)`;
            } else if (draggedItemIndex > hoverIndex && idx < draggedItemIndex && idx >= hoverIndex) {
              // Move down to make space above
              child.style.transform = `translateY(${safeItemHeight}px)`;
            }
          }
        });
      }
    } catch (error) {
      console.error('Error in touch move handler:', error);
      // Safely cancel drag operation on error
      cancelTouchDrag();
    }
  };

  // Handle end of touch dragging
  const handleTouchEnd = (e) => {
    // Clear the long press timer
    clearTimeout(longPressTimer.current);
    console.log('Touch end event fired, dragging state:', touchDragging);
    
    // Remove touch-active class from all items
    if (listRef.current) {
      Array.from(listRef.current.children).forEach(child => {
        if (child && child.classList) {
          child.classList.remove('touch-active');
        }
      });
    }
    
    // If not in dragging mode, return
    if (!touchDragging) return;
    
    finishTouchDrag();
  };
  
  // Helper function to clean up touch drag state
  const finishTouchDrag = () => {
    console.log('Finishing touch drag, index:', draggedItemIndex);
    if (draggedItemIndex === null || !listRef.current) return;
    
    // Calculate where the item should go
    const listRect = listRef.current.getBoundingClientRect();
    const touchY = currentTouchY - listRect.top;
    
    // Use a safe itemHeight value
    const safeItemHeight = itemHeight || 50; // Default to 50px if not set
    
    // Get the target index
    let targetIndex = Math.max(0, Math.min(
      Math.floor(touchY / safeItemHeight),
      userList.length - 1
    ));
    
    // Update the list with the new order
    if (targetIndex !== draggedItemIndex) {
      console.log('Reordering from', draggedItemIndex, 'to', targetIndex);
      
      const newList = [...userList];
      const [movedItem] = newList.splice(draggedItemIndex, 1);
      newList.splice(targetIndex, 0, movedItem);
      setUserList(newList);
    }
    
    // Clean up dragging state
    if (draggedElement) {
      draggedElement.classList.remove('touch-dragging');
      draggedElement.classList.remove('touch-active');
      draggedElement.style.transform = 'none';
    }
    
    // Reset styles on all list items
    if (listRef.current) {
      Array.from(listRef.current.children).forEach(child => {
        if (child && child.classList) {
          child.classList.remove('touch-dragging');
          child.classList.remove('touch-active');
          if (child.classList.contains('ranking-item')) {
            child.style.transform = 'none';
            child.style.transition = 'none';
          }
        }
      });
    }
    
    // Reset dragging state
    setTouchDragging(false);
    setDraggedItemIndex(null);
    setDraggedElement(null);
    
    // Re-enable page scrolling
    document.body.style.overflow = '';
    
    console.log('Touch drag finished');
  };
  
  // Cancel touch drag if needed
  const cancelTouchDrag = () => {
    console.log('Cancelling touch drag');
    clearTimeout(longPressTimer.current);
    
    // Remove touch-active class from all items
    if (listRef.current) {
      Array.from(listRef.current.children).forEach(child => {
        if (child && child.classList) {
          child.classList.remove('touch-active');
        }
      });
    }
    
    if (touchDragging && draggedElement) {
      draggedElement.classList.remove('touch-dragging');
      draggedElement.classList.remove('touch-active');
      draggedElement.style.transform = 'none';
      
      // Reset styles on all list items
      if (listRef.current) {
        Array.from(listRef.current.children).forEach(child => {
          if (child && child.classList && child.classList.contains('ranking-item')) {
            child.style.transform = 'none';
            child.style.transition = 'none';
          }
        });
      }
    }
    
    setTouchDragging(false);
    setDraggedItemIndex(null);
    setDraggedElement(null);
    document.body.style.overflow = '';
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
                onTouchMove={isMobile ? handleTouchMove : undefined}
                onTouchEnd={isMobile ? handleTouchEnd : undefined}
                onTouchCancel={isMobile ? cancelTouchDrag : undefined}
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
 
 
 