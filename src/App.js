import React, { useState, useEffect, useRef, useContext, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import './App.css';
import SeasonList from './components/SeasonList';
import Login from './components/Login';
import { survivorBackground, tribalBackground } from './images';
import { 
  getRankingsFromFirestore, 
  saveRankingsToFirestore, 
  subscribeToRankingsUpdates,
  subscribeToAuthChanges,
  logOut
} from './firebase';
import { UserProvider } from './UserContext';
import GlobalRankingsIcon from './images/GlobalRankings.png';
import { preloadImages } from './utils/imageCache';
import Notifications from './components/Notifications';
import PalmFrondTransition from './components/PalmFrondTransition/PalmFrondTransition';

// Import pages
import HomePage from './pages/HomePage';
import MyListsPage from './pages/MyListsPage';
import RankingsPage from './pages/RankingsPage';
import ListCreatorPage from './pages/ListCreatorPage';
import LoginPage from './pages/LoginPage';
import ListDetailPage from './pages/ListDetailPage';
import GlobalRankings from './components/GlobalRankings';

// Import survivor background image directly
import survivorBackgroundImg from './images/survivor-background.jpg';
import globalBackgroundImg from './images/global-background.png';

const LIST_CREATOR_DRAFT_KEY = 'listCreatorDraft'; // Define key for sessionStorage

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [maddysList, setMaddysList] = useState([]);
  const [andrewsList, setAndrewsList] = useState([]);
  const [kendallsList, setKendallsList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [user, setUser] = useState(null);
  const [userList, setUserList] = useState([]);
  const [listName, setListName] = useState('');
  const [listDescription, setListDescription] = useState('');
  const [listTags, setListTags] = useState([]);
  const [editingListId, setEditingListId] = useState(null);
  const seasonListRef = useRef(null);
  const [isAnimatingTransition, setIsAnimatingTransition] = useState(false);
  const [transitionCallback, setTransitionCallback] = useState(null);
  const [transitionDirection, setTransitionDirection] = useState('forward');
  
  // Determine current page from location
  const currentPage = location.pathname;
  
  // --- MODIFIED createMode LOGIC --- 
  // Create mode is active on the /create page OR on a global ranking detail page IF logged in
  const isOnCreatePage = currentPage === '/create';
  const isOnGlobalRankingsPage = currentPage.startsWith('/global-rankings'); 
  const isOnGlobalRankingDetailPage = isOnGlobalRankingsPage && currentPage.split('/').length > 2;
  const createMode = isOnCreatePage || (isOnGlobalRankingDetailPage && !!user && !isOnGlobalRankingsPage);
  // --- END MODIFIED LOGIC ---
  
  const showUserLists = currentPage === '/mylists';
  const showOtherLists = currentPage.includes('/rankings');
  
  // Set data-page attribute on body based on current page
  useEffect(() => {
    if (isOnGlobalRankingsPage) {
      document.body.setAttribute('data-page', 'global');
    } else if (createMode) {
      document.body.setAttribute('data-page', 'create');
    } else {
      document.body.setAttribute('data-page', 'other');
      
      // Ensure mobile menu classes are managed correctly based on actual page context
      if (!createMode && !isOnGlobalRankingsPage) { // Or adjust if global page can have mobile menu for seasons
          document.body.classList.remove('show-seasons-mobile');
      }
    }
    
    return () => {
      // Cleanup function
      document.body.removeAttribute('data-page');
    };
  }, [createMode, currentPage, isOnGlobalRankingsPage]);
  
  // Set background images dynamically
  useEffect(() => {
    document.documentElement.style.setProperty('--survivor-background', `url(${survivorBackgroundImg})`);
    document.documentElement.style.setProperty('--tribal-background', tribalBackground);
    document.documentElement.style.setProperty('--global-background', `url(${globalBackgroundImg})`);
  }, []);

  // <<< ADD NEW EFFECT: Check for pending redirect on any page load >>>
  useEffect(() => {
    // Skip when not authenticated - we can't redirect to /create without a user
    if (!user) return;
    
    // Check if we have a pending list action stored
    const postLoginActionString = sessionStorage.getItem('postLoginAction');
    if (postLoginActionString && location.pathname !== '/create') {
      try {
        console.log('Found pending list action, redirecting to /create page');
        const action = JSON.parse(postLoginActionString);
        // Clear immediately to avoid redirect loops
        sessionStorage.removeItem('postLoginAction');
        
        if (action.path === '/create' && action.data) {
          // Force the navigation to /create with state data
          console.log('Redirecting to /create with pending list data');
          navigate('/create', { 
            state: { pendingListData: action.data },
            replace: true // Replace current history entry
          });
        }
      } catch (error) {
        console.error('Error processing redirect:', error);
        sessionStorage.removeItem('postLoginAction');
      }
    }
  }, [user, location.pathname, navigate]); // Run when these dependencies change

  // Listen for authentication state changes
  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((user) => {
      setUser(user);
      if (user) {
        console.log('User is signed in:', user.displayName);
        // DO NOT navigate anywhere after login - let Login.js handle it
      } else {
        console.log('User is signed out');
        // Optional: Add navigation logic for sign-out if needed
      }
    });

    return () => unsubscribe();
  }, []); // Keep empty dependency array

  // --- EFFECT TO LOAD DRAFT or HANDLE EXPLICIT NAVIGATION TO /create ---
  useEffect(() => {
    if (location.pathname === '/create' && user) { // Only attempt to load draft if on /create and logged in
      const postLoginActionString = sessionStorage.getItem('postLoginAction');
      if (postLoginActionString) {
        try {
          const action = JSON.parse(postLoginActionString);
          sessionStorage.removeItem('postLoginAction'); // Consume immediately
          if (action.path === '/create' && action.data) {
            console.log('[App.js] Applying postLoginAction data to /create state.');
            setUserList(action.data.contestants || []);
            setListName(action.data.name || '');
            setListDescription(action.data.description || '');
            setListTags(action.data.tags || []);
            setEditingListId(action.data.id || null);
            sessionStorage.removeItem(LIST_CREATOR_DRAFT_KEY); // Clear any other draft
            return; // Applied, so exit
          }
        } catch (error) {
          console.error('Error processing postLoginAction for /create:', error);
        }
      }

      // If navigating with explicit editingListId in state (from editExistingList), prioritize that.
      // The editExistingList function itself sets the state from the actual list data.
      // This check ensures we don't then overwrite it with a stale sessionStorage draft.
      if (location.state?.editingListId && location.state?.source === 'editExistingList') {
        console.log('[App.js] Navigated to /create via editExistingList. Draft loading skipped.');
        // editExistingList should have already cleared the draft.
        return;
      }
      
      const draftDataString = sessionStorage.getItem(LIST_CREATOR_DRAFT_KEY);
      if (draftDataString) {
        try {
          console.log('[App.js] Found list creator draft in sessionStorage for /create. Applying to state.');
          const draftData = JSON.parse(draftDataString);
          setUserList(draftData.userList || []);
          setListName(draftData.listName || '');
          setListDescription(draftData.listDescription || '');
          setListTags(draftData.listTags || []);
          setEditingListId(draftData.editingListId || null);
        } catch (error) {
          console.error('Error parsing list creator draft from sessionStorage:', error);
          sessionStorage.removeItem(LIST_CREATOR_DRAFT_KEY); // Clear corrupted draft
        }
      }
    }
  }, [location.pathname, location.state, user, navigate]); // user and navigate added for robust handling of postLoginAction

  // --- EFFECT TO SAVE DRAFT TO SESSION STORAGE ---
  useEffect(() => {
    // Only save draft if on /create page OR if editingListId is active (implies create/edit session)
    // And if the user is logged in.
    if (user && (location.pathname === '/create' || editingListId !== null)) {
      const draftData = {
        userList,
        listName,
        listDescription,
        listTags,
        editingListId,
      };
      // Avoid saving an "empty" initial draft if all fields are default/empty, unless an editingListId is present
      const isEmptyNewDraft = !editingListId && !userList.length && !listName && !listDescription && !listTags.length;

      if (!isEmptyNewDraft || editingListId) {
        // console.log('[App.js] Saving list creator draft to sessionStorage:', draftData);
        sessionStorage.setItem(LIST_CREATOR_DRAFT_KEY, JSON.stringify(draftData));
      }
    }
    // Dependencies are the actual data points for the draft.
  }, [userList, listName, listDescription, listTags, editingListId, user, location.pathname]);

  // Load initial data from Firestore
  useEffect(() => {
    // Only load data if user is authenticated
    if (!user) {
      setIsLoading(false);
      return;
    }

    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        const data = await getRankingsFromFirestore();
        setMaddysList(data.maddysList || []);
        setAndrewsList(data.andrewsList || []);
        setKendallsList(data.kendallsList || []);
        setLastUpdated(data.lastUpdated || null);
      } catch (error) {
        console.error("Error loading initial data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, [user]);

  // Set up real-time listener for updates
  useEffect(() => {
    // Only subscribe to updates if user is authenticated
    if (!user) return;

    const unsubscribe = subscribeToRankingsUpdates((data) => {
      // Only update if the data is different to avoid infinite loops
      const newMaddysList = data.maddysList || [];
      const newAndrewsList = data.andrewsList || [];
      const newKendallsList = data.kendallsList || [];
      const newLastUpdated = data.lastUpdated || null;
      
      // Check if the lists actually changed to avoid re-renders
      if (JSON.stringify(newMaddysList) !== JSON.stringify(maddysList)) {
        setMaddysList(newMaddysList);
      }
      
      if (JSON.stringify(newAndrewsList) !== JSON.stringify(andrewsList)) {
        setAndrewsList(newAndrewsList);
      }
      
      if (JSON.stringify(newKendallsList) !== JSON.stringify(kendallsList)) {
        setKendallsList(newKendallsList);
      }
      
      setLastUpdated(newLastUpdated);
    });

    // Cleanup function to unsubscribe when component unmounts
    return () => unsubscribe();
  }, [user, maddysList, andrewsList, kendallsList]);

  // Custom setters that update Firestore
  const updateMaddysList = (newList) => {
    setMaddysList(newList);
    saveRankingsToFirestore(newList, andrewsList, kendallsList);
  };

  const updateAndrewsList = (newList) => {
    setAndrewsList(newList);
    saveRankingsToFirestore(maddysList, newList, kendallsList);
  };

  const updateKendallsList = (newList) => {
    setKendallsList(newList);
    saveRankingsToFirestore(maddysList, andrewsList, newList);
  };

  const navigateToMyLists = () => {
    // Check if currently on global rankings
    if (location.pathname.startsWith('/global-rankings')) {
      startTransitionAndNavigate('/mylists');
    } else {
      navigate('/mylists');
    }
  };

  const navigateToOtherLists = () => {
    // Check if currently on global rankings
    if (location.pathname.startsWith('/global-rankings')) {
      startTransitionAndNavigate('/rankings');
    } else {
      navigate('/rankings');
    }
  };

  const navigateToHome = () => {
    // Check if currently on global rankings
    if (location.pathname.startsWith('/global-rankings')) {
      startTransitionAndNavigate('/');
    } else {
      navigate('/');
    }
  };

  const startNewList = () => {
    const existingDraft = sessionStorage.getItem(LIST_CREATOR_DRAFT_KEY);

    if (existingDraft) {
      console.log('[App.js] startNewList: Existing draft found in sessionStorage. Navigating to /create to load it.');
      // Don't clear states here; the /create page loader will pick up the sessionStorage draft.
    } else {
      console.log('[App.js] startNewList: No draft found. Clearing states for a fresh list.');
      setUserList([]);
      setListName('');
      setListDescription('');
      setListTags([]);
      setEditingListId(null);
      // No need to remove draft from session storage if it doesn't exist.
    }
    navigate('/create');
  };

  const editExistingList = (list) => {
    // When explicitly editing a list, we load ITS data, not a potential draft.
    // The list data itself is fetched in MyListsPage and passed here.
    // Or, if only ID is passed, it would be fetched from Firestore.
    // For now, assume `list` object is complete as passed from MyListsPage.
    setUserList(list.contestants || []);
    setListName(list.name || '');
    setListDescription(list.description || '');
    setListTags(list.tags || []);
    setEditingListId(list.id);
    sessionStorage.removeItem(LIST_CREATOR_DRAFT_KEY); // Clear any draft
    console.log(`[App.js] Editing existing list ID: ${list.id}. Draft cleared.`);
    navigate('/create', { state: { editingListId: list.id, source: 'editExistingList' } }); // Pass source for clarity
  };

  const handleLogout = async () => {
    try {
      await logOut();
      // Reset all user-related states
      setUserList([]);
      setListName('');
      setListDescription('');
      setListTags([]);
      setEditingListId(null);
      sessionStorage.removeItem(LIST_CREATOR_DRAFT_KEY); // Clear draft on logout
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Function to handle viewing a specific user's lists
  const handleViewUserLists = (userId, userName) => {
    navigate(`/rankings/user/${userId}`, { state: { userName } });
  };

  // Add useEffect to trigger preloading
  useEffect(() => {
    // Preload image URLs in the background
    preloadImages();
  }, []); // Empty dependency array ensures this runs only once on mount

  // Effect to update editingListId ONLY when navigating to /create with state
  useEffect(() => {
    // Check if we are on the /create page AND state with editingListId exists
    if (location.pathname === '/create' && location.state?.editingListId) {
        const newEditingId = location.state.editingListId;
        // Only update if the ID is different from the current state
        if (newEditingId !== editingListId) {
            console.log("[App.js] Setting editingListId from navigation state:", newEditingId);
            setEditingListId(newEditingId);
        }
    } else if (location.pathname !== '/create' && editingListId !== null) {
        // If we navigate AWAY from /create, clear the editing state
        console.log("[App.js] Navigated away from /create, clearing editingListId.");
        setEditingListId(null);
    }
    // Dependency only on pathname and the state value itself
  }, [location.pathname, location.state?.editingListId, editingListId]);

  const startTransitionAndNavigate = (path, direction = 'forward') => {
    setTransitionDirection(direction);
    setTransitionCallback(() => () => navigate(path)); 
    setIsAnimatingTransition(true);
  };

  const handleAnimationHalfway = useCallback(() => {
    if (transitionCallback) {
      const navigateFn = transitionCallback();
      if (navigateFn) {
        navigateFn();
      }
    }
  }, [transitionCallback]);

  const handleAnimationComplete = useCallback(() => {
    setIsAnimatingTransition(false);
    setTransitionCallback(null);
  }, [setIsAnimatingTransition, setTransitionCallback]);
  
  // Example of how to use it for another navigation if needed
  // const navigateToHomeWithTransition = () => startTransitionAndNavigate('/', 'backward'); 

  return (
    <div className="App">
      <PalmFrondTransition 
        isAnimating={isAnimatingTransition}
        direction={transitionDirection}
        onAnimationHalfway={handleAnimationHalfway}
        onAnimationComplete={handleAnimationComplete}
      />
      <UserProvider user={user}>
        <header className="App-header">
          <div className="global-rankings-container">
            <button 
              onClick={() => startTransitionAndNavigate('/global-rankings')} 
              className="global-rankings-button"
              title="Global Rankings"
            >
              <img src={GlobalRankingsIcon} alt="Global Rankings" />
            </button>
          </div>
          <h1 onClick={navigateToHome} className="site-title">Survivor Rankings</h1>
          
          {/* Always render the button container, adjust content based on user */} 
          <div className="user-info">
            {/* Show welcome message only if logged in */}
            {user && (
              <span className="welcome-message">Welcome, {user.displayName}</span>
            )}
            
            <div className="user-actions">
                {/* Notifications Button */}
                {user && <Notifications />}
                
                {/* My Lists Button */} 
                <button 
                  onClick={navigateToMyLists}
                  className="create-list-button"
                >
                  My Lists
                </button>
                
                {/* Other Rankings Button */} 
                <button onClick={navigateToOtherLists} className="other-lists-button">
                  Other Rankings
                </button>
                
                {/* Conditional Login/Logout Button */} 
                {user ? (
                   <button onClick={handleLogout} className="logout-button">
                    Sign Out
                  </button>
                 ) : (
                   <button onClick={() => navigate('/login')} className="login-button">
                    Login
                  </button>
                )}
            </div>
          </div>
        </header>
        <main>
          <div className="rankings-section">
            <Routes>
              <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
              
              <Route 
                path="/" 
                element={
                  isLoading ? (
                    <div className="loading">Loading rankings...</div>
                  ) : (
                    <HomePage onViewUserLists={handleViewUserLists} />
                  )
                } 
              />
              
              <Route 
                path="/mylists" 
                element={
                  <MyListsPage 
                    user={user} 
                    onSelectList={(list) => {
                      console.log('[App.js onSelectList] Navigating with:', { userId: list.userId, listId: list.id });
                      navigate(`/list/${list.userId}/${list.id}`);
                    }} 
                    onCreateNew={startNewList} 
                  />
                } 
              />
              
              <Route 
                path="/rankings" 
                element={
                  <RankingsPage />
                } 
              />
              
              <Route 
                path="/rankings/user/:userId" 
                element={
                  <RankingsPage />
                } 
              />
              
              <Route 
                path="/list/:userId/:listId" 
                element={
                  <ListDetailPage />
                } 
              />
              
              <Route 
                path="/create" 
                element={
                  <ListCreatorPage 
                    userList={userList} 
                    setUserList={setUserList}
                    listName={listName}
                    setListName={setListName}
                    listDescription={listDescription}
                    setListDescription={setListDescription}
                    listTags={listTags}
                    setListTags={setListTags}
                    user={user}
                    editingListId={editingListId}
                    onCancel={navigateToMyLists}
                    seasonListRef={seasonListRef}
                  />
                } 
              />
              
              <Route path="/global-rankings" element={<GlobalRankings seasonListRef={seasonListRef} />} />
              
              <Route path="/global-rankings/:listId" element={<GlobalRankings seasonListRef={seasonListRef} />} />
              
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </div>
          <section className="seasons-section">
            <SeasonList 
              ref={seasonListRef}
              maddysList={createMode ? userList : maddysList}
              andrewsList={createMode ? [] : andrewsList}
              kendallsList={createMode ? [] : kendallsList}
              setMaddysList={createMode ? setUserList : updateMaddysList}
              setAndrewsList={createMode ? () => {} : updateAndrewsList}
              setKendallsList={createMode ? () => {} : updateKendallsList}
              user={user}
              createMode={createMode}
            />
          </section>
        </main>
        <footer className="App-footer">
          <a href="https://www.linkedin.com/in/andrew-kelly-compsci/" target="_blank" rel="noopener noreferrer">LinkedIn</a> | 
          <a href="https://andrewkelly.xyz" target="_blank" rel="noopener noreferrer">Website Resume</a>
        </footer>
      </UserProvider>
    </div>
  );
}

export default App; 