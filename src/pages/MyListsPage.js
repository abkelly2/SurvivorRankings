import React from 'react';
import UserListManager from '../components/UserListManager';

const MyListsPage = ({ user, onSelectList, onCreateNew }) => {
  return (
    <UserListManager 
      user={user}
      onSelectList={onSelectList}
      onCreateNew={onCreateNew}
    />
  );
};

export default MyListsPage; 