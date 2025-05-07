import React from 'react';
import OtherLists from '../components/OtherLists';
import UserProfileViewer from '../components/UserProfileViewer';
import { useParams, useLocation, useNavigate } from 'react-router-dom';

const RankingsPage = () => {
  const { userId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const userName = location.state?.userName || '';

  const handleSelectList = (list) => {
    navigate(`/list/${list.userId}/${list.id}`);
  };

  if (userId) {
    return (
      <UserProfileViewer 
        viewedUserId={userId} 
        onSelectList={handleSelectList} 
      />
    );
  } else {
  return (
    <OtherLists 
        // initialUserId={null}
        // initialUserName={userName}
        // source={'other'}
    />
  );
  }
};

export default RankingsPage; 