import React, { useState, useEffect } from 'react';
import { Droppable, Draggable } from 'react-beautiful-dnd';
import { getContestantImageUrl } from '../firebase';
import { survivorSeasons } from '../data/survivorData';

const RankingList = ({ items, droppableId, maxItems = 20 }) => {
  const [imageUrls, setImageUrls] = useState({});

  // Load image URLs for contestants in the list
  useEffect(() => {
    const loadImages = async () => {
      const newImageUrls = { ...imageUrls };
      
      for (const contestant of items) {
        if (!imageUrls[contestant.id]) {
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
              newImageUrls[contestant.id] = '/placeholder.jpg';
            }
          }
        }
      }
      
      setImageUrls(newImageUrls);
    };
    
    loadImages();
  }, [items]);

  return (
    <Droppable droppableId={droppableId}>
      {(provided) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className="ranking-list-container"
        >
          {items.length === 0 ? (
            <div className="empty-list-message">
              Drag contestants here to start your ranking
            </div>
          ) : (
            items.map((contestant, index) => (
              <Draggable
                key={contestant.id}
                draggableId={contestant.id}
                index={index}
              >
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className="ranking-item"
                  >
                    <div className="ranking-number">{index + 1}</div>
                    <img
                      src={imageUrls[contestant.id] || "https://via.placeholder.com/150?text=Loading..."}
                      alt={contestant.name}
                      className="contestant-image"
                    />
                    <div className="contestant-name">{contestant.name}</div>
                  </div>
                )}
              </Draggable>
            ))
          )}
          {provided.placeholder}
          {items.length >= maxItems && (
            <div className="max-items-message">
              Maximum of {maxItems} contestants reached
            </div>
          )}
        </div>
      )}
    </Droppable>
  );
};

export default RankingList; 