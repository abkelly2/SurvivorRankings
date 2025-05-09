const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require('firebase-admin');

// Function to create a notification when a list is liked
exports.onCreateListLike = onDocumentUpdated("userLists/{userId}", async (event) => {
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    
    if (!beforeData || !afterData) return null;
    
    // Get the lists arrays
    const beforeLists = beforeData.lists || [];
    const afterLists = afterData.lists || [];
    
    // Find lists that have new upvotes
    const listsWithNewUpvotes = afterLists.filter(afterList => {
      const beforeList = beforeLists.find(b => b.id === afterList.id);
      if (!beforeList) return false;
      
      const beforeUpvotes = beforeList.upvotes || [];
      const afterUpvotes = afterList.upvotes || [];
      
      return afterUpvotes.length > beforeUpvotes.length;
    });
    
    if (listsWithNewUpvotes.length === 0) return null;
    
    try {
      // Create notifications for each list with new upvotes
      const notificationPromises = listsWithNewUpvotes.map(async list => {
        // Get the user who liked the list (the last upvote)
        const likerId = list.upvotes[list.upvotes.length - 1];
        const ownerId = event.params.userId; // Get owner ID
        console.log('Liker ID:', likerId, 'Owner ID:', ownerId);
        
        // *** ADD CHECK: Don't notify if liker is owner ***
        if (likerId === ownerId) {
          console.log(`Skipping notification: User ${likerId} liked their own list ${list.id}.`);
          return null; // Return null to filter out later
        }
        
        // Get the liker's display name
        const likerDoc = await admin.firestore().collection('users').doc(likerId).get();
        const likerData = likerDoc.data();
        const likerName = likerData?.displayName || 'Someone';
        console.log('Liker name:', likerName);
        
        const notificationData = {
          userId: ownerId, // The list owner's ID
          type: 'list_like',
          listId: list.id,
          createdBy: likerId,
          createdByName: likerName,
          isNew: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        console.log('Creating list like notification with data:', notificationData);
        
        return admin.firestore().collection('notifications').add(notificationData);
      }).filter(promise => promise !== null); // Filter out null promises
      
      // Only proceed if there are valid promises
      if (notificationPromises.length === 0) {
          console.log("No valid list like notifications to send after self-like check.");
          return null;
      }
      
      return Promise.all(notificationPromises);
    } catch (error) {
      console.error('Error creating list like notifications:', error);
      return null;
    }
});

// Function to create a notification when a comment is liked
exports.onCreateCommentLike = onDocumentUpdated("comments/{commentId}", async (event) => {
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    
    if (!beforeData || !afterData) return null;
    
    const beforeUpvotes = beforeData.upvotes || [];
    const afterUpvotes = afterData.upvotes || [];
    
    // Check if a new upvote was added
    const newUpvote = afterUpvotes.find(uid => !beforeUpvotes.includes(uid));
    if (!newUpvote) return null;
    
    // *** ADD CHECK: Don't notify if liker is owner ***
    const ownerId = afterData.userId; // Comment owner
    const actorId = newUpvote;      // User who liked
    if (actorId === ownerId) {
      console.log(`Skipping notification: User ${actorId} liked their own comment ${event.params.commentId}.`);
      return null; // Exit function
    }
    
    try {
      // Get the liker's display name
      const likerDoc = await admin.firestore().collection('users').doc(newUpvote).get();
      const likerData = likerDoc.data();
      const likerName = likerData?.displayName || 'Someone';
      console.log('Comment liker name:', likerName);
      
      const notificationData = {
        userId: ownerId, // The comment owner's ID
        type: 'comment_like',
        commentId: event.params.commentId,
        createdBy: actorId, // Use actorId variable
        createdByName: likerName,
        isNew: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };
      console.log('Creating comment like notification with data:', notificationData);
      
      // Create the notification
      return admin.firestore().collection('notifications').add(notificationData);
    } catch (error) {
      console.error('Error creating comment like notification:', error);
      return null;
    }
});

// Function to create a notification when a comment is created
exports.onCreateComment = onDocumentCreated("comments/{commentId}", async (event) => {
    const commentData = event.data?.data();
    if (!commentData) return null;
    
    const listUserId = commentData.listUserId;
    const listId = commentData.listId;
    const parentId = commentData.parentId;
    const actorId = commentData.userId; // User who commented
    
    // Check for Global Rankings comments (listUserId might be null or different)
    // We assume for now that Global Rankings comments don't notify anyone
    // OR that we don't have a reliable list owner ID for them.
    // If global ranking comments SHOULD notify someone (e.g., admin), different logic is needed.
    if (!listUserId) { 
      console.log(`Comment ${event.params.commentId} has no listUserId, likely a Global Ranking comment. Skipping owner notification.`);
      // Still need to check for replies below...
    }
    
    // Removed redundant check: if (!listUserId || !listId) ... 
    // because listId check is not strictly needed for reply logic,
    // and listUserId check is handled above.
    
    try {
      const notificationPromises = [];

      // Get the commenter's display name
      const commenterDoc = await admin.firestore().collection('users').doc(actorId).get();
      const commenterData = commenterDoc.data();
      const commenterName = commenterData?.displayName || 'Someone';
      console.log('Commenter name:', commenterName);

      // --- Notify list owner about new top-level comments (if listUserId exists) --- 
      if (listUserId) { 
          const listOwnerId = listUserId;

          // *** ADD CHECK: Don't notify if commenter is list owner ***
          if (actorId !== listOwnerId) {
            const listOwnerNotification = {
              userId: listOwnerId,
              type: 'comment',
              content: commentData.text,
              listId: listId, // listId might be null for global, handle in UI
              commentId: event.params.commentId,
              createdBy: actorId,
              createdByName: commenterName,
              isNew: true,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            };
            console.log('Creating list owner notification with data:', listOwnerNotification);
            notificationPromises.push(
              admin.firestore().collection('notifications').add(listOwnerNotification)
            );
          } else {
            console.log(`Skipping notification: User ${actorId} commented on their own list ${listId}.`);
          }
      } 
      // --- End Notify list owner ---

      // --- Notify parent comment author about replies --- 
      if (parentId) {
        const parentCommentRef = admin.firestore().collection('comments').doc(parentId);
        const parentCommentDoc = await parentCommentRef.get();
        
        if (parentCommentDoc.exists) {
          const parentCommentData = parentCommentDoc.data();
          const parentAuthorId = parentCommentData.userId;
          
          // *** EXISTING CHECK: Don't notify if replying to your own comment ***
          if (parentAuthorId !== actorId) {
            const replyNotification = {
              userId: parentAuthorId, // Notify the parent comment's author
              type: 'comment_reply',
              content: commentData.text,
              listId: listId, // May be null for global list comments
              commentId: event.params.commentId,
              parentCommentId: parentId,
              createdBy: actorId,
              createdByName: commenterName,
              isNew: true,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            };
            console.log('Creating reply notification with data:', replyNotification);
            notificationPromises.push(
              admin.firestore().collection('notifications').add(replyNotification)
            );
          } else {
             console.log(`Skipping notification: User ${actorId} replied to their own comment ${parentId}.`);
          }
        }
      }
      // --- End Notify parent comment author ---

      // Only proceed if there are valid promises
      if (notificationPromises.length === 0) {
          console.log("No valid comment/reply notifications to send after self-action checks.");
          return null;
      }

      return Promise.all(notificationPromises);
    } catch (error) {
      console.error('Error creating comment notifications:', error);
      return null;
    }
}); 