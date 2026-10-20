import {ArrowUpRight} from 'lucide-react';
import type {ReviewPurpose} from '../../lib/reviews/model';

export default function VideoTabs({active}:{active:ReviewPurpose|'game'}){
 return <div className="video-sections">
  <nav aria-label="Анкеты для видео">
   <a href="/reviews" className={active==='review'?'is-active':''} aria-current={active==='review'?'page':undefined}>Анкета для разбора</a>
   <a href="/reviews/guess-form" className={active==='guess'?'is-active':''} aria-current={active==='guess'?'page':undefined}>Анкета для угадай ранг</a>
  </nav>
  <a className={'video-game-link'+(active==='game'?' is-active':'')} href="/reviews/guess" aria-current={active==='game'?'page':undefined}>Угадай ранг <ArrowUpRight size={14}/></a>
 </div>;
}
