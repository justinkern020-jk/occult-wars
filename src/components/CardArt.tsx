import { useEffect, useState } from 'react';
import { cardImageFallback, cardImageUrl } from '../game/maps';

/** Local art with grok CDN fallback so plates survive CDN flakes. */
export function CardArt({
  name,
  className,
  alt = '',
}: {
  name: string;
  className?: string;
  alt?: string;
}) {
  const [src, setSrc] = useState(cardImageUrl(name));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setSrc(cardImageUrl(name));
    setFailed(false);
  }, [name]);
  if (failed) {
    return <div className={`card-art-fallback ${className ?? ''}`} aria-hidden />;
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      draggable={false}
      onError={() => {
        if (src !== cardImageFallback(name)) {
          setSrc(cardImageFallback(name));
        } else {
          setFailed(true);
        }
      }}
    />
  );
}
