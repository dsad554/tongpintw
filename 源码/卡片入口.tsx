import React from 'react';
import {createRoot, type Root} from 'react-dom/client';
import CardSwap, {type SwapCard} from './卡片/CardSwap';
import './卡片容器.css';

type Actions={onCopy:(card:SwapCard)=>void;onShare:(card:SwapCard)=>void;onDelete?:(card:SwapCard)=>void};
type Mounted={root:Root;signature:string;cards:SwapCard[];actions:Actions};
const roots=new WeakMap<HTMLElement,Mounted>();
function paint(entry:Mounted){
  const action=(kind:keyof Actions,id:string)=>{const card=entry.cards.find(c=>c.id===id);const handler=entry.actions[kind];if(card&&handler)handler(card)};
  entry.root.render(<CardSwap cards={entry.cards} onCopy={id=>action('onCopy',id)} onShare={id=>action('onShare',id)} onDelete={entry.actions.onDelete ? id=>action('onDelete',id) : undefined}/>);
}
const shelf={
  render(container:HTMLElement,cards:SwapCard[],actions:Actions){
    const signature=JSON.stringify(cards);
    let entry=roots.get(container);
    if(entry){entry.actions=actions;if(entry.signature===signature)return;entry.signature=signature;entry.cards=cards}
    else{entry={root:createRoot(container),signature,cards,actions};roots.set(container,entry)}
    paint(entry);
  },
  destroy(container:HTMLElement){const entry=roots.get(container);if(entry){entry.root.unmount();roots.delete(container)}}
};
declare global{interface Window{TongpinCardShelf:typeof shelf}}
window.TongpinCardShelf=shelf;
