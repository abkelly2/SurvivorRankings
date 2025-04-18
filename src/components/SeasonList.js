import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { getContestantImageUrl, getSeasonLogoUrl } from '../firebase';
import { survivorSeasons } from '../data/survivorData';
import './SeasonList.css';

const SeasonList = forwardRef(({ 
  maddysList, 
  andrewsList, 
  kendallsList,
  user,
  createMode
}, ref) => {
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [contestantImageUrls, setContestantImageUrls] = useState({});
  const [seasonLogoUrls, setSeasonLogoUrls] = useState({});
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
      if (isMobile && createMode) {
        setShowMenuOnMobile(true);
      }
    },
    hideMenu: () => {
      if (isMobile && createMode) {
        setShowMenuOnMobile(false);
      }
    },
    setListUpdateCallback: (callback) => {
      setListUpdateCallback(() => callback);
    },
    cleanup: () => {
      // Reset body attributes
      if (document.body.getAttribute('data-page') === 'create') {
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
        seasonsSection.style.height = '';
        seasonsSection.style.maxHeight = '';
        seasonsSection.style.bottom = '';
        seasonsSection.style.padding = '';
      }
      setListUpdateCallback(null);
    }
  }));
  
  // Helper function to hide menu on mobile after selection
  const hideMenuOnMobile = () => {
    if (isMobile && createMode) {
      setShowMenuOnMobile(false);
      
      // Hide the bottom sheet
      const seasonsSection = document.querySelector('.seasons-section');
      if (seasonsSection) {
        seasonsSection.classList.remove('visible');
        
        // Re-enable body scrolling
        document.body.style.overflow = '';
        
        // Completely hide after animation completes
        setTimeout(() => {
          if (!showMenuOnMobile) {
            seasonsSection.style.display = 'none';
            
            // Reset any inline styles when hiding
            seasonsSection.style.height = '';
            seasonsSection.style.maxHeight = '';
            seasonsSection.style.bottom = '';
            seasonsSection.style.padding = '';
          }
        }, 300); // Match the transition time in CSS (0.3s)
      }
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
  const handleSeasonClick = (seasonId) => {
    // Save current scroll position before navigating
    const scrollContainer = document.querySelector('.seasons-section') || 
                           document.querySelector('.seasons-grid')?.parentElement;
    
    if (scrollContainer) {
      const currentPosition = scrollContainer.scrollTop;
      setScrollPosition(currentPosition);
      console.log('Saved scroll position:', currentPosition);
    }
    
    setSelectedSeason(seasonId);
    
    // 5% chance of finding an immunity idol
    if (Math.random() < 0.05) {
      setFoundIdol(true);
      setTimeout(() => setFoundIdol(false), 3000);
    }
  };

  // Load season logos
  useEffect(() => {
    const loadSeasonLogos = async () => {
      const newLogoUrls = { ...seasonLogoUrls };
      
      for (const season of survivorSeasons) {
        if (!newLogoUrls[season.id]) {
          try {
            const url = await getSeasonLogoUrl(season.id);
            newLogoUrls[season.id] = url;
          } catch (error) {
            console.error(`Error loading logo for season ${season.id}:`, error);
            newLogoUrls[season.id] = '/placeholder.jpg';
          }
        }
      }
      
      setSeasonLogoUrls(newLogoUrls);
    };
    
    loadSeasonLogos();
  }, []);

  // Remove tribal-mode class from body if it exists
  useEffect(() => {
    return () => {
      document.body.classList.remove('tribal-mode');
    };
  }, []);

  useEffect(() => {
    const loadContestantImages = async () => {
      if (!selectedSeason) return;

      const newImageUrls = { ...contestantImageUrls };
      const season = survivorSeasons.find(s => s.id === selectedSeason);
      
      if (season) {
        for (const contestant of season.contestants) {
          if (!newImageUrls[contestant.id]) {
            try {
              const numericSeasonId = season.id.startsWith('s') ? season.id.substring(1) : season.id;
              const url = await getContestantImageUrl(contestant, numericSeasonId);
              newImageUrls[contestant.id] = url;
            } catch (error) {
              console.error(`Error loading image for ${contestant.name}:`, error);
              newImageUrls[contestant.id] = '/placeholder.jpg';
            }
          }
        }
        setContestantImageUrls(newImageUrls);
      }
    };

    loadContestantImages();
  }, [selectedSeason]);

  // Load contestant images from search results
  useEffect(() => {
    const loadSearchResultImages = async () => {
      if (!searchTerm.trim()) return;
      
      const matchingContestants = getMatchingContestants();
      if (matchingContestants.length === 0) return;
      
      const newImageUrls = { ...contestantImageUrls };
      
      for (const contestant of matchingContestants) {
        if (!newImageUrls[contestant.id]) {
          try {
            const numericSeasonId = contestant.seasonId.startsWith('s') ? 
              contestant.seasonId.substring(1) : contestant.seasonId;
            const url = await getContestantImageUrl(contestant, numericSeasonId);
            newImageUrls[contestant.id] = url;
          } catch (error) {
            console.error(`Error loading image for ${contestant.name}:`, error);
            newImageUrls[contestant.id] = '/placeholder.jpg';
          }
        }
      }
      
      setContestantImageUrls(newImageUrls);
    };
    
    loadSearchResultImages();
  }, [searchTerm, contestantImageUrls]);

  const handleBackClick = () => {
    // Just go back to seasons view - the useEffect will handle restoring scroll
    setSelectedSeason(null);
  };

  // Handle start of dragging for contestants
  const handleDragStart = (e, contestant) => {
    if (!contestant || !contestant.id) {
        console.error("Drag start failed: No contestant or ID");
        e.preventDefault();
        return;
    }

    // Restore original image URL logic
    const imageUrl = contestant.imageUrl || contestantImageUrls[contestant.id] || "/images/placeholder.jpg";

    const data = {
        id: contestant.id,
        name: contestant.name || 'Unknown Contestant',
        imageUrl: imageUrl, 
        isSeason: false
    };

    try {
        const jsonData = JSON.stringify(data);
        e.dataTransfer.setData('text/plain', jsonData);

        e.dataTransfer.effectAllowed = 'move';

        if (e.currentTarget) {
            e.currentTarget.classList.add('dragging-item');
        }
    } catch (error) {
        console.error("Error during drag start:", error);
        e.preventDefault();
    }
  };

  // Handle drag end event
  const handleDragEnd = (e) => {
    if (e.currentTarget) {
        e.currentTarget.classList.remove('dragging-item');
    }
  };

  // Handle drag over event
  const handleDragOver = (e, targetId) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    
    // Add visual feedback for the drop target
    if (targetId !== dropTarget) {
      setDropTarget(targetId);
      
      // Remove drag-over class from all elements
      const dropTargets = document.querySelectorAll('.drop-target');
      dropTargets.forEach(target => {
        target.classList.remove('drag-over');
      });
      
      // Add drag-over class to current target
      if (e.currentTarget) {
        e.currentTarget.classList.add('drag-over');
      }
    }
    return false;
  };

  // Handle drag leave event
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    setDropTarget(null);
  };
  
  // Handle drop of contestant
  const handleDrop = (e, targetId) => {
    e.preventDefault();
    e.stopPropagation();
    
    const data = e.dataTransfer.getData('text/plain');
    if (data) {
      try {
        const contestant = JSON.stringify(data);
        console.log('Dropped contestant:', draggedContestant?.name, 'onto target:', targetId);
        
        // Here you would implement the logic to handle the drop
        // For example, adding the contestant to a list
        
        // Remove visual feedback
        e.currentTarget.classList.remove('drag-over');
        setDropTarget(null);
      } catch (error) {
        console.error('Error parsing dropped data:', error);
      }
    }
  };

  // Add new method for handling season drag start
  const handleSeasonDragStart = (e, season) => {
    try {
      // Add the seasonLogoUrl to the season data for displaying in lists
      const seasonWithImage = {
        ...season,
        imageUrl: seasonLogoUrls[season.id] || "https://via.placeholder.com/150?text=Loading...",
        isSeason: true // Mark this as a season for type checking later
      };
      
      // Store data in multiple formats for better browser compatibility
      const data = JSON.stringify(seasonWithImage);
      console.log('Starting drag with season data:', data);
      
      // Set the data in different formats for maximum compatibility
      e.dataTransfer.setData('application/json', data);
      e.dataTransfer.setData('text/plain', data);
      
      // Set a custom property to indicate the source is a season
      e.dataTransfer.setData('source', 'season-grid');
      
      // Set the drag image
      if (e.target.querySelector('img')) {
        const img = e.target.querySelector('img');
        e.dataTransfer.setDragImage(img, 25, 25);
      }
      
      e.target.classList.add('dragging');
      
      console.log('Drag started with season:', season.name, season.id);
    } catch (error) {
      console.error('Error in handleSeasonDragStart:', error);
    }
  };
  
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
  const handleContestantClick = (contestant) => {
    if (listUpdateCallback && typeof listUpdateCallback === 'function') {
      // Prepare contestant data with image
      const contestantWithImage = {
        ...contestant,
        imageUrl: contestantImageUrls[contestant.id] || "/placeholder.jpg"
      };
      listUpdateCallback(contestantWithImage);
      hideMenuOnMobile();
    } else {
      hideMenuOnMobile(); 
    }
  };
  
  // New function to handle clicking on a season to add it to the list
  const handleSeasonCardClick = (season) => {
    console.log('Season card clicked:', season.name, 'createMode:', createMode, 'isMobile:', isMobile);
    
    // Always navigate to the season's contestants view
    handleSeasonClick(season.id);
    
    // For mobile in create mode, we don't want to hide yet
    // (we want to show the contestants first, then hide after selection)
  };

  // Handle updating parent elements when not rendering
  useEffect(() => {
    // console.log(`[SeasonList Effect] Running. isMobile=${isMobile}, createMode=${createMode}, showMenuOnMobile=${showMenuOnMobile}`);
    if (isMobile) {
      // Always try to find the element fresh
      const seasonsSection = document.querySelector('.seasons-section'); 
      // console.log('[SeasonList Effect] Found seasonsSection:', seasonsSection);

      if (seasonsSection) {
        if (createMode && showMenuOnMobile) {
          // --- SHOWING MENU --- 
          // console.log('[SeasonList Effect] Applying styles to SHOW menu.');
          document.body.setAttribute('data-page', 'create'); // Keep for potential global styles
          
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
          
        } else {
          // --- HIDING MENU --- 
          // console.log('[SeasonList Effect] Applying styles to HIDE menu.');
          seasonsSection.style.transform = 'translateY(100%)'; // Slide down
          seasonsSection.style.opacity = '0';
          seasonsSection.classList.remove('visible'); // Remove class

          // Re-enable body scrolling
          document.body.style.overflow = '';
          
          // Remove attribute if it exists
          if (document.body.getAttribute('data-page') === 'create') {
            document.body.removeAttribute('data-page');
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
            }
          }, 300); // Match CSS transition time
        }
      } else {
          // console.warn('[SeasonList Effect] Could not find .seasons-section element.');
      }
    }
    
    // Cleanup function remains important
    return () => {
      if (document.body.getAttribute('data-page') === 'create') {
        document.body.removeAttribute('data-page');
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

  // Don't render the component at all ONLY when it's the hidden mobile menu
  // in create mode and not explicitly shown.
  // Render in all other cases (desktop, mobile non-create, mobile create shown).
  if (isMobile && createMode && !showMenuOnMobile) {
    console.log('[SeasonList Render] Returning null (Mobile, Create Mode, Not Shown)');
    return null;
  }

  // console.log('[SeasonList Render] Rendering component');
  return (
    <div ref={sectionRef}>
      {foundIdol && (
        <div className="idol-notification">
          You found a Hidden Immunity Idol! 🏆
        </div>
      )}
      
      {/* Add a swipe handle / close button for mobile that sits at the top of the menu */}
      {isMobile && createMode && (
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
      
      {!selectedSeason ? (
        // Show seasons list
        <>
          <h2 className="section-title">
            {(!isMobile || !createMode) && (
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
                {getMatchingContestants().map((contestant) => (
                  <div
                    key={`${contestant.id}-${contestant.seasonId}`}
                    className="contestant-item"
                    onClick={() => {
                      if (isLoggedIn && createMode) {
                        handleContestantClick(contestant);
                        
                        // Hide the menu on mobile after selecting a contestant from search
                        hideMenuOnMobile();
                      } else {
                        handleSearchContestantClick(contestant.seasonId);
                      }
                    }}
                    draggable={isLoggedIn && createMode}
                    onDragStart={isLoggedIn && createMode ? (e) => handleDragStart(e, contestant) : undefined}
                    onDragEnd={isLoggedIn && createMode ? handleDragEnd : undefined}
                  >
                    <img
                      src={contestantImageUrls[contestant.id] || "/placeholder.jpg"}
                      alt={contestant.name}
                      className="contestant-image"
                      draggable="false"
                    />
                    <div className="contestant-name">
                      {contestant.name}
                    </div>
                    <div className="contestant-season-name">
                      {contestant.seasonName.replace('Survivor: ', '').replace('Survivor ', '')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Show regular season grid
            <div className="seasons-grid" ref={seasonsGridRef}>
              {getFilteredSeasons().map((season) => (
                <div
                  key={season.id}
                  className="season-card"
                  onClick={() => handleSeasonCardClick(season)}
                  draggable={isLoggedIn && createMode}
                  onDragStart={isLoggedIn && createMode ? (e) => handleSeasonDragStart(e, season) : undefined}
                  onDragEnd={isLoggedIn && createMode ? handleDragEnd : undefined}
                >
                  {seasonLogoUrls[season.id] ? (
                    <img 
                      src={seasonLogoUrls[season.id]} 
                      alt={`Season ${season.id.replace('s', '')} Logo`}
                      className="season-logo"
                      draggable="false"
                    />
                  ) : (
                    <div className="season-logo-placeholder">
                      <h3>S{season.id.replace('s', '')}</h3>
                    </div>
                  )}
                  <p>{season.name.replace('Survivor: ', '').replace('Survivor ', '')}</p>
                </div>
              ))}
            </div>
          )}
        </>
      ) :
        // Show contestants when a season is selected
        <div className="contestants-container">
          <h2 className="section-title">
            {(!isMobile || !createMode) && (
              <div 
                className={`collapse-toggle ${isCollapsed ? 'collapsed' : ''}`}
                onClick={toggleCollapse}
                title={isCollapsed ? "Expand seasons menu" : "Collapse seasons menu"}
              />
            )}
            <button className="back-button" onClick={handleBackClick}>
              ← Back to Seasons
            </button>
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
                onClick={() => {
                  if (isLoggedIn && createMode) {
                    handleContestantClick({
                      ...contestant,
                      seasonId: selectedSeason,
                      seasonName: survivorSeasons.find(s => s.id === selectedSeason)?.name || ''
                    });
                    
                    // Hide the menu on mobile after selecting a contestant
                    hideMenuOnMobile();
                  }
                }}
                draggable={isLoggedIn && createMode}
                onDragStart={isLoggedIn && createMode ? 
                  (e) => handleDragStart(e, {
                    ...contestant,
                    seasonId: selectedSeason,
                    seasonName: survivorSeasons.find(s => s.id === selectedSeason)?.name || ''
                  }) : undefined}
                onDragEnd={isLoggedIn && createMode ? handleDragEnd : undefined}
              >
                <img 
                  src={contestantImageUrls[contestant.id] || '/placeholder.jpg'}
                  alt={contestant.name}
                  className="contestant-image"
                  draggable="false"
                />
                <div className="contestant-name">{contestant.name}</div>
              </div>
            ))}
          </div>
        </div>
      }
    </div>
  );
});

export default SeasonList;