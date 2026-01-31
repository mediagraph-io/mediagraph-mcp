import { useCallback, useMemo, useState } from 'react';

interface RatingStarsProps {
  rating: number;
  readonly?: boolean;
  size?: 'small' | 'medium' | 'large';
  onChange?: (rating: number) => void;
}

export function RatingStars({
  rating,
  readonly = false,
  size = 'medium',
  onChange,
}: RatingStarsProps) {
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const displayRating = hoverRating ?? rating;

  const handleClick = useCallback(
    (value: number) => {
      if (readonly) return;
      // Toggle off if clicking the same rating
      onChange?.(value === rating ? 0 : value);
    },
    [readonly, rating, onChange]
  );

  const handleMouseEnter = useCallback(
    (value: number) => {
      if (readonly) return;
      setHoverRating(value);
    },
    [readonly]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverRating(null);
  }, []);

  const stars = useMemo(() => {
    return [1, 2, 3, 4, 5].map((value) => {
      const filled = value <= displayRating;
      return (
        <button
          key={value}
          type="button"
          className={`rating-star ${filled ? 'filled' : ''}`}
          onClick={() => handleClick(value)}
          onMouseEnter={() => handleMouseEnter(value)}
          onMouseLeave={handleMouseLeave}
          disabled={readonly}
          aria-label={`Rate ${value} stars`}
        >
          <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      );
    });
  }, [displayRating, handleClick, handleMouseEnter, handleMouseLeave, readonly]);

  return (
    <div
      className={`rating-stars rating-stars-${size} ${readonly ? 'readonly' : ''}`}
      role="group"
      aria-label="Rating"
    >
      {stars}
    </div>
  );
}
