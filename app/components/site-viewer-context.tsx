'use client';
import {createContext,useContext,type ReactNode} from 'react';
export type SiteViewer={login:string;avatar:string|null};
const SiteViewerContext=createContext<SiteViewer|null>(null);
export function SiteViewerProvider({viewer,children}:{viewer:SiteViewer|null;children:ReactNode}){return <SiteViewerContext.Provider value={viewer}>{children}</SiteViewerContext.Provider>;}
export function useSiteViewer(){return useContext(SiteViewerContext);}
