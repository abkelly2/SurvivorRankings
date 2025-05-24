import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { getCachedImageUrl, subscribeToCacheUpdates } from '../utils/imageCache';
import { survivorSeasons } from '../data/survivorData';
import './SeasonList.css';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { auth } from '../firebase';
import { getContestantImageUrl } from '../firebase';

const SeasonList = forwardRef(({ 
  maddysList, 
  andrewsList, 
  kendallsList,
  user,
  createMode
}, ref) => {
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [foundIdol, setFoundIdol] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const searchInputRef = useRef(null);
  const sectionRef = useRef(null);
  const seasonsGridRef = useRef(null);
  const [draggedContestant, setDraggedContestant] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showMenuOnMobile, setShowMenuOnMobile] = useState(false);
  const [listUpdateCallback, setListUpdateCallback] = useState(null);
  const [cacheVersion, setCacheVersion] = useState(0);
  const [showIdolNotification, setShowIdolNotification] = useState(false);
  
  // --- Refs for Handle Drag Resizing ---
  const isHandleDragging = useRef(false);
  const handleDragStartY = useRef(0);
  const menuStartHeight = useRef(0);
  // -------------------------------------
  
  // Use the user prop to determine logged in state
  const isLoggedIn = !!user;
  
  // Check if it's mobile on mount and when window resizes
  useEffect(() => {
    const checkIfMobile = () => {
      const isMobileView = window.innerWidth <= 768;
      setIsMobile(isMobileView);
      
      const seasonsSection = sectionRef.current?.closest('.seasons-section');
      if (!seasonsSection) return; // Exit if section not found

      // Logic specifically for mobile create mode bottom sheet
      if (createMode && isMobileView) {
          document.body.setAttribute('data-page', 'create');
          // Manage display based on showMenuOnMobile state
          if (!showMenuOnMobile) {
            seasonsSection.classList.add('collapsed');
            seasonsSection.style.display = 'none'; 
            seasonsSection.style.height = ''; // Ensure height is reset when hidden
          } else {
            seasonsSection.style.display = ''; // Use default display (likely flex or block)
            seasonsSection.classList.remove('collapsed');
            // Optionally set initial open height if needed
            // seasonsSection.style.height = '85vh'; 
          }
      } else {
          // --- Desktop or Non-Create Mode Logic --- 
          // Ensure styles applied for mobile create mode are removed
          seasonsSection.style.display = ''; // Reset display
          seasonsSection.style.height = ''; // Reset height
          seasonsSection.style.maxHeight = ''; // Reset maxHeight
          seasonsSection.style.bottom = ''; // Reset bottom positioning
          seasonsSection.style.padding = ''; // Reset padding
          
          // Remove mobile-specific body attribute if it exists
          if (document.body.getAttribute('data-page') === 'create') {
            document.body.removeAttribute('data-page');
          }
          
          // Restore default collapse state based on localStorage for desktop
          const savedCollapsedState = localStorage.getItem('seasonsSectionCollapsed');
          if (savedCollapsedState === 'true') {
            seasonsSection.classList.add('collapsed');
            setIsCollapsed(true); // Sync state
          } else {
            seasonsSection.classList.remove('collapsed');
            setIsCollapsed(false); // Sync state
          }
      }
    };
    
    // Initial check
    checkIfMobile();
    
    // Add event listener for resize
    window.addEventListener('resize', checkIfMobile);
    
    // Cleanup event listener
    return () => {
      window.removeEventListener('resize', checkIfMobile);
      // Also clean up the attribute on unmount if component might unmount
      // while in create mode (though App structure might prevent this)
      if (document.body.getAttribute('data-page') === 'create') {
        document.body.removeAttribute('data-page');
      }
      // Consider resetting inline styles on unmount too if needed
      const seasonsSection = sectionRef.current?.closest('.seasons-section');
      if (seasonsSection) {
           seasonsSection.style.display = '';
           seasonsSection.style.height = '';
      }
    };
    // Dependencies: createMode, showMenuOnMobile, sectionRef (implicit via closure)
  }, [createMode, showMenuOnMobile]);
  
  // Expose methods to parent components through ref
  useImperativeHandle(ref, () => ({
    showMenu: () => {
      console.log('[SeasonList] showMenu called! isMobile=', isMobile, 'createMode=', createMode, 'document.body.dataset.page=', document.body.dataset.page);
      
      if (isMobile) {
        const seasonsSection = document.querySelector('.seasons-section');
        if (seasonsSection) {
          console.log('[SeasonList] Found seasons-section, applying styles');
          
          // Log initial data-page state
          console.log('[SeasonList] Current data-page before menu show:', document.body.dataset.page);
          
          // Immediately set critical display properties
          seasonsSection.style.display = 'block';
          seasonsSection.style.visibility = 'visible';
          seasonsSection.style.position = 'fixed';
          seasonsSection.style.top = 'auto';
          seasonsSection.style.left = '0';
          seasonsSection.style.right = '0';
          seasonsSection.style.bottom = '0';
          seasonsSection.style.height = '85vh';
          seasonsSection.style.maxHeight = '85vh';
          seasonsSection.style.zIndex = '1000';
          
          // Force a reflow by reading a layout property
          const initialHeight = seasonsSection.offsetHeight;
          console.log('[SeasonList] Initial height:', initialHeight);
          
          // Set initial animation state
          seasonsSection.style.transform = 'translateY(100%)';
          seasonsSection.style.opacity = '0';
          seasonsSection.style.transition = 'none';
          
          // Force another reflow and verify height
          const heightAfterTransform = seasonsSection.offsetHeight;
          console.log('[SeasonList] Height after transform:', heightAfterTransform);
          
          // Add necessary classes
          seasonsSection.classList.add('visible');
          seasonsSection.classList.remove('collapsed');
          
          // Lock body scroll
          document.body.style.overflow = 'hidden';
          
          // Force show the menu state
          setShowMenuOnMobile(true);
          
          // Check if we're in global rankings view
          const isGlobalRankings = window.location.pathname.includes('/global-rankings/');
          console.log('[SeasonList] isGlobalRankings:', isGlobalRankings, 'pathname:', window.location.pathname);
          
          // IMPORTANT: Only set data-page to "create" if we're NOT in global rankings
          // AND if we don't already have a data-page attribute
          if (!isGlobalRankings && !document.body.dataset.page) {
            console.log('[SeasonList] Setting data-page to "create"');
            document.body.setAttribute('data-page', 'create');
          } else {
            console.log('[SeasonList] Preserving existing data-page:', document.body.dataset.page);
          }
          
          // Trigger animation
          requestAnimationFrame(() => {
            seasonsSection.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
            seasonsSection.style.transform = 'translateY(0)';
            seasonsSection.style.opacity = '1';
            
            // If in global rankings, directly show Season 49 contestants
            if (isGlobalRankings) {
              console.log('[SeasonList] In global rankings, directly showing Season 49');
              setSelectedSeason('s49');
              // Clear any search term to ensure we show all contestants
              setSearchTerm('');
              // Log data-page state after showing Season 49
              console.log('[SeasonList] data-page after showing Season 49:', document.body.dataset.page);
            }
          });
        }
      }
    },
    hideMenu: () => {
      console.log("[SeasonList] hideMenu called");
      setShowMenuOnMobile(false);
      
      // Apply direct DOM manipulations for consistent behavior
      const seasonsSection = document.querySelector('.seasons-section');
      if (seasonsSection) {
        // Animate out first
        seasonsSection.style.transform = 'translateY(100%)';
        seasonsSection.style.opacity = '0';
        seasonsSection.classList.remove('visible');
        seasonsSection.classList.add('collapsed');
        
        // Restore body scroll
        document.body.style.overflow = '';
        
        // After animation, hide completely
        setTimeout(() => {
          if (!showMenuOnMobile) {
            seasonsSection.style.visibility = 'hidden';
            seasonsSection.style.display = 'none';
            
            // Reset any inline styles when hiding
            seasonsSection.style.height = '';
            seasonsSection.style.maxHeight = '';
            seasonsSection.style.bottom = '';
            seasonsSection.style.padding = '';
          }
        }, 300); // Match the transition time in CSS (0.3s)
      }
    },
    setListUpdateCallback: (callback) => {
      setListUpdateCallback(() => callback);
    },
    cleanup: () => {
      // Only remove data-page if we're not in global rankings
      // AND if it's currently set to "create"
      const isGlobalRankings = window.location.pathname.includes('/global-rankings');
      if (!isGlobalRankings && document.body.dataset.page === 'create') {
        document.body.removeAttribute('data-page');
      }
      
      // Reset body overflow
      document.body.style.overflow = '';
      
      // Reset any seasons section elements
      const seasonsSection = document.querySelector('.seasons-section');
      if (seasonsSection) {
        seasonsSection.style.display = '';
        seasonsSection.classList.remove('collapsed');
        seasonsSection.classList.remove('visible');
        
        // Reset any inline styles
        seasonsSection.style.position = '';
        seasonsSection.style.bottom = '';
        seasonsSection.style.height = '';
        seasonsSection.style.maxHeight = '';
        seasonsSection.style.zIndex = '';
        seasonsSection.style.transition = '';
        seasonsSection.style.padding = '';
        seasonsSection.style.top = '';
      }
      setListUpdateCallback(null);
    }
  }));
  
  // Helper function to hide menu on mobile after selection
  const hideMenuOnMobile = () => {
    console.log("[SeasonList] hideMenu called");
    setShowMenuOnMobile(false);
    
    // Apply direct DOM manipulations for consistent behavior
    const seasonsSection = document.querySelector('.seasons-section');
    if (seasonsSection) {
      // Animate out first
      seasonsSection.style.transform = 'translateY(100%)';
      seasonsSection.style.opacity = '0';
      seasonsSection.classList.remove('visible');
      seasonsSection.classList.add('collapsed');
      
      // Restore body scroll
      document.body.style.overflow = '';
      
      // After animation, hide completely
      setTimeout(() => {
        if (!showMenuOnMobile) {
          seasonsSection.style.visibility = 'hidden';
          seasonsSection.style.display = 'none';
          
          // Reset any inline styles when hiding
          seasonsSection.style.height = '';
          seasonsSection.style.maxHeight = '';
          seasonsSection.style.bottom = '';
          seasonsSection.style.padding = '';
        }
      }, 300); // Match the transition time in CSS (0.3s)
    }
  };
  
  // Add toggle collapse function
  const toggleCollapse = () => {
    // Toggle state
    setIsCollapsed(!isCollapsed);
    
    // Find the seasons section parent element and toggle the collapsed class
    const seasonsSection = sectionRef.current?.closest('.seasons-section');
    if (seasonsSection) {
      if (!isCollapsed) {
        seasonsSection.classList.add('collapsed');
        
        // Save to localStorage so we remember the state
        localStorage.setItem('seasonsSectionCollapsed', 'true');
        
        // On mobile, prevent scrolling of the body when the drawer is open
        if (window.innerWidth <= 768) {
          document.body.style.overflow = 'hidden';
        }
      } else {
        seasonsSection.classList.remove('collapsed');
        
        // Update localStorage
        localStorage.setItem('seasonsSectionCollapsed', 'false');
        
        // Re-enable scrolling on body when drawer is closed
        if (window.innerWidth <= 768) {
          document.body.style.overflow = '';
        }
      }
    }
  };
  
  // Save scroll position before navigating to season detail view
  useEffect(() => {
    // If we're showing the seasons grid (not a selected season)
    // we want to restore the scroll position if we have one
    if (!selectedSeason && scrollPosition > 0) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        // Use document.querySelector to find the container that actually scrolls
        const scrollContainer = document.querySelector('.seasons-section') || 
                               document.querySelector('.seasons-grid')?.parentElement;
        
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollPosition;
          console.log('Restored scroll position to:', scrollPosition, 'Container class:', scrollContainer.className);
        } else {
          console.log('Could not find scroll container to restore position');
        }
      });
    }
  }, [selectedSeason, scrollPosition]);
  
  // Easter egg - chance to find an idol on season card click
  const handleSeasonClick = async (seasonId) => {
    console.log('🎯 [handleSeasonClick] Called with seasonId:', seasonId);
    
    // Save current scroll position before navigating
    const scrollContainer = document.querySelector('.seasons-section') || 
                           document.querySelector('.seasons-grid')?.parentElement;
    
    if (scrollContainer) {
      const currentPosition = scrollContainer.scrollTop;
      setScrollPosition(currentPosition);
      console.log('📜 [handleSeasonClick] Saved scroll position:', currentPosition);
    }
    
    console.log('🔄 [handleSeasonClick] Setting selectedSeason to:', seasonId);
    setSelectedSeason(seasonId);
    
    // 50% chance of finding an immunity idol for testing purposes
    if (Math.random() < 0.05) {
      console.log('🏆 [handleSeasonClick] Found an idol!');
      setShowIdolNotification(true);
      setTimeout(() => setShowIdolNotification(false), 3000);
      // Track idol find in Firestore
      try {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        const userDoc = await getDoc(userRef);
        let currentIdols = 0;
        if (userDoc.exists() && userDoc.data().hasOwnProperty('idolsFound')) {
          currentIdols = userDoc.data().idolsFound;
        }
        await updateDoc(userRef, {
          idolsFound: currentIdols + 1
        });
      } catch (error) {
        console.error('❌ [handleSeasonClick] Error tracking idol find:', error);
      }
    }
  };

  // Remove tribal-mode class from body if it exists
  useEffect(() => {
    return () => {
      document.body.classList.remove('tribal-mode');
    };
  }, []);

  // Filter seasons based on search term when no season is selected
  const getFilteredSeasons = () => {
    if (!searchTerm.trim()) {
      return survivorSeasons;
    }
    
    const lowerSearchTerm = searchTerm.toLowerCase().trim();
    
    // Only filter by season name, not by contestants
    return survivorSeasons.filter(season => 
      season.name.toLowerCase().includes(lowerSearchTerm) ||
      (season.seasonNumber !== undefined && 
       season.seasonNumber.toString().includes(lowerSearchTerm))
    );
  };

  // Get contestants that match the search term across all seasons
  const getMatchingContestants = () => {
    if (!searchTerm.trim()) {
      return [];
    }
    
    const lowerSearchTerm = searchTerm.toLowerCase().trim();
    const result = [];
    const seenContestantNames = new Set(); // Track contestant names we've already added
    
    // Sort seasons by seasonNumber to prioritize earlier seasons
    const sortedSeasons = [...survivorSeasons].sort((a, b) => {
      const aNum = a.seasonNumber !== undefined ? a.seasonNumber : 999;
      const bNum = b.seasonNumber !== undefined ? b.seasonNumber : 999;
      return aNum - bNum;
    });
    
    sortedSeasons.forEach(season => {
      if (season.contestants) {
        season.contestants.forEach(contestant => {
          const normalizedName = contestant.name.toLowerCase().trim();
          
          // Only add contestant if we haven't seen their name before
          if (normalizedName.includes(lowerSearchTerm) && 
              !seenContestantNames.has(normalizedName)) {
            // Add season info to contestant for display
            result.push({
              ...contestant,
              seasonId: season.id,
              seasonName: season.name
            });
            
            // Mark this contestant name as seen
            seenContestantNames.add(normalizedName);
          }
        });
      }
    });
    
    return result;
  };

  // Handle search input change
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  // Clear search and focus the input
  const handleClearSearch = () => {
    setSearchTerm('');
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  // Function to handle clicking on a contestant from search results
  const handleSearchContestantClick = (seasonId) => {
    // Save current scroll position before navigating
    const scrollContainer = document.querySelector('.seasons-section, .search-results-container')?.parentElement;
    
    if (scrollContainer) {
      const currentPosition = scrollContainer.scrollTop;
      setScrollPosition(currentPosition);
      console.log('Saved scroll position from search:', currentPosition, 'Container:', scrollContainer.className);
    }
    
    setSelectedSeason(seasonId);
    // Don't clear search term so user can easily return to their search
  };

  // Function to handle clicking on contestants to add them to the list
  const handleContestantClick = async (contestant, event) => {
    if (!event || !event.currentTarget) {
      console.error("[SeasonList] No event or currentTarget available");
      return;
    }

    // DEBUG: Log the entire clicked element
    console.log("[SeasonList] Clicked element:", event.currentTarget);
    
    // Find the image element and get its URL
    const imgElement = event.currentTarget.querySelector('img.contestant-image');
    console.log("[SeasonList] Found img element:", imgElement);
    
    if (!imgElement || !imgElement.src) {
      console.error("[SeasonList] Could not find image URL in clicked element");
      return;
    }

    // Get the URL
    const imageUrl = imgElement.src;
    console.log("[SeasonList] Found image URL:", imageUrl);

    if (listUpdateCallback && typeof listUpdateCallback === 'function') {
      const contestantData = {
        id: contestant.id,
        name: contestant.name,
        imageUrl: imageUrl, // Use the URL we just grabbed
        isSeason: false,
        seasonId: selectedSeason || contestant.seasonId,
        seasonName: survivorSeasons.find(s => s.id === (selectedSeason || contestant.seasonId))?.name || ''
      };

      console.log("[SeasonList] Sending contestant data:", contestantData);
      
      // Call the callback with the contestant data
      listUpdateCallback(contestantData);
      
      // Only hide the menu on mobile if not in global rankings view
      const isInGlobalRankings = window.location.pathname.includes('/global-rankings/');
      if (!isInGlobalRankings) {
        hideMenuOnMobile();
      } else {
        setSelectedSeason(null);
      }
    } else {
      console.log("[SeasonList] No listUpdateCallback available");
      if (window.location.pathname.includes('/global-rankings/')) {
        alert("Please click a ranking slot first to select where to add the contestant.");
      }
      hideMenuOnMobile();
    }
  };
  
  // New function to handle clicking on a season to add it to the list
  const handleSeasonCardClick = async (season) => {
    console.log('🎮 [handleSeasonCardClick] Called with:', {
      seasonName: season.name,
      createMode,
      isMobile,
      pathname: window.location.pathname,
      selectedSeason: selectedSeason
    });
    
    // Save current scroll position before navigating
    const scrollContainer = document.querySelector('.seasons-section') || 
                           document.querySelector('.seasons-grid')?.parentElement;
    
    if (scrollContainer) {
      const currentPosition = scrollContainer.scrollTop;
      setScrollPosition(currentPosition);
      console.log('📜 [handleSeasonCardClick] Saved scroll position:', currentPosition);
    }

    // Check conditions for navigation
    const isGlobalRankings = window.location.pathname.includes('/global-rankings/');
    console.log('🔍 [handleSeasonCardClick] Checking navigation conditions:', {
      notCreateMode: !createMode,
      isDesktop: !isMobile,
      isGlobalRankings,
      shouldNavigate: !createMode || !isMobile || isGlobalRankings
    });

    // For mobile in create mode (not in global rankings), we want to show contestants first
    if (isMobile && createMode && !isGlobalRankings) {
      console.log('📱 [handleSeasonCardClick] Mobile create mode - showing contestants');
      await handleSeasonClick(season.id);
      return;
    }

    // For all other cases (desktop, non-create mode, or global rankings)
    console.log('➡️ [handleSeasonCardClick] Standard navigation - showing season:', season.id);
    await handleSeasonClick(season.id);
  };

  // Handle updating parent elements when not rendering
  useEffect(() => {
    console.log('[SeasonList Effect] Running with:', {
      isMobile,
      createMode,
      showMenuOnMobile,
      currentDataPage: document.body.dataset.page,
      pathname: window.location.pathname
    });

    if (isMobile) {
      const seasonsSection = document.querySelector('.seasons-section'); 
      if (seasonsSection) {
        const isGlobalRankings = window.location.pathname.includes('/global-rankings');
        console.log('[SeasonList Effect] isGlobalRankings:', isGlobalRankings);
        
        // IMPORTANT: If we're in global rankings, ensure we maintain "global" data-page
        if (isGlobalRankings && document.body.dataset.page !== 'global') {
          console.log('[SeasonList Effect] Restoring data-page to "global" in global rankings context');
          document.body.setAttribute('data-page', 'global');
        }
        
        if (createMode && showMenuOnMobile) {
          // --- SHOWING MENU --- 
          console.log('[SeasonList Effect] Showing menu. Current data-page:', document.body.dataset.page);
          
          // Only set data-page to "create" if we're not in global rankings
          // AND if we don't already have a data-page attribute
          if (!isGlobalRankings && !document.body.dataset.page) {
            console.log('[SeasonList Effect] Setting data-page to "create"');
            document.body.setAttribute('data-page', 'create');
          } else if (isGlobalRankings) {
            console.log('[SeasonList Effect] Ensuring data-page is "global" in global rankings');
            document.body.setAttribute('data-page', 'global');
          } else {
            console.log('[SeasonList Effect] Preserving existing data-page:', document.body.dataset.page);
          }
          
          // Apply styles directly
          seasonsSection.style.position = 'fixed';
          seasonsSection.style.top = 'auto';
          seasonsSection.style.bottom = '0';
          seasonsSection.style.left = '0';
          seasonsSection.style.right = '0';
          seasonsSection.style.height = '85vh'; 
          seasonsSection.style.maxHeight = '85vh'; 
          seasonsSection.style.transform = 'translateY(0)'; 
          seasonsSection.style.opacity = '1';
          seasonsSection.style.visibility = 'visible';
          seasonsSection.style.display = 'block'; 
          seasonsSection.style.zIndex = '1000';
          seasonsSection.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out'; 
          
          seasonsSection.style.padding = '10px 10px calc(10px + env(safe-area-inset-bottom, 0px)) 10px';
          
          seasonsSection.classList.add('visible'); 
          
          document.body.style.overflow = 'hidden';
          
          console.log('[SeasonList Effect] After showing menu. data-page:', document.body.dataset.page);
          
        } else {
          // --- HIDING MENU --- 
          console.log('[SeasonList Effect] Hiding menu. Current data-page:', document.body.dataset.page);
          
          seasonsSection.style.transform = 'translateY(100%)'; // Slide down
          seasonsSection.style.opacity = '0';
          seasonsSection.classList.remove('visible'); // Remove class

          // Re-enable body scrolling
          document.body.style.overflow = '';
          
          // Only remove data-page if we're not in global rankings
          // AND if it's currently set to "create"
          if (!isGlobalRankings && document.body.dataset.page === 'create') {
            console.log('[SeasonList Effect] Removing data-page "create"');
            document.body.removeAttribute('data-page');
          } else if (isGlobalRankings) {
            console.log('[SeasonList Effect] Ensuring data-page is "global" in global rankings');
            document.body.setAttribute('data-page', 'global');
          } else {
            console.log('[SeasonList Effect] Preserving data-page:', document.body.dataset.page);
          }

          // Reset styles after transition completes
          setTimeout(() => {
            // Check state again before fully hiding in case it changed back quickly
            if (!showMenuOnMobile) { 
              seasonsSection.style.visibility = 'hidden';
              seasonsSection.style.display = 'none'; 
              // Reset potentially conflicting styles fully
              seasonsSection.style.position = '';
              seasonsSection.style.bottom = '';
              seasonsSection.style.height = '';
              seasonsSection.style.maxHeight = '';
              seasonsSection.style.zIndex = '';
              seasonsSection.style.transition = ''; // Clear transition when hidden
              seasonsSection.style.padding = '';
              seasonsSection.style.top = '';
              
              // Ensure we maintain "global" in global rankings context
              if (isGlobalRankings) {
                document.body.setAttribute('data-page', 'global');
              }
              
              console.log('[SeasonList Effect] After hiding menu. data-page:', document.body.dataset.page);
            }
          }, 300); // Match CSS transition time
        }
      }
    }
    
    // Cleanup function remains important
    return () => {
      const isGlobalRankings = window.location.pathname.includes('/global-rankings');
      console.log('[SeasonList Effect] Cleanup. isGlobalRankings:', isGlobalRankings, 'data-page:', document.body.dataset.page);
      
      // Only remove data-page if we're not in global rankings
      // AND if it's currently set to "create"
      if (!isGlobalRankings && document.body.dataset.page === 'create') {
        console.log('[SeasonList Effect] Cleanup: Removing data-page "create"');
        document.body.removeAttribute('data-page');
      } else if (isGlobalRankings) {
        console.log('[SeasonList Effect] Cleanup: Ensuring data-page is "global"');
        document.body.setAttribute('data-page', 'global');
      } else {
        console.log('[SeasonList Effect] Cleanup: Preserving data-page:', document.body.dataset.page);
      }
      document.body.style.overflow = ''; // Ensure scroll is restored on unmount
    };
  }, [isMobile, createMode, showMenuOnMobile]);

  // Run once on initial render to debug the DOM structure
  useEffect(() => {
    if (isMobile && createMode) {
      console.log('Initial DOM structure check for mobile create mode');
      const seasonsSection = document.querySelector('.seasons-section');
      console.log('seasons-section element:', seasonsSection);
      
      if (seasonsSection) {
        console.log('seasons-section parent:', seasonsSection.parentElement);
        console.log('seasons-section classes:', seasonsSection.className);
        console.log('body data-page attribute:', document.body.getAttribute('data-page'));
      } else {
        console.warn('Could not find .seasons-section element on initial render');
      }
      
      // Set up DOM structure for mobile view right away
      document.body.setAttribute('data-page', 'create');
    }
  }, [isMobile, createMode]);

  // Add effect to handle window resize when menu is visible
  useEffect(() => {
    const updateMenuHeight = () => {
      if (isMobile && createMode && showMenuOnMobile) {
        const seasonsSection = document.querySelector('.seasons-section');
        if (seasonsSection) {
          seasonsSection.style.height = '85vh';
          seasonsSection.style.maxHeight = '85vh';
        }
      }
    };
    
    window.addEventListener('resize', updateMenuHeight);
    
    return () => {
      window.removeEventListener('resize', updateMenuHeight);
    };
  }, [isMobile, createMode, showMenuOnMobile]);

  // --- Touch Handlers for Handle Drag Resizing --- 
  const handleResizeTouchStart = (e) => {
    // Don't prevent default here, allow potential click on touchend
    isHandleDragging.current = true;
    handleDragStartY.current = e.touches[0].clientY;
    const seasonsSection = document.querySelector('.seasons-section');
    if (seasonsSection) {
      menuStartHeight.current = seasonsSection.offsetHeight; // Get current pixel height
    }
    console.log('[HandleDrag] Touch Start');
  };

  const handleResizeTouchMove = (e) => {
    if (!isHandleDragging.current) return;

    // Prevent scrolling while resizing menu
    e.preventDefault();

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - handleDragStartY.current; // How much the finger moved down
    const newHeight = menuStartHeight.current - deltaY; // Moving finger down decreases height

    const seasonsSection = document.querySelector('.seasons-section');
    if (seasonsSection) {
      // Apply constraints (e.g., min 100px, max 95% of viewport height)
      const minHeight = 100;
      const maxHeight = window.innerHeight * 0.95;
      const constrainedHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));
      
      seasonsSection.style.height = `${constrainedHeight}px`;
      seasonsSection.style.maxHeight = `${constrainedHeight}px`; // Keep max height in sync
      seasonsSection.style.transition = 'none'; // Disable transition during drag for smoothness
    }
  };

  const handleResizeTouchEnd = (e) => {
    if (!isHandleDragging.current) return;

    isHandleDragging.current = false;
    const seasonsSection = document.querySelector('.seasons-section');
    if (seasonsSection) {
        // Re-enable transition after dragging
        seasonsSection.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out, height 0.3s ease-out'; 
    }
    console.log('[HandleDrag] Touch End');
    // Optional: Snap to nearest height here if desired
  };
  // ------------------------------------------

  // Restore handleBackClick
  const handleBackClick = () => {
    setSelectedSeason(null);
  };

  // Restore handleDragStart for contestants
  const handleDragStart = (e, contestant) => {
    if (!contestant || !contestant.id) {
      console.error("Drag start failed: No contestant or ID");
      e.preventDefault();
      return;
    }

    console.log("Starting drag with contestant:", contestant);
    
    // Get image URL but ensure it's either a proper URL or null
    const imageUrl = getCachedImageUrl(contestant.id);
    
    // Ensure we're creating a valid JSON data object
    const data = {
      id: contestant.id,
      name: contestant.name || 'Unknown Contestant',
      imageUrl: imageUrl && !imageUrl.startsWith('data:') ? imageUrl : '/images/placeholder.jpg', // Ensure valid URL
      isSeason: false, // Mark as contestant
      seasonId: contestant.seasonId || null,
      seasonName: contestant.seasonName || null
    };

    try {
      const jsonData = JSON.stringify(data);
      // Set both text/plain and application/json for broader compatibility
      e.dataTransfer.setData('text/plain', jsonData);
      e.dataTransfer.setData('application/json', jsonData);
      e.dataTransfer.effectAllowed = 'move';
      
      // Create a custom drag image if needed
      if (e.target.querySelector('img')) {
        const img = e.target.querySelector('img');
        e.dataTransfer.setDragImage(img, 25, 25);
      }
      
      if (e.currentTarget) {
        e.currentTarget.classList.add('dragging-item');
      }
      setDraggedContestant(data); // Keep track of dragged item if needed
      console.log("Drag started with data:", jsonData);
    } catch (error) {
      console.error("Error during drag start:", error);
      e.preventDefault();
    }
  };

  // Restore handleSeasonDragStart for seasons
  const handleSeasonDragStart = (e, season) => {
    if (!season || !season.id) {
      console.error("Drag start failed: No season or ID");
      e.preventDefault();
      return;
    }

    // Get image URL but ensure it's either a proper URL or null
    const imageUrl = getCachedImageUrl(season.id);
    
    // Ensure we're creating a valid JSON data object
    const seasonWithImage = {
      ...season,
      imageUrl: imageUrl && !imageUrl.startsWith('data:') ? imageUrl : '/images/placeholder.jpg', // Ensure valid URL
      isSeason: true // Mark as season
    };

    try {
      const jsonData = JSON.stringify(seasonWithImage);
      e.dataTransfer.setData('text/plain', jsonData);
      e.dataTransfer.setData('application/json', jsonData); // Keep if needed elsewhere
      e.dataTransfer.setData('source', 'season-grid'); // Keep if needed
      e.dataTransfer.effectAllowed = 'move';

      if (e.target.querySelector('img')) {
        const img = e.target.querySelector('img');
        e.dataTransfer.setDragImage(img, 25, 25);
      }
      if (e.currentTarget) {
        e.currentTarget.classList.add('dragging'); // Use 'dragging' or 'dragging-item'
      }
      console.log("Season drag started with data:", jsonData);
    } catch (error) {
      console.error('Error in handleSeasonDragStart:', error);
      e.preventDefault();
    }
  };

  // Restore handleDragEnd
  const handleDragEnd = (e) => {
    if (e.currentTarget) {
      e.currentTarget.classList.remove('dragging-item');
      e.currentTarget.classList.remove('dragging');
    }
    setDraggedContestant(null); // Clear dragged item
  };

  // Subscribe to image cache updates to force re-render when URLs become available
  useEffect(() => {
    const unsubscribe = subscribeToCacheUpdates(() => {
      // Increment version number to trigger re-render
      setCacheVersion(v => v + 1);
    });

    // Cleanup subscription on component unmount
    return () => {
      unsubscribe();
    };
  }, []); // Run only once on mount

  // New function to handle adding an entire season to the list
  const handleAddSeasonToList = (season) => {
    if (listUpdateCallback && typeof listUpdateCallback === 'function') {
      // Prepare season data with contestants
      const seasonData = {
        id: season.id,
        name: season.name.replace('Survivor: ', '').replace('Survivor ', ''),
        contestants: season.contestants.map(contestant => ({
          ...contestant,
          imageUrl: getCachedImageUrl(contestant.id),
          seasonId: season.id,
          seasonName: season.name.replace('Survivor: ', '').replace('Survivor ', '')
        }))
      };
      // Call the callback with a special flag to indicate it's a season
      listUpdateCallback(seasonData, true);
      hideMenuOnMobile();
    } else {
      hideMenuOnMobile();
    }
  };

  // Add effect to automatically show Season 49 in global rankings view
  useEffect(() => {
    const isGlobalRankings = window.location.pathname.includes('/global-rankings/season-49');
    if (isGlobalRankings && selectedSeason !== 's49') {
      console.log('[SeasonList] Auto-selecting Season 49 for global rankings view');
      setSelectedSeason('s49');
    }
  }, [window.location.pathname]); // Re-run if pathname changes

  // Don't render the component at all ONLY when it's the hidden mobile menu
  // in create mode and not explicitly shown.
  // Render in all other cases (desktop, mobile non-create, mobile create shown).
  if (isMobile && createMode && !showMenuOnMobile) {
    console.log('[SeasonList Render] Returning null (Mobile, Create Mode, Not Shown)');
    return null;
  }

  console.log('🎨 [SeasonList Render] Rendering with:', {
    selectedSeason,
    createMode,
    isMobile,
    pathname: window.location.pathname,
    showMenuOnMobile
  });

  // MODIFIED: Determine if we should show contestants based on both selectedSeason and URL
  const isGlobalRankings = window.location.pathname.includes('/global-rankings/season-49');
  const shouldShowContestants = selectedSeason && (isGlobalRankings ? selectedSeason === 's49' : true);

  return (
    <div ref={sectionRef}>
      {showIdolNotification && (
        <div className="idol-notification">
          You found a Hidden Immunity Idol! 🏆
        </div>
      )}
      
      {/* Add a swipe handle / close button for mobile that sits at the top of the menu */}
      {isMobile && (createMode || isGlobalRankings) && (
        <div 
          className="menu-tab-handle" 
          onClick={(e) => { 
            // Prevent closing if drag just ended
            if (!isHandleDragging.current) { 
              hideMenuOnMobile(); 
            }
          }}
          onTouchStart={handleResizeTouchStart}
          onTouchMove={handleResizeTouchMove}
          onTouchEnd={handleResizeTouchEnd}
          onTouchCancel={handleResizeTouchEnd}
          aria-label="Close or resize seasons menu"
          style={{ touchAction: 'none' }}
        />
      )}
      
      {/* MODIFIED: Show contestants view if shouldShowContestants is true */}
      {shouldShowContestants ? (
        // Show contestants when a season is selected
        <div className="contestants-container">
          <h2 className="section-title">
            {/* Only show back button if NOT in global rankings */}
            {!window.location.pathname.includes('/global-rankings/season-49') && (
              <button className="back-button" onClick={handleBackClick}>
                ← Back to Seasons
              </button>
            )}
            <span>
              {survivorSeasons.find(s => s.id === selectedSeason)?.name}
            </span>
          </h2>
          
          {isLoggedIn && createMode && (
            <div className="create-instructions">
              Click contestants to add them to your ranking list or drag them for precise positioning.
            </div>
          )}
          
          <div className="contestants-grid">
            {survivorSeasons.find(s => s.id === selectedSeason)?.contestants.map(contestant => (
              <div 
                key={contestant.id} 
                className="contestant-card"
                data-contestant-id={contestant.id}
                onClick={(e) => {
                  // Allow clicking in both create mode and global rankings
                  if (createMode || window.location.pathname.includes('/global-rankings/')) {
                    // In global rankings, make sure we have a target index before proceeding
                    if (window.location.pathname.includes('/global-rankings/') && !listUpdateCallback) {
                      console.log('[SeasonList] No listUpdateCallback available, cannot add contestant');
                      return;
                    }

                    const contestantData = {
                      ...contestant,
                      seasonId: selectedSeason,
                      seasonName: survivorSeasons.find(s => s.id === selectedSeason)?.name || ''
                    };

                    if (createMode) {
                      handleContestantClick(contestantData, e);
                      hideMenuOnMobile();
                    } else {
                      // For global rankings, just call the callback directly
                      console.log('[SeasonList] Adding contestant in global rankings view:', contestantData);
                      listUpdateCallback(contestantData);
                    }
                  }
                }}
                draggable={createMode}
                onDragStart={createMode ? 
                  (e) => handleDragStart(e, {
                    ...contestant,
                    seasonId: selectedSeason,
                    seasonName: survivorSeasons.find(s => s.id === selectedSeason)?.name || ''
                  }) : undefined}
                onDragEnd={createMode ? handleDragEnd : undefined}
              >
                <img 
                  src={getCachedImageUrl(contestant.id) || `/images/Headshots/Season ${selectedSeason.substring(1)}/${contestant.id}.png`}
                  className="contestant-image"
                  alt=""
                  loading="lazy"
                />
                <div className="contestant-name">{contestant.name}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // Show season selection on desktop, or if not in global rankings on mobile */}
        <>
          <h2 className="section-title">
            {/* Only show collapse toggle on desktop */}
            {(!isMobile) && (
              <div 
                className={`collapse-toggle ${isCollapsed ? 'collapsed' : ''}`}
                onClick={toggleCollapse}
                title={isCollapsed ? "Expand seasons menu" : "Collapse seasons menu"}
              />
            )}
            <span>Survivor Seasons</span>
          </h2>
          
          <div className="search-bar-container">
            <input
              ref={searchInputRef}
              type="text"
              className="contestant-search-bar"
              placeholder="Search seasons or contestants..."
              value={searchTerm}
              onChange={handleSearchChange}
            />
            {searchTerm && (
              <button className="clear-search-button" onClick={handleClearSearch}>
                ×
              </button>
            )}
          </div>
          
          {searchTerm.trim() ? (
            // Show search results
            <div className="search-results-container">
              <h3 className="search-results-title">Search Results</h3>
              <div className="search-results">
                {getMatchingContestants().map(contestant => (
                  <div
                    key={`${contestant.id}-${contestant.seasonId}`}
                    className="contestant-item"
                    onClick={(e) => {
                      if (createMode) {
                        handleContestantClick(contestant, e);
                        hideMenuOnMobile();
                      }
                    }}
                    draggable={!isMobile}
                    onDragStart={(e) => handleDragStart(e, contestant)}
                    onDragEnd={handleDragEnd}
                  >
                    <img 
                      src={getCachedImageUrl(contestant.id) || `/images/Headshots/Season ${contestant.seasonId.substring(1)}/${contestant.id}.png`}
                      className="contestant-image"
                      alt=""
                    />
                    <div className="contestant-name">{contestant.name}</div>
                    <div className="season-name">
                      {survivorSeasons.find(s => s.id === contestant.seasonId)?.name || `Season ${contestant.seasonId.substring(1)}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Show regular season grid
            <div className="seasons-grid" ref={seasonsGridRef}>
              {getFilteredSeasons().map((season) => {
                console.log('🎴 [SeasonList Render] Rendering season card:', {
                  seasonId: season.id,
                  seasonName: season.name,
                  createMode,
                  isMobile,
                  pathname: window.location.pathname
                });
                
                return (
                  <div
                    key={season.id}
                    className="season-card"
                    onClick={() => {
                      console.log('👆 [SeasonList] Season card clicked:', {
                        seasonId: season.id,
                        seasonName: season.name,
                        createMode,
                        isMobile,
                        pathname: window.location.pathname
                      });
                      handleSeasonCardClick(season);
                    }}
                    draggable={createMode}
                    onDragStart={createMode ? (e) => handleSeasonDragStart(e, season) : undefined}
                    onDragEnd={createMode ? handleDragEnd : undefined}
                  >
                    <img
                      className="season-logo"
                      src={getCachedImageUrl(season.id)}
                      alt={`Season ${season.id.replace('s', '')} Logo`}
                      loading="lazy"
                    />
                    <p>{season.name.replace('Survivor: ', '').replace('Survivor ', '')}</p>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
});

export default SeasonList;