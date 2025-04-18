import React, { useState, useEffect } from 'react';
import UserListCreator from '../components/UserListCreator';

const ListCreatorPage = ({ 
  userList, 
  setUserList, 
  listName, 
  setListName, 
  listDescription, 
  setListDescription, 
  listTags, 
  setListTags, 
  user, 
  editingListId, 
  onCancel,
  seasonListRef,
  onShowMobileMenu
}) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleAddContestantToListCreator = (contestant) => {
    const isAlreadyInList = userList.some(
      item => !item.isEmpty && item.id === contestant.id
    );
    if (isAlreadyInList) {
      alert(`${contestant.name} is already in this list.`);
      return;
    }
    if (userList.filter(item => !item.isEmpty).length >= 10) {
        alert("You can only rank up to 10 contestants.");
        return;
    }
    
    const emptyIndex = userList.findIndex(item => item.isEmpty);
    let newList;
    if (emptyIndex !== -1) {
        newList = [...userList];
        newList[emptyIndex] = { ...contestant, isEmpty: false };
    } else {
        newList = [...userList, { ...contestant, isEmpty: false }]; 
    }
    setUserList(newList);
    console.log(`Added ${contestant.name} via mobile click to ListCreator`);
  };

  useEffect(() => {
    if (isMobile && seasonListRef && seasonListRef.current && typeof seasonListRef.current.setListUpdateCallback === 'function') {
      console.log('ListCreatorPage: Registering list update callback');
      seasonListRef.current.setListUpdateCallback(handleAddContestantToListCreator);
    } else if (seasonListRef && seasonListRef.current && typeof seasonListRef.current.setListUpdateCallback === 'function') {
      seasonListRef.current.setListUpdateCallback(null);
    }

    return () => {
      if (seasonListRef && seasonListRef.current && typeof seasonListRef.current.setListUpdateCallback === 'function') {
        seasonListRef.current.setListUpdateCallback(null);
      }
    };
  }, [isMobile, seasonListRef, handleAddContestantToListCreator]);

  const handleListAreaClick = () => {
    if (isMobile && onShowMobileMenu) {
      console.log('ListCreatorPage: Triggering showMobileMenu via prop');
      onShowMobileMenu();
    }
  };

  return (
    <UserListCreator 
      userList={userList}
      setUserList={setUserList}
      listName={listName}
      setListName={setListName}
      listDescription={listDescription}
      setListDescription={setListDescription}
      listTags={listTags}
      setListTags={setListTags}
      user={user}
      editingListId={editingListId}
      onCancel={onCancel}
      seasonListRef={seasonListRef}
      isMobile={isMobile}
      onListAreaClick={handleListAreaClick}
    />
  );
};

export default ListCreatorPage; 