/* eslint-disable indent */

// Use the specific v2 trigger import
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
// Import the admin SDK
const admin = require("firebase-admin");
const { onCreateListLike, onCreateCommentLike, onCreateComment } = require('./src/notifications');

// Initialize Admin SDK (should only happen once)
admin.initializeApp();
const db = admin.firestore();

// --- Helper Functions ---

// Function to calculate points based on rank (adjust scoring as needed)
function getPointsForRank(index) {
    // Simple inverse scoring: #1 = 10 pts, #10 = 1 pt
    if (index >= 0 && index < 10) {
        return 10 - index;
    }
    return 0; // No points for ranks outside top 10
}

// Helper function to perform recalculation for a specific listId
async function recalculateForList(listId) {
    console.log(`[recalculateForList] START - Recalculating for: ${listId}`); // START Log

    const contestantScores = {};
    let totalVotes = 0;
    let errorsProcessingUserRankings = 0;

    // 1. Fetch all user rankings
    let allUserRankingsSnapshot;
    try {
        allUserRankingsSnapshot = await db.collection("userGlobalRankings").get();
        console.log(`[recalculateForList] Fetched ${allUserRankingsSnapshot.size} user ranking documents for ${listId}.`);
    } catch (fetchError) {
        console.error(`[recalculateForList] CRITICAL ERROR fetching user rankings for ${listId}:`, fetchError);
        return; // Cannot proceed without data
    }

    allUserRankingsSnapshot.forEach((doc) => {
        const userId = doc.id;
        const userData = doc.data();
        
        // 2. Check if this user has data for the specific listId
        if (userData && userData[listId] && userData[listId].ranking) {
            // <<< ADDED Try-Catch around processing a single user's ranking >>>
            try {
                const userRanking = userData[listId].ranking;
                
                // Check if userRanking is actually an array
                if (!Array.isArray(userRanking)) {
                    console.warn(`[recalculateForList] Skipping user ${userId} for list ${listId}: ranking data is not an array. Data:`, userRanking);
                    throw new Error('Ranking data is not an array'); // Throw to be caught below
                }
                
                totalVotes++; // Count this user's submission only if data is valid array
                console.log(`[recalculateForList] Processing valid ranking for user ${userId}, list ${listId}. Current totalVotes: ${totalVotes}`);

                // 3. Iterate through the user's ranking
                userRanking.forEach((contestant, index) => {
                    if (contestant && !contestant.isEmpty && contestant.id) {
                        const points = getPointsForRank(index);
                        if (points > 0) {
                            if (!contestantScores[contestant.id]) {
                                contestantScores[contestant.id] = {
                                    id: contestant.id,
                                    totalScore: 0,
                                    name: contestant.name || "Unknown",
                                    imageUrl: contestant.imageUrl || "/images/placeholder.jpg",
                                    voteCount: 0,
                                };
                            }
                            contestantScores[contestant.id].totalScore += points;
                            contestantScores[contestant.id].voteCount += 1;
                            contestantScores[contestant.id].name = contestant.name || contestantScores[contestant.id].name;
                            contestantScores[contestant.id].imageUrl = contestant.imageUrl || contestantScores[contestant.id].imageUrl;
                        }
                    }
                });
            } catch (userError) {
                errorsProcessingUserRankings++;
                console.error(`[recalculateForList] ERROR processing ranking for user ${userId}, list ${listId}:`, userError);
                // Continue to the next user, do not increment totalVotes if processing failed here
            }
        } else {
           // Optional log: console.log(`[recalculateForList] User ${userId} has no submission for list ${listId}.`);
        }
    }); // End loop through all users

    console.log(`[recalculateForList] Finished processing user rankings for ${listId}. Total valid votes: ${totalVotes}. Errors encountered: ${errorsProcessingUserRankings}.`);

    // 4. Convert scores object to array and sort
    let sortedContestants = [];
    try {
        sortedContestants = Object.values(contestantScores).sort(
            (a, b) => b.totalScore - a.totalScore
        );
    } catch (sortError) {
        console.error(`[recalculateForList] ERROR sorting contestant scores for ${listId}:`, sortError);
        // Attempt to continue with unsorted data or handle appropriately
        sortedContestants = Object.values(contestantScores); 
    }

    // 5. Get the top 10
    const top10 = sortedContestants.slice(0, 10);

    console.log(`[recalculateForList] Top 10 calculated for ${listId}:`, top10.map((c) => `${c.name}: ${c.totalScore}`).join(", ")); // Log 2

    // 6. Save the result
    const globalRankingRef = db.collection("globalRankingsData").doc(listId);
    try {
        await globalRankingRef.set({ // <--- The critical step
            top10: top10,
            totalVotes: totalVotes, // Use the count of *successfully processed* votes
            calculatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastProcessedVotes: totalVotes, // Add explicit fields for debugging
            processingErrors: errorsProcessingUserRankings
        });
        console.log(`[recalculateForList] SUCCESS - Saved global ranking for ${listId}`); // Log 3
    } catch (saveError) {
        console.error(`[recalculateForList] CRITICAL ERROR saving global ranking for ${listId}:`, saveError); // Log 4
        // Do not rethrow here, allow the main function to handle overall errors if needed
    }
    console.log(`[recalculateForList] END - Recalculation attempt finished for: ${listId}`);
}


// --- Cloud Function Definition (using v2 syntax) ---

exports.calculateGlobalRanking = onDocumentWritten("userGlobalRankings/{userId}", async (event) => {
    // Access event data (includes change and context info)
    const change = event.data; // Provides before and after snapshots
    const userId = event.params.userId;

    // Get before and after data snapshots
    const beforeSnap = change?.before;
    const afterSnap = change?.after;
    const beforeData = beforeSnap?.data();
    const afterData = afterSnap?.data();


    // If the document was deleted, do nothing for now (can add recalc later if needed)
    if (!afterSnap?.exists) {
      console.log(`User rankings deleted for ${userId}. No recalculation triggered.`);
      return null;
    }

    const changedListIds = new Set();
    const validListIds = ["goat-strategy", "goat-social", "goat-competitor", "season-48"];

    // Determine which listIds were actually changed or added
    for (const listId in afterData) {
        // Check if this listId is one we care about
        if (!validListIds.includes(listId)) {
            continue; // Skip irrelevant listIds
        }

        let listChanged = false;
        if (!beforeSnap?.exists) {
            // 1. Document was created
            listChanged = true;
            console.log(`Document created, list ${listId} is new/changed.`);
        } else if (!beforeData || !beforeData[listId]) {
            // 2. List was added to an existing document.
            listChanged = true;
            console.log(`List ${listId} added to existing document.`);
        } else {
            // 3. Document and list existed before. Compare rankings.
            const beforeRankingStr = JSON.stringify(beforeData[listId]?.ranking || null);
            const afterRankingStr = JSON.stringify(afterData[listId]?.ranking || null);

            if (beforeRankingStr !== afterRankingStr) {
                listChanged = true;
                console.log(`Ranking changed for list ${listId}.`);
            }
        }

        // If the list changed, add it to the set for recalculation.
        if (listChanged) {
            changedListIds.add(listId);
        }
    }

    // Note: Recalculation on list *removal* is not explicitly handled here,
    // but could be added by checking beforeData keys not in afterData.

    if (changedListIds.size === 0) {
      console.log(`No relevant global list rankings changed for user ${userId}.`);
      return null;
    }

    console.log(`Detected changes for lists: ${[...changedListIds].join(", ")} by user ${userId}. Triggering recalculation.`);

    // --- Recalculate for each changed list ---
    const calculationPromises = [];
    for (const listId of changedListIds) {
        calculationPromises.push(recalculateForList(listId));
    }

    try {
        await Promise.all(calculationPromises);
        console.log(`Successfully recalculated global rankings for lists: ${[...changedListIds].join(", ")}`);
    } catch (error) {
        console.error("Error processing global ranking calculations:", error);
        // Optional: Log more specific error context if needed
    }

    return null; // Indicate function finished
});

// Export the notification functions
exports.onCreateListLike = onCreateListLike;
exports.onCreateCommentLike = onCreateCommentLike;
exports.onCreateComment = onCreateComment;