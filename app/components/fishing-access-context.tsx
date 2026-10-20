'use client';
import {createContext,useContext,type ReactNode} from 'react';

const FishingAccess=createContext(false);
export function FishingAccessProvider({allowed,children}:{allowed:boolean;children:ReactNode}){
 return <FishingAccess.Provider value={allowed}>{children}</FishingAccess.Provider>;
}
export function useFishingAccess(){return useContext(FishingAccess);}
