import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import './GlobalRankings.css';

const GlobalRankingsLegacy = () => {
  const navigate = useNavigate();
  const [legacyRankings, setLegacyRankings] = useState({});
  const [loading, setLoading] = useState(true);

  // Legacy lists data
  const legacyLists = [
    {
      id: 'season-48',
      name: 'Season 48',
      userName: 'Global Rankings',
      createdAt: new Date('2024-01-01').toISOString(),
      description: 'The final rankings for Survivor Season 48 contestants!',
      contestants: Array(10).fill(null).map((_, i) => ({ id: `slot-s48-${i+1}`, name: `#${i+1}`, imageUrl: '/images/placeholder.jpg', isEmpty: true }))
    }
  ];

  // Load legacy rankings data
  useEffect(() => {
    const loadLegacyRankings = async () => {
      const rankings = {};
      for (const list of legacyLists) {
        try {
          const globalRankingRef = doc(db, 'globalRankingsData', list.id);
          const globalSnap = await getDoc(globalRankingRef);
          if (globalSnap.exists()) {
            const data = globalSnap.data();
            rankings[list.id] = {
              top10: data.top10 || [],
              totalVotes: data.totalVotes || 0
            };
          }
        } catch (error) {
          console.error(`Error loading legacy ranking for ${list.id}:`, error);
          rankings[list.id] = { top10: [], totalVotes: 0 };
        }
      }
      setLegacyRankings(rankings);
      setLoading(false);
    };

    loadLegacyRankings();
  }, []);

  // Function to view a specific legacy ranking
  const viewLegacyRanking = (list) => {
    navigate(`/global-rankings/${list.id}`);
  };

  // Function to render a legacy ranking card
  const renderLegacyRankingCard = (list) => {
    if (!list) return null;
    
    const globalDataForList = legacyRankings[list.id];
    const isLoading = loading;
    const listTotalVotes = globalDataForList?.totalVotes || 0;
    
    let displayContestants = list.contestants;
    let isDisplayingGlobal = false;
    
    if (!isLoading && globalDataForList?.top10 && globalDataForList.top10.length > 0) {
      displayContestants = globalDataForList.top10;
      isDisplayingGlobal = true;
    }
    
    return (
      <div 
        className="ranking-list-container" 
        onClick={() => viewLegacyRanking(list)}
      >
        <h2 className="list-title">{list.name}</h2>
        <p className="list-description">{list.description}</p>
        
        <div className="ranking-list clickable">
          {isLoading ? (
            <div className="loading-message">Loading legacy ranking...</div>
          ) : displayContestants.length === 0 ? (
            <div className="empty-list-message">
              No data available for this legacy ranking
            </div>
          ) : (
            displayContestants.map((contestant, index) => (
              <div 
                key={`${contestant.id}-${index}`} 
                className="ranking-item"
              >
                <div className="ranking-number">{index + 1}</div>
                <img
                  src={contestant.imageUrl || "/images/placeholder.jpg"}
                  className="contestant-image"
                  draggable="false"
                />
                <div className="contestant-name">
                  {contestant.name}
                  {contestant.totalScore !== undefined && 
                    <span className="global-score"> {contestant.totalScore} pts</span>
                  }
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="list-footer">
          <span className="total-votes">Total Votes: {listTotalVotes}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="global-rankings-main-view global-rankings-page-wrapper">
      <h1 className="global-rankings-title">Global Rankings Legacy</h1>

      <div className="global-rankings-description">
        <p>
          View the results from previous Global Ranking challenges. These rankings are now closed and represent the final community votes for each category.
        </p>
      </div>
      
      <hr className="title-separator" />

      <div className="global-lists-container">
        {legacyLists.map(list => renderLegacyRankingCard(list))}
      </div>

      <div className="back-section">
        <button onClick={() => navigate('/global-rankings')} className="back-button">
          Back to Current Rankings
        </button>
      </div>
    </div>
  );
};

export default GlobalRankingsLegacy; 