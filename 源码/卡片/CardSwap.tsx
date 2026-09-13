import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import './CardSwap.css';

export interface SwapCard {
  id: string;
  title: string;
  summary: string;
  category?: string;
  createdAt?: number;
  example?: boolean;
}

interface CardSwapProps {
  cards: SwapCard[];
  onCopy: (id: string) => void;
  onShare: (id: string) => void;
  onDelete?: (id: string) => void;
}

type Direction = 1 | -1;
type Controller = { navigate: (direction: Direction) => void; refresh: () => void };
const AUTOPLAY_DELAY = 6500;

// Retains the supplied CardSwap's slots and drop → promote → return sequence.
// Only the first three slots are visible, so a large shelf stays inside its frame.
const makeSlot = (index: number, width: number, total: number) => {
  const depth = Math.min(index, 2);
  const distance = width < 400 ? 10 : 17;
  return {
    x: depth * distance,
    y: -depth * (width < 400 ? 13 : 16),
    z: -depth * distance * 1.5,
    zIndex: total - index,
    opacity: index < 3 ? 1 : 0,
    skewY: depth === 0 ? 0 : -1.2,
  };
};

export default function CardSwap({ cards, onCopy, onShare, onDelete }: CardSwapProps) {
  // Polling may supply a new array with the same data. Do not reset the carousel.
  const signature = JSON.stringify(cards);
  const stableCards = useMemo(() => cards, [signature]);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const orderRef = useRef<string[]>([]);
  const controllerRef = useRef<Controller | null>(null);
  const userPausedRef = useRef(false);
  const [userPaused, setUserPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [activeId, setActiveId] = useState(cards[0]?.id ?? '');
  const [moving, setMoving] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    userPausedRef.current = userPaused;
    controllerRef.current?.refresh();
  }, [userPaused]);

  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    if (!root || !stage || stableCards.length === 0) return;

    const ids = stableCards.map(card => card.id);
    const retained = orderRef.current.filter(id => ids.includes(id));
    orderRef.current = [...retained, ...ids.filter(id => !retained.includes(id))];
    setActiveId(orderRef.current[0]);
    setMoving(false);

    let disposed = false;
    let busy = false;
    let hovered = root.matches(':hover');
    let focused = root.contains(document.activeElement);
    let intersecting = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let timeline: gsap.core.Timeline | null = null;
    let runningKind: 'auto' | 'manual' | null = null;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(media.matches);
    const context = gsap.context(() => {}, root);

    const visible = () => intersecting && stage.getClientRects().length > 0
      && stage.getBoundingClientRect().width > 0;
    const canAutoPlay = () => !disposed && ids.length > 1 && !document.hidden
      && visible() && !hovered && !focused && !userPausedRef.current && !media.matches;

    const clearTimer = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };

    const placeAll = () => {
      const width = stage.clientWidth;
      orderRef.current.forEach((id, index) => {
        const element = cardRefs.current.get(id);
        if (!element) return;
        gsap.set(element, {
          ...makeSlot(index, width, ids.length),
          xPercent: -50,
          yPercent: -50,
          transformOrigin: 'center center',
          force3D: true,
        });
      });
    };

    const schedule = () => {
      clearTimer();
      if (!busy && canAutoPlay()) {
        timer = setTimeout(() => {
          timer = null;
          if (canAutoPlay()) swap(1, 'auto');
        }, AUTOPLAY_DELAY);
      }
    };

    const finish = () => {
      if (disposed) return;
      timeline = null;
      runningKind = null;
      busy = false;
      placeAll();
      setMoving(false);
      schedule();
    };

    const swap = (direction: Direction, kind: 'auto' | 'manual') => {
      if (busy || disposed || orderRef.current.length < 2) return;
      clearTimer();
      const previousOrder = orderRef.current;
      const outgoing = previousOrder[0];
      const nextOrder = direction === 1
        ? [...previousOrder.slice(1), outgoing]
        : [previousOrder[previousOrder.length - 1], ...previousOrder.slice(0, -1)];
      const outgoingElement = cardRefs.current.get(outgoing);
      if (!outgoingElement) return;
      orderRef.current = nextOrder;
      setActiveId(nextOrder[0]);
      if (kind === 'manual') {
        const card = stableCards.find(item => item.id === nextOrder[0]);
        setAnnouncement(`第 ${ids.indexOf(nextOrder[0]) + 1} 张，共 ${ids.length} 张。${card?.title ?? ''}`);
      }

      if (media.matches) {
        placeAll();
        schedule();
        return;
      }

      busy = true;
      runningKind = kind;
      setMoving(true);
      const width = stage.clientWidth;
      const outgoingSlot = makeSlot(nextOrder.indexOf(outgoing), width, ids.length);
      context.add(() => {
        timeline = gsap.timeline({ onComplete: finish });
        timeline.to(outgoingElement, {
          y: stage.clientHeight * 0.75,
          opacity: 0,
          duration: 0.36,
          ease: 'power2.in',
        });
        timeline.addLabel('promote', 0.18);
        nextOrder.forEach((id, index) => {
          if (id === outgoing) return;
          const element = cardRefs.current.get(id);
          if (!element) return;
          const slot = makeSlot(index, width, ids.length);
          timeline!.set(element, { zIndex: slot.zIndex }, 'promote');
          timeline!.to(element, { ...slot, duration: 0.5, ease: 'power2.out' }, 'promote');
        });
        timeline.addLabel('return', 0.4);
        timeline.set(outgoingElement, { zIndex: outgoingSlot.zIndex }, 'return');
        timeline.to(outgoingElement, {
          ...outgoingSlot,
          duration: 0.5,
          ease: 'power2.out',
        }, 'return');
      });
    };

    const refresh = () => {
      if (disposed) return;
      const allowed = canAutoPlay();
      if (!allowed) clearTimer();
      if (timeline) {
        // Pause at a readable slot rather than leaving half a card under the
        // pointer. Hidden views can freeze safely until they become visible.
        if (document.hidden || !visible()) timeline.pause();
        else if (runningKind === 'auto' && !allowed) {
          timeline.kill();
          finish();
        } else timeline.play();
      } else if (allowed && timer === null) {
        schedule();
      }
    };

    const pointerEnter = () => { hovered = true; refresh(); };
    const pointerLeave = () => { hovered = false; refresh(); };
    const focusIn = () => { focused = true; refresh(); };
    const focusOut = () => {
      queueMicrotask(() => {
        if (disposed) return;
        focused = root.contains(document.activeElement);
        refresh();
      });
    };
    const mediaChange = () => {
      setReducedMotion(media.matches);
      if (media.matches && timeline) {
        timeline.kill();
        finish();
      }
      refresh();
    };
    const intersectionObserver = new IntersectionObserver(entries => {
      intersecting = entries[0]?.isIntersecting ?? false;
      refresh();
    });
    const resizeObserver = new ResizeObserver(() => {
      if (disposed) return;
      if (timeline) timeline.kill();
      finish();
    });
    const visibilityObserver = new MutationObserver(refresh);
    for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement) {
      visibilityObserver.observe(ancestor, {
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
      });
    }

    root.addEventListener('pointerenter', pointerEnter);
    root.addEventListener('pointerleave', pointerLeave);
    root.addEventListener('focusin', focusIn);
    root.addEventListener('focusout', focusOut);
    document.addEventListener('visibilitychange', refresh);
    media.addEventListener('change', mediaChange);
    intersectionObserver.observe(root);
    resizeObserver.observe(stage);
    context.add(placeAll);
    controllerRef.current = { navigate: direction => swap(direction, 'manual'), refresh };
    schedule();

    return () => {
      disposed = true;
      clearTimer();
      timeline?.kill();
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      root.removeEventListener('pointerenter', pointerEnter);
      root.removeEventListener('pointerleave', pointerLeave);
      root.removeEventListener('focusin', focusIn);
      root.removeEventListener('focusout', focusOut);
      document.removeEventListener('visibilitychange', refresh);
      media.removeEventListener('change', mediaChange);
      controllerRef.current = null;
      context.revert();
    };
  }, [stableCards]);

  const selectedIndex = Math.max(0, stableCards.findIndex(card => card.id === activeId));
  if (stableCards.length === 0) {
    return <div className="tp-card-swap"><p className="tp-card-swap__empty">这个分类还没有问题卡片。</p></div>;
  }

  return (
    <div ref={rootRef} className="tp-card-swap" role="region" aria-roledescription="轮播"
      aria-label="我的问题卡片" data-single={stableCards.length === 1} data-moving={moving}>
      <div ref={stageRef} className="tp-card-swap__stage">
        {stableCards.map((card, index) => {
          const active = index === selectedIndex;
          const date = typeof card.createdAt === 'number' ? new Date(card.createdAt) : null;
          const validDate = date !== null && Number.isFinite(date.getTime());
          return (
            <article key={card.id} ref={element => {
              if (element) cardRefs.current.set(card.id, element);
              else cardRefs.current.delete(card.id);
            }} className="tp-card-swap__card" data-card-id={card.id} data-active={active}
              role="group" aria-roledescription="卡片" aria-label={`${index + 1} / ${stableCards.length}：${card.title}`}
              aria-hidden={!active} inert={!active || moving}>
              <div className="tp-card-swap__meta">
                <span className="tp-card-swap__tag">{card.example ? '示例' : card.category || '问题卡片'}</span>
                {!card.example && validDate && (
                  <time dateTime={date.toISOString()}>
                    {date.toLocaleDateString('zh-CN')}
                  </time>
                )}
              </div>
              <div className="tp-card-swap__body" tabIndex={active && !moving ? 0 : -1}
                aria-label={`${card.title}，卡片内容`}>
                <h3>{card.title}</h3>
                <p>{card.summary}</p>
              </div>
              <div className="tp-card-swap__actions">
                <button type="button" disabled={!active || moving} onClick={() => onCopy(card.id)}>复制卡片</button>
                <button type="button" disabled={!active || moving} onClick={() => onShare(card.id)}>分享</button>
                {!card.example && onDelete && (
                  <button type="button" className="tp-card-swap__delete" disabled={!active || moving}
                    onClick={() => onDelete(card.id)} aria-label="删除问题卡片">删除</button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <div className="tp-card-swap__controls" aria-label="卡片切换">
        <button type="button" className="tp-card-swap__nav" disabled={stableCards.length < 2 || moving}
          onClick={() => controllerRef.current?.navigate(-1)} aria-label="上一张卡片">
          <span aria-hidden="true">←</span><span>上一张</span>
        </button>
        <span className="tp-card-swap__counter" aria-label={`第 ${selectedIndex + 1} 张，共 ${stableCards.length} 张`}>
          <strong>{selectedIndex + 1}</strong><span aria-hidden="true"> / </span>{stableCards.length}
        </span>
        <button type="button" className="tp-card-swap__nav" disabled={stableCards.length < 2 || moving}
          onClick={() => controllerRef.current?.navigate(1)} aria-label="下一张卡片">
          <span>下一张</span><span aria-hidden="true">→</span>
        </button>
        <button type="button" className="tp-card-swap__pause" disabled={stableCards.length < 2 || reducedMotion}
          aria-pressed={userPaused || reducedMotion} onClick={() => setUserPaused(paused => !paused)}
          title={reducedMotion ? '已遵循系统减少动态效果设置，可手动切换卡片' : undefined}>
          {reducedMotion ? '静态浏览' : userPaused ? '继续轮播' : '暂停轮播'}
        </button>
      </div>
      <span className="tp-card-swap__sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
    </div>
  );
}
