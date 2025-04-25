import { survivorSeasons } from '../data/survivorData';
import { getContestantImageUrl, getSeasonLogoUrl } from '../firebase';

const imageCache = {};
let isPreloaded = false;
let isPreloading = false;

// --- Listener Mechanism ---
const listeners = new Set();

const notifyListeners = () => {
  // console.log('[ImageCache] Notifying listeners...');
  listeners.forEach(callback => callback());
};

export const subscribeToCacheUpdates = (callback) => {
  listeners.add(callback);
  // Return an unsubscribe function
  return () => {
    listeners.delete(callback);
  };
};
// ------------------------

// Function to get a cached URL
export const getCachedImageUrl = (id) => {
  // Return placeholder if ID not found (preloading status is less relevant now)
  return imageCache[id] || '/images/placeholder.jpg'; 
};

// Function to preload all images
export const preloadImages = async () => {
  // Prevent multiple simultaneous preloads
  if (isPreloading || isPreloaded) {
    // console.log('[ImageCache] Preloading already running or completed.');
    return;
  }
  isPreloading = true;
  console.log('[ImageCache] Starting image URL preloading...');

  const promises = [];
  const uniqueContestantIds = new Set();
  const uniqueSeasonIds = new Set();

  // Collect all unique IDs first
  survivorSeasons.forEach(season => {
    uniqueSeasonIds.add(season.id);
    season.contestants.forEach(contestant => {
      uniqueContestantIds.add(contestant.id);
    });
  });

  // Create promises for fetching contestant image URLs
  uniqueContestantIds.forEach(contestantId => {
    // Find the contestant object to pass to getContestantImageUrl (it needs name etc)
    let contestantData = null;
    let seasonIdNum = null;
    for (const season of survivorSeasons) {
      const foundContestant = season.contestants.find(c => c.id === contestantId);
      if (foundContestant) {
        contestantData = foundContestant;
        seasonIdNum = season.id.startsWith('s') ? season.id.substring(1) : season.id;
        break;
      }
    }

    if (contestantData && seasonIdNum) {
        promises.push(
            getContestantImageUrl(contestantData, seasonIdNum)
            .then(url => {
                imageCache[contestantId] = url;
                notifyListeners(); // Notify after successful fetch
            })
            .catch(error => {
                console.warn(`[ImageCache] Failed to preload image URL for contestant ${contestantId}:`, error);
                imageCache[contestantId] = '/images/placeholder.jpg'; // Store placeholder on error
                notifyListeners(); // Notify even on error (placeholder is set)
            })
        );
    } else {
         console.warn(`[ImageCache] Could not find data for contestant ID: ${contestantId}`);
         imageCache[contestantId] = '/images/placeholder.jpg';
         notifyListeners(); // Notify if data not found (placeholder set)
    }
  });

  // Create promises for fetching season logo URLs
  uniqueSeasonIds.forEach(seasonId => {
    promises.push(
      getSeasonLogoUrl(seasonId)
        .then(url => {
          imageCache[seasonId] = url;
          notifyListeners(); // Notify after successful fetch
        })
        .catch(error => {
          console.warn(`[ImageCache] Failed to preload logo URL for season ${seasonId}:`, error);
          imageCache[seasonId] = '/images/placeholder.jpg'; // Store placeholder on error
          notifyListeners(); // Notify even on error (placeholder is set)
        })
    );
  });

  // Wait for all fetches to complete (or fail)
  try {
    await Promise.all(promises);
    isPreloaded = true;
    isPreloading = false;
    console.log(`[ImageCache] Preloading finished. Cached ${Object.keys(imageCache).length} image URLs.`);
    // Optional: Final notification could go here, but notifying after each fetch is likely sufficient
    // notifyListeners(); 
  } catch (error) { 
    // Although individual errors are caught, catch potential Promise.all errors
    console.error("[ImageCache] Unexpected error during Promise.all:", error);
    isPreloading = false; // Ensure flag is reset on unexpected error
  }
}; 