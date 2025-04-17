import React from 'react';
import OtherLists from '../components/OtherLists';
import { useParams, useLocation } from 'react-router-dom';

const RankingsPage = () => {
  const { userId } = useParams();
  const location = useLocation();
  const userName = location.state?.userName || '';
  const source = userId ? 'home' : 'other';
  
  return (
    <OtherLists 
      initialUserId={userId || null} 
      initialUserName={userName} 
      source={source}
    />
  );
};

export default RankingsPage; 