import React, { useState, useEffect, useRef, useContext } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot,
  doc,
  updateDoc,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserContext } from '../UserContext';
import { useNavigate } from 'react-router-dom';
import './Notifications.css';

const Notifications = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const dropdownRef = useRef(null);
  const { user } = useContext(UserContext);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      console.log('No user logged in, skipping notifications setup');
      return;
    }

    console.log('Setting up notifications for user:', user.uid);

    // Query for the user's notifications, ordered by creation date
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    // Set up real-time listener
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        console.log('Received notifications snapshot:', snapshot.docs.length, 'notifications');
        const newNotifications = snapshot.docs.map(doc => {
          const data = doc.data();
          console.log('Notification data:', data);
          return {
            id: doc.id,
            ...data
          };
        });
        setNotifications(newNotifications);
      },
      (error) => {
        console.error('Error in notifications listener:', error);
      }
    );

    // Clean up listener on unmount
    return () => unsubscribe();
  }, [user]);

  const handleMouseEnter = () => {
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    setIsOpen(false);
    // Mark all notifications as read when closing the dropdown
    notifications.forEach(notification => {
      if (notification.isNew) {
        console.log('Marking notification as read:', notification.id);
        // Update the notification in Firestore
        const notificationRef = doc(db, 'notifications', notification.id);
        updateDoc(notificationRef, { isNew: false });
      }
    });
  };

  const newNotificationsCount = notifications.filter(n => n.isNew).length;

  const handleNotificationClick = async (notification) => {
    // Mark the notification as read
    const notificationRef = doc(db, 'notifications', notification.id);
    updateDoc(notificationRef, { isNew: false });

    try {
      // Navigate based on notification type
      switch (notification.type) {
        case 'list_like':
        case 'comment':
          // Navigate to the list (Assuming notification.userId is list creator for these types)
          navigate(`/list/${notification.userId}/${notification.listId}`);
          break;
        case 'comment_reply': // Fetch comment data to get correct list info
          const replyCommentRef = doc(db, 'comments', notification.commentId);
          const replyCommentDoc = await getDoc(replyCommentRef);
          
          if (replyCommentDoc.exists()) {
            const replyCommentData = replyCommentDoc.data();
            // Navigate to the list that contains the comment reply
            navigate(`/list/${replyCommentData.listUserId}/${replyCommentData.listId}`);
          } else {
            console.error('Comment (reply) not found:', notification.commentId);
            // Optionally navigate somewhere else or show an error
          }
          break;
        case 'comment_like':
          // First get the comment to find the list it belongs to
          const likedCommentRef = doc(db, 'comments', notification.commentId);
          const likedCommentDoc = await getDoc(likedCommentRef);
          
          if (likedCommentDoc.exists()) {
            const likedCommentData = likedCommentDoc.data();
            // Navigate to the list that contains the comment
            navigate(`/list/${likedCommentData.listUserId}/${likedCommentData.listId}`);
          } else {
            console.error('Comment (liked) not found:', notification.commentId);
          }
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('Error handling notification click:', error);
    }

    // Close the dropdown
    setIsOpen(false);
  };

  const renderNotification = (notification) => {
    console.log('Rendering notification:', notification);
    let content;
    let iconSrc = null; // Initialize icon source

    switch (notification.type) {
      case 'list_like':
        content = `${notification.createdByName || 'Someone'} liked your list!`;
        iconSrc = '/images/like.png'; // Path relative to public folder
        break;
      case 'comment_like':
        content = `${notification.createdByName || 'Someone'} liked your comment!`;
        iconSrc = '/images/like.png'; // Path relative to public folder
        break;
      case 'comment':
        const truncatedComment = notification.content && notification.content.length > 10 
          ? notification.content.substring(0, 10) + '...' 
          : notification.content;
        content = `${notification.createdByName || 'Someone'} commented "${truncatedComment}"`;
        iconSrc = '/images/comment.png'; // Path relative to public folder
        break;
      case 'comment_reply':
        const truncatedReply = notification.content && notification.content.length > 10 
          ? notification.content.substring(0, 10) + '...' 
          : notification.content;
        content = `${notification.createdByName || 'Someone'} replied to your comment: "${truncatedReply}"`;
        iconSrc = '/images/comment.png'; // Path relative to public folder
        break;
      default:
        content = 'New notification';
    }
    console.log('Notification content:', content);
    console.log('Notification icon:', iconSrc);

    return (
      <div 
        key={notification.id} 
        className={`notification-item ${notification.isNew ? 'new' : 'read'}`}
        onClick={() => handleNotificationClick(notification)}
      >
        {iconSrc && <img src={iconSrc} alt="Notification icon" className="notification-icon" />} {/* Render icon first */}
        <span className="notification-text">{content}</span> {/* Render text second, add class */}
      </div>
    );
  };

  return (
    <div 
      className="notifications-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      ref={dropdownRef}
    >
      <button className="notifications-button">
        <span className="notifications-button-text">Inbox</span>
        {newNotificationsCount > 0 && (
          <span className="notification-badge">{newNotificationsCount}</span>
        )}
      </button>
      
      {isOpen && (
        <div className="notifications-dropdown">
          <div className="notifications-list">
            {notifications.length > 0 ? (
              notifications.map(renderNotification)
            ) : (
              <div className="notification-item">No notifications yet</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications; 