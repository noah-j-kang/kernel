'use client';

import { useEffect, useState } from 'react';

export default function CustomCursor() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);
  const [textHovered, setTextHovered] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const updatePosition = (e) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };

    const handleMouseOver = (e) => {
      const target = e.target;
      const tagName = target.tagName.toLowerCase();

      if (tagName === 'input' || tagName === 'textarea' || target.closest('input') || target.closest('textarea')) {
        setTextHovered(true);
        setHovered(false);
      } else if (
        tagName === 'button' ||
        tagName === 'a' ||
        target.closest('button') ||
        target.closest('a')
      ) {
        setHovered(true);
        setTextHovered(false);
      } else {
        setHovered(false);
        setTextHovered(false);
      }
    };

    window.addEventListener('mousemove', updatePosition);
    window.addEventListener('mouseover', handleMouseOver);

    return () => {
      window.removeEventListener('mousemove', updatePosition);
      window.removeEventListener('mouseover', handleMouseOver);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      className="custom-cursor"
      style={{
        top: `${position.y}px`,
        left: `${position.x}px`,
        width: textHovered ? '4px' : (hovered ? '60px' : '20px'),
        height: textHovered ? '24px' : (hovered ? '60px' : '20px'),
        borderRadius: textHovered ? '2px' : '50%',
        transition: 'width 0.2s, height 0.2s, border-radius 0.2s'
      }}
    />
  );
}
