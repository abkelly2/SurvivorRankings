/* eslint-disable indent */

// Use the specific v2 trigger import
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
// Import the admin SDK
const admin = require("firebase-admin");

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
    console.log(`Recalculating global ranking for: ${listId}`);

    const contestantScores = {}; // { contestantId: { totalScore: X, name: Y, imageUrl: Z, votes: N } }
    let totalVotes = 0;

    // 1. Fetch all user rankings
    const allUserRankingsSnapshot = await db.collection("userGlobalRankings").get();

    allUserRankingsSnapshot.forEach((doc) => {
        const userData = doc.data();
        // Check if this user has submitted a ranking for the specific listId
        if (userData && userData[listId] && userData[listId].ranking) {
            const userRanking = userData[listId].ranking;
            totalVotes++; // Count this user's submission

            // 2. Iterate through the user's ranking and assign points
            userRanking.forEach((contestant, index) => {
                // Only score non-empty slots
                if (contestant && !contestant.isEmpty && contestant.id) {
                    const points = getPointsForRank(index);
                    if (points > 0) {
                        if (!contestantScores[contestant.id]) {
                            // First time seeing this contestant
                            contestantScores[contestant.id] = {
                                id: contestant.id, // Ensure ID is stored
                                totalScore: 0,
                                name: contestant.name || "Unknown",
                                imageUrl: contestant.imageUrl || "/images/placeholder.jpg",
                                voteCount: 0, // How many lists included this contestant
                            };
                        }
                        contestantScores[contestant.id].totalScore += points;
                        contestantScores[contestant.id].voteCount += 1;
                        // Update name/image potentially (take latest seen?) - simple approach for now
                        contestantScores[contestant.id].name = contestant.name || contestantScores[contestant.id].name;
                        contestantScores[contestant.id].imageUrl = contestant.imageUrl || contestantScores[contestant.id].imageUrl;
                    }
                }
            });
        }
    });

    // 3. Convert scores object to array and sort
    const sortedContestants = Object.values(contestantScores).sort(
        (a, b) => b.totalScore - a.totalScore // Sort descending by score
    );

    // 4. Get the top 10
    const top10 = sortedContestants.slice(0, 10);

    console.log(`Top 10 for ${listId}:`, top10.map((c) => `${c.name}: ${c.totalScore}`).join(", "));

    // 5. Save the result to Firestore
    const globalRankingRef = db.collection("globalRankingsData").doc(listId);
    try {
        await globalRankingRef.set({
            top10: top10, // Store the array of top 10 contestant objects
            totalVotes: totalVotes, // Store how many users contributed
            calculatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`Successfully saved global ranking for ${listId}`);
    } catch (error) {
        console.error(`Failed to save global ranking for ${listId}:`, error);
        // Rethrow error to be caught by the main try/catch
        throw error;
    }
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
    const validListIds = ["goat-strategy", "goat-social", "goat-competitor"];

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