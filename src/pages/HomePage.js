import React from 'react';
import RankingLists from '../components/RankingLists';

const HomePage = ({ onViewUserLists }) => {
  return <RankingLists onViewUserLists={onViewUserLists} />;
};

export default HomePage; 