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

  const handleNotificationClick = async (notification) => {
    // Mark the notification as read
    const notificationRef = doc(db, 'notifications', notification.id);
    updateDoc(notificationRef, { isNew: false });

    try {
      // Navigate based on notification type
      switch (notification.type) {
        case 'list_like':
        case 'comment':
        case 'comment_reply':
          // Navigate to the list
          navigate(`/list/${notification.userId}/${notification.listId}`);
          break;
        case 'comment_like':
          // First get the comment to find the list it belongs to
          const commentRef = doc(db, 'comments', notification.commentId);
          const commentDoc = await getDoc(commentRef);
          
          if (commentDoc.exists()) {
            const commentData = commentDoc.data();
            // Navigate to the list that contains the comment
            navigate(`/list/${commentData.listUserId}/${commentData.listId}`);
          } else {
            console.error('Comment not found:', notification.commentId);
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
    switch (notification.type) {
      case 'list_like':
        content = `${notification.createdByName || 'Someone'} liked your list!`;
        break;
      case 'comment_like':
        content = `${notification.createdByName || 'Someone'} liked your comment!`;
        break;
      case 'comment':
        content = `${notification.createdByName || 'Someone'} commented "${notification.content}"`;
        break;
      case 'comment_reply':
        content = `${notification.createdByName || 'Someone'} replied to your comment: "${notification.content}"`;
        break;
      default:
        content = 'New notification';
    }
    console.log('Notification content:', content);

    return (
      <div 
        key={notification.id} 
        className={`notification-item ${notification.isNew ? 'new' : 'read'}`}
        onClick={() => handleNotificationClick(notification)}
      >
        {content}
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
        Notifications
        {notifications.some(n => n.isNew) && <span className="notification-badge" />}
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