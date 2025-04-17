import React, { createContext } from 'react';

// Create a context for user data
export const UserContext = createContext(null);

// Create a provider component
export const UserProvider = ({ children, user }) => {
  return (
    <UserContext.Provider value={{ user }}>
      {children}
    </UserContext.Provider>
  );
}; 
 
 
 
 