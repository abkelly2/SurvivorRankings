import React from 'react';
import './ListView.css';

const ListView = ({ list, onBack }) => {
  if (!list) return null;
  
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  return (
    <div className="list-view">
      <div className="list-view-header">
        <h2>{list.name}</h2>
        
        <div className="list-meta">
          <span className="created-by">By: {list.userName || "Unknown"}</span>
          <span className="created-date">Created: {formatDate(list.createdAt)}</span>
          <span className="upvotes">Upvotes: {list.upvoteCount || 0}</span>
        </div>
        
        {list.tags && list.tags.length > 0 && (
          <div className="list-tags">
            {list.tags.map(tag => (
              <span key={tag} className="list-tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
      
      <button className="back-button" onClick={onBack}>
        Back to Lists
      </button>
      
      <div className="full-list ranking-list-container">
        <h3>Complete Ranking</h3>
        
        {list.contestants && list.contestants.length > 0 ? (
          <ol className="contestants-list ranking-list">
            {list.contestants.map((contestant, index) => (
              <li key={index} className="list-contestant-item ranking-item">
                <div className="contestant-rank ranking-number">{index + 1}</div>
                <img 
                  src={contestant.imageUrl || "https://via.placeholder.com/70"}
                  alt={contestant.name}
                  className="contestant-image"
                />
                <div className="contestant-name">{contestant.name}</div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-message empty-list-message">This list is empty</p>
        )}
      </div>
    </div>
  );
};

export default ListView; 