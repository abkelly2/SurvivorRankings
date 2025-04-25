import React, { useState, useEffect, useRef } from 'react';
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
  
  // Determine current page from location
  const currentPage = location.pathname;
  
  // --- MODIFIED createMode LOGIC --- 
  // Create mode is active on the /create page OR on a global ranking detail page IF logged in
  const isOnCreatePage = currentPage === '/create';
  const isOnGlobalRankingDetailPage = currentPage.startsWith('/global-rankings/') && currentPage.split('/').length > 2;
  const createMode = isOnCreatePage || (isOnGlobalRankingDetailPage && !!user);
  // --- END MODIFIED LOGIC ---
  
  const showUserLists = currentPage === '/mylists';
  const showOtherLists = currentPage.includes('/rankings');
  
  // Set data-page attribute on body based on current page
  useEffect(() => {
    if (createMode) {
      document.body.setAttribute('data-page', 'create');
    } else {
      document.body.setAttribute('data-page', 'other');
      
      // Make sure to remove any mobile menu classes when not in create mode
      document.body.classList.remove('show-seasons-mobile');
    }
    
    return () => {
      // Cleanup function
      document.body.removeAttribute('data-page');
    };
  }, [createMode, currentPage]);
  
  // Set background images dynamically
  useEffect(() => {
    // Add background image paths as CSS variables
    document.documentElement.style.setProperty('--survivor-background', `url(${survivorBackgroundImg})`);
    document.documentElement.style.setProperty('--tribal-background', tribalBackground);
  }, []);

  // Listen for authentication state changes
  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((user) => {
      setUser(user);
      if (user) {
        console.log('User is signed in:', user.displayName);
      } else {
        console.log('User is signed out');
      }
    });

    return () => unsubscribe();
  }, [navigate, location.pathname]);

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
    navigate('/mylists');
  };

  const navigateToOtherLists = () => {
    navigate('/rankings');
  };

  const navigateToHome = () => {
    navigate('/');
  };

  const startNewList = () => {
    setUserList([]);
    setListName('');
    setListDescription('');
    setListTags([]);
    setEditingListId(null);
    navigate('/create');
  };

  const editExistingList = (list) => {
    setUserList(list.contestants || []);
    setListName(list.name || '');
    setListDescription(list.description || '');
    setListTags(list.tags || []);
    setEditingListId(list.id);
    navigate('/create');
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

  return (
    <div className="App">
      <UserProvider user={user}>
        <header className="App-header">
          <div className="global-rankings-container">
            <button 
              onClick={() => navigate('/global-rankings')} 
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
                {/* My Lists Button */} 
                <button 
                  onClick={() => user ? navigateToMyLists() : navigate('/login')}
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
                   <button onClick={() => navigate('/login')} className="login-button"> {/* Use a different class if needed */} 
                    Login
                  </button>
                )}
            </div>
            
            {/* Show last updated only if logged in (optional, could be moved) */} 
            {user && lastUpdated && !createMode && !showUserLists && !showOtherLists && (
              <p className="last-updated">
                Last updated: {new Date(lastUpdated).toLocaleString()}
              </p>
            )}
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
                  !user ? (
                    <Navigate to="/login" />
                  ) : (
                    <MyListsPage 
                      user={user} 
                      onSelectList={(list) => {
                        console.log('[App.js onSelectList] Navigating with:', { userId: list.userId, listId: list.id });
                        navigate(`/list/${list.userId}/${list.id}`);
                      }} 
                      onCreateNew={startNewList} 
                    />
                  )
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
                  !user ? (
                    <Navigate to="/login" />
                  ) : (
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
                  )
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