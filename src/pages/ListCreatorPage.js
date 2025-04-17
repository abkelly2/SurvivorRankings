import React from 'react';
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
    />
  );
};

export default ListCreatorPage; 