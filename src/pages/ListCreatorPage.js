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
  seasonListRef
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
      console.warn(`${contestant.name} is already in this list.`);
      return;
    }
    
    const newList = [...userList, { ...contestant, isEmpty: false }];
    setUserList(newList);
    console.log(`Added ${contestant.name} via mobile click to ListCreator (length: ${newList.length})`);
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
    if (isMobile && seasonListRef && seasonListRef.current) {
      console.log('ListCreatorPage: Triggering showMenu');
      seasonListRef.current.showMenu();
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
    />
  );
};

export default ListCreatorPage; 