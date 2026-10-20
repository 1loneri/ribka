import Studio from './studio';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Studio id={id}/>;}
