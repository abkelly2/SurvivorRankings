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
        console.log('Liker ID:', likerId);
        
        // Get the liker's display name
        const likerDoc = await admin.firestore().collection('users').doc(likerId).get();
        console.log('Liker document exists:', likerDoc.exists);
        const likerData = likerDoc.data();
        console.log('Liker data:', likerData);
        const likerName = likerData?.displayName || 'Someone';
        console.log('Liker name:', likerName);
        
        const notificationData = {
          userId: event.params.userId, // The list owner's ID
          type: 'list_like',
          listId: list.id,
          createdBy: likerId,
          createdByName: likerName,
          isNew: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        console.log('Creating notification with data:', notificationData);
        
        return admin.firestore().collection('notifications').add(notificationData);
      });
      
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
    
    try {
      // Get the liker's display name
      const likerDoc = await admin.firestore().collection('users').doc(newUpvote).get();
      console.log('Comment liker document exists:', likerDoc.exists);
      const likerData = likerDoc.data();
      console.log('Comment liker data:', likerData);
      const likerName = likerData?.displayName || 'Someone';
      console.log('Comment liker name:', likerName);
      
      const notificationData = {
        userId: afterData.userId, // The comment owner's ID
        type: 'comment_like',
        commentId: event.params.commentId,
        createdBy: newUpvote,
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
    
    if (!listUserId || !listId) {
      console.error('Missing listUserId or listId in comment data');
      return null;
    }
    
    try {
      const notificationPromises = [];

      // Get the commenter's display name
      const commenterDoc = await admin.firestore().collection('users').doc(commentData.userId).get();
      console.log('Commenter document exists:', commenterDoc.exists);
      const commenterData = commenterDoc.data();
      console.log('Commenter data:', commenterData);
      const commenterName = commenterData?.displayName || 'Someone';
      console.log('Commenter name:', commenterName);

      // Always notify the list owner about new comments
      const listOwnerNotification = {
        userId: listUserId,
        type: 'comment',
        content: commentData.text,
        listId: listId,
        commentId: event.params.commentId,
        createdBy: commentData.userId,
        createdByName: commenterName,
        isNew: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };
      console.log('Creating list owner notification with data:', listOwnerNotification);
      
      notificationPromises.push(
        admin.firestore().collection('notifications').add(listOwnerNotification)
      );

      // If this is a reply to another comment, notify the parent comment's author
      if (parentId) {
        // Get the parent comment to find its author
        const parentCommentRef = admin.firestore().collection('comments').doc(parentId);
        const parentCommentDoc = await parentCommentRef.get();
        
        if (parentCommentDoc.exists) {
          const parentCommentData = parentCommentDoc.data();
          
          // Don't notify if replying to your own comment
          if (parentCommentData.userId !== commentData.userId) {
            const replyNotification = {
              userId: parentCommentData.userId,
              type: 'comment_reply',
              content: commentData.text,
              listId: listId,
              commentId: event.params.commentId,
              parentCommentId: parentId,
              createdBy: commentData.userId,
              createdByName: commenterName,
              isNew: true,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            };
            console.log('Creating reply notification with data:', replyNotification);
            
            notificationPromises.push(
              admin.firestore().collection('notifications').add(replyNotification)
            );
          }
        }
      }

      return Promise.all(notificationPromises);
    } catch (error) {
      console.error('Error creating comment notifications:', error);
      return null;
    }
}); 